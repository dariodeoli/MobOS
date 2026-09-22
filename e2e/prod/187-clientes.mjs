// QA de producción (#187) — Clientes completo: ficha, deuda, cronología,
// seguro, nota pública, pedidos asociados, estadísticas (#221), WhatsApp y
// portal público por token; más los públicos con token inválido y el rol
// Vendedor.
//
// Headless y sin sesión real: navega la demo pública (datos aislados en el
// navegador) y los públicos de clientes.moboss.online. La garantía pública con
// token válido no se puede verificar sin una sesión real: queda documentada.
//
// Uso: node e2e/prod/187-clientes.mjs
//   QA187_SHOTS=/tmp/qa187 (capturas + resultados.json)
//   QA_APP / QA_PORTAL / QA_API para otros entornos.
//
// Salida: <QA187_SHOTS>/*.png + resultados.json. Sale 1 si un paso falla o si
// la demo toca el API de clientes/portal.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.QA_APP || 'https://app.moboss.online'
const PORTAL = process.env.QA_PORTAL || 'https://clientes.moboss.online'
const API = process.env.QA_API || 'https://api.moboss.online'
const SHOTS = process.env.QA187_SHOTS || 'docs/QA-187-clientes-produccion'
mkdirSync(SHOTS, { recursive: true })

const VERSION_MINIMA = '1.0.136'
// Agregados del seed demo (#221): 5 compras válidas (la cancelada MOB-0031 no
// cuenta), Gs 7.750.000, saldo Gs 1.500.000, ticket Gs 1.550.000 y frecuencia
// cada 172 días.
const ESPERADO = {
  totalGastado: 'Gs 7.750.000',
  saldo: 'Gs 1.500.000',
  ticket: 'Gs 1.550.000',
  frecuencia: 'Cada 172 días',
  favorito: 'iPhone 15',
  pedidos: ['MOB-#0008', 'MOB-#0005', 'MOB-#0002'],
  serial: '356789012345678',
}

const resultado = { app: APP, portal: PORTAL, fecha: new Date().toISOString(), version: null, pasos: [], publicos: {}, api: {}, rateLimit: {}, apiReal: [], observaciones: [], hallazgos: [] }
const afirmar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }
const plano = (texto) => String(texto || '').replace(/\s+/g, ' ').trim()
const compararVersion = (a, b) => {
  const [x, y, z] = String(a).split('.').map(Number)
  const [p, q, r] = String(b).split('.').map(Number)
  return x - p || y - q || z - r
}

let contador = 0
const capturas = []
async function shot(page, nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.png`
  await page.screenshot({ path: `${SHOTS}/${archivo}` })
  capturas.push(archivo)
  return archivo
}

async function paso(nombre, fn) {
  try {
    const detalle = await fn()
    resultado.pasos.push({ paso: nombre, ok: true, detalle: detalle || '' })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultado.pasos.push({ paso: nombre, ok: false, detalle: mensaje })
    resultado.hallazgos.push(`${nombre}: ${mensaje}`)
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
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

const abrirDemo = async (page) => {
  await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await page.waitForTimeout(1500)
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
    await page.getByRole('button', { name: 'Cerrar' }).last().click()
    await page.waitForTimeout(400)
  }
}

const browser = await chromium.launch({ headless: true })
const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await contexto.newPage()
page.on('request', (req) => { if (req.url().includes('api.moboss.online')) resultado.apiReal.push(req.url().slice(0, 160)) })
page.on('pageerror', (error) => resultado.observaciones.push(`pageerror: ${String(error.message).slice(0, 160)}`))
// wa.me es externo: no se descarga, solo se lee la URL del chat.
let ultimoWa = ''
contexto.on('request', (req) => { if (/wa\.me/i.test(req.url())) ultimoWa = req.url() })
await contexto.route('**/wa.me/**', (ruta) => ruta.abort())

// ── 1. Demo Dueño ───────────────────────────────────────────────────────────
await paso('entrada anónima a /demo', async () => {
  await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  await shot(page, 'demo-entrada')
  const texto = await page.locator('body').innerText()
  resultado.version = (texto.match(/v\d+\.\d+\.\d+/) || [null])[0]?.slice(1) || null
  afirmar(!page.url().includes('/login'), `la demo redirigió a ${page.url()}`)
  afirmar(/datos ficticios/i.test(texto), 'la entrada no avisa que los datos son ficticios')
  afirmar(resultado.version, 'no se pudo leer la versión desplegada')
  afirmar(compararVersion(resultado.version, VERSION_MINIMA) >= 0, `versión ${resultado.version} < ${VERSION_MINIMA}`)
  return `versión v${resultado.version}`
})

await abrirDemo(page)

await paso('lista de clientes con agregados reales (#221)', async () => {
  await page.locator('aside nav, nav').first().getByRole('button', { name: 'Clientes', exact: true }).click()
  await page.waitForTimeout(1200)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await fila.waitFor({ timeout: 20000 })
  await shot(page, 'clientes-agregados')
  const texto = await fila.innerText()
  afirmar(texto.includes(ESPERADO.totalGastado), `la fila no muestra ${ESPERADO.totalGastado}: ${plano(texto)}`)
  afirmar(texto.split('\n').map((linea) => linea.trim()).includes('5'), `la fila no cuenta 5 compras: ${plano(texto)}`)
  afirmar(/\+595 981 123 456/.test(texto), 'la fila no muestra el teléfono con código de país')
  return `Lucía: 5 compras · ${ESPERADO.totalGastado}`
})

await paso('búsqueda instantánea y filtros segmentados', async () => {
  const campo = page.getByLabel('Buscar clientes')
  const contar = () => page.getByTestId('cliente-fila').count()
  await campo.fill('Lucía')
  let filas = await contar()
  for (let intento = 0; intento < 20 && filas !== 1; intento += 1) {
    await page.waitForTimeout(250)
    filas = await contar()
  }
  afirmar(filas === 1, `la búsqueda de «Lucía» devolvió ${filas} filas (se esperaba 1)`)
  await campo.fill('xyz-no-existe')
  let vacias = await contar()
  for (let intento = 0; intento < 20 && vacias !== 0; intento += 1) {
    await page.waitForTimeout(250)
    vacias = await contar()
  }
  afirmar(vacias === 0, `una búsqueda sin resultados devolvió ${vacias} filas`)
  await campo.fill('Lucía')
  await page.waitForTimeout(600)
  const filtros = page.getByRole('group', { name: 'Filtrar clientes' })
  afirmar(await filtros.count(), 'no aparece el grupo de filtros de clientes')
  await shot(page, 'clientes-busqueda')
  return '«Lucía» → 1 fila · sin resultados → 0 filas · filtros presentes'
})

await paso('alta de cliente en demo (local, sin API)', async () => {
  const marca = Date.now().toString(36).slice(-5).toUpperCase()
  const nombre = `QA${marca}`
  await page.getByLabel('Buscar clientes').fill('')
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  const modal = page.getByRole('dialog', { name: 'Crear cliente' })
  await modal.getByLabel('Primer nombre').fill(nombre)
  await modal.getByLabel(/Segundo nombre/).fill('Prueba')
  await modal.getByLabel('Teléfono').fill('0981999888')
  await modal.getByRole('button', { name: 'Guardar cliente' }).click()
  await page.waitForTimeout(1200)
  await page.getByLabel('Buscar clientes').fill(nombre)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: nombre }).first()
  await fila.waitFor({ timeout: 15000 })
  await shot(page, 'clientes-alta')
  afirmar(await fila.count(), `el cliente ${nombre} no quedó en la lista`)
  return `${nombre} creado en el navegador`
})

// Ficha: resumen, deuda, pedidos, cronología, seguro y estadísticas (#221).
await paso('ficha → resumen con total, saldo y últimas órdenes', async () => {
  await page.getByLabel('Buscar clientes').fill('Lucía')
  await page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first().click()
  const ficha = page.getByRole('dialog')
  await ficha.getByText('Saldo pendiente', { exact: false }).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  await shot(page, 'ficha-resumen')
  const unido = plano(await ficha.innerText())
  afirmar(/total gastado gs 7\.750\.000/i.test(unido), `el Resumen no muestra ${ESPERADO.totalGastado}`)
  afirmar(/saldo pendiente gs 1\.500\.000/i.test(unido), `el Resumen no muestra ${ESPERADO.saldo}`)
  afirmar(/órdenes activas/i.test(unido), 'no aparece «Órdenes activas»')
  afirmar(/última compra/i.test(unido), 'no aparece «Última compra»')
  afirmar(/cliente desde/i.test(unido), 'no aparece «Cliente desde»')
  afirmar(/últimas órdenes/i.test(unido) && unido.includes(ESPERADO.pedidos[0]), `no se ve ${ESPERADO.pedidos[0]} en las últimas órdenes`)
  return `total ${ESPERADO.totalGastado} · saldo ${ESPERADO.saldo} · ${ESPERADO.pedidos[0]}`
})

await paso('deuda por pedido del cliente', async () => {
  const ficha = page.getByRole('dialog')
  const deuda = ficha.getByTestId('perfil-deuda')
  await deuda.waitFor({ timeout: 15000 })
  const texto = await deuda.innerText()
  await shot(page, 'ficha-deuda')
  afirmar(texto.includes(ESPERADO.saldo), `la deuda no muestra ${ESPERADO.saldo}`)
  afirmar(texto.includes(ESPERADO.pedidos[0]), 'la deuda no lista el pedido pendiente')
  return `${ESPERADO.saldo} en ${ESPERADO.pedidos[0]}`
})

await paso('pedidos asociados con historial y equipos con serial', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  await page.waitForTimeout(800)
  const texto = await ficha.innerText()
  await shot(page, 'ficha-pedidos')
  const unido = plano(texto)
  for (const numero of ESPERADO.pedidos) afirmar(unido.includes(numero), `el historial no incluye ${numero}`)
  afirmar(/cancelado/i.test(unido), 'no se ve la venta cancelada del historial')
  afirmar(/equipos con imei\/serial/i.test(unido), 'no aparece «Equipos con IMEI/serial»')
  afirmar(texto.replace(/\s+/g, '').includes(ESPERADO.serial), `no se ve el serial ${ESPERADO.serial}`)
  return `${ESPERADO.pedidos.join(', ')} + cancelada + serial ${ESPERADO.serial}`
})

await paso('cronología del cliente con eventos', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await page.waitForTimeout(800)
  const texto = plano(await ficha.innerText())
  await shot(page, 'ficha-cronologia')
  afirmar(/pedido creado/i.test(texto), 'la cronología no muestra «Pedido creado»')
  afirmar(/comentario del equipo/i.test(texto), 'la cronología no muestra comentarios')
  afirmar(/garantía registrada/i.test(texto), 'la cronología no muestra la garantía registrada')
  return 'pedido, pago, comentario y garantía en la cronología'
})

await paso('datos del cliente: seguro activo con porcentaje', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  await page.waitForTimeout(600)
  const seguro = ficha.getByRole('switch', { name: 'Seguro del cliente activo' })
  afirmar(await seguro.count(), 'no aparece el interruptor de seguro')
  afirmar(await seguro.isChecked(), 'el seguro del seed no aparece activo')
  afirmar(await seguro.isDisabled(), 'en demo el seguro debería estar deshabilitado')
  const pct = await ficha.getByLabel('Porcentaje del cliente').inputValue()
  await shot(page, 'ficha-seguro')
  afirmar(/^12,5/.test(pct), `el porcentaje del seguro no es 12,5: ${pct}`)
  return `seguro activo · ${pct}%`
})

await paso('nota pública del cliente (visible al cliente)', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  await page.waitForTimeout(600)
  const publica = ficha.getByLabel('Nota pública')
  const interna = ficha.getByLabel('Nota interna')
  await publica.waitFor({ timeout: 15000 })
  afirmar(/visible al cliente/i.test(await ficha.getByText(/Nota pública/).first().innerText()), 'la nota pública no aclara que es visible al cliente')
  afirmar(!(await publica.isDisabled()), 'la nota pública debería poder editarse')
  afirmar(await interna.isDisabled(), 'la nota interna debería estar bloqueada en demo')
  afirmar(await ficha.getByRole('button', { name: 'Guardar notas' }).isDisabled(), 'el guardado de notas debería estar bloqueado en demo')
  await publica.fill('Nota QA: información que el cliente ve en su portal.')
  await shot(page, 'ficha-nota-publica')
  resultado.observaciones.push('la nota pública se edita en la ficha pero el guardado (y el render de «Nota de la tienda» en el portal) requiere una cuenta real')
  return 'campo «Nota pública (visible al cliente)» presente · guardado bloqueado en demo'
})

await paso('estadísticas calculadas (#221)', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Estadísticas/ }).click()
  await page.waitForTimeout(900)
  const texto = await ficha.innerText()
  await shot(page, 'ficha-estadisticas')
  const unido = plano(texto)
  afirmar(/compras 5\b/i.test(unido), 'las compras contadas no son 5 (la cancelada no debe contar)')
  afirmar(/ticket promedio gs 1\.550\.000/i.test(unido), `no se ve el ticket ${ESPERADO.ticket}`)
  afirmar(/frecuencia cada 172 días/i.test(unido), `no se ve la frecuencia «${ESPERADO.frecuencia}»`)
  afirmar(/gasto por mes gs [\d.]+/i.test(unido), 'no aparece «Gasto por mes»')
  afirmar(/modelos favoritos/i.test(unido) && unido.includes(ESPERADO.favorito), `no se ve el favorito ${ESPERADO.favorito}`)
  afirmar(/categorías favoritas/i.test(unido), 'no aparecen las categorías favoritas')
  return `5 compras · ${ESPERADO.ticket} · ${ESPERADO.frecuencia}`
})

await paso('whatsapp con plantilla y enlace al chat', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Resumen/ }).click()
  await ficha.getByRole('button', { name: /Elegir plantilla de WhatsApp/ }).click()
  const menu = page.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
  await menu.waitFor({ timeout: 10000 })
  const mensaje = await esperarTexto(() => menu.getByLabel('Mensaje de WhatsApp').inputValue())
  await shot(page, 'whatsapp-plantilla')
  afirmar(mensaje.trim().length > 0, 'la vista previa del mensaje quedó vacía')
  afirmar(/Lucía Fernández/.test(mensaje), `la plantilla no interpola el nombre: «${plano(mensaje).slice(0, 80)}»`)
  if (/Tu pedido\s+ya está/i.test(mensaje)) resultado.observaciones.push('la plantilla demo de Clientes deja «Tu pedido  ya está…» (la variable de pedido no aplica a la ficha)')
  ultimoWa = ''
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 15000 }),
    menu.getByRole('button', { name: 'Abrir WhatsApp' }).click(),
  ])
  const url = await esperarTexto(() => ultimoWa)
  await popup.close().catch(() => {})
  afirmar(/^https:\/\/wa\.me\/595981123456\?text=/.test(url), `el enlace no apunta al teléfono del cliente: ${String(url).slice(0, 120)}`)
  return `wa.me/595981123456 · «${plano(mensaje).slice(0, 50)}…»`
})

await paso('portal del cliente por token demo (QR, cuenta y vitrina)', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('button', { name: /Portal del cliente/ }).click()
  await page.getByAltText('QR del portal del cliente').waitFor({ timeout: 15000 })
  await shot(page, 'portal-qr')
  const enlaceCrudo = (await page.locator('p.break-all').textContent())?.trim() || ''
  const enlace = /^https?:/.test(enlaceCrudo) ? enlaceCrudo : `${PORTAL}${enlaceCrudo.startsWith('/') ? '' : '/'}${enlaceCrudo}`
  afirmar(/\/cuenta\/demo-/.test(enlace), `el enlace del portal no es local de la demo: ${enlace}`)
  await page.goto(enlace)
  await page.waitForTimeout(1200)
  await shot(page, 'portal-cuenta')
  const cuenta = await page.locator('body').innerText()
  afirmar(cuenta.includes(ESPERADO.saldo), `la cuenta no muestra el saldo ${ESPERADO.saldo}`)
  await page.goto(`${PORTAL}/portal/demo-demo-cliente-lucia-completo`)
  await page.waitForTimeout(1200)
  await shot(page, 'portal-vitrina')
  const vitrina = await page.locator('body').innerText()
  afirmar(vitrina.includes(ESPERADO.pedidos[0]), `la vitrina no lista ${ESPERADO.pedidos[0]}`)
  if (!/Nota de la tienda/i.test(vitrina)) resultado.observaciones.push('la vitrina no muestra la «Nota de la tienda» porque ningún cliente demo tiene nota pública sembrada')
  await page.goto(`${PORTAL}/cuenta/demo-demo-cliente-lucia-completo`)
  await page.waitForTimeout(1200)
  await shot(page, 'portal-completo')
  const completo = await page.locator('body').innerText()
  afirmar(completo.includes(ESPERADO.saldo), 'el nivel completo no muestra el saldo')
  return `${enlace} + vitrina + nivel completo`
})

await paso('?cliente=<id> abre la ficha del cliente', async () => {
  await page.goto(`${APP}/clientes?cliente=demo-cliente-lucia`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const ficha = page.getByRole('dialog')
  await ficha.getByText('Saldo pendiente', { exact: false }).first().waitFor({ timeout: 20000 })
  await shot(page, 'cliente-por-url')
  return 'la ficha abre con los datos demo'
})

await paso('servicio técnico demo (OS del pipeline)', async () => {
  await page.goto(`${APP}/servicio`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot(page, 'servicio-demo')
  const texto = await page.locator('body').innerText()
  afirmar(texto.includes('OS-#0001') && texto.includes('OS-#0002'), 'no aparecen las órdenes OS-#0001/OS-#0002')
  return 'OS-#0001 y OS-#0002 visibles'
})

// ── 2. Mobile (390×844) sin scroll horizontal ───────────────────────────────
await paso('clientes en mobile sin scroll horizontal', async () => {
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const pagina = await movil.newPage()
  await abrirDemo(pagina)
  await pagina.goto(`${APP}/clientes`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(1500)
  await shot(pagina, 'clientes-mobile')
  const medida = await pagina.evaluate(() => {
    const contenedor = document.querySelector('[data-testid="clientes-tabla"]')
    const ancho = document.documentElement.clientWidth
    return { pagina: document.documentElement.scrollWidth, clientWidth: ancho, tabla: contenedor ? contenedor.scrollWidth : null }
  })
  await movil.close()
  afirmar(medida.pagina <= medida.clientWidth + 1, `la página scrollea horizontal (${medida.pagina} > ${medida.clientWidth})`)
  return `ancho ${medida.clientWidth}px sin scroll${medida.tabla ? ` · tabla ${medida.tabla}px` : ''}`
})

// ── 3. Demo Vendedor (rol con acceso a Clientes) ────────────────────────────
await paso('demo Vendedor: Clientes visible por rol', async () => {
  const vendedor = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pagina = await vendedor.newPage()
  await pagina.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await pagina.waitForTimeout(1200)
  await pagina.getByRole('button', { name: /Vendedor/ }).first().click()
  await pagina.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await pagina.waitForTimeout(1500)
  if (await pagina.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) await pagina.getByRole('button', { name: 'Cerrar' }).last().click()
  await pagina.goto(`${APP}/clientes`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(1500)
  await shot(pagina, 'demo-vendedor')
  const texto = await pagina.locator('body').innerText()
  afirmar(/Lucía Fernández/.test(texto), 'el vendedor no ve la cartera demo')
  await vendedor.close()
  return 'la cartera demo carga con el rol Vendedor'
})

resultado.capturas = capturas

// ── 4. Públicos con token inválido (sin datos) ──────────────────────────────
const anonimo = await contexto.newPage()
for (const [ruta, clave] of [['/cuenta/token-inexistente-qa187', 'cuenta'], ['/portal/token-inexistente-qa187', 'vitrina'], ['/garantia/token-inexistente-qa187', 'garantia']]) {
  await anonimo.goto(`${PORTAL}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await anonimo.waitForTimeout(1000)
  const texto = (await anonimo.locator('body').innerText()).toLowerCase()
  resultado.publicos[clave] = { generico: /no encontrada|no es válido|venció/.test(texto), sinDatos: !/gs \d/.test(texto) }
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-publico-${clave}.png`
  await anonimo.screenshot({ path: `${SHOTS}/${archivo}` })
  capturas.push(archivo)
}
for (const [ruta, clave] of [['/api/portal/token-inexistente-qa187', 'portal'], ['/api/public/portal/token-inexistente-qa187', 'vitrina'], ['/api/public/warranty/token-inexistente-qa187', 'garantia']]) {
  const res = await fetch(`${API}${ruta}`)
  resultado.api[clave] = res.status
}

// Rate limit de públicos (#178): 30 pedidos por minuto por IP y ruta; el
// token inválido responde 404 hasta que la ventana se llena y luego 429 con
// Retry-After, sin filtrar datos.
{
  const url = `${API}/api/public/warranty/token-inexistente-qa187-rl`
  let pedido429 = null
  let ultimo = 0
  let retryAfter = null
  for (let intento = 1; intento <= 45 && pedido429 === null; intento += 1) {
    const res = await fetch(url)
    ultimo = res.status
    if (res.status === 429) {
      pedido429 = intento
      retryAfter = res.headers.get('retry-after')
    }
  }
  resultado.rateLimit = { pedido429, ultimoEstado: ultimo, retryAfter }
  if (pedido429 === null) resultado.hallazgos.push('el rate limit de públicos (#178) no respondió 429 en 45 pedidos')
  else if (!retryAfter) resultado.hallazgos.push('el 429 del rate limit no trae Retry-After')
}

await browser.close()

// La demo no puede tocar el API de clientes/portal/warranty.
const clienteEndpoints = /\/api\/(customers|message-templates|service-orders|service-items|service-checklists|portal|public\/portal|public\/warranty|warranties|orders)/
const apiDominio = resultado.apiReal.filter((url) => clienteEndpoints.test(url))
resultado.apiReal = [...new Set(resultado.apiReal)]
resultado.demoNoTocaApi = apiDominio.length === 0
if (!resultado.demoNoTocaApi) resultado.hallazgos.push(`la demo llamó al API de clientes/portal: ${apiDominio.join(', ')}`)
for (const clave of Object.keys(resultado.publicos)) {
  if (!resultado.publicos[clave].generico || !resultado.publicos[clave].sinDatos) resultado.hallazgos.push(`el público ${clave} con token inválido no quedó genérico/sin datos`)
}
for (const [clave, estado] of Object.entries(resultado.api)) {
  if (estado !== 404 && estado !== 429) resultado.hallazgos.push(`el API público ${clave} con token inválido devolvió ${estado} (se esperaba 404)`)
  if (estado === 429) resultado.observaciones.push(`el API público ${clave} respondió 429: la ventana del rate limit (#178) ya estaba activa`)
}

const fallos = resultado.pasos.filter((p) => !p.ok)
writeFileSync(`${SHOTS}/resultados.json`, JSON.stringify(resultado, null, 2))
console.log(`\nVersión desplegada: ${resultado.version ? `v${resultado.version}` : 'desconocida'}`)
console.log(`Pasos: ${resultado.pasos.length - fallos.length}/${resultado.pasos.length} OK · capturas: ${capturas.length}`)
console.log(`API de clientes/portal: ${resultado.demoNoTocaApi ? 'sin llamadas (OK)' : 'LLAMÓ (FALLO)'}`)
if (resultado.observaciones.length) console.log(`Observaciones: ${resultado.observaciones.length} (ver resultados.json)`)
if (fallos.length) console.log(`Fallos: ${fallos.map((f) => `${f.paso} (${f.detalle})`).join(' · ')}`)
process.exitCode = fallos.length || !resultado.demoNoTocaApi ? 1 : 0
