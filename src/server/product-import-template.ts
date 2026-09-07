import { createServerFn } from '@tanstack/react-start'
import * as XLSX from 'xlsx'
import { merchantAuthMiddleware } from '~/lib/auth.server'
import { sql } from '~/lib/db'
import { readRateLimit } from '~/lib/rate-limit'

// Column order and headers are the single source of truth for both the
// downloadable template and the import parser below — keeping them in one
// place means the template can never drift out of sync with what the
// parser actually expects.
export const IMPORT_COLUMNS = [
  'sku',
  'nom',
  'description',
  'prix_dzd',
  'categorie',
  'variante_libelle',
  'variante_stock',
  'variante_ajustement_prix_dzd',
] as const

const EXAMPLE_ROWS: (string | number)[][] = [
  ['TSHIRT-001', 'T-shirt basique', 'Coton 100%, coupe régulière', 1500, 'vetements-homme', 'Rouge / M', 10, 0],
  ['TSHIRT-001', 'T-shirt basique', 'Coton 100%, coupe régulière', 1500, 'vetements-homme', 'Bleu / L', 5, 0],
  ['SAC-002', 'Sac à main cuir', '', 4500, 'sacs-bagagerie', '', 8, 0],
]

/**
 * Generates the downloadable .xlsx template. Includes the category slugs
 * sheet as a reference so merchants know what to type in the "categorie"
 * column (import matches by slug, not by display name, to avoid ambiguity
 * between the Arabic and French labels).
 */
export const downloadProductImportTemplate = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async () => {
    const categories = await sql<{ slug: string; nameFr: string }[]>`
      SELECT slug, name_fr FROM categories ORDER BY sort_order
    `

    const wb = XLSX.utils.book_new()

    const productSheetData = [[...IMPORT_COLUMNS], ...EXAMPLE_ROWS]
    const productSheet = XLSX.utils.aoa_to_sheet(productSheetData)
    productSheet['!cols'] = [
      { wch: 16 }, { wch: 24 }, { wch: 30 }, { wch: 12 },
      { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, productSheet, 'Produits')

    const categorySheetData = [
      ['slug (à utiliser dans la colonne categorie)', 'nom'],
      ...categories.map((c) => [c.slug, c.nameFr]),
    ]
    const categorySheet = XLSX.utils.aoa_to_sheet(categorySheetData)
    categorySheet['!cols'] = [{ wch: 30 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, categorySheet, 'Catégories (référence)')

    // xlsx write in 'base64' type works in both Node and browser-side
    // consumption without touching Node's Buffer directly.
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
    return { base64, filename: 'algerbot-modele-import-produits.xlsx' }
  })



