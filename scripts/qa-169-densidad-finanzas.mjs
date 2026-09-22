// Lote 6-C (#169): mide densidad y ancho de las vistas de Finanzas y Reportes
// a 1280 y 1440 con datos reales, y guarda capturas de evidencia.
//
// Uso:
//   QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
//   node scripts/qa-169-densidad-finanzas.mjs
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const API = process.env.QA_API_URL || 'http://localhost:3115'
const WEB = process.env.QA_BASE_URL || 'http://localhost:5215'
const SALIDA = join(RAIZ, 'docs/qa/169')
mkdirSync(SALIDA, { recursive: true })

const VISTAS = [
  ['conciliacion', '/finanzas/conciliacion', /Conciliación y trazabilidad/],
  ['caja', '/finanzas/caja', /Abrir caja|Cerrar caja/],
  ['gastos', '/finanzas/gastos', /Registrar salida, cheque o adelanto/],
  ['creditos', '/finanzas/creditos', /Créditos/],
  ['cobranzas', '/finanzas/cuotas', /Cobranzas/],
  ['comisiones', '/finanzas/comisiones', /Comisiones/],
  ['reportes', '/analisis/reportes', /Reportes/],
  ['resumen', '/resumen', /Facturado/],
]

// Sesión real del entorno local (seed de e2e).
const loginRespuesta = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: WEB },
  body: JSON.stringify({ email: 'e2e-tienda@test.local', password: 'E2e-password-123', deviceId: 'qa-169' }),
})
const login = await loginRespuesta.json()
let cookies = (loginRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')
const admin = (login.sellers || []).find((fila) => fila.name === 'Administrador')
const pinRespuesta = await fetch(`${API}/api/auth/pin`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: WEB, cookie: cookies },
  body: JSON.stringify({ sellerId: admin.id, pin: '1234' }),
})
cookies = `${cookies}; ${(pinRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')}`

const browser = await chromium.launch()
const medidas = []
const desbordes = []

for (const [ancho, alto] of [[1280, 900], [1440, 950]]) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } })
  await ctx.addCookies(cookies.split('; ').map((par) => {
    const [name, ...resto] = par.split('=')
    return { name, value: resto.join('='), domain: 'localhost', path: '/' }
  }))
  const page = await ctx.newPage()
  for (const [clave, ruta, titulo] of VISTAS) {
    await page.goto(`${WEB}${ruta}`)
    await expect(page.getByText(titulo).filter({ visible: true }).first()).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(1200)
    const contenedores = await page.evaluate(() => {
      const nodos = [...document.querySelectorAll('.overflow-x-auto, [data-testid$="-tabla"]')]
      return nodos
        .filter((nodo) => nodo.offsetParent !== null && nodo.scrollWidth > 0)
        .map((nodo) => ({
          testid: nodo.dataset.testid || null,
          scrollWidth: nodo.scrollWidth,
          clientWidth: nodo.clientWidth,
          desborde: nodo.scrollWidth - nodo.clientWidth,
        }))
    })
    for (const fila of contenedores) {
      medidas.push({ ancho, vista: clave, ...fila })
      if (fila.desborde > 1) desbordes.push({ ancho, vista: clave, testid: fila.testid, desborde: fila.desborde })
    }
    await page.screenshot({ path: join(SALIDA, `${ancho}-${clave}.jpg`), type: 'jpeg', quality: 68, fullPage: false })
  }
  await ctx.close()
}

writeFileSync(join(SALIDA, 'medidas.json'), JSON.stringify({ web: WEB, medidas, desbordes }, null, 2))
await browser.close()
console.log('Vista            1280            1440')
for (const [clave] of VISTAS) {
  const de = (ancho) => medidas.filter((fila) => fila.ancho === ancho && fila.vista === clave).map((fila) => fila.desborde)
  console.log(`${clave.padEnd(16)} ${JSON.stringify(de(1280)).padEnd(15)} ${JSON.stringify(de(1440))}`)
}
console.log(`\n${desbordes.length} contenedor(es) con scroll horizontal`)
if (desbordes.length) process.exitCode = 1
