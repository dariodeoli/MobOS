import { test, expect } from '@playwright/test'
async function enter(page, width, role = 'ADMIN') {
  const calls = []
  page.on('request', r => {
    if (new URL(r.url()).pathname.startsWith('/api/')) calls.push(r.url())
  })
  await page.route('**/api/**', r =>
    new URL(r.request().url()).pathname.startsWith('/api/')
      ? r.fulfill({ status: 503, json: { error: 'API real prohibida en fixture' } })
      : r.continue(),
  )
  await page.route('https://**', r => r.abort())
  await page.addInitScript(role => {
    sessionStorage.setItem('mobos:demo-session', 'active')
    sessionStorage.setItem('mobos:demo-session:role', role)
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
  }, role)
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`/e2e/fixtures/plantillas507.html?tema=${width === 1440 ? 'dark' : 'light'}`)
  await expect(page.getByRole('button', { name: 'Nueva plantilla', exact: true })).toBeEnabled({
    timeout: 15000,
  })
  return () => expect(calls).toEqual([])
}
for (const width of [360, 390, 1440])
  test(`507 CRUD, mm, PDF real y adopción ${width}`, async ({ page }) => {
    const clean = await enter(page, width)
    await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Editar plantilla de impresión', exact: true })
    await editor.getByLabel('Nombre de la plantilla', { exact: true }).fill('Etiqueta QA')
    await expect(editor.locator('iframe')).toBeVisible()
    await expect(editor.getByRole('alert')).toHaveCount(0)
    await editor.getByLabel('Elemento', { exact: true }).selectOption('product')
    await editor.getByLabel('Tamaño de letra (pt)', { exact: true }).fill('9')
    await editor.getByLabel('Posición X (mm)', { exact: true }).fill('3')
    await expect(editor.getByRole('alert')).toContainText('Fuera del área útil')
    await editor.getByRole('group', { name: 'Mover elemento con flechas' }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(editor.getByLabel('Posición X (mm)', { exact: true })).toHaveValue('2')
    await expect(editor.getByRole('alert')).toHaveCount(0)
    const downloadPromise = page.waitForEvent('download')
    await editor.getByRole('button', { name: 'Descargar PDF de muestra', exact: true }).click()
    const download = await downloadPromise
    const path = await download.path()
    const fs = await import('node:fs/promises')
    const pdf = await fs.readFile(path, 'latin1')
    expect(pdf).toContain('/MediaBox [0 0 311.81 170.08]')
    expect(pdf).toContain('/Count 1')
    expect(await editor.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
    const small = await editor.locator('button,input,select').evaluateAll(elements =>
      elements
        .filter(e => !e.disabled && e.getBoundingClientRect().height > 0)
        .filter(e => e.getBoundingClientRect().height < 43)
        .map(e => e.getAttribute('aria-label') || e.textContent),
    )
    expect(small).toEqual([])
    await editor.getByRole('button', { name: 'Guardar plantilla', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Plantilla creada')
    await editor.getByRole('button', { name: 'Cerrar editor', exact: true }).click()
    const row = page
      .getByTestId('plantillas-empresa')
      .locator('li')
      .filter({ has: page.getByRole('button', { name: 'Editar Etiqueta QA', exact: true }) })
    await row.getByRole('button', { name: 'Usar en esta sucursal', exact: true }).click()
    await page.getByRole('button', { name: 'Etiquetar producto real del fixture' }).click()
    const labels = page.getByRole('dialog', { name: 'Etiquetas de góndola', exact: true })
    await expect(labels.getByLabel('Plantilla del PDF')).not.toHaveValue('')
    await expect(
      labels.getByRole('button', { name: 'Imprimir etiquetas', exact: true }),
    ).toBeDisabled()
    const iframe = labels.frameLocator('iframe')
    await expect(iframe.getByText('iPhone 15 · 128 GB Azul', { exact: true })).toBeVisible()
    await expect(iframe.getByText('Gs 4.850.000', { exact: true })).toBeVisible()
    expect(
      await labels.locator('iframe').evaluate(e => e.contentDocument.body.innerText),
    ).not.toContain('PROVEEDOR PRIVADO')
    await labels.getByLabel('Cantidad de etiquetas de iPhone 15 · 128 GB Azul').fill('2')
    await expect(labels.getByText(/documento 1 de 2/)).toBeVisible()
    const realPdf = page.waitForEvent('download')
    await labels.getByRole('button', { name: 'Descargar PDF con plantilla', exact: true }).click()
    const bytes = await fs.readFile(await (await realPdf).path(), 'latin1')
    expect(bytes).toContain('/Count 2')
    expect(bytes).toContain('/MediaBox [0 0 311.81 170.08]')
    await labels.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await row.getByRole('button', { name: 'Duplicar', exact: true }).click()
    await expect(page.getByTestId('plantillas-empresa').locator('li')).toHaveCount(2)
    await row.getByRole('button', { name: 'Restaurar', exact: true }).click()
    await page
      .getByRole('alertdialog', { name: 'Restaurar formato incorporado' })
      .getByRole('button', { name: 'Restaurar', exact: true })
      .click()
    await row.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await page
      .getByRole('alertdialog', { name: 'Eliminar plantilla' })
      .getByRole('button', { name: 'Eliminar', exact: true })
      .click()
    await expect(page.getByTestId('plantillas-empresa').locator('li')).toHaveCount(1)
    await page.getByRole('button', { name: 'Cambiar empresa fixture' }).click()
    await expect(page.getByTestId('plantillas-empresa').locator('li')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    clean()
  })
test('507 cliente demo revisión, tenant, rol y respuesta tardía', async ({ page }) => {
  await enter(page, 390)
  const result = await page.evaluate(async () => {
    const { clientePlantillas } = await import('/src/lib/api/printTemplates.js'),
      { PRESETS_PLANTILLA } = await import('/src/lib/printing/plantillas.js')
    const a = { empresaId: 'qa-A', userId: 'user', role: 'ADMIN', permissions: [] },
      b = { ...a, empresaId: 'qa-B' }
    let current = a,
      finish
    const client = clientePlantillas(a, { demo: true, actual: () => current }),
      preset = PRESETS_PLANTILLA[1]
    const created = await client.create({
      kind: preset.kind,
      name: 'Prueba',
      definition: preset.definition,
    })
    await client.update(created.id, { revision: 1, name: 'Nueva' })
    const code = async p => {
      try {
        await p
        return 'FAIL'
      } catch (e) {
        return e.code
      }
    }
    const conflict = await code(client.update(created.id, { revision: 1, name: 'Vieja' }))
    const forbidden = await code(
      clientePlantillas({ ...a, role: 'VENDEDOR' }, { demo: true }).create({
        kind: preset.kind,
        name: 'Otro',
        definition: preset.definition,
      }),
    )
    const other = await clientePlantillas(b, { demo: true }).list()
    const pending = clientePlantillas(a, {
      actual: () => current,
      transport: {
        get: () =>
          new Promise(resolve => {
            finish = resolve
          }),
      },
    }).list()
    current = b
    finish({ templates: [created], presets: [] })
    return { conflict, forbidden, other: other.templates.length, late: await code(pending) }
  })
  expect(result).toEqual({
    conflict: 'CONFLICT',
    forbidden: 'FORBIDDEN',
    other: 0,
    late: 'CONTEXT_CHANGED',
  })
})

test('507 controles de lectura no habilitan escrituras', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-session', 'active')
    sessionStorage.setItem('mobos:demo-session:role', 'VENDEDOR')
  })
  await page.route('**/api/**', r =>
    new URL(r.request().url()).pathname.startsWith('/api/') ? r.abort() : r.continue(),
  )
  await page.goto('/e2e/fixtures/plantillas507.html')
  await expect(page.getByRole('button', { name: 'Nueva plantilla', exact: true })).toBeDisabled()
  await expect(page.getByText(/Modo de lectura/)).toBeVisible()
})
test('507 comprobante premium conserva flujo y bloqueo de rotaciones', async ({ page }) => {
  await enter(page, 390)
  await page.getByLabel('Tipo de documento', { exact: true }).selectOption('comprobante')
  await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Editar plantilla de impresión', exact: true })
  await expect(editor.getByLabel('Orientación del contenido')).toBeDisabled()
  await expect(editor.locator('iframe')).toBeVisible()
  await expect(
    editor.frameLocator('iframe').getByText('Funda de muestra', { exact: false }),
  ).toBeVisible()
  await expect(
    editor.frameLocator('iframe').getByText('Gs. 180.000', { exact: false }),
  ).toHaveCount(0)
  const text = await editor.locator('iframe').evaluate(e => e.contentDocument.body.innerText)
  expect(text).toContain('180.000')
  expect(text).toContain('Funda de muestra')
  await expect(editor.getByRole('alert')).toHaveCount(0)
})
test('507 desborde visible bloquea PDF sin truncar texto', async ({ page }) => {
  await enter(page, 390)
  await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Editar plantilla de impresión', exact: true })
  await editor.getByLabel('Elemento', { exact: true }).selectOption('product')
  await editor.getByLabel('Alto del elemento (mm)', { exact: true }).fill('1')
  await expect(editor.getByRole('alert')).toContainText('no cabe')
  await expect(
    editor.getByRole('button', { name: 'Descargar PDF de muestra', exact: true }),
  ).toBeDisabled()
})
test('507 transporte real conserva verbos, revisiones, defaults y cuerpo DELETE', async ({
  page,
}) => {
  await enter(page, 390)
  const calls = await page.evaluate(async () => {
    const { clientePlantillas } = await import('/src/lib/api/printTemplates.js'),
      { PRESETS_PLANTILLA } = await import('/src/lib/printing/plantillas.js')
    const calls = [],
      transport = Object.fromEntries(
        ['get', 'post', 'patch', 'delete', 'put'].map(verb => [
          verb,
          async (...args) => {
            calls.push([verb, ...args])
            return { ok: true }
          },
        ]),
      )
    const c = clientePlantillas(
      { empresaId: 'A', userId: 'U', sucursalId: 'S', role: 'ADMIN', permissions: ['*'] },
      { transport },
    )
    await c.list('etiquetas-producto')
    await c.defaults()
    await c.remove('id/1', 3)
    await c.action('x', { action: 'restore', revision: 4 })
    await c.setDefault({ kind: 'etiquetas-producto', branchId: null, templateId: 'x' })
    await c.update('x', { revision: 5, name: 'Cambio' })
    await c.create({
      kind: PRESETS_PLANTILLA[1].kind,
      name: 'Nueva',
      definition: PRESETS_PLANTILLA[1].definition,
    })
    return calls
  })
  expect(calls[0]).toEqual(['get', '/api/print/templates?kind=etiquetas-producto', { cacheMs: 0 }])
  expect(calls[1]).toEqual(['get', '/api/print/templates/defaults?branchId=S', { cacheMs: 0 }])
  expect(calls[2]).toEqual(['delete', '/api/print/templates/id%2F1', { body: { revision: 3 } }])
  expect(calls[3]).toEqual(['post', '/api/print/templates/x', { action: 'restore', revision: 4 }])
  expect(calls[4]).toEqual([
    'put',
    '/api/print/templates/defaults',
    { kind: 'etiquetas-producto', branchId: null, templateId: 'x' },
  ])
  expect(calls[5]).toEqual(['patch', '/api/print/templates/x', { revision: 5, name: 'Cambio' }])
  expect(calls[6][0]).toBe('post')
  expect(calls[6][1]).toBe('/api/print/templates')
})

test('507 medio provisional Brother exporta 25×90 sin girar MediaBox', async ({ page }) => {
  await enter(page, 390)
  await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Editar plantilla de impresión', exact: true })
  await editor.getByLabel('Propuesta de equipo y medio').selectOption('brother-ql800')
  await expect(editor.getByLabel('Ancho (mm)', { exact: true })).toHaveValue('25')
  await expect(editor.getByLabel('Alto (mm)', { exact: true })).toHaveValue('90')
  await expect(editor.locator('iframe')).toBeVisible()
  await expect(editor.getByRole('alert')).toHaveCount(0)
  const pending = page.waitForEvent('download')
  await editor.getByRole('button', { name: 'Descargar PDF de muestra', exact: true }).click()
  const fs = await import('node:fs/promises'),
    pdf = await fs.readFile(await (await pending).path(), 'latin1')
  expect(pdf).toContain('/Width 295 /Height 1063')
  expect(pdf).toContain('/MediaBox [0 0 70.87 255.12]')
  expect(pdf).toContain('/Count 1')
})
