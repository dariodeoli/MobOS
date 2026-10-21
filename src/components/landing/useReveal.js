import { useEffect } from 'react'

// Entradas al hacer scroll: solo transform/opacity (sin saltos de layout).
// Sin IntersectionObserver, sin JS o con movimiento reducido todo queda visible.
export default function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const items = [...root.querySelectorAll('[data-reveal]')]
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof IntersectionObserver === 'undefined') {
      items.forEach(el => el.classList.add('is-in'))
      return undefined
    }
    items.forEach(el => {
      const siblings = el.parentElement ? [...el.parentElement.children] : []
      el.style.setProperty('--i', String(Math.max(0, siblings.indexOf(el)) % 4))
    })
    root.setAttribute('data-reveal-ready', '')
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    items.forEach(el => io.observe(el))
    return () => {
      io.disconnect()
      root.removeAttribute('data-reveal-ready')
    }
  }, [rootRef])
}
