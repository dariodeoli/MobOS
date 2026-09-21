// QA de producción (#187 / #198) — Clientes y Servicio.
//
// Verifica, headless y sin sesión:
//  1. Demo anónima: ficha con datos ficticios (deuda, cronología, seguro),
//     WhatsApp de plantilla, portal por token demo y Servicio Técnico, sin
//     llamadas al API real.
//  2. Públicos con token inválido: mensaje genérico y 404 en la API.
//
// Uso: node e2e/prod/187-clientes.mjs
//   QA198_SHOTS=/tmp/qa198 (capturas) · QA_APP=… QA_PORTAL=… QA_API=… para otros entornos.
//
// Si el demo completo todavía no está deployado, el script lo informa
// ("pendiente de deploy") y deja igual la verificación de públicos + captura.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.QA_APP || 'https://app.moboss.online'
const PORTAL = process.env.QA_PORTAL || 'https://clientes.moboss.online'
const API = process.env.QA_API || 'https://api.moboss.online'
const SHOTS = process.env.QA198_SHOTS || '/tmp/qa198'
mkdirSync(SHOTS, { recursive: true })

const resultado = { demo: {}, publicos: {}, api: {}, pendienteDeploy: false, hallazgos: [] }
const browser = await chromium.launch({ headless: true })
const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await contexto.newPage()
const apiReal = []
page.on('request', (request) => {
  if (/\/api\/(customers|message-templates|service-orders|service-items|service-checklists|portal|public\/portal)/.test(request.url())) apiReal.push(request.url())
})

// ── 1. Demo (anónima o con perfil Dueño) ────────────────────────────────────
await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1500)
const entrada = page.getByRole('button', { name: /Dueño/ }).first()
if (await entrada.count()) await entrada.click()
else await page.getByRole('button', { name: /Entrar|Probar|Ver la demo/i }).first().click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${SHOTS}/01-demo-entrada.png` })

const nav = page.locator('aside nav, nav').first()
await nav.getByRole('button', { name: 'Clientes', exact: true }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${SHOTS}/02-clientes-demo.png` })
const lista = await page.locator('body').innerText()
resultado.demo.seedVisible = lista.includes('Lucía Fernández')

if (resultado.demo.seedVisible) {
  await page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first().click()
  await page.waitForTimeout(1200)
  const ficha = page.getByRole('dialog')
  resultado.demo.bannerDemo = await ficha.getByText(/Modo demo/).count() > 0
  resultado.demo.deuda = await ficha.getByText('Saldo pendiente: Gs 1.500.000').count() > 0
  resultado.demo.ultimasOrdenes = await ficha.getByText('MOB-#0008').count() > 0
  await page.screenshot({ path: `${SHOTS}/03-ficha-deuda.png` })

  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await page.waitForTimeout(600)
  resultado.demo.cronologia = await ficha.getByText('Pedido creado').count() > 0
  await page.screenshot({ path: `${SHOTS}/04-ficha-cronologia.png` })

  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  await page.waitForTimeout(600)
  const seguro = ficha.getByRole('switch', { name: 'Seguro del cliente activo' })
  resultado.demo.seguro = (await seguro.count()) > 0 && (await seguro.isChecked()) && (await seguro.isDisabled())
  resultado.demo.seguroPct = await ficha.getByLabel('Porcentaje del cliente').inputValue().catch(() => '')
  await page.screenshot({ path: `${SHOTS}/05-ficha-seguro.png` })

  // WhatsApp de plantilla (popover con plantillas demo, sin API).
  await ficha.getByRole('button', { name: /Elegir plantilla de WhatsApp/ }).click()
  await page.waitForTimeout(600)
  resultado.demo.whatsapp = await page.getByRole('dialog', { name: 'Plantillas de WhatsApp' }).getByText('Pedido listo para retirar').count() > 0
  await page.screenshot({ path: `${SHOTS}/06-whatsapp-plantilla.png` })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // Portal por token demo (local, sin API).
  const idDemo = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('mobos:demo-customers:v1') || '[]')[0] || {}).id || 'demo-cliente-lucia' } catch { return 'demo-cliente-lucia' }
  })
  await page.goto(`${PORTAL}/cuenta/demo-demo-cliente-lucia-completo`)
  await page.waitForTimeout(1000)
  const portalTexto = await page.locator('body').innerText()
  resultado.demo.portalCuenta = portalTexto.includes('Tienda demo') && portalTexto.includes('Gs 1.500.000')
  await page.screenshot({ path: `${SHOTS}/07-portal-cuenta.png` })
  await page.goto(`${PORTAL}/portal/demo-demo-cliente-lucia-completo`)
  await page.waitForTimeout(1000)
  resultado.demo.portalVitrina = (await page.locator('body').innerText()).includes('MOB-#0008')
  await page.screenshot({ path: `${SHOTS}/08-portal-vitrina.png` })

  // Observación demo: ?cliente= abre la ficha sin API real.
  await page.goto(`${APP}/clientes?cliente=${encodeURIComponent(idDemo)}`)
  await page.waitForTimeout(1500)
  resultado.demo.clienteParam = await page.getByRole('dialog').getByText(/Modo demo/).count() > 0
  await page.screenshot({ path: `${SHOTS}/09-cliente-param.png` })

  // Servicio Técnico demo.
  await page.goto(`${APP}/servicio`)
  await page.waitForTimeout(1500)
  const servicioTexto = await page.locator('body').innerText()
  resultado.demo.servicio = servicioTexto.includes('OS-#0001') && servicioTexto.includes('OS-#0002')
  await page.screenshot({ path: `${SHOTS}/10-servicio-demo.png` })
} else {
  resultado.pendienteDeploy = true
  resultado.hallazgos.push('El demo completo (#194) todavía no está deployado: la lista de Clientes en producción está vacía y no muestra los seeds ficticios.')
}

resultado.demo.apiReal = [...new Set(apiReal)]

// ── 2. Públicos con token inválido ──────────────────────────────────────────
const anonimo = await contexto.newPage()
for (const [ruta, clave] of [['/cuenta/token-inexistente-qa198', 'cuenta'], ['/portal/token-inexistente-qa198', 'vitrina'], ['/garantia/token-inexistente-qa198', 'garantia']]) {
  await anonimo.goto(`${PORTAL}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await anonimo.waitForTimeout(1000)
  const texto = (await anonimo.locator('body').innerText()).toLowerCase()
  resultado.publicos[clave] = { generico: /no encontrada|no es válido|venció/.test(texto) }
  await anonimo.screenshot({ path: `${SHOTS}/11-publico-${clave}.png` })
}
for (const [ruta, clave] of [['/api/portal/token-inexistente-qa198', 'portal'], ['/api/public/portal/token-inexistente-qa198', 'vitrina'], ['/api/public/warranty/token-inexistente-qa198', 'garantia']]) {
  const res = await fetch(`${API}${ruta}`)
  resultado.api[clave] = res.status
}

await browser.close()
writeFileSync(`${SHOTS}/resumen.json`, JSON.stringify(resultado, null, 2))
console.log(JSON.stringify(resultado, null, 2))
if (resultado.pendienteDeploy) process.exitCode = 3
