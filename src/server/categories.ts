import { createServerFn } from '@tanstack/react-start'
import { sql } from '~/lib/db'
import { publicRateLimit } from '~/lib/rate-limit'

export interface CategoryRow {
  id: string
  slug: string
  nameAr: string
  nameFr: string
}

export const listCategories = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .handler(async (): Promise<CategoryRow[]> => {
    return sql<CategoryRow[]>`
      SELECT id, slug, name_ar, name_fr FROM categories ORDER BY sort_order ASC
    `
  })


