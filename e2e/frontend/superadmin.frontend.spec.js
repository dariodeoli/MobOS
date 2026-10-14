import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Panel de plataforma (/superadmin). Frontend-only: el API se simula. Cubre la
// redirección cuando el API niega el acceso y el panel a 390 y 1440 (claro y
// oscuro), sin scroll horizontal y con objetivos táctiles de 44 px.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-superadmin-qa'

function serie(base, dias = 30) {
  const hoy = new Date(Date.UTC(2026, 9, 14))
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoy.getTime() - (dias - 1 - i) * 86_400_000)
    return { dia: d.toISOString().slice(0, 10), valor: base + ((i * 7) % 5) }
  })
}
const kpi = (clave, etiqueta, actual, previo, unidad = 'cantidad', extra = {}) => ({
  clave, etiqueta, actual, previo, variacion: previo ? Math.round(((actual - previo) / previo) * 1000) / 10 : null, unidad,
  serie: serie(actual / 30), seriePrevia: serie(previo / 30), fuente: `Fuente de ${etiqueta} · cálculo de prueba.`, ...extra,
})
const RESUMEN = {
  periodo: '30', sinDatos: false,
  kpis: [
    kpi('empresas', 'Empresas', 42, 38),
    kpi('usuariosActivos', 'Usuarios activos', 120, 95),
    kpi('pedidos', 'Pedidos', 900, 700),
    kpi('ventas', 'Ventas (Gs.)', 456_000_000, 380_000_000, 'pyg'),
    kpi('altas', 'Nuevas altas', 4, 0),
    { ...kpi('usuariosNuevos', 'Usuarios nuevos', 0, 0), serie: serie(0).map(p => ({ ...p, valor: 0 })), seriePrevia: [] },
  ],
  totales: { empresasActivas: 40, usuarios: 150, usuariosHabilitados: 140 },
  demo: { empresas: 1, usuarios: 6, pedidos: 30 },
}
const rank = (...pares) => pares.map(([clave, n]) => ({ clave, n, porcentaje: Math.round((n / pares.reduce((a, [, x]) => a + x, 0)) * 1000) / 10 }))
const TRAFICO = {
  periodo: '30',
  landing: {
    sinDatos: false,
    kpis: [kpi('visitas', 'Visitas a la landing', 320, 250), kpi('visitantes', 'Visitantes únicos', 210, 190), { ...kpi('tiempo', 'Tiempo en la página', 83, 70), unidad: 'segundos' }],
    scroll: { promedioPct: 61, buckets: [25, 50, 75, 100].map((pct, i) => ({ pct, n: 90 - i * 20, porcentaje: 90 - i * 20 })), fuente: 'Sitio · scrollPct máximo por visita.' },
    paginas: rank(['/', 280], ['/status', 40]), fuentes: rank(['directo', 150], ['facebook', 100], ['google.com', 70]), dispositivos: rank(['mobile', 220], ['desktop', 100]),
    notas: { paginas: 'Sitio · pageview por ruta.', fuentes: 'Sitio · utm_source o referente.', dispositivos: 'Sitio · tipo de dispositivo.' },
  },
  demo: {
    sinDatos: false,
    kpis: [kpi('demos', 'Demos iniciadas', 60, 40), { ...kpi('duracionDemo', 'Duración media de la demo', 245, 200), unidad: 'segundos' }],
    visitantes: { actual: 50, previo: 30, variacion: 66.7 },
    roles: rank(['ADMIN', 25], ['VENDEDOR', 20], ['TECNICO', 8]), modulos: rank(['pos', 90], ['pedidos', 40], ['stock', 22]),
    conversion: { visitantes: 50, convertidos: 6, porcentaje: 12 },
    notas: { roles: 'Demo · demo_start por rol.', modulos: 'Demo · demo_view por módulo.', conversion: 'Demo · clic en Crear cuenta tras iniciar la demo.' },
  },
}
const EMPRESAS = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, name: `Tienda ${i + 1}`, slug: `tienda-${i}`, email: `t${i}@ejemplo.test`, createdAt: '2026-09-01T12:00:00Z', archivedAt: null, usuarios: 3, pedidos: 10 + i, ultimaActividad: '2026-10-13T20:00:00Z' }))
const USUARIOS = Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, name: `Persona ${i + 1}`, email: `p${i}@ejemplo.test`, role: i % 2 ? 'VENDEDOR' : 'ADMIN', status: 'ACTIVE', createdAt: '2026-09-01T12:00:00Z', lastAccessAt: '2026-10-13T20:00:00Z', empresaId: 't1', empresa: 'Tienda 1' }))

async function montar(page, { acceso = true } = {}) {
  const pedidos = []
  await page.route(/https:\/\//, route => route.abort())
  await page.route('**/api/**', async route => {
    const { pathname, searchParams } = new URL(route.request().url())
    // El glob también atrapa módulos de Vite (/src/lib/api/…): solo se simula /api/.
    if (!pathname.startsWith('/api/')) return route.continue()
    pedidos.push(`${pathname}?${searchParams}`)
    if (pathname === '/api/superadmin/access') return acceso ? route.fulfill({ status: 200, json: { ok: true } }) : route.fulfill({ status: 404, json: { message: 'No encontrado.' } })
    if (pathname === '/api/superadmin/resumen') return route.fulfill({ status: 200, json: RESUMEN })
    if (pathname === '/api/superadmin/trafico') return route.fulfill({ status: 200, json: TRAFICO })
    if (pathname === '/api/superadmin/empresas') return route.fulfill({ status: 200, json: { items: EMPRESAS, total: 61, pagina: Number(searchParams.get('pagina') || 1), porPagina: 30 } })
    if (pathname === '/api/superadmin/usuarios') return route.fulfill({ status: 200, json: { items: USUARIOS, total: 30, pagina: 1, porPagina: 30 } })
    if (pathname.startsWith('/api/superadmin/empresas/')) return route.fulfill({ status: 200, json: { ...EMPRESAS[0], emailVerifiedAt: '2026-09-01T12:00:00Z', usuariosActivos: 3, sucursales: 1, pedidos30: 12, ventas30: 12_345_678, equipo: [{ id: 'u1', name: 'Dueño Uno', role: 'ADMIN', status: 'ACTIVE' }] } })
    if (pathname.startsWith('/api/superadmin/usuarios/')) return route.fulfill({ status: 200, json: { ...USUARIOS[0], segundosActivos: 7200, sesionesAbiertas: 1, pedidos: 5, ultimaActividad: '2026-10-13T20:00:00Z' } })
    if (pathname === '/api/auth/me') return route.fulfill({ status: 401, json: { message: 'Sin sesión' } })
    return route.fulfill({ status: 200, json: [] })
  })
  await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', localStorage.getItem('mobos:theme') || 'light') } catch { /* sin storage */ } })
  return pedidos
}

const sinScroll = page => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ancho: innerWidth }))

test('sin acceso, /superadmin vuelve al inicio sin mostrar el panel', async ({ page }) => {
  await montar(page, { acceso: false })
  await page.goto('/superadmin')
  await expect.poll(() => new URL(page.url()).pathname).not.toMatch(/^\/superadmin/)
  await expect(page.getByTestId('superadmin-shell')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Plataforma')
  await page.goto('/superadmin/usuarios')
  await expect.poll(() => new URL(page.url()).pathname).not.toMatch(/^\/superadmin/)
})

for (const [ancho, alto, oscuro] of [[1440, 900, false], [390, 844, true], [360, 780, false]]) {
  test(`${ancho} ${oscuro ? 'oscuro' : 'claro'}: resumen, empresas y usuarios sin scroll horizontal`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width: ancho, height: alto })
    await montar(page)
    await page.addInitScript(oscuroFlag => { try { localStorage.setItem('mobos:theme', oscuroFlag ? 'dark' : 'light') } catch { /* sin storage */ } }, oscuro)
    await page.goto('/superadmin')

    // Resumen: tarjetas, deltas, notas «fuente · cálculo» y período anterior.
    await expect(page.getByTestId('superadmin-resumen')).toBeVisible()
    await expect(page.getByTestId('kpi-empresas-valor')).toHaveText('42')
    await expect(page.getByTestId('kpi-ventas-valor')).toContainText('456.000.000')
    await expect(page.getByTestId('kpi-usuariosNuevos-vacio')).toHaveText('Sin datos todavía')
    await expect(page.getByTestId('kpi-pedidos-fuente')).toContainText('cálculo')
    await expect(page.getByTestId('kpi-altas')).toContainText('sin base previa')
    await expect(page.getByTestId('resumen-demo')).toContainText('excluidas de todas las cifras')
    for (const id of ['periodo-hoy', 'periodo-7', 'periodo-30', 'periodo-90', 'periodo-mes', 'periodo-mes-anterior'])
      expect((await page.getByTestId(id).boundingBox()).height, id).toBeGreaterThanOrEqual(44)
    await page.getByTestId('periodo-7').click()
    await expect(page.getByTestId('periodo-7')).toHaveAttribute('aria-pressed', 'true')
    let m = await sinScroll(page)
    expect(m.scroll, 'resumen: scroll horizontal').toBeLessThanOrEqual(m.ancho)
    await page.screenshot({ path: `${out}/resumen-${ancho}-${oscuro ? 'oscuro' : 'claro'}.png`, fullPage: false })

    // Empresas: búsqueda, paginación y detalle en ventana centrada con X roja.
    await page.getByTestId(ancho >= 1024 ? 'nav-empresas' : 'nav-empresas').filter({ visible: true }).click()
    await expect(page.getByTestId('lista-empresas')).toBeVisible()
    await expect(page.getByTestId('lista-total')).toContainText('61 en total · página 1 de 3')
    m = await sinScroll(page)
    expect(m.scroll, 'empresas: scroll horizontal').toBeLessThanOrEqual(m.ancho)
    await page.screenshot({ path: `${out}/empresas-${ancho}-${oscuro ? 'oscuro' : 'claro'}.png` })
    const fila = page.getByTestId('lista-fila').filter({ visible: true }).first()
    expect((await fila.boundingBox()).height).toBeGreaterThanOrEqual(44)
    await page.getByTestId('pagina-siguiente').click()
    await expect(page.getByTestId('lista-total')).toContainText('página 2 de 3')
    await fila.click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()
    await expect(page.getByTestId('detalle-empresa')).toContainText('Tienda 1')
    const cerrar = dialogo.getByRole('button', { name: 'Cerrar' })
    expect((await cerrar.boundingBox()).width).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: `${out}/empresa-detalle-${ancho}-${oscuro ? 'oscuro' : 'claro'}.png` })
    m = await sinScroll(page)
    expect(m.scroll, 'detalle: scroll horizontal').toBeLessThanOrEqual(m.ancho)
    await page.keyboard.press('Escape')
    await expect(dialogo).toHaveCount(0)

    // Tráfico y demo.
    await page.getByTestId('nav-trafico').filter({ visible: true }).click()
    await expect(page.getByTestId('superadmin-trafico')).toBeVisible()
    await expect(page.getByTestId('kpi-tiempo-valor')).toHaveText('1 min 23 s')
    await expect(page.getByTestId('kpi-duracionDemo-valor')).toHaveText('4 min 05 s')
    await expect(page.getByTestId('trafico-roles')).toContainText('Dueño')
    await expect(page.getByTestId('trafico-modulos')).toContainText('pos')
    await expect(page.getByTestId('trafico-conversion')).toContainText('12 %')
    await expect(page.getByTestId('trafico-fuentes')).toContainText('Directo')
    await expect(page.getByTestId('trafico-dispositivos')).toContainText('Celular')
    await expect(page.getByTestId('trafico-scroll')).toContainText('Llegaron al 50 %')
    await expect(page.getByTestId('periodo-30')).toBeVisible()
    m = await sinScroll(page)
    expect(m.scroll, 'tráfico: scroll horizontal').toBeLessThanOrEqual(m.ancho)
    await page.screenshot({ path: `${out}/trafico-${ancho}-${oscuro ? 'oscuro' : 'claro'}.png`, fullPage: true })

    // Usuarios.
    await page.getByTestId('nav-usuarios').filter({ visible: true }).click()
    await expect(page.getByTestId('lista-usuarios')).toBeVisible()
    await page.getByTestId('lista-fila').filter({ visible: true }).first().click()
    await expect(page.getByTestId('detalle-usuario')).toContainText('Persona 1')
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
    m = await sinScroll(page)
    expect(m.scroll, 'usuarios: scroll horizontal').toBeLessThanOrEqual(m.ancho)
  })
}

test('la búsqueda y los filtros llegan al API como parámetros (sin cargar todo)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const pedidos = await montar(page)
  await page.goto('/superadmin/empresas')
  await page.getByTestId('lista-buscar').fill('alfa')
  await page.getByTestId('filtro-estado').selectOption('archivadas')
  await expect.poll(() => pedidos.some(p => p.startsWith('/api/superadmin/empresas?') && p.includes('q=alfa') && p.includes('estado=archivadas'))).toBe(true)
})

test('la landing manda un pageview anónimo y respeta «No rastrear»', async ({ page }) => {
  const enviados = []
  await page.route('**/api/public/track', async route => { enviados.push(route.request().postData()); return route.fulfill({ status: 204 }) })
  await page.route('**/api/**', route => (new URL(route.request().url()).pathname.startsWith('/api/public/track') ? route.fallback() : new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ status: 401, json: {} }) : route.continue()))
  await page.goto('/landing-preview')
  await expect.poll(() => enviados.length).toBeGreaterThan(0)
  const evento = JSON.parse(enviados[0])
  expect(evento).toMatchObject({ kind: 'landing', name: 'pageview', path: '/landing-preview' })
  expect(evento.visitorId).toMatch(/^[a-f0-9]{32}$/)
  expect(Object.keys(evento).sort()).toEqual(['kind', 'name', 'path', 'referrer', 'utmSource', 'visitorId'].filter(k => k in evento).sort())
})

test('con DNT activado no se envía nada', async ({ page }) => {
  const enviados = []
  await page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' }))
  await page.route('**/api/public/track', route => { enviados.push(1); return route.fulfill({ status: 204 }) })
  await page.goto('/landing-preview')
  await page.waitForTimeout(1500)
  expect(enviados).toHaveLength(0)
})
