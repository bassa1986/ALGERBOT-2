import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getRequestHeader } from '@tanstack/react-start/server'
import { sql } from '~/lib/db'
import { verifyLoginWidgetPayload, verifyWebAppInitData } from '~/lib/telegram'
import { issueSession, revokeCurrentSession, merchantAuthMiddleware, getOptionalMerchantSession } from '~/lib/auth'
import { authRateLimit, readRateLimit, mutationRateLimit } from '~/lib/rate-limit'
import { sha256Hex } from '~/lib/crypto'
import { sendAuthenticationTemplate } from '~/lib/whatsapp-cloud-api'
import { normalizeWhatsAppNumber } from '~/lib/whatsapp-links'

interface MerchantRow {
  id: string
  status: 'pending' | 'active' | 'suspended'
  onboardingCompletedAt: Date | null
}

/**
 * Upserts a merchant by telegram_user_id (UNIQUE NOT NULL — one Telegram
 * account can never own two merchant accounts) and returns the merchant row.
 * Profile fields (name/username/photo) are refreshed on every login so the
 * dashboard reflects the merchant's current Telegram profile.
 */
async function upsertMerchantFromTelegram(user: {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
}): Promise<MerchantRow> {
  const rows = await sql<MerchantRow[]>`
    INSERT INTO merchants (telegram_user_id, telegram_username, telegram_first_name, telegram_last_name, telegram_photo_url)
    VALUES (${user.id}, ${user.username ?? null}, ${user.first_name ?? null}, ${user.last_name ?? null}, ${user.photo_url ?? null})
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      telegram_username = EXCLUDED.telegram_username,
      telegram_first_name = EXCLUDED.telegram_first_name,
      telegram_last_name = EXCLUDED.telegram_last_name,
      telegram_photo_url = EXCLUDED.telegram_photo_url,
      updated_at = now()
    RETURNING id, status, onboarding_completed_at
  `
  return rows[0]
}

/**
 * Ensures every merchant has a subscription row starting already covered
 * for the platform's configured free trial (default 15 days) from signup.
 * Idempotent: only inserts if the merchant doesn't already have one, so
 * repeat logins never reset an existing subscription's expiry.
 */
async function ensureTrialSubscription(merchantId: string): Promise<void> {
  await sql`
    INSERT INTO subscriptions (merchant_id, current_period_expires_at)
    SELECT ${merchantId}, now() + (s.free_trial_days || ' days')::interval
    FROM subscription_settings s
    WHERE s.id = true
    ON CONFLICT (merchant_id) DO NOTHING
  `
}

// ---------- Login Widget flow (merchant web login page) ----------

const loginWidgetSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
})

export const loginWithTelegramWidget = createServerFn({ method: 'POST' })
  .middleware([authRateLimit])
  .validator(loginWidgetSchema)
  .handler(async ({ data }) => {
    const isValid = await verifyLoginWidgetPayload(data)
    if (!isValid) {
      throw new Error('Échec de la vérification Telegram')
    }

    const merchant = await upsertMerchantFromTelegram(data)
    await ensureTrialSubscription(merchant.id)

    await issueSession({
      merchantId: merchant.id,
      userAgent: getRequestHeader('user-agent') ?? null,
      ipAddress: getRequestHeader('x-forwarded-for') ?? null,
    })

    return {
      merchantId: merchant.id,
      needsOnboarding: merchant.onboardingCompletedAt === null,
    }
  })

// ---------- WebApp initData flow (Telegram Mini App WebView) ----------

const webAppLoginSchema = z.object({
  initData: z.string().min(1),
})

export const loginWithTelegramWebApp = createServerFn({ method: 'POST' })
  .middleware([authRateLimit])
  .validator(webAppLoginSchema)
  .handler(async ({ data }) => {
    const verified = await verifyWebAppInitData(data.initData)
    if (!verified) {
      throw new Error('Échec de la vérification Telegram')
    }

    const merchant = await upsertMerchantFromTelegram(verified.user)
    await ensureTrialSubscription(merchant.id)

    await issueSession({
      merchantId: merchant.id,
      userAgent: getRequestHeader('user-agent') ?? null,
      ipAddress: getRequestHeader('x-forwarded-for') ?? null,
    })

    return {
      merchantId: merchant.id,
      needsOnboarding: merchant.onboardingCompletedAt === null,
    }
  })

// ---------- Logout ----------

export const logoutMerchant = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async () => {
    await revokeCurrentSession()
    return { ok: true }
  })

// ---------- Current session info (for client-side auth state) ----------

export const getCurrentMerchant = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async ({ context }) => {
    const rows = await sql<
      {
        id: string
        fullName: string | null
        phone: string | null
        phoneVisibleInStorefront: boolean
        status: string
        telegramFirstName: string | null
        telegramUsername: string | null
        telegramPhotoUrl: string | null
        whatsappNumber: string | null
        onboardingCompletedAt: Date | null
      }[]
    >`
      SELECT id, full_name, phone, phone_visible_in_storefront, status, telegram_first_name, telegram_username,
             telegram_photo_url, whatsapp_number, onboarding_completed_at
      FROM merchants
      WHERE id = ${context.merchantId}
    `
    return rows[0] ?? null
  })

const updateWhatsAppNumberSchema = z.object({
  // Empty string clears the number (buyer-facing button disappears);
  // otherwise validated after normalization in whatsapp-links.ts —
  // digits/spaces/+ only here, real shape-checking happens on save below.
  whatsappNumber: z.string().max(30),
})

export const updateMyWhatsAppNumber = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(updateWhatsAppNumberSchema)
  .handler(async ({ context, data }) => {
    const trimmed = data.whatsappNumber.trim()
    if (trimmed === '') {
      await sql`UPDATE merchants SET whatsapp_number = NULL, updated_at = now() WHERE id = ${context.merchantId}`
      return { ok: true, whatsappNumber: null }
    }

    const digitsOnly = trimmed.replace(/\D/g, '')
    // Loose sanity bound (7-15 digits covers any real international
    // number, per the ITU E.164 max length) — checked before
    // normalizing, since normalization only reshapes digits already
    // present, it doesn't add missing ones.
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      throw new Error('Numéro WhatsApp invalide')
    }

    // Stored in normalized form (digits only, country-code-first) rather
    // than verbatim as typed — this is the SAME value buildMerchantWhatsAppLink
    // would derive from it anyway (that function is idempotent on an
    // already-normalized input), and critically, it's the value
    // requestWhatsAppLoginOtp/verifyWhatsAppLoginOtp look up by. Storing
    // the raw "0555 12 34 56" form here while querying by the normalized
    // "213555123456" form elsewhere would mean OTP login could never
    // find a match for any merchant, ever — this consistency is required
    // for that feature to function at all, not just a style preference.
    const normalized = normalizeWhatsAppNumber(trimmed)

    try {
      await sql`
        UPDATE merchants SET whatsapp_number = ${normalized}, updated_at = now() WHERE id = ${context.merchantId}
      `
    } catch (err) {
      // whatsapp_number is now unique (see migration 0017, required for
      // WhatsApp OTP login to unambiguously identify one account) — a
      // 23505 here means another merchant already has this number.
      const code = 'code' in (err as object) ? (err as { code: string }).code : undefined
      if (code === '23505') {
        throw new Error('Ce numéro WhatsApp est déjà utilisé par un autre compte.')
      }
      throw err
    }
    return { ok: true, whatsappNumber: normalized }
  })

const updatePhoneVisibilitySchema = z.object({
  // Empty string clears the stored phone entirely; visible can only be
  // true if a non-empty phone is provided in the SAME call — enforced
  // below, not left to the client, since "visible but no phone" or
  // "phone set but visible=true with no phone" would both be nonsensical
  // states for the storefront query to read.
  phone: z.string().max(30),
  visible: z.boolean(),
})

export const updateMyPhoneVisibility = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(updatePhoneVisibilitySchema)
  .handler(async ({ context, data }) => {
    const trimmed = data.phone.trim()

    if (trimmed === '') {
      // No number on file at all -> visibility is meaningless, force it off.
      await sql`
        UPDATE merchants SET phone = NULL, phone_visible_in_storefront = false, updated_at = now()
        WHERE id = ${context.merchantId}
      `
      return { ok: true, phone: null, visible: false }
    }

    const digitsOnly = trimmed.replace(/\D/g, '')
    // Same loose sanity bound as WhatsApp's own number field above —
    // 7-15 digits covers any real international number (ITU E.164 max).
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      throw new Error('Numéro de téléphone invalide')
    }

    await sql`
      UPDATE merchants SET phone = ${trimmed}, phone_visible_in_storefront = ${data.visible}, updated_at = now()
      WHERE id = ${context.merchantId}
    `
    return { ok: true, phone: trimmed, visible: data.visible }
  })

/**
 * Same fix as getTelegramLinkConfig above, for the same reason: this used
 * to be VITE_FACEBOOK_APP_ID read via import.meta.env in ShareSheet.tsx,
 * which is baked in at Docker BUILD time and silently empty on platforms
 * that inject env vars into the running container instead. Not a hard
 * crash there (ShareSheet already falls back to the plain Facebook sharer
 * when this is empty) but the Messenger-specific share option was
 * permanently, silently disabled in production either way.
 */
export const getFacebookAppId = createServerFn({ method: 'GET' })
  .middleware([readRateLimit])
  .handler(async () => {
    return { fbAppId: process.env.FACEBOOK_APP_ID?.trim() || null }
  })

// ---------- WhatsApp OTP login ----------
//
// Not "SSO" in the OAuth sense — Meta's WhatsApp Business Platform has no
// login-widget/OAuth equivalent to Telegram's Login Widget, so there is
// no "Sign in with WhatsApp" redirect flow to build. What IS real and
// buildable: verify a merchant's WhatsApp number with a one-time code,
// then log them into their EXISTING account (the same one their Telegram
// login reaches) if that number is already linked to a merchant (via
// updateMyWhatsAppNumber in Store Settings). A number with no linked
// merchant cannot log in this way — this is a second door into an
// existing account, not a way to create a new one.

const OTP_TTL_MS = 5 * 60 * 1000 // 5 minutes
const OTP_LENGTH = 6

function generateOtpCode(): string {
  // Math.random() is fine here — this is a short-lived, single-use,
  // rate-limited code delivered over an out-of-band channel (WhatsApp),
  // not a long-lived secret like a session token or password reset link,
  // which use crypto-grade randomness elsewhere in this codebase.
  return Math.floor(100000 + Math.random() * 900000).toString().padStart(OTP_LENGTH, '0')
}

const requestOtpSchema = z.object({ whatsappNumber: z.string().min(1).max(30) })

export const requestWhatsAppLoginOtp = createServerFn({ method: 'POST' })
  .middleware([authRateLimit])
  .validator(requestOtpSchema)
  .handler(async ({ data }) => {
    const normalized = normalizeWhatsAppNumber(data.whatsappNumber)

    const merchantRows = await sql<{ id: string }[]>`
      SELECT id FROM merchants WHERE whatsapp_number = ${normalized}
    `
    // Always the same response whether or not the number is linked to an
    // account — otherwise this endpoint would let anyone probe which
    // WhatsApp numbers have a merchant account, the same enumeration
    // concern already handled this way for admin password reset.
    if (merchantRows[0]) {
      const code = generateOtpCode()
      const codeHash = await sha256Hex(code)
      const expiresAt = new Date(Date.now() + OTP_TTL_MS)

      await sql`
        INSERT INTO whatsapp_otp_codes (whatsapp_number, code_hash, expires_at)
        VALUES (${normalized}, ${codeHash}, ${expiresAt})
      `

      try {
        await sendAuthenticationTemplate(normalized, code)
      } catch (err) {
        // A send failure here is a real operational problem (missing/
        // unapproved template, bad Meta credentials) — logged loudly so
        // it's noticed, but still reported to the caller as generic
        // success below to preserve the same enumeration-safe response
        // shape. The merchant simply won't receive a code and can retry.
        console.error('[whatsapp-otp] failed to send authentication template', err)
      }
    }

    return { ok: true }
  })

const verifyOtpSchema = z.object({
  whatsappNumber: z.string().min(1).max(30),
  code: z.string().min(4).max(10),
})

export const verifyWhatsAppLoginOtp = createServerFn({ method: 'POST' })
  .middleware([authRateLimit])
  .validator(verifyOtpSchema)
  .handler(async ({ data }) => {
    const normalized = normalizeWhatsAppNumber(data.whatsappNumber)
    const codeHash = await sha256Hex(data.code.trim())

    const rows = await sql<{ id: string; usedAt: Date | null; expiresAt: Date }[]>`
      SELECT id, used_at, expires_at FROM whatsapp_otp_codes
      WHERE whatsapp_number = ${normalized} AND code_hash = ${codeHash}
      ORDER BY created_at DESC
      LIMIT 1
    `
    const otp = rows[0]
    if (!otp || otp.usedAt !== null || otp.expiresAt.getTime() < Date.now()) {
      throw new Error('Code invalide ou expiré.')
    }

    const merchantRows = await sql<{ id: string; onboardingCompletedAt: Date | null }[]>`
      SELECT id, onboarding_completed_at FROM merchants WHERE whatsapp_number = ${normalized}
    `
    const merchant = merchantRows[0]
    if (!merchant) {
      // The number's linked merchant was removed/changed between request
      // and verify (rare race, e.g. the merchant unlinked their number in
      // another tab) — fail rather than log into a now-nonexistent link.
      throw new Error('Ce numéro n\'est plus associé à un compte.')
    }

    await sql`UPDATE whatsapp_otp_codes SET used_at = now() WHERE id = ${otp.id}`

    await issueSession({
      merchantId: merchant.id,
      userAgent: getRequestHeader('user-agent') ?? null,
      ipAddress: getRequestHeader('x-forwarded-for') ?? null,
    })

    return { merchantId: merchant.id, needsOnboarding: merchant.onboardingCompletedAt === null }
  })

export const getOptionalSession = createServerFn({ method: 'GET' })
  .middleware([readRateLimit])
  .handler(async () => {
    return getOptionalMerchantSession()
  })





export const getTelegramBotUsername = createServerFn({ method: 'GET' })
  .middleware([readRateLimit])
  .handler(async () => {
    return { botUsername: process.env.TELEGRAM_BOT_USERNAME?.trim() || null }
  })

/**
 * Config needed to build t.me deep links (buildAppLink/
 * buildProductTelegramLink in src/lib/telegram-links.ts). Read here,
 * server-side, at request time — NOT via import.meta.env, which Vite
 * inlines at build time and silently breaks on platforms that inject env
 * vars into the running container rather than the build step. See the
 * comment on TELEGRAM_BOT_USERNAME in .env.example for the full story.
 */
export const getTelegramLinkConfig = createServerFn({ method: 'GET' })
  .middleware([readRateLimit])
  .handler(async () => {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim()
    const miniAppShortName = process.env.TELEGRAM_MINIAPP_SHORT_NAME?.trim()
    if (!botUsername || !miniAppShortName) return null
    return { botUsername, miniAppShortName }
  })

