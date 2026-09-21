// Navigation helpers for the panel.

// Opens a panel view by URL slug. Returns after the panel shell has rendered.
export async function gotoVista(page, slug) {
  await page.goto(`/${slug}`)
  await page.waitForLoadState('domcontentloaded')
}
