import { useState } from 'react'

/**
 * One-click copy-to-clipboard with a brief visual confirmation window.
 * Used by the merchant dashboard's "Copy Product Link" / "Copy App Link"
 * buttons (merchants only need one-click copy, no native share sheet),
 * and reusable anywhere else a plain copy action is needed.
 */
export function useCopyToClipboard(resetAfterMs = 2000) {
  const [copied, setCopied] = useState(false)

  async function copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), resetAfterMs)
  }

  return { copy, copied }
}
