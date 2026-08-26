import { useEffect, useRef, type RefObject } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface ScrollRevealOptions {
  /** CSS selector, scoped to the container ref, for the elements to animate. */
  selector: string
  /** Stagger delay between each matched element, in seconds. */
  stagger?: number
  /** Vertical offset (px) elements animate in from. */
  yOffset?: number
  /** Disable entirely — useful when a list is still loading/empty. */
  enabled?: boolean
}

/**
 * Fades + slides in matched child elements as they scroll into view.
 * Shared across every storefront layout variant so animation behavior
 * (easing, stagger, trigger start point) stays visually consistent across
 * fashion/grocery/electronics/furniture/general rather than being
 * reimplemented per template.
 *
 * RTL-safe: only animates on the Y axis (opacity + translateY), so it
 * behaves identically regardless of text/layout direction.
 */
export function useScrollReveal<T extends HTMLElement>(
  options: ScrollRevealOptions,
): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const { selector, stagger = 0.08, yOffset = 24, enabled = true } = options

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    const targets = container.querySelectorAll(selector)
    if (targets.length === 0) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: yOffset },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 85%',
            once: true,
          },
        },
      )
    }, container)

    return () => ctx.revert()
    // Re-run when the selector's matched element count could have changed
    // (e.g. product list finished loading) — callers pass a stable
    // `enabled` + re-mount key rather than deep-comparing data here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, stagger, yOffset, enabled])

  return containerRef
}

/**
 * One-shot entrance animation for a single element (e.g. sticky add-to-cart
 * bar sliding up on mount) — not scroll-triggered, just an on-mount tween.
 */
export function useEntranceAnimation<T extends HTMLElement>(
  fromVars: gsap.TweenVars,
  toVars: gsap.TweenVars,
): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const tween = gsap.fromTo(el, fromVars, { ...toVars, ease: toVars.ease ?? 'power2.out' })
    return () => {
      tween.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
