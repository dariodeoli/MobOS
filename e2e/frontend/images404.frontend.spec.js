import { test, expect } from '@playwright/test'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1cAAAAASUVORK5CYII=', 'base64')
for (const cambio of ['empresa', 'A→B→A', 'logout', 'sucursal', 'rol', 'permisos']) test(`#404 foto privada no sobrevive ${cambio}`, async ({ page }) => {
  let requests = 0, allowed = true
  await page.route('**/api/products/**/images/**', r => { requests++; return r.fulfill(allowed ? { status: 200, contentType: 'image/png', body: png } : { status: 403, json: { error: 'Acceso revocado' } }) })
  await page.goto('/e2e/fixtures/images404.html')
  await expect(page.getByRole('img', { name: 'Foto privada ficticia' })).toBeVisible()
  expect(requests).toBe(1)
  allowed = false
  await page.evaluate(async cambio => {
    if (cambio === 'logout') await window.fixture404.contexto(null)
    else if (cambio === 'sucursal') await window.fixture404.contexto('A', 'ADMIN', ['stock:read'], 'otra-sucursal')
    else if (cambio === 'rol') await window.fixture404.contexto('A', 'VENDEDOR')
    else if (cambio === 'permisos') await window.fixture404.contexto('A', 'ADMIN', [])
    else {
      await window.fixture404.contexto('B')
      if (cambio === 'A→B→A') await window.fixture404.contexto('A')
    }
  }, cambio)
  // La instancia permanece montada: retirar la imagen visible es parte del contrato.
  await expect(page.getByRole('img', { name: 'Foto privada ficticia' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver a mostrar foto' }).click()
  await expect(page.getByRole('img', { name: 'Foto privada ficticia' })).toHaveCount(0)
})

test('#515 revoca la URL y permite foto nueva autorizada sin duplicar descarga', async ({ page }) => {
  let requests = 0
  await page.addInitScript(() => {
    window.revocadas404 = []
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = url => { window.revocadas404.push(url); revoke(url) }
  })
  await page.route('**/api/products/**/images/**', r => { requests++; return r.fulfill({ status: 200, contentType: 'image/png', body: png }) })
  await page.goto('/e2e/fixtures/images404.html')
  const foto = page.getByRole('img', { name: 'Foto privada ficticia' })
  await expect(foto).toBeVisible()
  const anterior = await foto.getAttribute('src')
  expect(await page.evaluate(async () => {
    const { cargarFoto } = await import('/src/lib/api/productImages.js')
    const urls = await Promise.all([cargarFoto(window.fixture404.source), cargarFoto(window.fixture404.source)])
    return urls[0] === urls[1]
  })).toBe(true)
  expect(requests).toBe(1)
  await page.evaluate(() => window.fixture404.contexto('B'))
  await expect(foto).toHaveCount(0)
  await expect.poll(() => page.evaluate(url => window.revocadas404.includes(url), anterior)).toBe(true)
  await page.getByRole('button', { name: 'Volver a mostrar foto' }).click()
  await expect(foto).toBeVisible()
  expect(await foto.getAttribute('src')).not.toBe(anterior)
  expect(requests).toBe(2)
})

test('#515 cuerpo tardío anterior no crea blob ni borra caché nueva', async ({ page }) => {
  let requests = 0
  await page.addInitScript(() => {
    window.creadas404 = []
    const create = URL.createObjectURL.bind(URL)
    URL.createObjectURL = blob => { const url = create(blob); window.creadas404.push(url); return url }
    const blob = Response.prototype.blob
    let primero = true
    Response.prototype.blob = async function () {
      if (this.url.includes('/fixture-image') && primero) {
        primero = false
        window.cuerpo404 = true
        await new Promise(resolve => { window.resolverCuerpo404 = resolve })
      }
      return blob.call(this)
    }
  })
  await page.route('**/api/products/**/images/**', r => { requests++; return r.fulfill({ status: 200, contentType: 'image/png', body: png }) })
  await page.goto('/e2e/fixtures/images404.html')
  await expect.poll(() => page.evaluate(() => Boolean(window.cuerpo404))).toBe(true)
  await page.evaluate(async () => { await window.fixture404.contexto('B'); await window.fixture404.contexto('A') })
  await page.getByRole('button', { name: 'Volver a mostrar foto' }).click()
  const foto = page.getByRole('img', { name: 'Foto privada ficticia' })
  await expect(foto).toBeVisible()
  const actual = await foto.getAttribute('src')
  await page.evaluate(() => window.resolverCuerpo404())
  // Esperar el catch de la carga vieja y comprobar que no eliminó la nueva.
  expect(await page.evaluate(async () => {
    const { cargarFoto } = await import('/src/lib/api/productImages.js')
    await new Promise(resolve => setTimeout(resolve, 30))
    return cargarFoto(window.fixture404.source)
  })).toBe(actual)
  expect(await page.evaluate(() => window.creadas404.length)).toBe(1)
  expect(requests).toBe(2)
  await expect(foto).toHaveAttribute('src', actual)
})

for (const status of [401, 402, 403]) test(`#515 denegación ${status} de otra imagen retira foto ya visible`, async ({ page }) => {
  await page.route('**/api/products/**/images/**', r => r.fulfill(r.request().url().includes('/denied') ? { status, json: { error: 'No autorizado' } } : { status: 200, contentType: 'image/png', body: png }))
  await page.goto('/e2e/fixtures/images404.html')
  await expect(page.getByRole('img', { name: 'Foto privada ficticia' })).toBeVisible()
  await page.evaluate(async () => {
    const { cargarFoto } = await import('/src/lib/api/productImages.js')
    await cargarFoto('/api/products/fixture-product/images/denied').catch(() => {})
  })
  await expect(page.getByRole('img', { name: 'Foto privada ficticia' })).toHaveCount(0)
})


test('#515 invalidación de otra pestaña también retira foto montada', async ({ page, context }) => {
  await context.route('**/api/products/**/images/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }))
  await page.goto('/e2e/fixtures/images404.html')
  const otra = await context.newPage()
  await otra.goto('/e2e/fixtures/images404.html')
  // El arranque de otra pestaña ya notifica: reactivar explícitamente A.
  await page.evaluate(() => window.fixture404.contexto('A'))
  await page.getByRole('button', { name: 'Volver a mostrar foto' }).click()
  const foto = page.getByRole('img', { name: 'Foto privada ficticia' })
  await expect(foto).toBeVisible()
  await otra.evaluate(() => window.fixture404.contexto('B'))
  await expect(foto).toHaveCount(0)
  await otra.close()
})


test('#515 descarga fallida se puede recuperar sin conservar el rechazo en caché', async ({ page }) => {
  let requests = 0
  await page.route('**/api/products/**/images/**', r => {
    requests++
    return r.fulfill(requests === 1 ? { status: 503, json: { error: 'Temporal' } } : { status: 200, contentType: 'image/png', body: png })
  })
  const fallida = page.waitForResponse(r => r.url().includes('/fixture-image') && r.status() === 503)
  await page.goto('/e2e/fixtures/images404.html')
  await fallida
  await page.evaluate(async () => {
    const { cargarFoto } = await import('/src/lib/api/productImages.js')
    await cargarFoto(window.fixture404.source)
  })
  await page.getByRole('button', { name: 'Volver a mostrar foto' }).click()
  await expect(page.getByRole('img', { name: 'Foto privada ficticia' })).toBeVisible()
  expect(requests).toBe(2)
})
