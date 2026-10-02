// QA #325 — Responsive móvil y roles secundarios (auditoría demo v1.0.209).
//
// Recorrido E2E de los puntos pendientes de la auditoría: detalle de cliente,
// pedido y producto; kardex, precios, importación y garantías; modales de
// crear/editar/rechazar/recibir; portal público y cotizaciones compartidas;
// impresión y correos; y los roles Vendedor, Gerente, Técnico y Delivery.
//
// Por superficie: capturas claro/oscuro/móvil, medición de scroll horizontal
// y elementos cortados (gate #249) y gate de targets < 44 px en mobile.
// Evidencia: docs/qa/325-roles-responsive/ (capturas + auditoria-*.json).
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'
import { crearIntegranteConPinLibre } from './helpers/integrantes.mjs'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const SHOTS = process.env.MOBOS_CAPTURAS || join('docs', 'qa', '325-roles-responsive')
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

mkdirSync(SHOTS, { recursive: true })

// Token del pedido semilla (lo escribe el global-setup). Ausente con --list.
let PEDIDO_SEMILLA = { publicToken: '', orderNumber: '' }
try {
  PEDIDO_SEMILLA = JSON.parse(readFileSync(new URL('./.auth/seed-order.json', import.meta.url), 'utf8'))
} catch { /* sin setup: solo el listado lo tolera */ }

async function api(page, ruta, opciones = {}) {
  return page.evaluate(async ({ api, ruta, opciones }) => {
    const respuesta = await fetch(`${api}${ruta}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opciones,
    })
    const body = await respuesta.json().catch(() => null)
    return { status: respuesta.status, body }
  }, { api: API, ruta, opciones })
}

async function cambiarOperador(page, sellerId, pin) {
  const ingreso = await api(page, '/api/auth/pin', { method: 'POST', body: JSON.stringify({ sellerId, pin }) })
  expect(ingreso.status, `cambio de operador a ${sellerId}: ${JSON.stringify(ingreso.body)}`).toBe(200)
}

// El tema se resuelve por localStorage en el arranque: se escribe en el origen
// actual y la navegación siguiente ya lo aplica.
async function tema(page, valor) {
  await page.evaluate((v) => { try { localStorage.setItem('mobos:theme', v) } catch { /* sin storage */ } }, valor)
}

// Medición del criterio #249: scroll horizontal del documento, elementos
// visibles que se salen del viewport (fuera de contenedores con scroll propio)
// y targets con área efectiva < 44 px.
async function medir(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const visible = (el) => el.offsetParent !== null && el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]')
    const enScrollable = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const overflow = getComputedStyle(n).overflowX
        if (overflow === 'auto' || overflow === 'scroll') return true
      }
      return false
    }
    const overflowH = Math.max(0, document.documentElement.scrollWidth - vw)
    const cortados = []
    for (const el of document.querySelectorAll('button, a, input, select, textarea, h1, h2, h3, table, img, [data-testid]')) {
      if (!visible(el) || enScrollable(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.left < -1 || rect.right > vw + 1) {
        cortados.push({
          que: el.tagName.toLowerCase(),
          texto: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
          izquierda: Math.round(rect.left),
          derecha: Math.round(rect.right),
          clase: String(el.className).slice(0, 70),
        })
      }
    }
    const areaTactil = (el) => {
      const rect = el.getBoundingClientRect()
      let ancho = rect.width
      let alto = rect.height
      const etiqueta = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') : null
      if (etiqueta) {
        const caja = etiqueta.getBoundingClientRect()
        ancho = Math.max(ancho, caja.width)
        alto = Math.max(alto, caja.height)
      }
      const after = getComputedStyle(el, '::after')
      if (after && after.content && after.content !== 'none' && after.position === 'absolute') {
        const anchoAfter = parseFloat(after.width)
        const altoAfter = parseFloat(after.height)
        if (Number.isFinite(anchoAfter)) ancho = Math.max(ancho, anchoAfter)
        if (Number.isFinite(altoAfter)) alto = Math.max(alto, altoAfter)
      }
      return { ancho, alto }
    }
    const chicos = []
    for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]')) {
      if (!visible(el)) continue
      if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue
      if (enScrollable(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const area = areaTactil(el)
      if (area.alto < 44 || area.ancho < 44) {
        chicos.push({
          que: el.tagName.toLowerCase(),
          texto: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 34),
          ancho: Math.round(area.ancho),
          alto: Math.round(area.alto),
          dibujo: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          clase: String(el.className).slice(0, 60),
        })
      }
    }
    const porPatron = {}
    for (const chico of chicos) {
      const patron = `${chico.que}:${chico.clase.replace(/\s+/g, ' ').slice(0, 44)}`
      porPatron[patron] = porPatron[patron] ? { ...porPatron[patron], veces: porPatron[patron].veces + 1 } : { ...chico, veces: 1 }
    }
    return {
      overflowH,
      totalCortados: cortados.length,
      cortados: cortados.slice(0, 8),
      totalChicos: chicos.length,
      chicos: Object.values(porPatron).sort((a, b) => b.veces - a.veces).slice(0, 10),
    }
  })
}

function registrar(nombre, ancho, medicion) {
  console.log(`[325:${nombre}-${ancho}] scroll=${medicion.overflowH}px cortados=${medicion.totalCortados} chicos=${medicion.totalChicos}`)
  return { superficie: nombre, ancho, ...medicion }
}

function guardar(nombre, filas) {
  writeFileSync(join(SHOTS, `auditoria-${nombre}.json`), `${JSON.stringify(filas, null, 2)}\n`)
}

function exigir(medicion, etiqueta, esMobile = false) {
  expect(medicion.overflowH, `${etiqueta}: sin scroll horizontal`).toBe(0)
  expect(medicion.totalCortados, `${etiqueta}: sin elementos cortados · ${JSON.stringify(medicion.cortados)}`).toBe(0)
  if (esMobile) expect(medicion.totalChicos, `${etiqueta}: ningún target < 44 en mobile · ${JSON.stringify(medicion.chicos)}`).toBe(0)
}

// Visita una ruta en escritorio (claro), mobile (claro) y mobile oscuro; corre
// `accion` (p. ej. abrir un detalle) antes de medir y capturar.
async function evidencia(page, { nombre, ruta, listo, accion, oscuro = true, salida = SHOTS }) {
  const filas = []
  for (const [etiqueta, viewport, t] of [
    ['desktop', DESKTOP, 'light'],
    ['mobile', MOBILE, 'light'],
    ...(oscuro ? [['mobile-oscuro', MOBILE, 'dark']] : []),
  ]) {
    await page.setViewportSize(viewport)
    await tema(page, t === 'dark' ? 'dark' : 'light')
    await page.goto(ruta)
    await expect(listo(page)).toBeVisible({ timeout: 30_000 })
    if (accion) await accion(page)
    const medicion = await medir(page)
    filas.push(registrar(`${nombre}`, etiqueta, medicion))
    exigir(medicion, `${nombre} ${etiqueta}`, etiqueta.startsWith('mobile'))
    await page.screenshot({ path: join(salida, `${nombre}-${etiqueta}.png`) })
    if (t === 'dark') await tema(page, 'light')
  }
  return filas
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Roles secundarios: Vendedor, Gerente, Técnico y Delivery.
// ─────────────────────────────────────────────────────────────────────────────
test('roles: cada uno entra por su puerta, con su menú y sus límites', async ({ page }) => {
  test.slow()
  await page.goto('/resumen')
  const yo = await api(page, '/api/auth/me')
  const adminId = yo.body?.user?.id
  expect(adminId).toBeTruthy()
  const usuarios = await api(page, '/api/users')
  const vendedor = (usuarios.body || []).find((u) => u.email === SEED.sellers[0].email)
  const repartidor = (usuarios.body || []).find((u) => u.email === SEED.repartidor.email)
  expect(vendedor?.id, 'vendedor del seed').toBeTruthy()
  expect(repartidor?.id, 'repartidor del seed').toBeTruthy()

  const marca = Date.now().toString(36).toUpperCase()
  const gerente = await crearIntegranteConPinLibre(page, { api: API, nombre: `Integrante E2E Gerente ${marca}`, rol: 'GERENTE' })
  const tecnico = await crearIntegranteConPinLibre(page, { api: API, nombre: `Integrante E2E Técnico ${marca}`, rol: 'TECNICO' })

  const ROLES = [
    {
      id: 'vendedor',
      sellerId: vendedor.id,
      pin: SEED.sellers[0].pin,
      destino: /\/pos$/,
      titulo: /^(POS|Nueva venta)$/,
      entradaListo: (p) => p.getByPlaceholder('Buscar producto…'),
      menu: ['POS', 'Mis pedidos', 'Clientes', 'Productos', 'Cotizaciones'],
      ocultos: ['Inicio', 'Finanzas', 'Configuración'],
      paginas: [
        ['/pedidos', (p) => p.getByTestId('pedido-fila').first()],
        ['/clientes', (p) => p.getByTestId('cliente-fila').first()],
        ['/productos', (p) => p.getByTestId('producto-fila').first()],
        ['/cotizaciones', (p) => p.getByRole('button', { name: 'Todas', exact: true })],
      ],
      negadas: ['/inventario/unidades', '/finanzas/caja'],
    },
    {
      id: 'gerente',
      sellerId: gerente.id,
      pin: gerente.pin,
      destino: /\/pos$/,
      titulo: /^(POS|Nueva venta)$/,
      entradaListo: (p) => p.getByPlaceholder('Buscar producto…'),
      menu: ['POS', 'Mis pedidos', 'Clientes', 'Productos', 'Precios'],
      ocultos: ['Inicio', 'Finanzas', 'Configuración', 'Unidades'],
      paginas: [
        ['/precios', (p) => p.getByRole('heading', { name: 'Listas de precios' }).first()],
        ['/pedidos', (p) => p.getByTestId('pedido-fila').first()],
      ],
      negadas: ['/finanzas/caja', '/configuracion/equipo'],
    },
    {
      id: 'tecnico',
      sellerId: tecnico.id,
      pin: tecnico.pin,
      destino: /\/servicio$/,
      titulo: 'Taller',
      entradaListo: (p) => p.getByTestId('servicio-garantias'),
      menu: ['Taller y garantías'],
      ocultos: ['POS', 'Inicio', 'Clientes'],
      paginas: [
        ['/servicio', (p) => p.getByTestId('servicio-garantias')],
      ],
      negadas: ['/pos', '/clientes'],
    },
    {
      id: 'delivery',
      sellerId: repartidor.id,
      pin: SEED.repartidor.pin,
      destino: /\/delivery\/repartos$/,
      titulo: 'Mis repartos',
      entradaListo: (p) => p.getByTestId('reparto-pedido').first(),
      menu: ['Mis repartos', 'Rendiciones'],
      ocultos: ['POS'],
      paginas: [
        ['/delivery/repartos', (p) => p.getByTestId('reparto-pedido').first()],
        ['/delivery/rendiciones', (p) => p.getByTestId('rendir-abrir')],
      ],
      negadas: ['/pos'],
    },
  ]

  const filas = []
  try {
    for (const rol of ROLES) {
      await cambiarOperador(page, rol.sellerId, rol.pin)
      await page.goto('/')
      await expect(page).toHaveURL(rol.destino)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(rol.titulo)

      // El menú lateral del rol: lo que ve y lo que no.
      await page.setViewportSize(DESKTOP)
      for (const item of rol.menu) {
        await expect(page.locator('aside nav').getByRole('button', { name: item, exact: true }).first(), `${rol.id}: menú ${item}`).toBeVisible({ timeout: 20_000 })
      }
      for (const item of rol.ocultos) {
        await expect(page.locator('aside nav').getByRole('button', { name: item, exact: true }), `${rol.id}: no ve ${item}`).toHaveCount(0)
      }

      // Capturas y medición de la puerta de entrada del rol.
      const puerta = await evidencia(page, {
        nombre: `rol-${rol.id}-entrada`,
        ruta: '/',
        listo: rol.entradaListo || ((p) => p.getByRole('heading', { level: 1 })),
      })
      filas.push(...puerta)

      // Sus páginas: mobile y escritorio sin scroll ni cortes.
      for (const [ruta, listo] of rol.paginas) {
        const nombre = `rol-${rol.id}-${ruta.split('/').filter(Boolean).join('-') || 'inicio'}`
        filas.push(...await evidencia(page, { nombre, ruta, listo }))
      }

      // Rutas de otros roles: redirige a la primera vista permitida.
      for (const negada of rol.negadas) {
        await page.setViewportSize(MOBILE)
        await page.goto(negada)
        await expect(page, `${rol.id} no debería quedarse en ${negada}`).not.toHaveURL(new RegExp(negada.replace(/\//g, '\\/')))
      }
    }
  } finally {
    // Volver a administración y dar de baja los integrantes de prueba.
    try {
      await cambiarOperador(page, adminId, SEED.admin.pin)
      for (const creado of [gerente, tecnico]) {
        await api(page, '/api/users', { method: 'PATCH', body: JSON.stringify({ id: creado.id, status: 'INACTIVE' }) })
      }
    } catch (error) {
      console.warn('[325] limpieza de integrantes:', error?.message || error)
    }
  }
  guardar('roles', filas)
  expect(filas.length).toBeGreaterThan(0)
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. Detalle de cliente, pedido y producto (+ kardex).
// ─────────────────────────────────────────────────────────────────────────────
test('detalles: cliente, pedido y producto con kardex (claro · móvil · oscuro)', async ({ page }) => {
  test.slow()
  const filas = []

  filas.push(...await evidencia(page, {
    nombre: 'detalle-cliente',
    ruta: '/clientes',
    listo: (p) => p.getByTestId('cliente-fila').first(),
    accion: async (p) => {
      await p.getByTestId('cliente-fila').first().click()
      const dialogo = p.getByRole('dialog', { name: /^Cliente: / })
      await expect(dialogo).toBeVisible({ timeout: 20_000 })
      await expect(dialogo.getByText('Total gastado')).toBeVisible({ timeout: 20_000 })
    },
  }))

  filas.push(...await evidencia(page, {
    nombre: 'detalle-pedido',
    ruta: '/pedidos',
    listo: (p) => p.getByTestId('pedido-fila').first(),
    accion: async (p) => {
      await p.getByTestId('pedido-fila').first().click()
      await expect(p.getByRole('button', { name: /Imprimir comprobante/ }).first()).toBeVisible({ timeout: 20_000 })
    },
  }))

  filas.push(...await evidencia(page, {
    nombre: 'detalle-producto-kardex',
    ruta: '/productos',
    listo: (p) => p.getByTestId('producto-fila').first(),
    accion: async (p) => {
      await p.getByTestId('producto-fila').first().click()
      await expect(p.getByTestId('kardex-abrir')).toBeVisible({ timeout: 20_000 })
      await p.getByTestId('kardex-abrir').click()
      await expect(p.getByTestId('kardex-tabla')).toBeVisible({ timeout: 20_000 })
    },
  }))

  guardar('detalles', filas)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Kardex, precios, importación y garantías.
// ─────────────────────────────────────────────────────────────────────────────
test('precios, importación y garantías (claro · móvil · oscuro)', async ({ page }) => {
  test.slow()
  const filas = []

  // Precios: listas y precios por cantidad.
  filas.push(...await evidencia(page, {
    nombre: 'precios',
    ruta: '/precios',
    listo: (p) => p.getByRole('heading', { name: 'Listas de precios' }),
  }))

  // Importación de productos: el modal entra en 390 y se puede usar.
  filas.push(...await evidencia(page, {
    nombre: 'importar-productos',
    ruta: '/productos',
    listo: (p) => p.getByTestId('importar-productos'),
    accion: async (p) => {
      await p.getByTestId('importar-productos').click()
      await expect(p.getByRole('dialog').getByRole('heading', { name: 'Importar productos (CSV o Excel)' })).toBeVisible({ timeout: 20_000 })
      await expect(p.getByLabel('Archivo de productos')).toBeVisible()
    },
  }))

  // Garantías y servicio técnico: la tabla unificada del taller.
  filas.push(...await evidencia(page, {
    nombre: 'garantias-taller',
    ruta: '/servicio',
    listo: (p) => p.getByTestId('servicio-garantias'),
  }))

  guardar('kardex-precios-importacion-garantias', filas)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Modales de crear / editar / rechazar / recibir.
// ─────────────────────────────────────────────────────────────────────────────
test('modales: crear, editar, recibir y rechazar dentro del viewport', async ({ page }) => {
  test.slow()
  const filas = []

  // Crear: alta de cliente.
  filas.push(...await evidencia(page, {
    nombre: 'modal-crear-cliente',
    ruta: '/clientes',
    listo: (p) => p.getByRole('button', { name: '+ Crear cliente' }),
    accion: async (p) => {
      await p.getByRole('button', { name: '+ Crear cliente' }).click()
      await expect(p.getByRole('dialog').getByRole('heading', { name: 'Crear cliente' })).toBeVisible({ timeout: 20_000 })
    },
  }))

  // Editar: la ficha de producto abre con sus campos editables y el kardex.
  filas.push(...await evidencia(page, {
    nombre: 'modal-editar-producto',
    ruta: '/productos',
    listo: (p) => p.getByTestId('producto-fila').first(),
    accion: async (p) => {
      await p.getByTestId('producto-fila').first().click()
      await expect(p.getByTestId('kardex-abrir')).toBeVisible({ timeout: 20_000 })
      await p.getByRole('button', { name: 'Editar', exact: true }).click()
      await expect(p.getByRole('heading', { name: 'Editar producto' })).toBeVisible({ timeout: 20_000 })
    },
  }))

  // Recibir: unidad serializada en inventario.
  filas.push(...await evidencia(page, {
    nombre: 'modal-recibir-unidad',
    ruta: '/inventario/unidades',
    listo: (p) => p.getByTestId('inventario-fila').first(),
    accion: async (p) => {
      await p.getByRole('button', { name: '+ Recibir unidad' }).click()
      await expect(p.getByLabel('IMEI o serial')).toBeVisible({ timeout: 20_000 })
    },
  }))

  // Rechazar: la cotización compartida rechaza con motivo (se cancela después
  // para no mutar la cotización de la evidencia pública).
  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente rechazo QA325 ${Date.now().toString(36).toUpperCase()}` }),
  })
  const cotizacion = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({
      customerId: cliente.body?.id,
      customerName: cliente.body?.name,
      items: [{ description: 'Equipo para rechazo visual', quantity: 1, unitPricePyg: 1500000 }],
    }),
  })
  expect(cotizacion.status, JSON.stringify(cotizacion.body)).toBe(201)
  // Enviada: la página pública muestra el bloque de aceptar/rechazar.
  await api(page, '/api/quotes', { method: 'PATCH', body: JSON.stringify({ id: cotizacion.body.id, status: 'SENT' }) })
  filas.push(...await evidencia(page, {
    nombre: 'modal-rechazar-cotizacion',
    ruta: `/cotizacion/${encodeURIComponent(cotizacion.body.publicToken)}`,
    listo: (p) => p.getByRole('heading', { name: cotizacion.body.number }),
    accion: async (p) => {
      const rechazar = p.getByRole('button', { name: 'Rechazar', exact: true })
      if (await rechazar.count()) {
        await rechazar.click()
        await expect(p.getByText('Motivo del rechazo (opcional)')).toBeVisible({ timeout: 20_000 })
      }
    },
  }))

  guardar('modales', filas)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Portal público y cotizaciones compartidas.
// ─────────────────────────────────────────────────────────────────────────────
test('portal público y cotización compartida (claro · móvil · oscuro)', async ({ page }) => {
  test.slow()
  test.skip(!PEDIDO_SEMILLA.publicToken, 'sin token del pedido semilla (falta global-setup)')
  const filas = []

  filas.push(...await evidencia(page, {
    nombre: 'portal-pedido-publico',
    ruta: `/pedido/${encodeURIComponent(PEDIDO_SEMILLA.publicToken)}`,
    listo: (p) => p.getByText(PEDIDO_SEMILLA.orderNumber).first(),
  }))

  const marca = Date.now().toString(36).toUpperCase()
  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente público QA325 ${marca}`, phone: `0985${String(Date.now()).slice(-6)}` }),
  })
  const cotizacion = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({
      customerId: cliente.body?.id,
      customerName: cliente.body?.name,
      validUntil: new Date(Date.now() + 2 * 86400000).toISOString(),
      items: [
        { description: 'iPhone 15 · 128 GB', quantity: 1, unitPricePyg: 4850000 },
        { description: 'Funda de silicona', quantity: 2, unitPricePyg: 80000 },
      ],
    }),
  })
  expect(cotizacion.status, JSON.stringify(cotizacion.body)).toBe(201)
  await api(page, '/api/quotes', { method: 'PATCH', body: JSON.stringify({ id: cotizacion.body.id, status: 'SENT' }) })

  filas.push(...await evidencia(page, {
    nombre: 'portal-cotizacion-publica',
    ruta: `/cotizacion/${encodeURIComponent(cotizacion.body.publicToken)}`,
    listo: (p) => p.getByRole('heading', { name: cotizacion.body.number }),
  }))

  // Cuenta del cliente: cotizaciones, avisos y enlace compartido.
  const acceso = await api(page, `/api/customers/${encodeURIComponent(cliente.body.id)}/access-token`, {
    method: 'POST',
    body: JSON.stringify({ level: 'rapido' }),
  })
  expect(acceso.status, JSON.stringify(acceso.body)).toBe(200)
  filas.push(...await evidencia(page, {
    nombre: 'portal-cuenta-cliente',
    ruta: `/cuenta/${encodeURIComponent(acceso.body.token)}`,
    listo: (p) => p.getByTestId('portal-cotizaciones'),
  }))

  guardar('portal-publico', filas)
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Impresión y correos.
// ─────────────────────────────────────────────────────────────────────────────
test('impresión y correos (comprobante · cotización · impresoras)', async ({ page }) => {
  test.slow()
  const filas = []

  // Comprobante del pedido: preview con formato y niveles.
  filas.push(...await evidencia(page, {
    nombre: 'impresion-comprobante',
    ruta: '/pedidos',
    listo: (p) => p.getByTestId('pedido-fila').first(),
    accion: async (p) => {
      await p.getByTestId('pedido-fila').first().click()
      await p.getByRole('button', { name: /Imprimir comprobante/ }).first().click({ timeout: 20_000 })
      await expect(p.getByRole('dialog', { name: 'Comprobante' })).toBeVisible({ timeout: 20_000 })
      await expect(p.getByTitle('Vista previa del comprobante')).toBeVisible()
    },
  }))

  // Correo de cotización: el diálogo entra en 390 y el envío no miente sin
  // transporte. Se usa una cotización con ficha (el camino soportado).
  const marca = Date.now().toString(36).toUpperCase()
  const clienteCorreo = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente correo QA325 ${marca}`, phone: `0985${String(Date.now()).slice(-6)}` }),
  })
  const cotizacion = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({
      customerId: clienteCorreo.body?.id,
      customerName: clienteCorreo.body?.name,
      items: [{ description: 'Equipo cotizado QA325', quantity: 1, unitPricePyg: 750000 }],
    }),
  })
  expect([200, 201], JSON.stringify(cotizacion.body)).toContain(cotizacion.status)
  filas.push(...await evidencia(page, {
    nombre: 'correo-cotizacion',
    ruta: '/cotizaciones',
    listo: (p) => p.getByTestId('cotizaciones-tabla'),
    accion: async (p) => {
      const fila = p.getByTestId('cotizacion-fila').filter({ hasText: cotizacion.body.number }).first()
      await expect(fila).toBeVisible({ timeout: 20_000 })
      await fila.getByRole('button', { name: 'Correo' }).click()
      await expect(p.getByRole('dialog').getByRole('heading', { name: /por correo/ })).toBeVisible({ timeout: 20_000 })
      await expect(p.getByLabel('Correo del cliente')).toBeVisible()
    },
  }))

  // Impresoras: puentes, cola y prueba local.
  filas.push(...await evidencia(page, {
    nombre: 'impresion-dispositivos',
    ruta: '/configuracion/dispositivos',
    listo: (p) => p.getByText('Configurá y probá tus impresoras térmicas').first(),
  }))

  // Prueba funcional del envío (una sola vez): con transporte avisa el envío;
  // sin transporte, lo dice en vez de mentir (mismo criterio que qa-250).
  await page.setViewportSize(DESKTOP)
  await page.goto('/cotizaciones')
  await expect(page.getByTestId('cotizaciones-tabla')).toBeVisible({ timeout: 30_000 })
  const filaCorreo = page.getByTestId('cotizacion-fila').filter({ hasText: cotizacion.body.number }).first()
  await expect(filaCorreo).toBeVisible({ timeout: 20_000 })
  await filaCorreo.getByRole('button', { name: 'Correo' }).click()
  const dialogoCorreo = page.getByRole('dialog')
  await expect(dialogoCorreo.getByRole('heading', { name: /por correo/ })).toBeVisible({ timeout: 20_000 })
  await dialogoCorreo.getByLabel('Correo del cliente').fill(`qa325-${marca.toLowerCase()}@ejemplo.invalid`)
  await dialogoCorreo.getByRole('button', { name: 'Enviar cotización' }).click()
  const honesto = dialogoCorreo.getByText(/no está configurado|El envío quedó fallido/)
  const enviado = dialogoCorreo.getByText(/Cotización enviada|En camino a/)
  await expect(honesto.or(enviado).first()).toBeVisible({ timeout: 20_000 })
  const resultadoCorreo = (await honesto.count()) ? 'sin-transporte-avisa' : 'encolado'
  console.log(`[325:correo] resultado=${resultadoCorreo}`)
  guardar('correo-resultado', [{ marca, cotizacion: cotizacion.body.number, resultado: resultadoCorreo }])

  guardar('impresion-correos', filas)
})
