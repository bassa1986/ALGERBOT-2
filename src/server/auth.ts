import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getRequestHeader } from '@tanstack/react-start/server'
import { sql } from '~/lib/db'
import { verifyLoginWidgetPayload, verifyWebAppInitData } from '~/lib/telegram'
import { issueSession, revokeCurrentSession, merchantAuthMiddleware, getOptionalMerchantSession } from '~/lib/auth'
import { authRateLimit, readRateLimit } from '~/lib/rate-limit'

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
        status: string
        telegramFirstName: string | null
        telegramUsername: string | null
        telegramPhotoUrl: string | null
        onboardingCompletedAt: Date | null
      }[]
    >`
      SELECT id, full_name, phone, status, telegram_first_name, telegram_username,
             telegram_photo_url, onboarding_completed_at
      FROM merchants
      WHERE id = ${context.merchantId}
    `
    return rows[0] ?? null
  })

export const getOptionalSession = createServerFn({ method: 'GET' }).handler(async () => {
  return getOptionalMerchantSession()
})





export const getTelegramBotUsername = createServerFn({ method: 'GET' }).handler(async () => {
  return { botUsername: process.env.TELEGRAM_BOT_USERNAME?.trim() || null }
})

