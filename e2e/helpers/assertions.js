// Shared assertion helpers (Phase 1 QA).

import { expect } from '@playwright/test'

// The app must never scroll horizontally (+1px tolerance for rounding).
// Web fonts change text metrics, so settle them before measuring.
export async function expectNoHorizontalOverflow(page) {
  const { scrollWidth, innerWidth } = await page.evaluate(async () => {
    await document.fonts.ready
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })
  expect(scrollWidth, 'document must not overflow horizontally').toBeLessThanOrEqual(innerWidth + 1)
}
