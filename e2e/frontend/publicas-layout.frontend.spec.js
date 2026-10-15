import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// #403 — Páginas públicas para clientes: pedido, cotización y garantía a
// 360/390/1440, claro y oscuro. Frontend-only: la API se simula con payloads
// mínimos (sin costos ni datos internos). Contrato: sin scroll horizontal,
// objetivos >= 44 px, texto >= 12 px, estado visible, WhatsApp a mano.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-publicas'
const SHOTS = process.env.MOBOS_QA_SHOTS === '1'
const VIEWPORTS = [
  [360, 780],
  [390, 844],
  [1440, 900],
]

const company = { name: 'Celulares Don Pepe Importadora y Servicio Técnico Asunción' }
const branch = { name: 'Casa Central', address: 'Av. Mariscal López 1234', city: 'Asunción', department: 'Central', phone: '0981123456', instagram: 'donpepe.py' }
const items = [
  { description: 'Samsung Galaxy S24 Ultra 512 GB Titanium Black con cargador original', quantity: 1, unitPricePyg: 7850000, discountPyg: 0, totalPyg: 7850000 },
  { description: 'Funda reforzada', quantity: 2, unitPricePyg: 85000, discountPyg: 0, totalPyg: 170000 },
]

const pedido = {
  level: 'completo',
  orderNumber: 'PED-000123',
  status: 'COMPLETED',
  fulfillmentStatus: 'IN_TRANSIT',
  updatedAt: '2026-10-14T15:00:00.000Z',
  createdAt: '2026-10-13T12:00:00.000Z',
  customerName: 'María Fernanda González Benítez',
  company,
  branch,
  items,
  subtotalPyg: 8020000,
  discountPyg: 0,
  deliveryPyg: 30000,
  totalPyg: 8050000,
  paidPyg: 5000000,
  pendingPyg: 3050000,
  payments: [{ method: 'TRANSFER', methodLabel: 'Transferencia', amountPyg: 5000000, paidAt: '2026-10-13T12:30:00.000Z', account: 'Banco Familiar' }],
  tracking: {
    estadoLabel: 'En camino',
    encabezado: 'Seguimiento de pedido',
    pasos: [
      { key: 'PROCESSING', label: 'Confirmado', hecho: true, actual: false, at: '2026-10-13T12:00:00.000Z' },
      { key: 'READY_TO_SHIP', label: 'Preparado', hecho: true, actual: false, at: '2026-10-14T09:00:00.000Z' },
      { key: 'IN_TRANSIT', label: 'En camino', hecho: true, actual: true, at: '2026-10-14T15:00:00.000Z' },
      { key: 'DELIVERED', label: 'Entregado', hecho: false, actual: false, at: null },
    ],
  },
  warranties: [],
}

const cotizacion = {
  number: 'COT-000045',
  status: 'SENT',
  customerName: 'María Fernanda González Benítez',
  validUntil: '2026-11-30T00:00:00.000Z',
  company,
  branch,
  items,
  subtotalPyg: 8020000,
  discountPyg: 20000,
  totalPyg: 8000000,
  notes: 'Precio sujeto a stock. Incluye 12 meses de garantía oficial.',
}

const garantia = {
  productName: 'Samsung Galaxy S24 Ultra 512 GB',
  orderNumber: 'PED-000123',
  serial: '356789012345678',
  status: 'ACTIVE',
  daysRemaining: 240,
  warrantyDays: 365,
  purchasedAt: '2026-10-13T12:00:00.000Z',
  expiresAt: '2027-10-13T12:00:00.000Z',
  coverage: 'Defectos de fábrica\nFalla de batería',
  exclusions: 'Golpes y humedad',
  store: { name: company.name, city: 'Asunción', phone: '0981123456' },
}

const PAGINAS = [
  { nombre: 'pedido', ruta: '/pedido/tok-pedido', api: /\/api\/orders\/public\/tok-pedido$/, payload: pedido, estado: 'estado-pedido', texto: 'En camino' },
  { nombre: 'cotizacion', ruta: '/cotizacion/tok-cot', api: /\/api\/quotes\/public\/tok-cot$/, payload: cotizacion, estado: 'estado-cotizacion', texto: 'Pendiente de confirmar' },
  { nombre: 'garantia', ruta: '/garantia/tok-gar', api: /\/api\/public\/warranty\/tok-gar$/, payload: garantia, estado: 'estado-garantia', texto: 'Garantía vigente' },
]

async function preparar(page, pagina) {
  page.on('pageerror', e => { throw e })
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (pagina.api.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pagina.payload) })
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' })
  })
  await page.route(/https:\/\//, route => route.abort())
}

function medir(page) {
  return page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
    }
    const chicos = []
    const pequenos = []
    for (const el of document.querySelectorAll('main button, main a[href], main input, main label')) {
      if (!visible(el)) continue
      if (el.tagName === 'A' && el.closest('p')) continue // enlaces dentro de texto corrido
      if (el.tagName === 'INPUT' && el.closest('label')) continue
      const r = el.getBoundingClientRect()
      if (r.height < 43.5) pequenos.push(`${el.tagName} "${(el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const nodo = walker.currentNode
      if (!nodo.textContent.trim() || !nodo.parentElement || !visible(nodo.parentElement)) continue
      const px = parseFloat(getComputedStyle(nodo.parentElement).fontSize)
      if (px < 11.99) chicos.push(`${nodo.parentElement.tagName} ${px}px "${nodo.textContent.trim().slice(0, 30)}"`)
    }
    return {
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pequenos,
      chicos,
    }
  })
}

for (const pagina of PAGINAS) {
  for (const [ancho, alto] of VIEWPORTS) {
    for (const esquema of ['light', 'dark']) {
      test(`${pagina.nombre} ${ancho}px ${esquema}: una columna, 44px, texto >= 12px y estado visible`, async ({ page }) => {
        await page.setViewportSize({ width: ancho, height: alto })
        await page.emulateMedia({ colorScheme: esquema })
        await preparar(page, pagina)
        await page.goto(pagina.ruta, { waitUntil: 'domcontentloaded' })
        const estado = page.getByTestId(pagina.estado)
        await expect(estado).toBeVisible()
        await expect(estado).toContainText(pagina.texto)
        const medidas = await medir(page)
        expect(medidas.desborde, 'sin scroll horizontal').toBeLessThanOrEqual(0)
        expect(medidas.chicos, 'texto >= 12px').toEqual([])
        if (ancho < 1024) expect(medidas.pequenos, 'objetivos >= 44px en móvil').toEqual([])
        if (SHOTS && esquema === 'light' && ancho !== 390) {
          await mkdir(out, { recursive: true })
          await page.screenshot({ path: `${out}/${pagina.nombre}-${ancho}.png`, fullPage: true })
        }
      })
    }
  }
}

test('pedido: línea de tiempo con los cuatro pasos, WhatsApp de la tienda y total completo en Gs', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await preparar(page, PAGINAS[0])
  await page.goto('/pedido/tok-pedido', { waitUntil: 'domcontentloaded' })
  const pasos = page.getByTestId('linea-tiempo').getByRole('listitem')
  await expect(pasos).toHaveCount(4)
  await expect(pasos.nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('boton-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/595981123456\?text=/)
  await expect(page.getByTestId('resumen-totales')).toContainText('8.050.000')
  await expect(page.getByTestId('resumen-totales')).not.toContainText('…')
})
