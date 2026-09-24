// #249 · Modales del POS en pantalla chica: mide cajas reales y captura el
// escáner, el selector de IMEI, suspender venta, ventas suspendidas y analytics
// a 390 (target ≥44) y 768 (compacto). Sobre la demo pública.
//
// Uso: QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.158-produccion node scripts/qa-249-pos-modales.mjs
// Salida: docs/qa/249-pos-responsive/<etiqueta>-modales/<viewport>-<modal>.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = `${process.env.QA_ETIQUETA || 'post-deploy'}-modales`
const SALIDA = join(process.env.QA_OUT || 'docs/qa/249-pos-responsive', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const TOQUE = 44
const V2 = process.env.QA_V2 === '1'
const TEMA = process.env.QA_TEMA === 'dark' ? 'dark' : null
const SUFIJO = `${V2 ? '-v2' : ''}${TEMA ? `-${TEMA}` : ''}`
const VIEWPORTS = [
  { nombre: '390', ancho: 390, alto: 844 },
  { nombre: '768', ancho: 768, alto: 1024 },
]

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const resultados = []
const navegador = await chromium.launch()

for (const viewport of VIEWPORTS) {
  const esMovil = viewport.ancho < 768
  const contexto = await navegador.newContext({
    viewport: { width: viewport.ancho, height: viewport.alto },
    deviceScaleFactor: 2,
  })
  await contexto.addInitScript(({ v2, tema }) => {
    try {
      if (tema) localStorage.setItem('mobos:theme', tema)
      localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
    } catch { /* sin almacenamiento */ }
  }, { v2: V2, tema: TEMA })
  const page = await contexto.newPage()
  const errores = []
  const medidas = []
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))

  const medir = async (etiqueta, locator) => {
    try {
      const objetivo = locator.first()
      if (!(await objetivo.count())) return medidas.push({ etiqueta, estado: 'no-visible' })
      const caja = await objetivo.boundingBox()
      if (!caja) return medidas.push({ etiqueta, estado: 'sin-caja' })
      const ancho = Math.round(caja.width)
      const alto = Math.round(caja.height)
      medidas.push({ etiqueta, ancho, alto, corto: esMovil && (ancho < TOQUE || alto < TOQUE), estado: 'medido' })
    } catch (error) {
      medidas.push({ etiqueta, estado: 'error', detalle: String(error.message).slice(0, 100) })
    }
  }

  try {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await esperar(1400)
    await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
    await esperar(2200)
    const guia = page.getByRole('button', { name: 'Entendido' })
    if (await guia.count()) await guia.click().catch(() => {})
    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
    await esperar(1200)
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente modales QA')

    // 1) Selector de IMEI (producto serializado del demo).
    const buscarProducto = page.getByPlaceholder('Buscar producto…')
    let tarjeta = null
    for (let intento = 0; intento < 12 && !tarjeta; intento += 1) {
      await buscarProducto.fill('iPhone 15 Pro Max')
      await esperar(900)
      const candidata = page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: 'iPhone 15 Pro Max' }).first()
      if (await candidata.count()) tarjeta = candidata
    }
    if (!tarjeta) throw new Error('el catálogo demo no mostró el iPhone 15 Pro Max')
    await tarjeta.click()
    await esperar(700)
    await page.locator('#pos-resumen-venta').getByRole('button', { name: /^(Elegir|Cambiar) IMEI de / }).first().click()
    const imei = page.getByRole('dialog', { name: /Equipo físico|IMEI/ }).first()
    if (await imei.count()) {
      await esperar(500)
      const botonesImei = imei.getByRole('button')
      for (let i = 0; i < await botonesImei.count(); i += 1) {
        const texto = (await botonesImei.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 24)
        await medir(`imei · ${texto || i + 1}`, botonesImei.nth(i))
      }
      await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-imei${SUFIJO}.jpg`), type: 'jpeg', quality: 70 })
      await imei.getByRole('button', { name: 'Listo' }).click().catch(() => {})
      await esperar(400)
    }

    // 2) Suspender venta.
    await page.getByRole('button', { name: 'Suspender venta' }).click()
    const suspender = page.getByRole('dialog', { name: 'Suspender venta' })
    await suspender.waitFor({ timeout: 10_000 })
    await medir('suspender · etiqueta', suspender.getByLabel('Etiqueta (opcional)'))
    await medir('suspender · cancelar', suspender.getByRole('button', { name: 'Cancelar' }))
    await medir('suspender · confirmar', suspender.getByRole('button', { name: 'Suspender venta' }))
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-suspender${SUFIJO}.jpg`), type: 'jpeg', quality: 70 })
    await suspender.getByRole('button', { name: 'Suspender venta' }).click()
    await esperar(600)

    // 3) Ventas suspendidas (con el borrador recién creado).
    await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
    const suspendidas = page.getByRole('dialog', { name: 'Ventas suspendidas' })
    await suspendidas.waitFor({ timeout: 10_000 })
    await medir('suspendidas · enlace', suspendidas.getByRole('button', { name: 'Enlace público' }))
    await medir('suspendidas · recuperar', suspendidas.getByRole('button', { name: 'Recuperar' }))
    await medir('suspendidas · descartar', suspendidas.getByRole('button', { name: 'Descartar' }))
    await medir('suspendidas · cerrar', suspendidas.getByRole('button', { name: 'Cerrar' }))
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-suspendidas${SUFIJO}.jpg`), type: 'jpeg', quality: 70 })
    await page.keyboard.press('Escape')
    await esperar(400)

    // 4) Analytics del POS.
    await page.getByRole('button', { name: 'Analytics' }).click()
    const analytics = page.getByRole('dialog').first()
    await esperar(900)
    await medir('analytics · cerrar', analytics.getByRole('button', { name: 'Cerrar' }))
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-analytics${SUFIJO}.jpg`), type: 'jpeg', quality: 70 })
    await page.keyboard.press('Escape')
    await esperar(300)

    // 5) Producto escaneado (SKU derivado del catálogo demo).
    await page.getByPlaceholder('Buscar producto…').fill('MOBOS:PROD:DEMO-CARGADOR-USBC-20W')
    const escaner = page.getByRole('dialog', { name: 'Producto escaneado' })
    if (await escaner.count()) {
      await esperar(400)
      await medir('escaner · agregar', escaner.getByRole('button', { name: 'Agregar a la venta' }))
      await medir('escaner · cancelar', escaner.getByRole('button', { name: 'Cancelar' }))
      await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-escaner${SUFIJO}.jpg`), type: 'jpeg', quality: 70 })
      await escaner.getByRole('button', { name: 'Cancelar' }).click().catch(() => {})
    }
  } catch (error) {
    errores.push(`auditoría: ${String(error.message).slice(0, 200)}`)
  }

  resultados.push({
    viewport: viewport.nombre,
    medidas,
    cortos: medidas.filter((m) => m.corto).length,
    errores,
  })
  await contexto.close()
}

await navegador.close()
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, etiqueta: ETIQUETA, toque: TOQUE, resultados }, null, 2))
for (const fila of resultados) {
  const cortos = fila.medidas.filter((m) => m.corto).map((m) => `${m.etiqueta} ${m.ancho}x${m.alto}`)
  const faltantes = fila.medidas.filter((m) => m.estado !== 'medido').map((m) => `${m.etiqueta}(${m.estado})`)
  console.log(`${fila.viewport}: ${fila.medidas.filter((m) => m.estado === 'medido').length} medidas · cortos ${fila.cortos}${cortos.length ? ` → ${cortos.join(' | ')}` : ''}${faltantes.length ? ` · sin medir: ${faltantes.join(' | ')}` : ''} · errores ${fila.errores.length}`)
}
