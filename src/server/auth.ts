import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getRequestHeader } from '@tanstack/react-start/server'
import { sql } from '~/lib/db'
import { verifyLoginWidgetPayload, verifyWebAppInitData } from '~/lib/telegram'
import { issueSession, revokeCurrentSession, merchantAuthMiddleware, getOptionalMerchantSession } from '~/lib/auth'
import { authRateLimit, readRateLimit, mutationRateLimit } from '~/lib/rate-limit'

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
    // number, per the ITU E.164 max length) — real formatting/country-code
    // handling happens in normalizeWhatsAppNumber at link-build time, not
    // here; this just rejects obvious garbage before it's stored.
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      throw new Error('Numéro WhatsApp invalide')
    }

    await sql`
      UPDATE merchants SET whatsapp_number = ${trimmed}, updated_at = now() WHERE id = ${context.merchantId}
    `
    return { ok: true, whatsappNumber: trimmed }
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

