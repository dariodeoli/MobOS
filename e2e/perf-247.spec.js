// #247: auditoría de performance de las pantallas más usadas.
//
// Mide, para inventario / POS / clientes / finanzas, una carga fría (contexto
// nuevo, sin caché HTTP) y una caliente (misma pestaña, recarga), con CPU
// limitada para que las diferencias sean comparables:
//   - tiempo hasta el marcador de "listo" de cada pantalla,
//   - navegación (TTFB, DOMContentLoaded, load),
//   - cantidad y peso de los recursos de la API y de los scripts,
// y deja el JSON + un Markdown en `test-results/perf-247/` (o MOBOS_PERF_SALIDA).
//
// Uso:  MOBOS_PERF_AUDIT=1 MOBOS_E2E_BACKEND=prod npx playwright test e2e/perf-247.spec.js --project=admin
// En la suite normal queda salteado (no corre si no está la variable).
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const AUDITORIA = process.env.MOBOS_PERF_AUDIT === '1'
const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const SALIDA = process.env.MOBOS_PERF_SALIDA || 'test-results/perf-247'
const CPU_THROTTLE = Number(process.env.MOBOS_PERF_CPU || 4)
const esApiReal = (url) => url.startsWith(`http://localhost:${API_PORT}/api/`) || url.includes('api.moboss.online/api/')

test.describe.configure({ retries: 0 })
test.skip(!AUDITORIA, 'Auditoría de performance (#247): usar MOBOS_PERF_AUDIT=1')

const PANTALLAS = [
  {
    id: 'inventario',
    ruta: '/inventario/unidades',
    listo: async (page) => {
      await expect(page.getByRole('heading', { name: 'Unidades' })).toBeVisible()
      await expect(page.getByTestId('inventario-fila').first()).toBeVisible()
    },
  },
  {
    id: 'pos',
    ruta: '/pos',
    listo: async (page) => {
      await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    },
  },
  {
    id: 'pedidos',
    ruta: '/pedidos',
    listo: async (page) => {
      await expect(page.getByTestId('pedidos-tabla')).toBeVisible()
      await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
    },
  },
  {
    id: 'clientes',
    ruta: '/clientes',
    listo: async (page) => {
      await expect(page.getByTestId('cliente-fila').first()).toBeVisible()
    },
  },
  {
    id: 'finanzas',
    ruta: '/finanzas/caja',
    listo: async (page) => {
      await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()
    },
  },
]

const medirEnPagina = (page) =>
  page.evaluate((puertoApi) => {
    const nav = performance.getEntriesByType('navigation')[0] || {}
    const recursos = performance.getEntriesByType('resource').map((r) => ({
      url: r.name,
      tipo: r.initiatorType,
      bytes: r.transferSize || 0,
      decodificado: r.decodedBodySize || 0,
      ms: Math.round(r.duration || 0),
    }))
    // Solo pedidos reales al API (en dev el server sirve también módulos /src/*).
    const esApi = (url) => url.startsWith(`http://localhost:${puertoApi}/api/`) || url.includes('api.moboss.online/api/')
    return {
      ttfb: Math.round((nav.responseStart || 0) - (nav.startTime || 0)),
      domContentLoaded: Math.round((nav.domContentLoadedEventEnd || 0) - (nav.startTime || 0)),
      load: Math.round((nav.loadEventEnd || 0) - (nav.startTime || 0)),
      navegacionTransfer: nav.transferSize || 0,
      api: recursos.filter((r) => esApi(r.url)),
      scripts: recursos.filter((r) => r.tipo === 'script' || r.url.endsWith('.js') || r.url.endsWith('.jsx')),
      recursos: recursos.length,
      transferTotal: recursos.reduce((suma, r) => suma + r.bytes, 0) + (nav.transferSize || 0),
    }
  }, process.env.MOBOS_E2E_API_PORT || '3001')

async function medir(page, pantalla, etiqueta, { recargar = false, rep = 1 } = {}) {
  const arranque = Date.now()
  if (recargar) await page.reload({ waitUntil: 'commit' })
  else await page.goto(pantalla.ruta, { waitUntil: 'commit' })
  await pantalla.listo(page)
  const listoMs = Date.now() - arranque
  const datos = await medirEnPagina(page)
  const apiBytes = datos.api.reduce((suma, r) => suma + r.bytes, 0)
  const apiMs = datos.api.reduce((suma, r) => suma + r.ms, 0)
  const scriptsBytes = datos.scripts.reduce((suma, r) => suma + r.bytes, 0)
  const sinOrigen = (url) => url.replace(/^https?:\/\/[^/]+/, '')
  const lentas = [...datos.api].sort((a, b) => b.ms - a.ms).slice(0, 5)
    .map((r) => ({ url: sinOrigen(r.url).slice(0, 90), ms: r.ms, bytes: r.bytes }))
  // Todas las llamadas al API, para detectar duplicadas en la misma carga.
  const apiTodas = datos.api.map((r) => ({ url: sinOrigen(r.url).slice(0, 120), ms: r.ms }))
  const porRuta = {}
  for (const llamada of apiTodas) {
    const ruta = llamada.url.split('?')[0]
    porRuta[ruta] = (porRuta[ruta] || 0) + 1
  }
  const duplicadas = Object.entries(porRuta).filter(([, n]) => n > 1).map(([ruta, n]) => ({ ruta, n }))
  return {
    pantalla: pantalla.id,
    carga: etiqueta,
    rep,
    listoMs,
    ttfbMs: datos.ttfb,
    domContentLoadedMs: datos.domContentLoaded,
    loadMs: datos.load,
    pedidosApi: datos.api.length,
    apiMs,
    apiBytes,
    scripts: datos.scripts.length,
    scriptsBytes,
    transferTotal: datos.transferTotal,
    lentas,
    apiTodas,
    duplicadas,
  }
}

test('auditoría de carga de las pantallas más usadas (#247)', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  mkdirSync(SALIDA, { recursive: true })
  const storageState = test.info().project.use?.storageState || 'e2e/.auth/admin.json'

  const conThrottle = async (page) => {
    const cdp = await page.context().newCDPSession(page).catch(() => null)
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE }).catch(() => {})
  }

  const filas = []
  const REPS = Number(process.env.MOBOS_PERF_REPS || 3)
  for (const pantalla of PANTALLAS) {
    for (let rep = 1; rep <= REPS; rep += 1) {
      // Contexto nuevo: sin caché HTTP ni foto local (primera visita).
      const fresco = await browser.newContext(storageState ? { storageState } : {})
      try {
        const primera = await fresco.newPage()
        await conThrottle(primera)
        filas.push(await medir(primera, pantalla, 'fria', { rep }))
        // Caliente: recarga en la misma pestaña (caché HTTP + service worker).
        filas.push(await medir(primera, pantalla, 'caliente', { recargar: true, rep }))
        await primera.close()

        // Segunda visita: misma sesión y almacenamiento (foto local ya guardada).
        const segunda = await fresco.newPage()
        await conThrottle(segunda)
        filas.push(await medir(segunda, pantalla, 'segunda', { rep }))
        await segunda.close()
      } finally {
        await fresco.close()
      }
    }
  }

  const mediana = (valores) => {
    const orden = [...valores].sort((a, b) => a - b)
    const medio = Math.floor(orden.length / 2)
    return orden.length % 2 ? orden[medio] : Math.round((orden[medio - 1] + orden[medio]) / 2)
  }
  const resumen = {
    fecha: new Date().toISOString(),
    cpuThrottle: CPU_THROTTLE,
    repeticiones: REPS,
    pantallas: filas,
  }
  writeFileSync(`${SALIDA}/perf-247.json`, `${JSON.stringify(resumen, null, 2)}\n`)

  // Tabla de medianas por pantalla y tipo de carga.
  const celdas = []
  for (const pantalla of PANTALLAS) {
    for (const carga of ['fria', 'caliente', 'segunda']) {
      const grupo = filas.filter((f) => f.pantalla === pantalla.id && f.carga === carga)
      if (!grupo.length) continue
      const api = grupo.reduce((s, f) => s + f.apiMs, 0) / grupo.length
      celdas.push({
        pantalla: pantalla.id,
        carga,
        listoMs: mediana(grupo.map((f) => f.listoMs)),
        domContentLoadedMs: mediana(grupo.map((f) => f.domContentLoadedMs)),
        loadMs: mediana(grupo.map((f) => f.loadMs)),
        pedidosApi: mediana(grupo.map((f) => f.pedidosApi)),
        apiMs: Math.round(api),
        scripts: mediana(grupo.map((f) => f.scripts)),
        scriptsBytes: mediana(grupo.map((f) => f.scriptsBytes)),
      })
    }
  }

  const tabla = [
    '# Auditoría de performance (#247)',
    '',
    `Fecha: ${resumen.fecha} · CPU throttle ${CPU_THROTTLE}x · ${REPS} repeticiones (mediana)`,
    '',
    '| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...celdas.map((f) => `| ${f.pantalla} | ${f.carga} | **${f.listoMs}** | ${f.domContentLoadedMs} | ${f.loadMs} | ${f.pedidosApi}, ${f.apiMs} | ${f.scripts}, ${Math.round(f.scriptsBytes / 1024)} |`),
    '',
    '## APIs más lentas por pantalla (primera corrida de cada combinación)',
    '',
    ...PANTALLAS.flatMap((pantalla) => (['fria', 'caliente', 'segunda']).flatMap((carga) => {
      const f = filas.find((x) => x.pantalla === pantalla.id && x.carga === carga && x.rep === 1)
      if (!f) return []
      return [
        `### ${pantalla.id} · ${carga}`,
        ...f.lentas.map((r) => `- ${r.ms} ms · ${r.bytes} B · \`${r.url}\``),
        ...(f.duplicadas.length ? ['', `Repetidas: ${f.duplicadas.map((d) => `${d.ruta} ×${d.n}`).join(', ')}`] : []),
        '',
      ]
    })),
  ]
  writeFileSync(`${SALIDA}/perf-247.md`, `${tabla.join('\n')}\n`)
  console.log(`[perf-247] evidencia en ${SALIDA}/perf-247.{json,md}`)
  expect(filas.length).toBe(PANTALLAS.length * 3 * REPS)
})

// Navegación entre secciones con la sesión caliente: es lo que la gente hace
// todo el día (POS → Pedidos → Clientes → Inventario). Con #247 el panel
// adelanta esos chunks cuando el equipo está ocioso; acá se mide el efecto.
test('navegación entre las secciones más usadas (#247)', async ({ browser }) => {
  test.setTimeout(5 * 60_000)
  const storageState = test.info().project.use?.storageState || 'e2e/.auth/admin.json'
  const fresco = await browser.newContext(storageState ? { storageState } : {})
  try {
    const page = await fresco.newPage()
    const cdp = await page.context().newCDPSession(page).catch(() => null)
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE }).catch(() => {})
    // Red lenta (3G): acá se ve el efecto del adelanto ocioso. Se apaga con
    // MOBOS_PERF_NET=0 para medir en red local.
    const redLenta = process.env.MOBOS_PERF_NET !== '0'
    if (cdp && redLenta) {
      await cdp.send('Network.enable').catch(() => {})
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: Math.round(200 * 1024),
        uploadThroughput: Math.round(100 * 1024),
      }).catch(() => {})
    }

    await page.goto('/pos', { waitUntil: 'commit' })
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    // El adelanto ocioso avisa cuando terminó (y si algún chunk falla, el
    // navegador lo carga igual al entrar: acá se registra si llegó a tiempo).
    const prefetch = await page.evaluate(() => new Promise((resolve) => {
      let listo = false
      window.addEventListener('mobos:prefetch-listo', () => { listo = true; resolve('listo') }, { once: true })
      window.setTimeout(() => resolve(listo ? 'listo' : 'sin-aviso'), 10_000)
    }))

    const pasos = [
      ['Pedidos', async () => expect(page.getByTestId('pedidos-tabla')).toBeVisible()],
      ['Clientes', async () => expect(page.getByTestId('cliente-fila').first()).toBeVisible()],
      ['Unidades', async () => expect(page.getByTestId('inventario-fila').first()).toBeVisible()],
      ['POS', async () => expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()],
    ]
    const filas = []
    for (const [seccion, listo] of pasos) {
      const arranque = Date.now()
      // El ítem puede compartir nombre con su grupo (p. ej. «Clientes»): el
      // ítem es el último botón con ese nombre dentro del menú.
      await page.locator('aside nav').getByRole('button', { name: seccion, exact: true }).last().click()
      await listo()
      filas.push({ seccion, listoMs: Date.now() - arranque })
    }

    const salida = process.env.MOBOS_PERF_SALIDA || 'test-results/perf-247'
    mkdirSync(salida, { recursive: true })
    writeFileSync(
      `${salida}/perf-247-navegacion.json`,
      `${JSON.stringify({ fecha: new Date().toISOString(), cpuThrottle: CPU_THROTTLE, redLenta, prefetch, filas }, null, 2)}\n`,
    )
    console.log(`[perf-247] navegación (${prefetch}): ${filas.map((f) => `${f.seccion} ${f.listoMs} ms`).join(' · ')}`)
    expect(filas.length).toBe(pasos.length)
  } finally {
    await fresco.close()
  }
})
