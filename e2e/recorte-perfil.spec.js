// Foto de perfil: el recortador abre con la foto ENTERA (contain) y el zoom lo
// decide el usuario (hasta 3×), sin recorte automático de las fotos verticales.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

test('el recortador abre con la foto entera y el zoom lo maneja el usuario', async ({ page }) => {
  // Foto vertical 600×1200 generada en el navegador (sin fixtures en disco).
  const dataUrl = await page.evaluate(() => {
    const lienzo = document.createElement('canvas')
    lienzo.width = 600
    lienzo.height = 1200
    const contexto = lienzo.getContext('2d')
    contexto.fillStyle = '#101826'
    contexto.fillRect(0, 0, 600, 1200)
    return lienzo.toDataURL('image/png')
  })
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
  await page.goto('/configuracion/mi-cuenta')
  await page.getByText('Mi foto', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'vertical.png', mimeType: 'image/png', buffer })

  const modal = page.getByRole('dialog').filter({ hasText: 'Recortar foto' }).first()
  await expect(modal).toBeVisible({ timeout: 20_000 })
  const imagen = modal.getByAltText('Foto a recortar')
  await expect(imagen).toBeVisible()

  // Contain: la foto entra entera en el cuadrado de 240 (vertical → 120×240).
  const alAbrir = await imagen.boundingBox()
  expect(alAbrir, 'la imagen se mide').toBeTruthy()
  expect(Math.round(alAbrir.height)).toBe(240)
  expect(Math.round(alAbrir.width)).toBe(120)
  expect(await modal.locator('input[type="range"]').inputValue()).toBe('1')

  // El zoom del usuario acerca (2,5× sobre el ajuste) sin tocar el recorte.
  await modal.locator('input[type="range"]').evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, '2.5')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect.poll(async () => Math.round((await imagen.boundingBox()).width), { timeout: 5_000 }).toBe(300)
  await expect(modal.getByText(/Zoom · 2\.5×/)).toBeVisible()
})
