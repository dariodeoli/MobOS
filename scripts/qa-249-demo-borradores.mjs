// Verificación en producción de los borradores de la demo (#148 §20, #249):
// crea, lista, avisa el enlace público, retoma y descarta, con capturas.
// Corre sobre la demo pública (datos ficticios, sin tocar datos reales).
//
// Uso: QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.153-produccion node scripts/qa-249-demo-borradores.mjs
// Salida: docs/qa/249-pos-responsive/<etiqueta-demo>/0X-*.jpg + resultados-demo.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = `${process.env.QA_ETIQUETA || 'post-deploy'}-demo-borradores`
const SALIDA = join(process.env.QA_OUT || 'docs/qa/249-pos-responsive', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errores = []

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await contexto.newPage()
page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))

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
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente borrador 249')
  await page.getByPlaceholder('Buscar producto…').fill('iPhone 15 Pro')
  await esperar(900)
  await page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: 'iPhone 15 Pro' }).first().click()
  await esperar(700)

  // 1) Suspender con etiqueta.
  await page.getByRole('button', { name: 'Suspender venta' }).click()
  const suspender = page.getByRole('dialog', { name: 'Suspender venta' })
  await suspender.getByLabel('Etiqueta (opcional)').fill('Borrador demo 249')
  await suspender.getByRole('button', { name: 'Suspender venta' }).click()
  await expectTexto(page, /Venta suspendida en la demo/)
  await page.getByText('Todavía no agregaste productos.').waitFor({ timeout: 10_000 })
  await page.screenshot({ path: join(SALIDA, '01-suspendido.jpg'), type: 'jpeg', quality: 72 })

  // 2) La lista de borradores + el aviso del enlace público.
  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  const lista = page.getByRole('dialog', { name: 'Ventas suspendidas' })
  await lista.getByText('Borrador demo 249').waitFor({ timeout: 10_000 })
  await page.screenshot({ path: join(SALIDA, '02-lista.jpg'), type: 'jpeg', quality: 72 })
  await lista.getByRole('button', { name: 'Enlace público' }).click()
  await expectTexto(page, /En la demo el enlace público no se genera/)
  await page.screenshot({ path: join(SALIDA, '03-aviso-enlace.jpg'), type: 'jpeg', quality: 72 })

  // 3) Retomar (el carrito vuelve y el borrador sale de la lista).
  await lista.getByRole('button', { name: 'Recuperar' }).click()
  await expectTexto(page, /Venta recuperada/)
  await page.getByRole('button', { name: /^Ver detalle de iPhone 15 Pro/ }).waitFor({ timeout: 10_000 })
  await page.screenshot({ path: join(SALIDA, '04-retomado.jpg'), type: 'jpeg', quality: 72 })

  // 4) Un segundo borrador se descarta.
  await page.getByRole('button', { name: 'Suspender venta' }).click()
  await page.getByRole('dialog', { name: 'Suspender venta' }).getByRole('button', { name: 'Suspender venta' }).click()
  await expectTexto(page, /Venta suspendida en la demo/)
  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  const lista2 = page.getByRole('dialog', { name: 'Ventas suspendidas' })
  await lista2.getByRole('button', { name: 'Descartar' }).click()
  await page.getByRole('dialog', { name: 'Descartar venta suspendida' }).getByRole('button', { name: 'Descartar' }).click()
  await expectTexto(page, /No hay borradores guardados en este navegador/)
  await page.screenshot({ path: join(SALIDA, '05-descartado.jpg'), type: 'jpeg', quality: 72 })
} catch (error) {
  errores.push(String(error.message).slice(0, 300))
}

await contexto.close()
await navegador.close()
writeFileSync(
  join(SALIDA, 'resultados-demo.json'),
  JSON.stringify({ base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), errores }, null, 2),
)
console.log(`demo borradores: ${errores.length ? `ERROR ${errores[0]}` : 'flujo completo capturado'} · errores ${errores.length}`)

async function expectTexto(page, patron) {
  await page.getByText(patron).first().waitFor({ timeout: 10_000 })
}
