#!/usr/bin/env node
// QA post-deploy (#193): flujo de consulta de IMEI en modo MOCK en producción,
// sin LIVE y sin cargos. Recorre la UI real (ficha de unidad): precheck con
// costo visible, confirmación explícita, resultado marcado SIMULADO con fuente
// y fecha, y verifica que el navegador NO haga ninguna llamada a imeicheck.net.
//
// Requisito (una cuenta real de producción):
//   MOBOS_QA_STORAGE_STATE=/tmp/mobos-qa.json
// Exportar la sesión una vez:
//   npx playwright codegen --save-storage=/tmp/mobos-qa.json https://app.moboss.online/login
//   (iniciar sesión en la ventana, entrar al panel y cerrarla)
//
// Opcionales:
//   MOBOS_QA_URL=https://app.moboss.online
//   MOBOS_QA_IMEI=<IMEI/serial de una unidad real> (si falta, usa la primera)
//   MOBOS_QA_OUT=/tmp/qa-193-imei   (capturas + reporte.json)
//
// Seguridad: sin IMEICHECK_LIVE no hay cargos; si el resultado no aparece como
// SIMULADO el script falla ruidosamente (podría haber LIVE activo).
//
// Uso: node scripts/qa-193-imei-produccion.mjs [--config]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const estado = String(process.env.MOBOS_QA_STORAGE_STATE || '')
const serialBuscado = String(process.env.MOBOS_QA_IMEI || '').trim()
const salida = String(process.env.MOBOS_QA_OUT || '/tmp/qa-193-imei')
const soloConfig = process.argv.includes('--config')

const faltantes = []
if (!estado) faltantes.push('MOBOS_QA_STORAGE_STATE (sesión de producción exportada)')
else if (!existsSync(estado)) faltantes.push(`MOBOS_QA_STORAGE_STATE no existe: ${estado}`)

if (soloConfig || faltantes.length) {
  console.log(JSON.stringify({ url: BASE, storageState: estado || null, imei: serialBuscado || null, salida, faltantes, listo: faltantes.length === 0 }, null, 2))
  if (faltantes.length) {
    console.error(`\n✖ Falta configurar: ${faltantes.join('; ')}`)
    process.exit(2)
  }
  process.exit(0)
}

mkdirSync(salida, { recursive: true })
const reporte = { url: BASE, iniciado: new Date().toISOString(), pasos: [], capturas: [], llamadasProveedor: 0, erroresConsola: 0, ok: false }
const capturar = async (page, nombre) => {
  const ruta = `${salida}/${nombre}.png`
  await page.screenshot({ path: ruta })
  reporte.capturas.push(ruta)
}
const paso = async (nombre, fn) => {
  try {
    const detalle = await fn()
    reporte.pasos.push({ paso: nombre, ok: true, detalle: detalle || '' })
    console.log(`✔ ${nombre}${detalle ? ` · ${detalle}` : ''}`)
  } catch (causa) {
    reporte.pasos.push({ paso: nombre, ok: false, detalle: String(causa?.message || causa) })
    throw causa
  }
}

const browser = await chromium.launch()
let codigo = 0
try {
  const contexto = await browser.newContext({ storageState: estado, viewport: { width: 1440, height: 900 } })
  const page = await contexto.newPage()
  const errores = []
  page.on('request', peticion => { if (/imeicheck\.net/i.test(peticion.url())) reporte.llamadasProveedor += 1 })
  page.on('console', mensaje => { if (mensaje.type() === 'error') errores.push(mensaje.text().slice(0, 160)) })

  await paso('inventario visible con la sesión real', async () => {
    await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    if (page.url().includes('/login')) throw new Error('la sesión no es válida (redirigió a /login)')
    if (await page.getByText(/Ingresá con una cuenta real/i).count()) throw new Error('el módulo pide cuenta real')
    await capturar(page, '01-inventario')
    return page.url()
  })

  await paso('abrir la unidad', async () => {
    const filas = page.getByTestId('inventario-fila')
    if (serialBuscado && !(await filas.count())) {
      const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
      await campo.fill(serialBuscado)
      await campo.press('Enter')
      await page.waitForTimeout(2000)
    }
    const fila = serialBuscado ? filas.filter({ hasText: serialBuscado }).first() : filas.first()
    await fila.waitFor({ timeout: 20_000 })
    await fila.click()
    await page.getByTestId('unidad-imei').waitFor({ timeout: 15_000 })
    await capturar(page, '02-ficha-imei')
    return serialBuscado || '(primera unidad del listado)'
  })

  await paso('precheck con costo visible (no llama al proveedor)', async () => {
    const bloque = page.getByTestId('unidad-imei')
    await bloque.getByTestId('imei-precheck').click()
    await page.waitForTimeout(1500)
    const texto = await bloque.innerText()
    if (/no pasa la verificación|15 dígitos|Falta el IMEI/i.test(texto)) throw new Error(`la unidad no tiene un IMEI válido: ${texto.slice(-140)}`)
    if (!/Apple Basic/.test(texto)) throw new Error('no apareció el servicio Apple Basic')
    if (!/SIMULADO/.test(texto) || !/Sin cobro/.test(texto)) throw new Error('el precheck no avisa que es SIMULADO sin cobro antes de confirmar')
    await capturar(page, '03-precheck')
    return (texto.match(/US\$ [0-9.]+/) || ['(sin costo a la vista)'])[0]
  })

  await paso('confirmar y ver el resultado SIMULADO con fuente y fecha', async () => {
    const bloque = page.getByTestId('unidad-imei')
    await bloque.getByTestId('imei-confirmar').click()
    await page.waitForTimeout(3000)
    const texto = await bloque.innerText()
    if (!/SIMULADO/.test(texto)) throw new Error(`el resultado no está marcado como SIMULADO (¿IMEICHECK_LIVE activo?): ${texto.slice(0, 200)}`)
    if (!/imeicheck\.net/.test(texto)) throw new Error('no aparece la fuente imeicheck.net en los campos')
    await capturar(page, '04-resultado')
    return 'SIMULADO · fuente y fecha visibles'
  })

  reporte.erroresConsola = errores.length
  if (reporte.llamadasProveedor > 0) reporte.motivo = `hubo ${reporte.llamadasProveedor} llamadas del navegador a imeicheck.net`
  else reporte.ok = true
} catch (causa) {
  reporte.motivo = String(causa?.message || causa)
} finally {
  writeFileSync(`${salida}/reporte.json`, JSON.stringify(reporte, null, 2))
  await browser.close()
}

console.log(JSON.stringify(reporte, null, 2))
if (!reporte.ok) codigo = 1
else if (reporte.llamadasProveedor > 0) codigo = 5
process.exit(codigo)
