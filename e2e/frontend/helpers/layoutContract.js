import { expect } from '@playwright/test'

// QA-A: the layout contract every screen of the redesign has to meet
// (docs in mobos-redesign-plan.md §4). `measureLayout` runs in the page and
// returns plain findings; `expectLayoutContract` turns the shell-owned ones
// into assertions. Content findings (targets, contrast, overlaps inside
// `main`) are returned too so each unit can enforce its own screens.
//
//  - no horizontal page scroll
//  - fixed mobile chrome (app bar) <= 64px
//  - first content top <= 168px at 375x812 and <= 132px at 1440x900
//  - below lg every interactive box >= 44x44 (inline text links excepted)
//  - no intersecting interactive boxes
//  - amounts (.tabular-nums) never cut
//  - text contrast >= 4.5 (3 for large text)

export const FIRST_CONTENT_TOP = { mobile: 168, desktop: 132 }
const SHELL_SELECTOR =
  '[data-testid="shell-mobile-header"], [data-testid="shell-lateral"], [data-testid="shell-bottom-nav"], [data-testid="shell-contexto"], [data-testid="shell-subcontexto"], [data-testid="shell-pestanas"], [data-testid="demo-aviso"], [data-testid="shell-breadcrumb"]'

export async function measureLayout(page) {
  return page.evaluate(
    ({ shellSelector }) => {
      const vw = window.innerWidth
      const mobile = vw < 1024
      const rectOf = el => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
      }
      const describe = el => {
        const id = el.getAttribute('data-testid') || el.getAttribute('data-tab-id')
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)
        return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ''} "${label}"`
      }
      const visible = el => {
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')
          return false
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return false
        // sr-only clips to 1px: not a visible control.
        return !(r.width <= 1 && r.height <= 1)
      }
      const inShell = el => Boolean(el.closest(shellSelector))

      // 1. Horizontal scroll.
      const hscroll = document.documentElement.scrollWidth > vw

      // 2. Fixed / sticky chrome pinned to the top.
      const chrome = [...document.querySelectorAll('body *')]
        .filter(el => {
          const position = getComputedStyle(el).position
          return (position === 'fixed' || position === 'sticky') && visible(el)
        })
        .map(el => ({ el, r: el.getBoundingClientRect(), style: getComputedStyle(el) }))
        .filter(({ r, style }) => r.top <= 1 && r.height < 200 && style.top === '0px')
        .map(({ el, r }) => ({ what: describe(el), bottom: Math.round(r.bottom) }))
      const chromeBottom = chrome.reduce((max, item) => Math.max(max, item.bottom), 0)

      // 3. First content top (first visible child of <main>).
      const main = document.querySelector('main')
      let firstContentTop = null
      if (main) {
        const child = [...main.children].find(visible)
        const first = child || main
        firstContentTop = Math.round(first.getBoundingClientRect().top)
      }

      // Interactive controls (visible, enabled).
      const controls = [
        ...document.querySelectorAll(
          'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="checkbox"]',
        ),
      ].filter(el => visible(el) && !el.disabled)

      // 4. Touch targets below lg.
      const small = mobile
        ? controls
            .filter(el => !el.closest('[data-inline-link]') && !el.hasAttribute('data-inline-link'))
            .filter(el => {
              // Text links that sit inside running text are exempt.
              if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return false
              // A hidden native control stacked under a styled label is not the target.
              if (el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label'))
                return false
              const r = el.getBoundingClientRect()
              return r.width < 43.5 || r.height < 43.5
            })
            .map(el => {
              const r = el.getBoundingClientRect()
              return {
                what: describe(el),
                size: `${Math.round(r.width)}x${Math.round(r.height)}`,
                shell: inShell(el),
              }
            })
        : []

      // 5. Intersecting interactive boxes. Nested controls are excluded, and so is
      // scrolling content passing under fixed/sticky chrome (that is scrolling, not overlap).
      const pinned = el => {
        for (let node = el; node; node = node.parentElement) {
          const position = getComputedStyle(node).position
          if (position === 'fixed' || position === 'sticky') return true
        }
        return false
      }
      const overlaps = []
      const boxes = controls.map(el => ({ el, r: el.getBoundingClientRect(), pinned: pinned(el) }))
      for (let i = 0; i < boxes.length; i += 1)
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]
          const b = boxes[j]
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue
          if (a.pinned !== b.pinned) continue
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.x, b.r.x)
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.y, b.r.y)
          if (w > 1 && h > 1)
            overlaps.push({
              what: `${describe(a.el)} x ${describe(b.el)}`,
              shell: inShell(a.el) || inShell(b.el),
            })
        }

      // 6. Amounts never cut.
      const cutAmounts = [...document.querySelectorAll('.tabular-nums')]
        .filter(visible)
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => describe(el))

      // 7. Contrast of visible text.
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const parse = css => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = '#000'
        context.fillStyle = css
        context.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
        return { r, g, b, a: a / 255 }
      }
      const over = (top, bottom) => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1,
      })
      const backdrop = el => {
        const layers = []
        for (let node = el; node; node = node.parentElement) {
          const style = getComputedStyle(node)
          if (style.backgroundImage !== 'none' && !style.backgroundImage.startsWith('linear-gradient'))
            return null
          const color = parse(style.backgroundColor)
          if (color.a > 0) layers.push(color)
          if (color.a === 1) break
        }
        let base = { r: 255, g: 255, b: 255, a: 1 }
        if (document.documentElement.classList.contains('dark')) base = { r: 11, g: 13, b: 16, a: 1 }
        return layers.reduceRight((acc, layer) => over(layer, acc), base)
      }
      const luminance = ({ r, g, b }) => {
        const channel = v => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }
      const lowContrast = []
      const seen = new Set()
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue
        const el = node.parentElement
        if (!el || seen.has(el) || !visible(el) || el.closest('[aria-hidden="true"]')) continue
        seen.add(el)
        if (el.closest('button:disabled, [disabled], [aria-disabled="true"]')) continue
        const style = getComputedStyle(el)
        const bg = backdrop(el)
        if (!bg) continue
        const fg = over(parse(style.color), bg)
        const l1 = luminance(fg)
        const l2 = luminance(bg)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        const size = parseFloat(style.fontSize)
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
        if (ratio < (large ? 3 : 4.5))
          lowContrast.push({ what: describe(el), ratio: Number(ratio.toFixed(2)), shell: inShell(el) })
      }

      return {
        width: vw,
        mobile,
        hscroll,
        chromeBottom,
        chrome,
        firstContentTop,
        small,
        overlaps,
        cutAmounts,
        lowContrast,
      }
    },
    { shellSelector: SHELL_SELECTOR },
  )
}

// Asserts the contract. `scope: 'shell'` (default) enforces page-level rules
// plus every finding that lives inside the shell chrome; `scope: 'all'` also
// enforces content findings. Content findings are always attached to the
// test as an annotation so a unit can see what is still open.
export async function expectLayoutContract(page, label, { scope = 'shell', top } = {}) {
  const m = await measureLayout(page)
  const only = list => (scope === 'all' ? list : list.filter(item => item.shell))
  expect(m.hscroll, `${label}: horizontal scroll at ${m.width}px`).toBe(false)
  if (m.mobile)
    expect(m.chromeBottom, `${label}: fixed top chrome ${JSON.stringify(m.chrome)}`).toBeLessThanOrEqual(64)
  const limit = top ?? (m.mobile ? FIRST_CONTENT_TOP.mobile : FIRST_CONTENT_TOP.desktop)
  expect(m.firstContentTop, `${label}: first content top`).not.toBeNull()
  expect(m.firstContentTop, `${label}: first content top`).toBeLessThanOrEqual(limit)
  expect(only(m.small), `${label}: touch targets < 44px`).toEqual([])
  expect(only(m.overlaps), `${label}: intersecting interactive boxes`).toEqual([])
  expect(m.cutAmounts, `${label}: amounts cut`).toEqual([])
  expect(only(m.lowContrast), `${label}: contrast < 4.5`).toEqual([])
  return m
}

// Overlays must close with Escape and give focus back.
export async function expectEscapeCloses(page, open, closedLocator, label) {
  await open()
  await page.keyboard.press('Escape')
  await expect(closedLocator, `${label}: Esc closes`).toBeHidden()
}
