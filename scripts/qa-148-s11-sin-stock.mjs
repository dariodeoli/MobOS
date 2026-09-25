// #148 §11 · Capturas de la venta sin stock / sin IMEI: guía inline con acciones
// (elegir unidad, vender sin IMEI / sobre pedido), aviso claro en vez del
// genérico y pedido creado sin descontar stock. Corre sobre la demo en
// claro/oscuro y desktop/mobile; el «antes» sale de producción y el «después»
// de la rama.
//
// Uso: QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=rama-148-s11 node scripts/qa-148-s11-sin-stock.mjs
// Salida: docs/qa/148-s11/sin-stock/<etiqueta>/<vista>-<tema>-*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/148-s11/sin-stock', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const VARIANTES = [
  { nombre: 'desktop-claro', ancho: 1280, alto: 900, tema: null },
  { nombre: 'desktop-oscuro', ancho: 1280, alto: 900, tema: 'dark' },
  { nombre: 'movil-claro', ancho: 390, alto: 844, tema: null },
  { nombre: 'movil-oscuro', ancho: 390, alto: 844, tema: 'dark' },
]

const ESPERA = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const resultados = []
const navegador = await chromium.launch()

// Un carrito por escena: la demo se resetea al recargar (vive en memoria).
async function abrirPos(page) {
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
  await ESPERA(1200)
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente sin stock QA')
}

async function agregar(page, nombre, pasos) {
  const buscar = page.getByPlaceholder('Buscar producto…')
  for (let intento = 0; intento < 10; intento += 1) {
    await buscar.fill(nombre)
    await ESPERA(800)
    const tarjeta = page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: nombre }).first()
    if (await tarjeta.count()) { await tarjeta.click(); await ESPERA(800); return true }
  }
  pasos.push(`no se pudo agregar: ${nombre}`)
  return false
}

for (const variante of VARIANTES) {
  const contexto = await navegador.newContext({
    viewport: { width: variante.ancho, height: variante.alto },
    deviceScaleFactor: 2,
  })
  await contexto.addInitScript(({ tema }) => {
    try { if (tema) localStorage.setItem('mobos:theme', tema) } catch { /* sin storage */ }
  }, { tema: variante.tema })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))
  const captura = (sufijo) => page.screenshot({ path: join(SALIDA, `${variante.nombre}-${sufijo}.jpg`), type: 'jpeg', quality: 72 })
  const escenas = {}

  try {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await ESPERA(1400)
    await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
    await ESPERA(2200)
    const entendido = page.getByRole('button', { name: 'Entendido' })
    if (await entendido.count()) await entendido.click().catch(() => {})

    const carrito = page.locator('#pos-resumen-venta')
    const guardar = () => page.getByRole('button', { name: /^(Crear pedido sin pago|Confirmar venta|Crear pedido)/ }).first()
    const guia = page.getByTestId('guia-venta')
    const estados = () => carrito.locator('[data-estado]').evaluateAll((filas) => filas.map((fila) => fila.dataset.estado || '—'))
    const avisos = async () => (await page.getByRole('alert').allTextContents()).map((texto) => texto.trim()).filter(Boolean).join(' | ').slice(0, 240)

    // ── Escena A · producto agotado (sin stock) ────────────────────────
    const pasosA = []
    await abrirPos(page)
    await agregar(page, 'Protector de vidrio 17 Pro', pasosA)
    const estadosA = await estados()
    await guardar().click().catch(() => {})
    await ESPERA(900)
    const alertaA = await avisos()
    pasosA.push(`aviso: ${alertaA || 'sin aviso'}`)
    await carrito.scrollIntoViewIfNeeded().catch(() => {})
    await ESPERA(300)
    await captura('a1-aviso-sin-stock')

    const hayGuiaA = await guia.first().isVisible().catch(() => false)
    const guiaA = hayGuiaA ? (await guia.innerText()).replace(/\s+/g, ' ').slice(0, 240) : null
    pasosA.push(`guía: ${hayGuiaA ? 'sí' : 'no'}`)
    if (hayGuiaA) {
      await guia.scrollIntoViewIfNeeded().catch(() => {})
      await ESPERA(300)
      await captura('a2-guia-inline')
      const sobrePedido = guia.getByRole('button', { name: 'Sobre pedido' })
      if (await sobrePedido.count()) {
        await sobrePedido.first().click()
        await ESPERA(700)
        pasosA.push('marcado sobre pedido: sí')
      }
    }
    const estadosMarcadoA = await estados()
    await carrito.scrollIntoViewIfNeeded().catch(() => {})
    await ESPERA(300)
    await captura('a3-sobre-pedido')
    await guardar().click().catch(() => {})
    await ESPERA(2000)
    const exitoA = (await page.getByRole('status').allTextContents()).map((t) => t.trim()).filter((t) => /Venta|pedido/i.test(t)).join(' | ').slice(0, 160)
    pasosA.push(`resultado: ${exitoA || 'sin confirmación'}`)
    await captura('a4-venta')
    escenas.sinStock = { pasos: pasosA, alerta: alertaA, guia: guiaA, estados: estadosA, estadosMarcado: estadosMarcadoA, exito: exitoA }

    // ── Escena B · equipo serializado sin IMEI elegido ────────────────
    const pasosB = []
    await abrirPos(page)
    await agregar(page, 'iPhone 15 Pro Max', pasosB)
    const estadosB = await estados()
    await guardar().click().catch(() => {})
    await ESPERA(900)
    const alertaB = await avisos()
    pasosB.push(`aviso: ${alertaB || 'sin aviso'}`)
    await carrito.scrollIntoViewIfNeeded().catch(() => {})
    await ESPERA(300)
    await captura('b1-aviso-imei')

    const hayGuiaB = await guia.first().isVisible().catch(() => false)
    const guiaB = hayGuiaB ? (await guia.innerText()).replace(/\s+/g, ' ').slice(0, 240) : null
    pasosB.push(`guía: ${hayGuiaB ? 'sí' : 'no'}`)
    if (hayGuiaB) {
      await guia.scrollIntoViewIfNeeded().catch(() => {})
      await ESPERA(300)
      await captura('b2-guia-inline')
      const elegir = guia.getByRole('button', { name: /^Elegir unidad/ })
      if (await elegir.count()) {
        await elegir.first().click()
        await ESPERA(900)
        const dialogo = page.getByRole('dialog', { name: /Elegir IMEI/ })
        await dialogo.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {})
        await captura('b3-elegir-unidad')
        const reservar = dialogo.getByRole('button', { name: 'Reservar este' }).first()
        if (await reservar.count()) { await reservar.click(); await ESPERA(800) }
        const listo = dialogo.getByRole('button', { name: 'Listo' })
        if (await listo.count()) await listo.click()
        await ESPERA(800)
        pasosB.push('unidad elegida: sí')
      }
    }
    const estadosResueltoB = await estados()
    await guardar().click().catch(() => {})
    await ESPERA(2000)
    const exitoB = (await page.getByRole('status').allTextContents()).map((t) => t.trim()).filter((t) => /Venta|pedido/i.test(t)).join(' | ').slice(0, 160)
    pasosB.push(`resultado: ${exitoB || 'sin confirmación'}`)
    await captura('b4-venta')
    escenas.sinImei = { pasos: pasosB, alerta: alertaB, guia: guiaB, estados: estadosB, estadosResuelto: estadosResueltoB, exito: exitoB }

    resultados.push({ variante: variante.nombre, escenas, errores })
  } catch (error) {
    errores.push(`sonda: ${String(error.message).slice(0, 220)}`)
    resultados.push({ variante: variante.nombre, escenas, errores })
  }
  await contexto.close()
}

await navegador.close()
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, etiqueta: ETIQUETA, resultados }, null, 2))
for (const fila of resultados) {
  const a = fila.escenas?.sinStock || {}
  const b = fila.escenas?.sinImei || {}
  console.log(`${fila.variante} · A ${JSON.stringify(a.estados || [])}→${JSON.stringify(a.estadosMarcado || [])} ${a.exito ? `✓ ${a.exito}` : 'sin venta'} · B ${JSON.stringify(b.estados || [])} ${b.exito ? `✓ ${b.exito}` : 'sin venta'} · errores ${fila.errores.length}`)
}
