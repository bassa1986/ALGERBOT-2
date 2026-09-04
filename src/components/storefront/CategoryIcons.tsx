// A small, hand-picked set of line icons for the homepage's category tile
// grid, keyed by the real category slugs seeded in src/db/categories.data.ts
// (see BASE_CATEGORIES). No icon library dependency — plain inline SVG,
// stroke-based to match a consistent weight, colored via currentColor so
// it inherits the tile's text color rather than being hardcoded.
//
// Any category slug not in this map (a merchant-defined or future
// category) falls back to a simple generic "tag" icon rather than
// breaking the grid or requiring this file to be kept in lockstep with
// every possible category.

import type { SVGProps, ReactNode } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

const CategoryIcons: Record<string, (props: IconProps) => ReturnType<typeof Icon>> = {
  'vetements-homme': (p) => (
    <Icon {...p}>
      <path d="M8 4 4 7l2 3 2-1.5V20h8V8.5L18 10l2-3-4-3-2 2h-4z" />
    </Icon>
  ),
  'vetements-femme': (p) => (
    <Icon {...p}>
      <path d="M8 4 4 7l2 3 2-1.5v2L6 20h12l-2-9.5v-2l2 1.5 2-3-4-3-2 2h-4z" />
    </Icon>
  ),
  'vetements-enfant': (p) => (
    <Icon {...p}>
      <path d="M9 4 6 6l1.5 2L9 7v9h6V7l1.5 1L18 6l-3-2-2 1.5h-2z" />
    </Icon>
  ),
  chaussures: (p) => (
    <Icon {...p}>
      <path d="M3 18v-3c2-.5 3-2 3.5-4l3 1c.3 1.3 1 2 2.5 2h6c2 0 3 1 3 3v1H3z" />
      <path d="M6.5 11 8 6" />
    </Icon>
  ),
  'beaute-soins': (p) => (
    <Icon {...p}>
      <path d="M9 2h6v4H9z" />
      <path d="M8 6h8l1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
      <path d="M8 12h8" />
    </Icon>
  ),
  electronique: (p) => (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </Icon>
  ),
  'telephones-accessoires': (p) => (
    <Icon {...p}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </Icon>
  ),
  'maison-cuisine': (p) => (
    <Icon {...p}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-6h4v6" />
    </Icon>
  ),
  'meubles-deco': (p) => (
    <Icon {...p}>
      <path d="M4 13V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5" />
      <path d="M4 13h16v3H4z" />
      <path d="M5 16v3M19 16v3" />
    </Icon>
  ),
  'sport-loisirs': (p) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
    </Icon>
  ),
  'bebe-enfant': (p) => (
    <Icon {...p}>
      <circle cx="12" cy="9" r="4" />
      <path d="M6 21c0-4 2.5-6 6-6s6 2 6 6" />
    </Icon>
  ),
  'bijoux-montres': (p) => (
    <Icon {...p}>
      <circle cx="12" cy="13" r="6" />
      <path d="M9 4h6l-1.5 3h-3z" />
    </Icon>
  ),
  'sacs-bagagerie': (p) => (
    <Icon {...p}>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Icon>
  ),
  epicerie: (p) => (
    <Icon {...p}>
      <path d="M5 8h14l-1.5 11a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Icon>
  ),
  'auto-moto': (p) => (
    <Icon {...p}>
      <path d="M4 16l1.5-5A2 2 0 0 1 7.4 9.5h9.2A2 2 0 0 1 18.5 11L20 16" />
      <rect x="3" y="16" width="18" height="3" rx="1.5" />
      <circle cx="7.5" cy="19" r="1.4" />
      <circle cx="16.5" cy="19" r="1.4" />
    </Icon>
  ),
  'bricolage-jardin': (p) => (
    <Icon {...p}>
      <path d="M14 6l4 4-8 8H6v-4z" />
      <path d="M13 7l4-4" />
    </Icon>
  ),
  jouets: (p) => (
    <Icon {...p}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M6 20l2-8h8l2 8" />
    </Icon>
  ),
  'librairie-papeterie': (p) => (
    <Icon {...p}>
      <path d="M4 4h9a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
      <path d="M16 4h4v17h-4" />
    </Icon>
  ),
  artisanat: (p) => (
    <Icon {...p}>
      <path d="M12 3v6" />
      <circle cx="12" cy="13" r="6.5" />
      <path d="M9.5 13a2.5 2.5 0 0 1 5 0" />
    </Icon>
  ),
  divers: (p) => (
    <Icon {...p}>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </Icon>
  ),
}

export function CategoryIcon({ slug, ...props }: IconProps & { slug: string }) {
  const IconComponent = CategoryIcons[slug]
  if (IconComponent) return <IconComponent {...props} />
  // Generic fallback for any slug not in the curated map above (a "tag").
  return (
    <Icon {...props}>
      <path d="M20 12 12.5 4.5A2 2 0 0 0 11 4H5a1 1 0 0 0-1 1v6a2 2 0 0 0 .6 1.4L12 20z" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  )
}
