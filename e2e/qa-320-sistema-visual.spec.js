// QA #320 — Sistema visual: un solo encabezado y un solo pie por página.
//
// Recorre las superficies del panel con barra de módulo y verifica el criterio
// de la auditoría: el título visible de la página (h1 del shell) aparece una
// sola vez, la barra de módulo no lo repite (contexto + acciones) y el pie
// institucional lo renderiza solo el shell (una vez por página). Deja capturas
// claro/oscuro/móvil y el registro crudo en docs/qa/320-sistema-visual/.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS = process.env.MOBOS_CAPTURAS || join('docs', 'qa', '320-sistema-visual')
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

mkdirSync(SHOTS, { recursive: true })

async function tema(page, valor) {
  await page.evaluate((v) => { try { localStorage.setItem('mobos:theme', v) } catch { /* sin storage */ } }, valor)
}

// Superficies reportadas en #320 (más las que comparten la barra de módulo):
// ruta, barra esperada y contenido que confirma que la pantalla cargó.
const PANTALLAS = [
  ['pos', '/pos', 'barra-pos', (p) => p.getByPlaceholder('Buscar producto…')],
  ['pedidos', '/pedidos', 'barra-pedidos', (p) => p.getByTestId('pedido-fila').first()],
  ['cotizaciones', '/cotizaciones', 'barra-cotizaciones', (p) => p.getByRole('button', { name: 'Todas', exact: true })],
  ['clientes', '/clientes', 'barra-clientes', (p) => p.getByTestId('cliente-fila').first()],
  ['productos', '/productos', 'barra-productos', (p) => p.getByTestId('producto-fila').first()],
  ['promociones', '/promociones', 'barra-promociones', (p) => p.getByTestId('barra-promociones')],
  ['plantillas', '/plantillas', 'barra-plantillas', (p) => p.getByTestId('barra-plantillas')],
  ['precios', '/precios', 'barra-precios', (p) => p.getByRole('heading', { name: 'Listas de precios' }).first()],
  ['inventario-unidades', '/inventario/unidades', 'barra-inventario', (p) => p.getByTestId('inventario-fila').first()],
  ['compras', '/compras', 'barra-compras', (p) => p.getByTestId('barra-compras')],
  ['delivery', '/delivery', 'barra-delivery', (p) => p.getByTestId('reparto-admin-pedido').first()],
  ['servicio', '/servicio', 'barra-taller', (p) => p.getByTestId('servicio-garantias')],
  ['trade-in', '/trade-in', 'barra-tradein', (p) => p.locator('[data-testid="barra-tradein"]:visible')],
  ['autorizaciones', '/autorizaciones', 'barra-autorizaciones', (p) => p.getByTestId('barra-autorizaciones')],
  ['celulares', '/celulares', 'barra-celulares', (p) => p.getByTestId('barra-celulares')],
  ['comparador', '/comparador', 'barra-comparador', (p) => p.getByTestId('barra-comparador')],
  // Páginas administrativas sin barra de módulo: mismo criterio de título y pie.
  ['inicio', '/resumen', null, (p) => p.getByRole('heading', { name: 'Accesos rápidos' })],
  ['analisis-reportes', '/analisis/reportes', null, (p) => p.locator('[data-testid="reportes-abc-tabla"]').or(p.getByText('Cómo se calcula el resultado')).first()],
  ['finanzas-caja', '/finanzas/caja', null, (p) => p.getByText('Saldo esperado').first()],
  ['configuracion-equipo', '/configuracion/equipo', null, (p) => p.getByTestId('integrante-fila').first()],
  ['mi-cuenta', '/mi-cuenta', null, (p) => p.getByRole('heading', { name: 'Tu perfil' })],
  ['ayuda', '/ayuda/ayuda', null, (p) => p.getByRole('heading', { name: 'Documentación interna' })],
]

test.describe('sistema visual (#320)', () => {
  test('un solo título y un solo pie por página (claro · móvil · oscuro)', async ({ page }) => {
    test.slow()
    const registro = []
    for (const [nombre, ruta, barra, listo] of PANTALLAS) {
      for (const [etiqueta, viewport, t] of [
        ['desktop', DESKTOP, 'light'],
        ['mobile', MOBILE, 'light'],
        ['mobile-oscuro', MOBILE, 'dark'],
      ]) {
        await page.setViewportSize(viewport)
        await tema(page, t === 'dark' ? 'dark' : 'light')
        await page.goto(ruta)
        await expect(listo(page), `${nombre}: contenido de la pantalla`).toBeVisible({ timeout: 30_000 })

        // La barra de módulo (cuando existe) no repite el título visible:
        // agrupa contexto y acciones.
        if (barra) {
          const barraLocator = page.locator(`[data-testid="${barra}"]:visible`)
          await expect(barraLocator, `${nombre}: barra de módulo`).toBeVisible({ timeout: 20_000 })
          await expect(barraLocator.getByRole('heading'), `${nombre}: la barra no repite el título`).toHaveCount(0)
        }

        // La identidad visible aparece una sola vez en la página.
        const titulo = (await page.locator('h1:visible').first().innerText()).trim()
        const veces = await page.evaluate((texto) => [...document.querySelectorAll('h1, h2, h3')]
          .filter((el) => el.getClientRects().length > 0 && (el.textContent || '').trim() === texto).length, titulo)
        expect(veces, `${nombre} ${etiqueta}: «${titulo}» aparece ${veces} vez/veces`).toBe(1)

        // El pie institucional lo renderiza el shell, una sola vez.
        await expect(page.locator('footer.mobos-footer'), `${nombre} ${etiqueta}: un solo pie`).toHaveCount(1)

        registro.push({ superficie: nombre, estado: etiqueta, titulo, veces })
        await page.screenshot({ path: join(SHOTS, `${nombre}-${etiqueta}.png`) })
        if (t === 'dark') await tema(page, 'light')
      }
    }
    writeFileSync(join(SHOTS, 'auditoria-320.json'), `${JSON.stringify(registro, null, 2)}\n`)
    expect(registro).toHaveLength(PANTALLAS.length * 3)
  })
})
