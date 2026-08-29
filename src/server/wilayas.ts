import { createServerFn } from '@tanstack/react-start'
import { sql } from '~/lib/db.server'
import { publicRateLimit } from '~/lib/rate-limit'

export interface WilayaRow {
  code: number
  nameAr: string
  nameFr: string
}

// Public — no auth required. Wilayas are reference data shown to merchants
// (delivery zone setup) and buyers (checkout wilaya picker) alike.
export const getWilayas = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .handler(async (): Promise<WilayaRow[]> => {
    return sql<WilayaRow[]>`SELECT code, name_ar, name_fr FROM wilayas ORDER BY code`
  })

