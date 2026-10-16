// #404 integrado: navegador + API Next production + PostgreSQL aislado.
// Imágenes sintéticas; ningún mock de uploads ni lectura de fotos reales.
import { test, expect, request as pwRequest } from '@playwright/test'
import { openShellDestination } from './helpers/shell-navigation.js'
import { createRequire } from 'node:module'
const sharp = createRequire(new URL('../backend/package.json', import.meta.url))('sharp')
import { SEED } from './helpers/seed-data.js'
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
async function api(page, path, method = 'GET', body) {
  return page.evaluate(async ({ api, path, method, body }) => {
    const r = await fetch(`${api}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: r.status, data: await r.json().catch(() => null) }
  }, { api: API, path, method, body })
}
async function foto() {
  const data = Buffer.alloc(800 * 400 * 3)
  for (let y = 0; y < 400; y++) for (let x = 0; x < 800; x++) { const i = (y * 800 + x) * 3; data[i + (x < 400 ? 1 : 0)] = 255 }
  return { name: 'producto-ficticio.png', mimeType: 'image/png', buffer: await sharp(data, { raw: { width: 800, height: 400, channels: 3 } }).png().toBuffer() }
}
async function seleccionarRecorte(page, archivo, izquierda = true) {
  await page.getByTestId('galeria-archivo').setInputFiles(archivo)
  const crop = page.getByRole('dialog', { name: 'Recortar foto', exact: true })
  await expect(crop.getByRole('img', { name: 'Foto a recortar' })).toBeVisible()
  const box = await crop.getByTestId('recorte-encuadre').boundingBox()
  await page.mouse.move(box.x + 120, box.y + 120); await page.mouse.down()
  await page.mouse.move(box.x + (izquierda ? 240 : 0), box.y + 120); await page.mouse.up()
  await crop.getByRole('button', { name: 'Usar esta foto', exact: true }).click()
  await expect(crop).toHaveCount(0)
}
async function verificarBytes(page, imagen, canal) {
  for (const [url, lado] of [[imagen.url, 800], [imagen.thumbUrl, 160]]) {
    const resultado = await page.evaluate(async ({ api, url }) => {
      const r = await fetch(`${api}${url}`, { credentials: 'include' })
      const bytes = new Uint8Array(await r.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
      return { status: r.status, tipo: r.headers.get('content-type'), base64: btoa(binary) }
    }, { api: API, url })
    expect(resultado.status).toBe(200); expect(resultado.tipo).toContain('image/webp')
    const input = Buffer.from(resultado.base64, 'base64'), meta = await sharp(input).metadata()
    expect(meta.width).toBe(lado); expect(meta.height).toBe(lado); expect(meta.format).toBe('webp'); expect(meta.exif).toBeUndefined()
    const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    for (const [x, y] of [[lado / 2, lado / 2], [lado / 4, lado / 4], [lado * 3 / 4, lado * 3 / 4]]) {
      const i = (Math.floor(y) * lado + Math.floor(x)) * info.channels
      expect(data[i + canal]).toBeGreaterThan(235); expect(data[i + (canal === 1 ? 0 : 1)]).toBeLessThan(20)
    }
  }
}
async function aislamientoAjeno(path, image) {
  const otra = await pwRequest.newContext({ baseURL: API })
  const cookie = async (r, nombre) => (await r.headersArray()).filter(h => h.name.toLowerCase() === 'set-cookie').map(h => h.value).join(';').match(new RegExp(`(?:^|;)\\s*${nombre}=([^;]+)`))?.[1]
  try {
    const reg = await otra.post('/api/auth/register', { data: { companyName: 'Otra tienda fotos QA', email: `fotos404-${Date.now()}@test.local`, password: 'Foto404-aislada-123', deviceId: 'fotos404-qa' } })
    expect(reg.status()).toBe(201)
    const company = await cookie(reg, 'mobos_company_session'), sellers = (await reg.json()).sellers
    const onboarding = await otra.post('/api/auth/onboarding', { headers: { Authorization: `Bearer ${company}` }, data: { pin: '1234' } })
    expect(onboarding.ok()).toBe(true)
    const pin = await otra.post('/api/auth/pin', { headers: { Authorization: `Bearer ${company}` }, data: { sellerId: sellers.find(u => u.name === 'Administrador').id, pin: '1234' } })
    expect(pin.status()).toBe(200)
    const token = await cookie(pin, 'mobos_seller_session')
    for (const route of [path, image.url, image.thumbUrl]) expect((await otra.get(route, { headers: { Authorization: `Bearer ${token}` } })).status(), 'otra empresa no ve lista ni bytes').toBe(404)
  } finally { await otra.dispose() }
}

async function abrirFicha(page, sku) {
  await page.goto('/productos')
  const buscador = page.getByLabel('Buscar productos', { exact: true })
  await buscador.fill(sku); await buscador.press('Enter')
  const fila = page.getByTestId('producto-fila').filter({ hasText: sku })
  await expect(fila).toHaveCount(1); await fila.click()
  await expect(page.getByTestId('galeria-fotos')).toBeVisible()
  await expect(page.getByText('Cargando fotos…', { exact: true })).toHaveCount(0)
}

test('#404 ficha móvil guarda encuadre real y conserva principal, orden, baja y límites', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 390, height: 844 })
  const marca = Date.now().toString(36), sku = `FOTO404-${marca}`
  await page.goto('/productos')
  const creado = await api(page, '/api/products', 'POST', { sku, name: `Foto ficticia ${marca}`, category: 'Accesorios', accessoryCategory: 'CASE', pricePyg: 50000, stock: 1, branchId: SEED.branchId })
  expect(creado.status).toBe(201)
  const id = creado.data.id, path = `/api/products/${id}/images`
  try {
    await abrirFicha(page, sku)
    const posts = []; page.on('request', r => { if (r.method() === 'POST' && r.url() === `${API}${path}`) posts.push(r) })
    // Cancelar conserva la lista vacía y no produce ni un POST al API real.
    await page.getByTestId('galeria-archivo').setInputFiles(await foto())
    await page.getByRole('dialog', { name: 'Recortar foto', exact: true }).getByRole('button', { name: 'Cancelar', exact: true }).click()
    expect(posts).toHaveLength(0); expect((await api(page, path)).data).toEqual([])
    // Positivo1: verde izquierdo seleccionado, no centro automático rojo/verde.
    await seleccionarRecorte(page, await foto(), true)
    await expect.poll(async () => (await api(page, path)).data?.length).toBe(1)
    let images = (await api(page, path)).data
    expect(posts).toHaveLength(1); expect(images[0].isPrimary).toBe(true)
    expect(images[0].width).toBe(800); expect(images[0].height).toBe(800)
    await verificarBytes(page, images[0], 1)
    const primera = images[0]
    await aislamientoAjeno(path, primera)
    await seleccionarRecorte(page, await foto(), false)
    await expect.poll(async () => (await api(page, path)).data?.length).toBe(2)
    images = (await api(page, path)).data
    expect(posts).toHaveLength(2); expect(new Set(images.map(i => i.id)).size).toBe(2)
    const segunda = images.find(i => i.id !== primera.id)
    expect(segunda.isPrimary).toBe(false); await verificarBytes(page, segunda, 0)
    // Principal y orden conservan identidades, no crean otra foto.
    await page.getByRole('button', { name: 'Foto 2', exact: true }).click()
    await page.getByRole('button', { name: 'Hacer principal', exact: true }).click()
    await expect.poll(async () => (await api(page, path)).data?.[0]?.id).toBe(segunda.id)
    const orden = await api(page, path, 'PATCH', { action: 'reorder', order: [primera.id, segunda.id] })
    expect(orden.status).toBe(200); expect(orden.data.map(i => i.id).sort()).toEqual([primera.id, segunda.id].sort())
    expect(orden.data.filter(i => i.isPrimary)).toHaveLength(1)
    expect(orden.data.find(i => i.id === primera.id).position).toBe(0)
    expect(orden.data.find(i => i.id === segunda.id).position).toBe(1)
    expect(orden.data[0].id).toBe(segunda.id)
    // Reabrir verifica persistencia del mismo principal y borrar porUI es baja lógica.
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
    await abrirFicha(page, sku)
    await page.getByRole('button', { name: 'Foto 1 (principal)', exact: true }).click()
    await page.getByRole('button', { name: 'Quitar', exact: true }).click()
    await expect.poll(async () => (await api(page, path)).data?.length).toBe(1)
    const restantes = (await api(page, path)).data
    expect(restantes[0].id).toBe(primera.id); expect(restantes[0].isPrimary).toBe(true)
    expect(await page.evaluate(async ({ api, url }) => (await fetch(`${api}${url}`, { credentials: 'include' })).status, { api: API, url: segunda.url })).toBe(404)
    // Negativas cliente antes de recortar/subir.
    for (const file of [{ name: 'no.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') }, { name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }]) {
      await page.getByTestId('galeria-archivo').setInputFiles(file)
      await expect(page.getByTestId('galeria-fotos').getByRole('alert')).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Recortar foto', exact: true })).toHaveCount(0)
    }
    expect(posts).toHaveLength(2); expect((await api(page, path)).data).toHaveLength(1)
  } finally { await api(page, `/api/products?id=${id}`, 'DELETE') }
})

test('#404 alta POS confirma local y sube una sola vez después de crear producto', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/')
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'POS')
  await page.getByRole('button', { name: 'Nuevo producto', exact: false }).click()
  const nombre = `Alta foto ficticia ${Date.now().toString(36)}`
  await page.getByPlaceholder('Nombre base (ej: Protector 17 Air)').fill(nombre)
  await page.getByRole('textbox', { name: /^Precio de venta \(Gs\) \*/ }).fill('50000')
  const posts = []; page.on('request', r => { if (r.method() === 'POST' && /\/api\/products\/[^/]+\/images$/.test(r.url())) posts.push(r) })
  await seleccionarRecorte(page, await foto(), true)
  expect(posts).toHaveLength(0)
  const creacion = page.waitForResponse(r => r.url() === `${API}/api/products` && r.request().method() === 'POST' && r.status() === 201)
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  const creado = await (await creacion).json(), path = `/api/products/${creado.id}/images`
  try {
    await expect.poll(async () => (await api(page, path)).data?.length).toBe(1)
    expect(posts).toHaveLength(1)
    const images = (await api(page, path)).data
    expect(images[0].isPrimary).toBe(true); await verificarBytes(page, images[0], 1)
  } finally { await api(page, `/api/products?id=${creado.id}`, 'DELETE') }
})
