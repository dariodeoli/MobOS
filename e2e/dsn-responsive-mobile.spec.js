// Auditoría responsive mobile (pedido de Dario): POS + pantallas clave a
// 360/390/414 px y tablet (768). Mide scroll horizontal, elementos cortados y
// targets por debajo de 44 px, audita el modal principal y deja capturas por
// pantalla. Es un INFORME: no falla por los hallazgos (los fixes llegan
// después, con sus aserciones).
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/responsive-mobile'
const ANCHOS = [[360, 740], [390, 844], [414, 896], [768, 1024]]

const PANTALLAS = [
  ['pos', '/pos', (page) => page.getByRole('heading', { name: 'Nueva venta' }), async (page, ancho) => {
    // Carrito con una línea en el ancho de referencia del celular: es el estado
    // que más se usa en el mostrador (en los otros anchos se audita el inicio).
    if (ancho !== 390) return
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente QA ${Date.now().toString(36)}`)
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill('Cable')
    const producto = page.getByRole('button', { name: /Cable USB-C E2E/ }).first()
    await expect(producto).toBeVisible({ timeout: 15_000 })
    await producto.click()
    await expect(page.getByText('Productos de esta venta').first()).toBeVisible({ timeout: 15_000 })
  }],
  ['inventario', '/inventario/unidades', (page) => page.getByTestId('inventario-fila').first()],
  ['pedidos', '/pedidos', (page) => page.getByRole('heading', { name: 'Mis pedidos' })],
  ['clientes', '/clientes', (page) => page.getByTestId('cliente-fila').first()],
  ['finanzas', '/finanzas/caja', (page) => page.getByText('Saldo esperado').first()],
  ['demo', '/demo', (page) => page.locator('h1:visible, h2:visible').first()],
  // La landing se sirve en el host público: acá se audita su vista previa local
  // (`/landing-preview`, solo en dev) y en producción con el script.
  ['landing', '/landing-preview', (page) => page.locator('h1:visible').first()],
]

// Modales principales por pantalla (criterio de Dario: usables en mobile). Se
// auditan a 390 y se capturan. Con timeout corto: si el disparador no está, se
// reporta y se sigue.
const MODALES = {
  pos: (page) => page.getByRole('button', { name: /Ventas suspendidas/ }).first().click({ timeout: 5_000 }),
  inventario: (page) => page.getByRole('button', { name: /Recibir unidad/ }).first().click({ timeout: 5_000 }),
}

// Medición en la página: scroll horizontal del documento, elementos visibles
// que se salen del viewport (fuera de contenedores scrollables a propósito) y
// controles interactivos por debajo de 44 px.
async function auditar(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const visible = (el) => el.offsetParent !== null && el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]')
    const enScrollable = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const overflow = getComputedStyle(n).overflowX
        if (overflow === 'auto' || overflow === 'scroll') return true
      }
      return false
    }
    const overflowH = Math.max(0, document.documentElement.scrollWidth - vw)
    const cortados = []
    for (const el of document.querySelectorAll('button, a, input, select, textarea, h1, h2, h3, table, img, [data-testid]')) {
      if (!visible(el) || enScrollable(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.left < -1 || rect.right > vw + 1) {
        cortados.push({
          que: el.tagName.toLowerCase(),
          texto: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 34),
          izquierda: Math.round(rect.left),
          derecha: Math.round(rect.right),
          ancho: Math.round(rect.width),
          clase: String(el.className).slice(0, 70),
        })
      }
    }
    // Área táctil efectiva: si el control expande su zona con `::after`
    // (patrón .toque-44), se mide esa área y no la caja dibujada.
    const areaTactil = (el) => {
      const rect = el.getBoundingClientRect()
      let ancho = rect.width
      let alto = rect.height
      const after = getComputedStyle(el, '::after')
      if (after && after.content && after.content !== 'none' && after.position === 'absolute') {
        const anchoAfter = parseFloat(after.width)
        const altoAfter = parseFloat(after.height)
        if (Number.isFinite(anchoAfter)) ancho = Math.max(ancho, anchoAfter)
        if (Number.isFinite(altoAfter)) alto = Math.max(alto, altoAfter)
      }
      return { ancho, alto }
    }
    const chicos = []
    for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]')) {
      if (!visible(el) || el.closest('[aria-hidden="true"]')) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const area = areaTactil(el)
      if (area.alto < 44 || area.ancho < 44) {
        chicos.push({
          que: el.tagName.toLowerCase(),
          texto: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30),
          ancho: Math.round(area.ancho),
          alto: Math.round(area.alto),
          dibujo: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          clase: String(el.className).slice(0, 70),
        })
      }
    }
    // Resumen por patrón de clase (los hallazgos se agrupan, no se listan 300 veces).
    const porPatron = {}
    for (const chico of chicos) {
      const clave = `${chico.que}:${chico.clase.replace(/\s+/g, ' ').slice(0, 44)}`
      porPatron[clave] = porPatron[clave] ? { ...porPatron[clave], veces: porPatron[clave].veces + 1 } : { ...chico, veces: 1 }
    }
    return {
      overflowH,
      totalCortados: cortados.length,
      cortados: cortados.slice(0, 8),
      totalChicos: chicos.length,
      chicos: Object.values(porPatron).sort((a, b) => b.veces - a.veces).slice(0, 10),
    }
  })
}

function auditarPantallas(registro, pantallas) {
  for (const [pantalla, ruta, listo, preparar] of pantallas) {
    test(`${pantalla}: 360/390/414 + tablet`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      for (const [ancho, alto] of ANCHOS) {
        await page.setViewportSize({ width: ancho, height: alto })
        await page.goto(ruta)
        await expect(listo(page)).toBeVisible({ timeout: 30_000 })
        if (preparar) await preparar(page, ancho)
        const medicion = await auditar(page)
        registro.push({ pantalla, ancho, ...medicion })
        console.log(`[${pantalla}-${ancho}] scroll=${medicion.overflowH}px cortados=${medicion.totalCortados} chicos=${medicion.totalChicos}`)
        await page.screenshot({ path: `${SHOTS}/${pantalla}-${ancho}.png` })
        if (ancho === 390) {
          const abrirModal = MODALES[pantalla]
          if (abrirModal) {
            try {
              await abrirModal(page)
              await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 })
              const enModal = await auditar(page)
              registro.push({ pantalla: `${pantalla}-modal`, ancho: 390, ...enModal })
              console.log(`[${pantalla}-390-modal] scroll=${enModal.overflowH}px cortados=${enModal.totalCortados} chicos=${enModal.totalChicos}`)
              await page.screenshot({ path: `${SHOTS}/${pantalla}-390-modal.png` })
              await page.keyboard.press('Escape')
            } catch (error) {
              console.log(`[${pantalla}-390-modal] no se pudo auditar: ${String(error.message || error).split('\n')[0]}`)
            }
          }
          // Oscuro en el ancho de referencia del celular.
          await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
          await page.goto(ruta)
          await expect(listo(page)).toBeVisible({ timeout: 30_000 })
          if (preparar) await preparar(page, ancho)
          await page.screenshot({ path: `${SHOTS}/${pantalla}-${ancho}-oscuro.png` })
          await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
        }
      }
      // Un archivo por pantalla: el worker puede reiniciarse tras un fallo y el
      // acumulador del módulo se pierde.
      writeFileSync(`${SHOTS}/auditoria-${pantalla}.json`, JSON.stringify(registro.filter((fila) => fila.pantalla === pantalla), null, 2))
      expect(registro.filter((fila) => fila.pantalla === pantalla)).toHaveLength(ANCHOS.length)
    })
  }
}

test.describe('auditoría responsive mobile', () => {
  // La corrida toca 4 anchos + modal + oscuro por pantalla: más lenta que un spec normal.
  test.slow()
  // La landing no está en este spec: se sirve en el host público y en local `/`
  // cae al acceso. Se audita en producción con `scripts/qa-responsive-landing.mjs`.
  auditarPantallas([], PANTALLAS)
})
