// The WhatsApp Flow Data Endpoint -- a plain HTTP route (not a
// createServerFn RPC) because Meta calls this directly over HTTPS with
// its own encrypted payload format, following the exact protocol Meta's
// docs describe. See src/lib/whatsapp-flow-crypto.ts for the crypto
// itself; this file is the routing/business logic around it, including
// accumulating order state across the multi-screen flow (see the
// whatsapp_flow_sessions table, migration 0013) since Meta's Data
// Endpoint calls are stateless per-request on Meta's side -- each screen
// submission only contains THAT screen's fields, not earlier ones.
//
// Register this URL as the Flow's "Endpoint" in the Meta App Dashboard
// (WhatsApp > Configuration > Flows), as:
//   https://<your-domain>/api/whatsapp/flow-endpoint
//
// Setup still needed on Meta's side before this works (none of it is
// code): generate an RSA key pair, upload the PUBLIC key to Meta via the
// /<PHONE_NUMBER_ID>/whatsapp_business_encryption endpoint, and put the
// PRIVATE key (PEM) in WHATSAPP_FLOW_PRIVATE_KEY -- see .env.example.

import { createFileRoute } from '@tanstack/react-router'
import { decryptFlowRequest, encryptFlowResponse } from '~/lib/whatsapp-flow-crypto'
import { listStoreProductsForFlow, getProductWithVariantsForFlow, previewFlowOrder } from '~/server/storefront-public'
import { getWilayasForFlow } from '~/server/wilayas'
import { sql } from '~/lib/db'
import { formatDzd } from '~/lib/i18n/format'
import { checkRateLimit } from '~/lib/rate-limit'

interface FlowDataExchangeBody {
  version: string
  action: 'ping' | 'INIT' | 'data_exchange' | 'BACK'
  screen?: string
  data?: Record<string, unknown>
  flow_token?: string
}

interface SessionState {
  product_id?: string
  product_name?: string
  unit_price_centimes?: number
  variant_id?: string | null
  quantity?: number
  buyer_name?: string
  buyer_phone?: string
  wilaya_code?: number
  commune?: string
  address?: string
  notes?: string
}

async function getSession(flowToken: string): Promise<{ storeSlug: string; state: SessionState } | null> {
  const rows = await sql<{ storeSlug: string; state: SessionState }[]>`
    SELECT store_slug, state FROM whatsapp_flow_sessions WHERE flow_token = ${flowToken} AND order_id IS NULL
  `
  return rows[0] ?? null
}

async function updateSessionState(flowToken: string, patch: Partial<SessionState>): Promise<SessionState> {
  const rows = await sql<{ state: SessionState }[]>`
    UPDATE whatsapp_flow_sessions
    SET state = state || ${JSON.stringify(patch)}::jsonb, updated_at = now()
    WHERE flow_token = ${flowToken}
    RETURNING state
  `
  return rows[0]?.state ?? patch
}

async function getStoreNameForFlow(storeSlug: string): Promise<string | null> {
  const rows = await sql<{ name: string }[]>`SELECT name FROM stores WHERE slug = ${storeSlug}`
  return rows[0]?.name ?? null
}

function formatCentimes(centimes: number): string {
  return formatDzd(centimes, 'fr')
}

async function handleDecryptedRequest(body: FlowDataExchangeBody): Promise<Record<string, unknown>> {
  if (body.action === 'ping') {
    return { data: { status: 'active' } }
  }

  const flowToken = body.flow_token
  const session = flowToken ? await getSession(flowToken) : null

  if (!session) {
    // Expired/unknown/already-completed session -- fail closed rather
    // than guessing. The buyer sees an empty list and can request a
    // fresh Flow message from the merchant.
    return { screen: 'PRODUCT_LIST', data: { store_name: '', products: [] } }
  }

  if (body.action === 'INIT') {
    const [products, storeName] = await Promise.all([
      listStoreProductsForFlow(session.storeSlug),
      getStoreNameForFlow(session.storeSlug),
    ])
    return {
      screen: 'PRODUCT_LIST',
      data: {
        store_name: storeName ?? session.storeSlug,
        products: products.map((p) => ({
          id: p.id,
          title: p.name,
          description: formatCentimes(p.priceCentimes),
        })),
      },
    }
  }

  if (body.action === 'data_exchange' && body.screen === 'PRODUCT_LIST') {
    const productId = body.data?.selected_product as string | undefined
    const product = productId ? await getProductWithVariantsForFlow(productId) : null
    if (!product) {
      return { screen: 'PRODUCT_LIST', data: { store_name: session.storeSlug, products: [] } }
    }
    await updateSessionState(flowToken!, { product_id: product.id, product_name: product.name, unit_price_centimes: product.priceCentimes })
    return {
      screen: 'PRODUCT_DETAILS',
      data: {
        product_name: product.name,
        unit_price_label: formatCentimes(product.priceCentimes),
        has_variants: product.variants.length > 0,
        variants: product.variants.map((v) => ({ id: v.id, title: v.label })),
        quantities: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), title: String(i + 1) })),
      },
    }
  }

  if (body.action === 'data_exchange' && body.screen === 'PRODUCT_DETAILS') {
    const variantId = (body.data?.selected_variant as string | undefined) || null
    const quantity = parseInt((body.data?.quantity as string | undefined) ?? '1', 10)
    await updateSessionState(flowToken!, { variant_id: variantId, quantity: Number.isFinite(quantity) ? quantity : 1 })

    const wilayas = await getWilayasForFlow()
    return {
      screen: 'DELIVERY_INFO',
      data: { wilayas: wilayas.map((w) => ({ id: String(w.code), title: `${w.code} - ${w.nameFr}` })) },
    }
  }

  if (body.action === 'data_exchange' && body.screen === 'DELIVERY_INFO') {
    const wilayaCode = parseInt((body.data?.wilaya_code as string | undefined) ?? '', 10)
    const patch: Partial<SessionState> = {
      buyer_name: body.data?.buyer_name as string | undefined,
      buyer_phone: body.data?.buyer_phone as string | undefined,
      wilaya_code: Number.isFinite(wilayaCode) ? wilayaCode : undefined,
      commune: body.data?.commune as string | undefined,
      address: body.data?.address as string | undefined,
      notes: (body.data?.notes as string | undefined) || undefined,
    }
    const state = await updateSessionState(flowToken!, patch)

    if (!state.product_id || !state.quantity || !state.wilaya_code) {
      return { screen: 'REVIEW', data: { summary_text: '', can_deliver: false, error_text: 'Session invalide, veuillez recommencer.' } }
    }

    const preview = await previewFlowOrder({
      storeSlug: session.storeSlug,
      productId: state.product_id,
      variantId: state.variant_id ?? null,
      quantity: state.quantity,
      wilayaCode: state.wilaya_code,
    })

    const summaryLines = [
      `${state.product_name} x${state.quantity}`,
      `Sous-total: ${formatCentimes(preview.subtotalCentimes)}`,
      `Livraison: ${formatCentimes(preview.deliveryFeeCentimes)}`,
      `Total: ${formatCentimes(preview.totalCentimes)}`,
    ]

    return {
      screen: 'REVIEW',
      data: {
        summary_text: preview.canDeliver ? summaryLines.join('\n') : '',
        can_deliver: preview.canDeliver,
        error_text: preview.errorText ?? '',
      },
    }
  }

  // Any other action/screen combination (e.g. BACK) -- just re-show the
  // current screen with whatever data came in, rather than erroring the
  // whole Flow.
  return { screen: body.screen ?? 'PRODUCT_LIST', data: body.data ?? {} }
}

export const Route = createFileRoute('/api/whatsapp/flow-endpoint')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        // Generous but bounded -- a buyer moving through several Flow
        // screens generates several requests in quick succession, but the
        // URL is still public and must not be an unbounded compute sink
        // (each request does an RSA-OAEP decrypt regardless of validity).
        if (!checkRateLimit('whatsapp-flow-endpoint', clientIp, 60, 60_000)) {
          return new Response('Too many requests', { status: 429 })
        }

        const privateKeyPem = process.env.WHATSAPP_FLOW_PRIVATE_KEY
        if (!privateKeyPem) {
          console.error('[whatsapp-flow-endpoint] WHATSAPP_FLOW_PRIVATE_KEY not set')
          return new Response('Flow endpoint not configured', { status: 503 })
        }

        let encryptedPayload: { encrypted_flow_data: string; encrypted_aes_key: string; initial_vector: string }
        try {
          encryptedPayload = await request.json()
        } catch {
          return new Response('Invalid request body', { status: 400 })
        }

        let decrypted: ReturnType<typeof decryptFlowRequest>
        try {
          decrypted = decryptFlowRequest(encryptedPayload, privateKeyPem)
        } catch (err) {
          // Per Meta's spec: if decryption fails (e.g. the key registered
          // with Meta doesn't match ours anymore), respond 421 so the
          // client re-fetches our current public key instead of retrying
          // blindly against a stale one.
          console.error('[whatsapp-flow-endpoint] decryption failed', err)
          return new Response('Decryption failed', { status: 421 })
        }

        const responseBody = await handleDecryptedRequest(decrypted.body as FlowDataExchangeBody)
        const encryptedResponse = encryptFlowResponse(responseBody, decrypted.aesKey, decrypted.iv)

        // Per Meta's spec: plain base64 text body, not JSON.
        return new Response(encryptedResponse, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      },
    },
  },
})
