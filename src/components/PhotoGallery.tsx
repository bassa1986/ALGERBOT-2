import { useState } from 'react'

export interface GalleryImage {
  id: string
  url: string
  isCover: boolean
}

const MAX_IMAGES = 6

/**
 * Shared gallery UI used both in the full Add/Edit Product form and in the
 * inline per-row photo control on the products list. Drag-and-drop reorder
 * is done with the native HTML5 drag events (no extra dependency) — simple
 * and sufficient for a small, capped set of thumbnails.
 */
export function PhotoGallery({
  images,
  onReorder,
  onSetCover,
  onDelete,
  disabled = false,
}: {
  images: GalleryImage[]
  onReorder: (orderedIds: string[]) => void
  onSetCover: (imageId: string) => void
  onDelete: (imageId: string) => void
  disabled?: boolean
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return
    const reordered = [...images]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    onReorder(reordered.map((img) => img.id))
    setDragIndex(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--color-text-muted)]">
          {images.length} / {MAX_IMAGES} photos
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {images.map((img, index) => (
          <div
            key={img.id}
            draggable={!disabled}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden border border-[var(--color-border)] cursor-move"
          >
            <img src={img.url} alt="" className="h-full w-full object-cover" />

            {img.isCover && (
              <span className="absolute top-0.5 left-0.5 rounded bg-[var(--color-accent)] px-1 text-[10px] font-semibold text-[var(--color-espresso)]">
                Couverture
              </span>
            )}

            <div className="absolute bottom-0.5 right-0.5 flex gap-1">
              {!img.isCover && (
                <button
                  type="button"
                  onClick={() => onSetCover(img.id)}
                  title="Définir comme couverture"
                  className="rounded bg-white/90 px-1 text-[10px] leading-4"
                >
                  ★
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(img.id)}
                title="Supprimer"
                className="rounded bg-white/90 px-1 text-[10px] leading-4 text-[var(--color-danger)]"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
