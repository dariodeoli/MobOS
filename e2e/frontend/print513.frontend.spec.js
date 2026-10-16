import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { leerRaster } from '../helpers/raster-qr.js'
test('513 comprobante y unidad HTML premium generan raster real sin QR nativo ni sufijos', async ({
  page,
}) => {
  await page.route('**/api/**', route =>
    new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.fulfill({ status: 401, json: { error: 'Sin sesión real' } })
      : route.continue(),
  )
  await page.route('https://**', route => route.abort())
  await page.goto('/e2e/fixtures/plantillas507.html')
  const result = await page.evaluate(async () => {
    const { buildOrderReceiptHtml, buildUnitLabelsHtml } =
      await import('/src/components/shared/OrderReceipt.jsx')
    const { ticketsDesdeHtml } = await import('/src/lib/printing/htmlEscpos.js')
    const token = 'Abcdefghijklmnopqrstuvwxyz0123_-'
    const order = {
      id: 'fixture513',
      orderNumber: 'QA-513',
      createdAt: '2026-10-15T12:00:00Z',
      status: 'PAID',
      totalPyg: 180000,
      paidPyg: 180000,
      customer: { name: 'Cliente ficticio' },
      items: [
        { description: 'Funda sintética', quantity: 1, unitPricePyg: 180000, totalPyg: 180000 },
      ],
      payments: [{ method: 'CASH', status: 'CONFIRMED', amountPyg: 180000 }],
    }
    const receipt = await buildOrderReceiptHtml(order, {
      level: 'rapido',
      format: 'thermal-80',
      token,
      contexto: { empresa: { nombre: 'Comercio ficticio' }, tenant: { name: 'Comercio ficticio' } },
    })
    const unit = await buildUnitLabelsHtml(
      [{ serial: '350000000000001', product: { name: 'iPhone 15' }, condition: 'USED' }],
      { ancho: 80, base: 'https://clientes.example.invalid' },
    )
    const output = []
    for (const [kind, html] of [
      ['receipt', receipt],
      ['unit', unit],
    ]) {
      try {
        const tickets = await ticketsDesdeHtml(html, {
          impresora: { modelo: 'ZKP8008', ancho: 80, corte: true },
          formato: 'thermal-80',
          etiquetas: kind === 'unit',
        })
        output.push({ kind, html, base64: tickets[0].base64() })
      } catch (error) {
        output.push({ kind, error: error.message })
      }
    }
    return output
  })
  console.log(result.map(({ kind, error }) => ({ kind, error })))
  for (const row of result) {
    expect(row.error, JSON.stringify(row)).toBeUndefined()
    await writeFile(`/tmp/print513-${row.kind}.bin`, Buffer.from(row.base64, 'base64'))
    expect(row.html).toContain('data-area-termica="80"')
    const decoded = leerRaster(row.base64)
    expect(decoded.cuts).toBe(1)
    expect(decoded.pages.map(p => p.qr)).toEqual([row.kind === 'receipt' ? 'https://clientes.example.invalid/pedidos/Abcdefghijklmnopqrstuvwxyz0123_-' : 'https://clientes.example.invalid/u/350000000000001'])
    if (row.kind === 'receipt') { expect(row.html).toContain('180.000'); expect(row.html).toContain('QA-0513') }
  }
})

test('513 dispatcher local envía el raster del HTML confirmado y conserva copias', async ({
  page,
}) => {
  const sent = []
  await page.route('**/api/**', route =>
    new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.fulfill({ status: 401, json: { error: 'Sin sesión real' } })
      : route.continue(),
  )
  await page.route('http://127.0.0.1:17890/**', async route => {
    if (route.request().method() === 'POST') sent.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: { ok: true },
    })
  })
  await page.goto('/e2e/fixtures/plantillas507.html')
  const result = await page.evaluate(async () => {
    const { imprimirDocumento, usarTenantImpresoras } = await import('/src/lib/printing/agent.js')
    const { ticketsDesdeHtml } = await import('/src/lib/printing/htmlEscpos.js')
    const { buildUnitLabelsHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    usarTenantImpresoras('fixture-A')
    const html = await buildUnitLabelsHtml(
      [1, 2, 3].map(n => ({ serial: `35000000000000${n}`, product: { name: 'iPhone 15' } })),
      { ancho: 80, base: 'https://clientes.example.invalid' },
    )
    const impresora = {
      modelo: 'ZKP8008',
      ancho: 80,
      destino: 'lan:192.0.2.99:9100',
      activa: true,
      corte: true,
      copias: 2,
    }
    let expected
    const result = await imprimirDocumento(
      async ({ impresora }) => {
        const pages = await ticketsDesdeHtml(html, {
          impresora,
          formato: 'thermal-80',
          etiquetas: true,
        })
        expected = pages[0].base64()
        return pages
      },
      {
        store: { impresoras: [impresora], agentUrl: 'http://127.0.0.1:17890' },
        impresora,
        copias: 2,
        tipo: 'etiquetas-stock',
      },
    )
    return { result, expected }
  })
  expect(result.result.ok).toBe(true)
  expect(sent).toHaveLength(1)
  expect(sent[0].data).toBe(result.expected)
  expect(sent[0].copias).toBe(2)
  expect(sent[0].impresora).toBe('lan:192.0.2.99:9100')
  const decoded = leerRaster(sent[0].data)
  expect(decoded.cuts).toBe(3)
  expect(decoded.pages.map(p => p.qr)).toEqual([1, 2, 3].map(n => `https://clientes.example.invalid/u/35000000000000${n}`))
})
for (const volver of [false, true])
  test(`513 raster demorado invalida contexto A→B${volver ? '→A' : ''} sin jobs`, async ({
    page,
  }) => {
    const sent = []
    await page.route('**/api/**', route =>
      new URL(route.request().url()).pathname.startsWith('/api/')
        ? route.fulfill({ status: 401, json: { error: 'Sin sesión real' } })
        : route.continue(),
    )
    await page.route('http://127.0.0.1:17890/**', async route => {
      if (route.request().method() === 'POST') sent.push(route.request().url())
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: { ok: true },
      })
    })
    await page.goto('/e2e/fixtures/plantillas507.html')
    const result = await page.evaluate(async volver => {
      const { imprimirDocumento, usarTenantImpresoras } = await import('/src/lib/printing/agent.js')
      const { crearTicket } = await import('/src/lib/printing/escpos.js')
      usarTenantImpresoras('fixture-A')
      let release, started
      const ready = new Promise(resolve => (started = resolve))
      const impresora = {
        modelo: 'ZKP8008',
        ancho: 80,
        destino: 'lan:192.0.2.99:9100',
        activa: true,
      }
      const pending = imprimirDocumento(
        async () => {
          started()
          await new Promise(resolve => (release = resolve))
          return crearTicket().texto('FICTICIO A')
        },
        { store: { impresoras: [impresora], agentUrl: 'http://127.0.0.1:17890' }, impresora },
      )
      await ready
      usarTenantImpresoras('fixture-B')
      if (volver) usarTenantImpresoras('fixture-A')
      release()
      return await pending
    }, volver)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('contexto cambió')
    expect(sent).toHaveLength(0)
  })

test('513 rechazo de modelo/papel/límite nunca vuelve a bytes antiguos; PDF conserva el HTML', async ({
  page,
}) => {
  const sent = []
  await page.route('**/api/**', route =>
    new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.fulfill({ status: 401, json: { error: 'Sin sesión real' } })
      : route.continue(),
  )
  await page.route('http://127.0.0.1:17890/**', async route => {
    if (route.request().method() === 'POST') sent.push(route.request().url())
    await route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: { ok: true },
    })
  })
  await page.goto('/e2e/fixtures/plantillas507.html')
  const result = await page.evaluate(async () => {
    const { imprimirDocumento } = await import('/src/lib/printing/agent.js')
    const { ticketsDesdeHtml } = await import('/src/lib/printing/htmlEscpos.js')
    const { htmlConAreaTermica } = await import('/src/lib/printing/papelTermico.js')
    const { documentoAPdf } = await import('/src/lib/printing/pdfDocumento.js')
    const html = htmlConAreaTermica(
      '<html><head></head><body><h1>Diseño confirmado</h1></body></html>',
      'thermal-80',
    )
    const results = []
    for (const [modelo, ancho, documento] of [
      ['QL-800', 80, html],
      ['TSP143IIIW', 80, html],
      ['LTT214', 80, html],
      ['', 80, html],
      ['ZKP8008', 58, html],
      ['ZKP8008', 80, html.replace('</body>', '<div style="height:9000px">Largo</div></body>')],
    ]) {
      const impresora = { modelo, ancho, destino: 'lan:192.0.2.99:9100', activa: true }
      results.push(
        await imprimirDocumento(
          ({ impresora }) => ticketsDesdeHtml(documento, { impresora, formato: 'thermal-80' }),
          { store: { impresoras: [impresora], agentUrl: 'http://127.0.0.1:17890' }, impresora },
        ),
      )
    }
    const pdf = await documentoAPdf(html, { formato: 'thermal-80' })
    return {
      results,
      pdf: await pdf.arrayBuffer().then(b =>
        Array.from(new Uint8Array(b))
          .map(x => String.fromCharCode(x))
          .join(''),
      ),
    }
  })
  expect(result.results.every(r => !r.ok && r.motivo === 'preparacion-documento')).toBe(true)
  expect(result.results[0].error).toContain('ZKP8008')
  expect(result.results[4].error).toContain('distinto papel')
  expect(result.results[5].error).toContain('límite')
  expect(result.pdf).toContain('%PDF-')
  expect(sent).toHaveLength(0)
})

for (const volver of [false, true]) test(`513 consumidor Stock no adopta contexto nuevo durante QR A→B${volver ? '→A' : ''}`, async ({ page }) => {
  const sent = []
  await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ status: 401, json: {} }) : route.continue())
  await page.route('http://127.0.0.1:17890/**', route => {
    if (route.request().method() === 'POST') sent.push(route.request().url())
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, json: { ok: true } })
  })
  await page.goto('/e2e/fixtures/plantillas507.html')
  const result = await page.evaluate(async volver => {
    const agent = await import('/src/lib/printing/agent.js')
    const { printLabel } = await import('/src/components/stock/impresionStock.js')
    agent.usarTenantImpresoras('fixture-A')
    agent.guardarImpresoras('fixture-A', { impresoras: [{ modelo: 'ZKP8008', ancho: 80, activa: true, predeterminada: true, destino: 'lan:192.0.2.99:9100' }] })
    const original = HTMLCanvasElement.prototype.toDataURL
    let started, release, delayed = false
    const ready = new Promise(resolve => started = resolve)
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const data = original.apply(this, args)
      if (delayed) return data
      delayed = true; started()
      return new Promise(resolve => release = () => resolve(data))
    }
    try {
      const pending = printLabel({ serial: '350000000000001', product: { name: 'Equipo ficticio' } })
      await ready
      agent.usarTenantImpresoras('fixture-B')
      if (volver) agent.usarTenantImpresoras('fixture-A')
      release()
      return await pending
    } finally { HTMLCanvasElement.prototype.toDataURL = original }
  }, volver)
  expect(result.ok).toBe(false)
  expect(result.motivo).toBe('contexto-cambiado')
  expect(sent).toHaveLength(0)
})

test('513 rechazo local tardío no encola en la empresa siguiente', async ({ page }) => {
  let local, release
  const ready = new Promise(resolve => local = resolve), queued = []
  await page.route('**/api/**', route => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue()
    if (route.request().url().includes('/api/print/jobs')) queued.push(route.request().postData())
    return route.fulfill({ status: 401, json: {} })
  })
  await page.route('http://127.0.0.1:17890/**', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, json: { ok: true } })
    local()
    await new Promise(resolve => release = resolve)
    return route.fulfill({ status: 400, headers: { 'Access-Control-Allow-Origin': '*' }, json: { ok: false, error: 'Rechazo antes de aceptar' } })
  })
  await page.goto('/e2e/fixtures/plantillas507.html')
  const pending = page.evaluate(async () => {
    const agent = await import('/src/lib/printing/agent.js')
    const { crearTicket } = await import('/src/lib/printing/escpos.js')
    agent.usarTenantImpresoras('fixture-A')
    const impresora = { destino: 'lan:192.0.2.99:9100', activa: true, modelo: 'ZKP8008', ancho: 80 }
    return agent.imprimirDocumento(crearTicket().texto('Fixture A'), { impresora, store: { impresoras: [impresora], remoteEnabled: true, agentUrl: 'http://127.0.0.1:17890' } })
  })
  await ready
  await page.evaluate(async () => (await import('/src/lib/printing/agent.js')).usarTenantImpresoras('fixture-B'))
  release()
  const result = await pending
  expect(result.ok).toBe(false)
  expect(result.motivo).toBe('contexto-cambiado')
  expect(queued).toHaveLength(0)
})
