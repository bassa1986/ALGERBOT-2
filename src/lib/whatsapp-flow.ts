// Thin convenience wrapper tying together: generating a unique per-session
// flow_token, creating the whatsapp_flow_sessions row that accumulates
// state across the multi-screen order Flow, and actually sending the
// Flow message via sendFlowMessage.

import { randomBytes } from 'node:crypto'
import { sql } from './db'
import { sendFlowMessage } from './whatsapp-cloud-api'

export async function sendProductBrowseFlow(opts: {
  buyerWhatsAppNumber: string
  storeSlug: string
  storeName: string
}): Promise<void> {
  const flowId = process.env.WHATSAPP_FLOW_ID
  if (!flowId) {
    console.warn('[whatsapp-flow] WHATSAPP_FLOW_ID not set -- not sending.')
    return
  }

  // Unique per send, NOT a shared "store:<slug>" token -- this is the key
  // the Flow Data Endpoint and the completion webhook use to find and
  // update this specific session's accumulated order state (see
  // whatsapp_flow_sessions, migration 0013). A shared token would let two
  // different buyers' in-progress orders collide with each other.
  const flowToken = randomBytes(16).toString('hex')

  await sql`
    INSERT INTO whatsapp_flow_sessions (flow_token, buyer_whatsapp_number, store_slug, state)
    VALUES (${flowToken}, ${opts.buyerWhatsAppNumber}, ${opts.storeSlug}, '{}')
  `

  await sendFlowMessage({
    to: opts.buyerWhatsAppNumber,
    flowId,
    headerText: opts.storeName,
    bodyText: `Commandez chez ${opts.storeName} directement sur WhatsApp.`,
    ctaLabel: 'Commander',
    flowToken,
    screen: 'PRODUCT_LIST',
  })
}
