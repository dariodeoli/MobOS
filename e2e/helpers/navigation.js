// Navigation helpers for the /pos panel.

// Opens a POS view by URL. Returns after the panel shell has rendered.
export async function gotoVista(page, vista) {
  await page.goto(`/pos/${vista}`)
  await page.waitForLoadState('domcontentloaded')
}
