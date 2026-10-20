import { test, expect } from '@playwright/test'
async function enterDemo(page) {
  const writes = []
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/') && path !== '/api/public/track' && !['GET','HEAD','OPTIONS'].includes(request.method())) writes.push(path) })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":"Frontend-only harness"}',
        }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:aviso-metricas', '1')
  })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  const nav = page.viewportSize().width < 1024
    ? page.getByTestId('shell-bottom-nav')
    : page.getByTestId('shell-lateral')
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
  return () => expect(writes).toEqual([])
}


// The POS replaces both opening controls while rendering its shared Modal.
for (const existing of [false, true]) {
  for (const close of ['Escape', 'button', 'confirm']) {
    test(`499 foco ${existing ? 'existente' : 'nuevo'} ${close}`, async ({ page }) => {
      const verifyApi = await enterDemo(page)
      const contactTrigger = page.locator('summary').filter({ hasText: 'Datos de contacto, RUC/CI y direcciones' })
      const editTrigger = page.getByRole('button', { name: 'Editar datos del cliente', exact: true })
      if (existing) {
        const search = page.getByPlaceholder('Buscar cliente o escribir un nombre nuevo')
        await search.fill('Mar')
        await expect(page.getByTestId('pos-bloque-cliente').getByRole('button').filter({ hasText: 'María' }).first()).toBeVisible()
        await search.press('Enter')
        await editTrigger.click()
      } else {
        await contactTrigger.click()
      }
      const dialog = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
      await expect(dialog).toBeVisible()
      if (close === 'Escape') await page.keyboard.press('Escape')
      else if (close === 'button') {
        await dialog.getByRole('button', { name: existing ? 'Cerrar edición' : 'Cerrar', exact: true }).click()
      } else {
        await dialog.getByLabel('Nombre del cliente en ficha', { exact: true }).fill('Cliente QA')
        await dialog.getByTestId('confirmar-cliente').click()
      }
      await expect(dialog).toBeHidden()
      // Wait for React to remount the logical successor and restore focus.
      // Saving a new demo card (#350) now creates an id and selected summary.
      const savedCard = existing || close === 'confirm'
      await expect(savedCard ? editTrigger : contactTrigger).toBeFocused()
      verifyApi()
    })
  }
}
