import { test, expect } from '@playwright/test'

test('#402 marca de sesión en papeles A4/58/80 y etiquetas, sin imprimir ni guardar negocio', async ({ page }) => {
  let writes = 0
  await page.route('**/api/**', (route) => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue()
    if (!['GET', 'OPTIONS'].includes(route.request().method())) writes++
    return route.abort()
  })
  await page.route('**/qa-print402', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }))
  await page.goto('/qa-print402')
  const results = await page.evaluate(async () => {
    const { default: RefreshRuntime } = await import('/@react-refresh')
    RefreshRuntime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => type => type
    window.__vite_plugin_react_preamble_installed__ = true
    const { fijarEmpresaImpresion } = await import('/src/lib/printing/empresaImpresion.js')
    const paper = await import('/src/components/shared/OrderReceipt.jsx')
    const { buildStationSheetHtml } = await import('/src/lib/printing/hojaEstacion.js')
    const outputs = []
    for (const brandColor of ['#AA3300', '#223388', 'red; background:url(x)', '#ffffff']) {
      fijarEmpresaImpresion({ tenant: { name: 'Tienda QA', brandColor }, branch: null })
      const expected = ['#AA3300', '#223388'].includes(brandColor) ? brandColor.toLowerCase() : '#0c8876'
      for (const format of ['a4', 'thermal-58', 'thermal-80']) {
        const builders = ['buildDeliveryNoteHtml', 'buildInternalReceiptHtml', 'buildProformaHtml', 'buildCierreCajaHtml', 'buildResumenDiaHtml', 'buildInformeDispositivoHtml', 'buildCertificadoHtml', 'buildListaCompraHtml', 'buildListaPreciosHtml', 'buildManifiestoHtml', 'buildComprobanteRecepcionHtml']
        for (const builder of builders) {
          const html = builder === 'buildInternalReceiptHtml'
            ? await paper[builder]({}, { items: [] }, { format })
            : await paper[builder]({ items: [], lineas: [], totales: {} }, { format })
          const doc = new DOMParser().parseFromString(html, 'text/html')
          outputs.push({ builder, format, expected, color: doc.querySelector('style').textContent.includes(expected), injected: html.includes('background:url(x)') })
        }
      }
      for (const builder of ['buildProductLabelsHtml', 'buildUnitLabelsHtml', 'buildEtiquetasLoteHtml']) {
        const html = await paper[builder]([])
        outputs.push({ builder, expected, color: html.includes(`color:${expected}`), injected: html.includes('background:url(x)') })
      }
      outputs.push({ builder: 'buildStationSheetHtml', expected, color: buildStationSheetHtml([]).includes(`color:${expected}`), injected: false })
    }
    fijarEmpresaImpresion({ tenant: null, branch: null })
    outputs.push({ builder: 'logout', expected: '#0c8876', color: paper.styles('a4').includes('#0c8876'), injected: false })
    return outputs
  })
  expect(results.length).toBe(149)
  expect(results.filter(result => !result.color || result.injected)).toEqual([])
  expect(writes).toBe(0)
})
