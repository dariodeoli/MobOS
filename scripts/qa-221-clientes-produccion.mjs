#!/usr/bin/env node
// Verificación post-deploy del dominio Clientes en la demo pública (#194),
// evidencia para #221: clientes y pedidos asociados con agregados calculados
// como la cuenta real (total gastado, pedidos, última compra), ficha con
// Resumen/Pedidos/Estadísticas, portal del cliente y WhatsApp con plantilla.
//
// No usa sesiones ni datos reales: entra a la demo pública (/demo → Dueño) y
// verifica que NADA del recorrido llame al API real (demo 100% local).
//
// Uso:
//   node scripts/qa-221-clientes-produccion.mjs
//   MOBOS_QA_URL=http://localhost:5249 MOBOS_QA_OUT=/tmp/qa221 node scripts/qa-221-clientes-produccion.mjs
//
// Salida: <QA_OUT>/*.jpg + resultados.json (versión desplegada, agregados
// observados y llamadas al API). Sale 1 si algún paso falla o si la demo tocó
// el API real.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API_HOST = process.env.MOBOS_QA_API_HOST || 'api.moboss.online'
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-221-demo-clientes-prod')
const VERSION_MINIMA = '1.0.136'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const llamadasApi = []
const observaciones = []
let contador = 0
let versionDesplegada = null

// Agregados del seed demo (determinísticos): 5 compras válidas (la cancelada
// MOB-0031 no cuenta), Gs 7.750.000, saldo Gs 1.500.000, ticket Gs 1.550.000
// y frecuencia cada 172 días (intervalos 33/50/305/300 sobre 4 intervalos).
const ESPERADO = {
  totalGastado: 'Gs 7.750.000',
  saldo: 'Gs 1.500.000',
  ticket: 'Gs 1.550.000',
  frecuencia: 'Cada 172 días',
  favorito: 'iPhone 15',
  pedidos: ['MOB-#0008', 'MOB-#0005', 'MOB-#0002'],
  serial: '356789012345678',
}

const afirmar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }
const plano = (texto) => String(texto || '').replace(/\s+/g, ' ').trim()

async function shot(page, nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  const antes = llamadasApi.length
  try {
    const detalle = await fn(capturas)
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

const compararVersion = (a, b) => {
  const [x, y, z] = String(a).split('.').map(Number)
  const [p, q, r] = String(b).split('.').map(Number)
  return x - p || y - q || z - r
}

const esperarTexto = async (fn, timeout = 8000) => {
  const limite = Date.now() + timeout
  let valor = ''
  while (Date.now() < limite) {
    valor = await fn()
    if (plano(valor)) return valor
    await new Promise((listo) => setTimeout(listo, 250))
  }
  return valor
}

const browser = await chromium.launch()
const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await contexto.newPage()
page.on('request', (req) => {
  const url = req.url()
  if (url.includes(API_HOST)) llamadasApi.push(url.slice(0, 160))
})
// wa.me es externo: no se descarga, solo se lee la URL del chat.
let ultimoWa = ''
contexto.on('request', (req) => { if (/wa\.me/i.test(req.url())) ultimoWa = req.url() })
await contexto.route('**/wa.me/**', (ruta) => ruta.abort())

let ficha = null

// 1) Entrada anónima a la demo y perfil Dueño (ahí vive la ficha de clientes).
await paso('entrada anónima: /demo abre la entrada de perfiles sin login', async (capturas) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  capturas.push(await shot(page, 'demo-entrada'))
  const texto = await page.locator('body').innerText()
  versionDesplegada = (texto.match(/v\d+\.\d+\.\d+/) || [null])[0]?.slice(1) || null
  afirmar(!page.url().includes('/login'), `la demo redirigió a ${page.url()}`)
  afirmar(await page.getByRole('button', { name: /Entrar como Dueño/ }).count(), 'no aparece el perfil Dueño')
  afirmar(/datos ficticios/i.test(texto), 'la entrada no avisa que los datos son ficticios')
  afirmar(versionDesplegada, 'no se pudo leer la versión desplegada')
  afirmar(compararVersion(versionDesplegada, VERSION_MINIMA) >= 0, `versión desplegada ${versionDesplegada} < ${VERSION_MINIMA}`)
  return `demo pública sin login · versión v${versionDesplegada}`
})

await paso('panel del Dueño en modo demo', async (capturas) => {
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.waitForTimeout(1800)
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
    await page.getByRole('button', { name: 'Cerrar' }).last().click()
  }
  capturas.push(await shot(page, 'panel-dueno-demo'))
  const texto = await page.locator('body').innerText()
  afirmar(/Modo demo: datos ficticios/i.test(texto), 'no se ve el banner de modo demo')
  return `panel abierto en ${page.url()}`
})

// 2) Clientes: la lista muestra los agregados calculados como la cuenta real.
await paso('lista de clientes con agregados (pedidos y total gastado)', async (capturas) => {
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.getByLabel('Buscar clientes').fill('Lucía')
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await fila.waitFor({ timeout: 20000 })
  const texto = await fila.innerText()
  capturas.push(await shot(page, 'lista-clientes-agregados'))
  afirmar(texto.includes(ESPERADO.totalGastado), `la fila no muestra ${ESPERADO.totalGastado}: ${plano(texto)}`)
  afirmar(texto.split('\n').map((linea) => linea.trim()).includes('5'), `la fila no cuenta 5 compras: ${plano(texto)}`)
  afirmar(/\+595 981 123 456/.test(texto), 'la fila no muestra el teléfono con código de país')
  return `fila con 5 compras y ${ESPERADO.totalGastado}`
})

await paso('ficha: resumen con total gastado, saldo y últimas órdenes', async (capturas) => {
  await page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first().click()
  ficha = page.getByRole('dialog')
  await ficha.getByText('Total gastado', { exact: false }).waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  const texto = await ficha.innerText()
  capturas.push(await shot(page, 'ficha-resumen'))
  const unido = plano(texto)
  afirmar(/total gastado gs 7\.750\.000/i.test(unido), `el Resumen no muestra ${ESPERADO.totalGastado}`)
  afirmar(/saldo pendiente gs 1\.500\.000/i.test(unido), `el Resumen no muestra el saldo ${ESPERADO.saldo}`)
  afirmar(/cliente desde/i.test(unido), 'no aparece «Cliente desde»')
  afirmar(/últimas órdenes/i.test(unido), 'no aparece «Últimas órdenes»')
  afirmar(unido.includes(ESPERADO.pedidos[0]), `las últimas órdenes no incluyen ${ESPERADO.pedidos[0]}`)
  const kpiPedidos = (texto.match(/PEDIDOS\s*\n\s*(\d+)/) || [null, null])[1]
  if (kpiPedidos && kpiPedidos !== '5') observaciones.push(`la ficha cuenta ${kpiPedidos} pedidos (incluye la venta cancelada) y el listado/estadísticas cuentan 5 compras`)
  if (/No hay pedidos, pagos, deuda, cronología ni portal/i.test(unido)) observaciones.push('la ficha de demo avisa «No hay pedidos, pagos, deuda, cronología ni portal» aunque muestra todos esos datos')
  return `total ${ESPERADO.totalGastado} · saldo ${ESPERADO.saldo} · ${ESPERADO.pedidos[0]}${kpiPedidos ? ` · KPI pedidos ${kpiPedidos}` : ''}`
})

// 3) Pedidos asociados: historial del cliente (con la venta cancelada) y
// equipos con IMEI/serial de sus compras.
await paso('pedidos asociados: historial con estados y equipos con serial', async (capturas) => {
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  await page.waitForTimeout(800)
  const texto = await ficha.innerText()
  capturas.push(await shot(page, 'pedidos-asociados'))
  const unido = plano(texto)
  const compacto = texto.replace(/\s+/g, '')
  for (const numero of ESPERADO.pedidos) afirmar(unido.includes(numero), `el historial no incluye ${numero}`)
  afirmar(/cancelado/i.test(unido), 'no se ve la venta cancelada del historial')
  afirmar(/equipos con imei\/serial/i.test(unido), 'no aparece «Equipos con IMEI/serial»')
  afirmar(compacto.includes(ESPERADO.serial), `no se ve el serial ${ESPERADO.serial} en los equipos del cliente`)
  return `historial con ${ESPERADO.pedidos.join(', ')} + venta cancelada · serial ${ESPERADO.serial}`
})

// 4) Estadísticas: mismas fórmulas que la cuenta real, desde los pedidos demo.
await paso('estadísticas calculadas (ticket, frecuencia, favoritos)', async (capturas) => {
  await ficha.getByRole('tab', { name: /^Estadísticas/ }).click()
  await page.waitForTimeout(900)
  const texto = await ficha.innerText()
  capturas.push(await shot(page, 'estadisticas'))
  const unido = plano(texto)
  afirmar(/compras 5\b/i.test(unido), 'las compras contadas no son 5 (la cancelada no debe contar)')
  afirmar(/ticket promedio gs 1\.550\.000/i.test(unido), `no se ve el ticket promedio ${ESPERADO.ticket}`)
  afirmar(/frecuencia cada 172 días/i.test(unido), `no se ve la frecuencia «${ESPERADO.frecuencia}»`)
  afirmar(/gasto por mes gs [\d.]+/i.test(unido), 'no aparece «Gasto por mes»')
  afirmar(/modelos favoritos/i.test(unido) && unido.includes(ESPERADO.favorito), `no se ve el favorito ${ESPERADO.favorito}`)
  afirmar(/categorías favoritas/i.test(unido), 'no aparecen las categorías favoritas')
  if (/se calculan con las ventas reales de la tienda/i.test(unido)) observaciones.push('las Estadísticas de la demo avisan «se calculan con las ventas reales de la tienda» aunque salen de los pedidos demo')
  if (/\d+ u\. · Gs 0\b/.test(unido)) observaciones.push('los favoritos de la demo muestran los montos por producto en Gs 0 (los ítems demo no traen importe)')
  return `5 compras · ticket ${ESPERADO.ticket} · ${ESPERADO.frecuencia} · favorito ${ESPERADO.favorito}`
})

// 5) Portal del cliente: enlace/QR local de la demo y portal renderizado.
await paso('portal del cliente (QR y cuenta por token local)', async (capturas) => {
  await ficha.getByRole('tab', { name: /^Resumen/ }).click()
  await ficha.getByRole('button', { name: /Portal del cliente/ }).click()
  await page.getByAltText('QR del portal del cliente').waitFor({ timeout: 15000 })
  capturas.push(await shot(page, 'portal-qr'))
  const enlaceCrudo = (await page.locator('p.break-all').textContent())?.trim()
  const enlace = /^https?:/.test(enlaceCrudo || '') ? enlaceCrudo : `${BASE}${enlaceCrudo?.startsWith('/') ? '' : '/'}${enlaceCrudo || ''}`
  afirmar(/\/cuenta\/demo-/.test(enlace || ''), `el enlace del portal no es local de la demo: ${enlace}`)
  await page.goto(enlace)
  await page.waitForTimeout(1500)
  capturas.push(await shot(page, 'portal-cliente'))
  const texto = await page.locator('body').innerText()
  afirmar(texto.includes(ESPERADO.saldo), `el portal no muestra el saldo ${ESPERADO.saldo}`)
  afirmar(texto.includes(ESPERADO.pedidos[0]), `el portal no lista el pedido ${ESPERADO.pedidos[0]}`)
  const tienda = (texto.match(/(Aurora[^\n]*|Tienda demo)/) || [null])[0]
  if (tienda && !/Aurora/.test(tienda)) observaciones.push(`el portal de la demo muestra «${tienda}» y la tienda ficticia es Aurora Móviles`)
  return `${enlace} · saldo ${ESPERADO.saldo} · tienda «${tienda || 'sin nombre'}»`
})

// 6) WhatsApp: plantilla del cliente con sus datos y enlace al chat.
await paso('whatsapp con plantilla, mensaje y enlace al chat', async (capturas) => {
  await page.goto(`${BASE}/clientes?cliente=demo-cliente-lucia`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const ficha2 = page.getByRole('dialog')
  await ficha2.getByText('Total gastado', { exact: false }).waitFor({ timeout: 20000 })
  await ficha2.getByRole('button', { name: /Elegir plantilla de WhatsApp/ }).click()
  const menu = page.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
  await menu.waitFor({ timeout: 10000 })
  const mensaje = await esperarTexto(() => menu.getByLabel('Mensaje de WhatsApp').inputValue())
  capturas.push(await shot(page, 'whatsapp-plantilla'))
  afirmar(mensaje.trim().length > 0, 'la vista previa del mensaje quedó vacía')
  afirmar(/Lucía Fernández/.test(mensaje), `la plantilla no interpola el nombre del cliente: «${plano(mensaje).slice(0, 90)}»`)
  if (/Tu pedido\s+ya está/i.test(mensaje)) observaciones.push('la plantilla demo de Clientes deja «Tu pedido  ya está…» (la variable de pedido no aplica a la ficha del cliente)')
  ultimoWa = ''
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 15000 }),
    menu.getByRole('button', { name: 'Abrir WhatsApp' }).click(),
  ])
  const url = await esperarTexto(() => ultimoWa)
  await popup.close().catch(() => {})
  afirmar(/^https:\/\/wa\.me\/595981123456\?text=/.test(url), `el enlace de WhatsApp no apunta al teléfono del cliente: ${String(url).slice(0, 120)}`)
  return `wa.me/595981123456 · «${plano(mensaje).slice(0, 60)}…»`
})

await contexto.close()
await browser.close()

// La demo no puede pegarle al API real en ningún paso.
const apiOk = llamadasApi.length === 0
const resumen = {
  base: BASE,
  apiVigilada: API_HOST,
  versionDesplegada: versionDesplegada ? `v${versionDesplegada}` : null,
  fecha: new Date().toISOString(),
  esperado: ESPERADO,
  observaciones,
  llamadasApi,
  demoNoTocaApi: apiOk,
  resultados,
}
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resumen, null, 2))
console.log(`\nVersión desplegada: ${versionDesplegada ? `v${versionDesplegada}` : 'desconocida'}`)
console.log(`Llamadas a ${API_HOST}: ${llamadasApi.length} ${apiOk ? '(OK: ninguna)' : '(FALLO)'}`)
console.log(`Fallos: ${resultados.filter(r => r.estado === 'fallo').length}/${resultados.length}`)
if (observaciones.length) console.log(`Observaciones: ${observaciones.length} (ver resultados.json)`)
process.exitCode = resultados.some(r => r.estado === 'fallo') || !apiOk ? 1 : 0
