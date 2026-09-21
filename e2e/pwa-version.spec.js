// #214: la app abierta avisa cuando producción sirve un bundle nuevo y recarga
// a pedido, sin tocar el offline del POS (eso vive en pos-checkout.spec.js).
import { test, expect } from '@playwright/test'

test('avisa que hay versión nueva y permite recargar', async ({ page }) => {
  // El chequeo pide /index.html con query propio; se responde con un bundle
  // distinto al que cargó la pestaña (en dev, /src/main.jsx).
  await page.route('**/index.html?*', async (route) => {
    const respuesta = await route.fetch()
    const html = (await respuesta.text())
      .replace(/\/assets\/index-[A-Za-z0-9_-]+\.js/g, '/assets/index-version-nueva.js')
      .replace(/src="\/src\/main\.jsx"/g, 'src="/assets/index-version-nueva.js"')
    await route.fulfill({ response: respuesta, body: html })
  })

  await page.goto('/login')
  const aviso = page.getByTestId('aviso-version')
  await expect(aviso).toBeVisible()
  await expect(aviso.getByText('Hay una versión nueva')).toBeVisible()

  // «Después» lo oculta sin recargar.
  await aviso.getByRole('button', { name: 'Después' }).click()
  await expect(aviso).toHaveCount(0)

  // En una carga nueva vuelve a detectarlo.
  await page.reload()
  await expect(aviso).toBeVisible()

  // «Recargar» relanza la app (con el mock activo, vuelve a detectar el aviso).
  await Promise.all([page.waitForEvent('load'), aviso.getByRole('button', { name: 'Recargar' }).click()])
  await expect(page.getByTestId('aviso-version')).toBeVisible()
})
