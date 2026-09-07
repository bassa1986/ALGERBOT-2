import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { publicReadRateLimit } from '~/lib/rate-limit'

export interface WilayaRow {
  code: number
  nameAr: string
  nameFr: string
}

// Public — no auth required. Wilayas are reference data shown to merchants
// (delivery zone setup) and buyers (checkout wilaya picker) alike.
export const getWilayas = createServerFn({ method: 'GET' })
  .middleware([publicReadRateLimit])
  .handler(async (): Promise<WilayaRow[]> => {
    return sql<WilayaRow[]>`SELECT code, name_ar, name_fr FROM wilayas ORDER BY code`
  })

/**
 * Plain function (not a createServerFn) for callers that aren't React
 * components calling an RPC — the WhatsApp Flow Data Endpoint route
 * (src/routes/api/whatsapp/flow-endpoint.ts) needs the wilaya list for
 * its DELIVERY_INFO screen's Dropdown, from a plain HTTP handler.
 */
export async function getWilayasForFlow(): Promise<WilayaRow[]> {
  return sql<WilayaRow[]>`SELECT code, name_ar, name_fr FROM wilayas ORDER BY code`
}

export interface CommuneRow {
  code: number
  nameAr: string
  nameFr: string
}

// Public — same reasoning as getWilayas. Scoped to one wilaya at a time
// (a commune's code is only meaningful within its wilaya) so the merchant's
// commune dropdown and the marketplace's commune filter can both refresh
// their options as soon as a wilaya is picked, without loading all ~1,541
// communes up front.
export const getCommunesByWilaya = createServerFn({ method: 'GET' })
  .middleware([publicReadRateLimit])
  .validator(z.object({ wilayaCode: z.number().int().min(1).max(69) }))
  .handler(async ({ data }): Promise<CommuneRow[]> => {
    return sql<CommuneRow[]>`
      SELECT code, name_ar, name_fr FROM communes WHERE wilaya_code = ${data.wilayaCode} ORDER BY code
    `
  })


