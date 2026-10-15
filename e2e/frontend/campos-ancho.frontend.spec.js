import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination, selectConfigSection } from '../helpers/shell-navigation.js'

// #389: ancho de campo según el contenido (docs/CAMPOS.md §2.1). En >=768px los
// datos cortos (teléfono, CI/RUC, correo, ciudad, país) no pasan de su máximo y
// comparten fila; en celular ocupan el ancho disponible sin scroll horizontal.
// Demo frontend-only (sin backend). Los máximos replican ANCHO_CAMPO_PX.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-campos-qa'
const MAX = { telefono: 320, documento: 256, correo: 352, ciudad: 288, pais: 224, etiqueta: 144, nombre: 384, busqueda: 448, selector: 256 }
const TOL = 1.5

async function enterDemo(page, width, height = 900) {
  await page.setViewportSize({ width, height })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function abrirAltaCliente(page) {
  await openShellDestination(page, 'Clientes')
  await page.getByRole('button', { name: '+ Crear cliente' }).first().click()
  const modal = page.getByRole('dialog', { name: 'Crear cliente' })
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: '+ Añadir dirección' }).scrollIntoViewIfNeeded()
  return modal
}

const caja = async loc => loc.first().boundingBox()
const sinScrollHorizontal = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

test('1440: alta de cliente con campos cortos que no superan su máximo y comparten fila', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterDemo(page, 1440)
  const modal = await abrirAltaCliente(page)
  await page.screenshot({ path: `${out}/1440-alta-cliente.png` })

  const tel = await caja(modal.getByLabel('Teléfono', { exact: true }))
  const telGrupo = await caja(modal.getByRole('combobox', { name: 'Código de país' }))
  const correo = await caja(modal.getByPlaceholder('cliente@correo.com'))
  const ruc = await caja(modal.locator('#cliente-documento'))
  expect(tel.x + tel.width - telGrupo.x, 'teléfono (código + número)').toBeLessThanOrEqual(MAX.telefono + TOL)
  expect(correo.width, 'correo').toBeLessThanOrEqual(MAX.correo + TOL)
  expect(ruc.width, 'CI/RUC').toBeLessThanOrEqual(MAX.documento + TOL)
  // Teléfono | Correo en la misma fila, sin huecos intermedios grandes.
  expect(Math.abs(tel.y - correo.y)).toBeLessThan(8)
  expect(correo.x - (tel.x + tel.width)).toBeLessThan(64)

  // Dirección compacta: Etiqueta | País | Ciudad en una fila.
  const etiqueta = await caja(modal.getByPlaceholder('Casa, oficina…'))
  const pais = await caja(modal.getByLabel('País', { exact: true }))
  const ciudad = await caja(modal.getByLabel('Ciudad', { exact: true }))
  expect(etiqueta.width, 'etiqueta').toBeLessThanOrEqual(MAX.etiqueta + TOL)
  expect(pais.width, 'país').toBeLessThanOrEqual(MAX.pais + TOL)
  expect(ciudad.width, 'ciudad').toBeLessThanOrEqual(MAX.ciudad + TOL)
  expect(Math.abs(etiqueta.y - pais.y)).toBeLessThan(8)
  expect(Math.abs(pais.y - ciudad.y)).toBeLessThan(8)
  // Orden: Identidad -> Contacto -> Direcciones.
  const yIdentidad = (await caja(modal.getByText('Identidad', { exact: true }))).y
  const yContacto = (await caja(modal.getByText('Contacto', { exact: true }))).y
  const yDirecciones = (await caja(modal.getByText('Direcciones', { exact: true }))).y
  expect(yIdentidad).toBeLessThan(yContacto)
  expect(yContacto).toBeLessThan(yDirecciones)
})

test('CountrySelect: Paraguay primero, resto buscable y se puede borrar el país', async ({ page }) => {
  await enterDemo(page, 1440)
  const modal = await abrirAltaCliente(page)
  const pais = modal.getByLabel('País', { exact: true })
  await expect(pais).toHaveValue('Paraguay')
  await pais.focus()
  const lista = page.getByRole('listbox', { name: 'Países' })
  await expect(lista.getByRole('option')).toHaveText(['Paraguay', 'Argentina', 'Brasil', 'Uruguay', 'Bolivia', 'Chile', 'Estados Unidos', 'España'])
  await pais.fill('peru')
  await expect(lista.getByRole('option').first()).toHaveText('Perú')
  await lista.getByRole('option').first().click()
  await expect(pais).toHaveValue('Perú')
  await pais.fill('')
  await expect(pais).toHaveValue('')
})

test('390: campos a todo el ancho disponible y sin scroll horizontal', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterDemo(page, 390, 844)
  const modal = await abrirAltaCliente(page)
  const marco = await caja(modal.locator('form'))
  for (const [nombre, loc] of [
    ['correo', modal.getByPlaceholder('cliente@correo.com')],
    ['CI/RUC', modal.locator('#cliente-documento')],
    ['país', modal.getByLabel('País', { exact: true })],
    ['ciudad', modal.getByLabel('Ciudad', { exact: true })],
  ]) {
    const b = await caja(loc)
    expect(b.width, `${nombre} a todo el ancho`).toBeGreaterThanOrEqual(marco.width - 90)
    expect(b.height, `${nombre} 44px`).toBeGreaterThanOrEqual(43.5)
  }
  expect(await sinScrollHorizontal(page)).toBe(true)
  await page.screenshot({ path: `${out}/390-alta-cliente.png` })
})

test('1440: buscadores y selects de Configuración con ancho por contenido (#389)', async ({ page }) => {
  await enterDemo(page, 1440)
  await openShellDestination(page, 'Configuración')

  await selectConfigSection(page, 'Seguridad y auditoría')
  const busqueda = await caja(page.getByPlaceholder('Buscar por cliente, producto o vendedor…'))
  expect(busqueda.width, 'Seguridad: buscador').toBeLessThanOrEqual(MAX.busqueda + TOL)

  await selectConfigSection(page, 'Equipo y acceso')
  const nombre = await caja(page.locator('#direct-name'))
  expect(nombre.width, 'Equipo: Nombre').toBeLessThanOrEqual(MAX.nombre + TOL)

  await selectConfigSection(page, 'Comercial')
  const producto = await caja(page.getByPlaceholder('Elegí el producto…'))
  expect(producto.width, 'Comercial: buscador de producto').toBeLessThanOrEqual(MAX.busqueda + TOL)

  await selectConfigSection(page, 'Mi cuenta')
  const bloqueo = await caja(page.locator('#pref-bloqueo'))
  expect(bloqueo.width, 'Mi cuenta: select').toBeLessThanOrEqual(MAX.selector + TOL)
})

test('390: buscador y select de Configuración ocupan el ancho disponible', async ({ page }) => {
  await enterDemo(page, 390, 844)
  await openShellDestination(page, 'Configuración')
  await selectConfigSection(page, 'Seguridad y auditoría')
  const busqueda = await caja(page.getByPlaceholder('Buscar por cliente, producto o vendedor…'))
  expect(busqueda.width).toBeGreaterThanOrEqual(390 - 80)
  expect(await sinScrollHorizontal(page)).toBe(true)
})

async function abrirFichaPos(page) {
  await openShellDestination(page, 'POS')
  const bloque = page.getByTestId('pos-bloque-cliente')
  await expect(bloque).toBeVisible()
  await bloque.getByText('Datos de contacto, RUC/CI y direcciones').click()
  await bloque.getByLabel(/Facturar a otro titular/).check()
  await bloque.getByRole('button', { name: '+ Dirección' }).click()
  await bloque.getByLabel('País', { exact: true }).scrollIntoViewIfNeeded()
  return bloque
}

test('POS 1440: identidad, contacto, facturación y direcciones en ese orden, con campos por contenido', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterDemo(page, 1440)
  const bloque = await abrirFichaPos(page)
  const y = async texto => (await caja(bloque.getByText(texto, { exact: true }))).y
  const yFactura = (await caja(bloque.getByLabel(/Facturar a otro titular/))).y
  expect(await y('Identidad')).toBeLessThan(await y('Contacto'))
  expect(await y('Contacto')).toBeLessThan(yFactura)
  expect(yFactura).toBeLessThan(await y('Direcciones'))

  const tel = await caja(bloque.getByLabel('Teléfono del cliente'))
  const code = await caja(bloque.getByRole('combobox', { name: 'Código de país' }))
  const correo = await caja(bloque.getByLabel('Correo del cliente', { exact: true }))
  const ruc = await caja(bloque.getByLabel('CI o RUC del cliente', { exact: true }))
  const rucTitular = await caja(bloque.getByLabel('RUC del titular de factura', { exact: true }))
  const ciudad = await caja(bloque.getByLabel('Ciudad', { exact: true }))
  const pais = await caja(bloque.getByLabel('País', { exact: true }))
  expect(tel.x + tel.width - code.x, 'teléfono').toBeLessThanOrEqual(MAX.telefono + TOL)
  expect(correo.width, 'correo').toBeLessThanOrEqual(MAX.correo + TOL)
  expect(ruc.width, 'CI/RUC').toBeLessThanOrEqual(MAX.documento + TOL)
  expect(rucTitular.width, 'RUC del titular').toBeLessThanOrEqual(MAX.documento + TOL)
  expect(ciudad.width, 'ciudad').toBeLessThanOrEqual(MAX.ciudad + TOL)
  expect(pais.width, 'país').toBeLessThanOrEqual(MAX.pais + TOL)
  await page.screenshot({ path: `${out}/1440-pos-ficha.png` })
})

test('POS 390: la ficha usa el ancho disponible sin scroll horizontal', async ({ page }) => {
  await enterDemo(page, 390, 844)
  const bloque = await abrirFichaPos(page)
  const marco = await caja(bloque)
  for (const [nombre, loc] of [
    ['correo', bloque.getByLabel('Correo del cliente', { exact: true })],
    ['CI/RUC', bloque.getByLabel('CI o RUC del cliente', { exact: true })],
    ['ciudad', bloque.getByLabel('Ciudad', { exact: true })],
    ['país', bloque.getByLabel('País', { exact: true })],
  ]) {
    const b = await caja(loc)
    expect(b.width, `${nombre} a todo el ancho`).toBeGreaterThanOrEqual(marco.width - 90)
    expect(b.height, `${nombre} 44px`).toBeGreaterThanOrEqual(43.5)
  }
  expect(await sinScrollHorizontal(page)).toBe(true)
})

// #363: adaptadores reales sobre el catálogo y buscador de la biblioteca.
async function montarCamposCompartidos(page, banco = 'Financiera Finexpar') {
  await page.goto('/')
  await page.evaluate(async bancoInicial => {
    const recursos = performance.getEntriesByType('resource').map(r => r.name)
    const React = await import(recursos.find(url => url.includes('/deps/react.js')))
    const ReactDOM = await import(recursos.find(url => url.includes('react-dom_client')))
    const { default: Proveedor } = await import('/src/components/shared/SupplierCombobox.jsx')
    const { default: Banco } = await import('/src/components/shared/BancoCombobox.jsx')
    const { default: Ruc } = await import('/src/components/shared/RucField.jsx')
    const R = React.default || React
    const h = R.createElement
    const proveedores = [{ id: 'a', name: 'Proveedor Ágil', code: 'AGIL' }]
    function Campos() {
      const [valor, cambiar] = R.useState('')
      const [ruc, cambiarRuc] = R.useState('123456789')
      const [identidad, aceptar] = R.useState(null)
      const [banco, cambiarBanco] = R.useState(bancoInicial)
      const [eventos, guardar] = R.useState([])
      const registrar = (tipo, valor) => guardar(prev => [...prev, [tipo, valor]])
      return h('div', { style: { padding: 20, maxWidth: 600 } },
        h(Proveedor, { proveedores, value: valor, onLibre: texto => { cambiar(texto); registrar('libre', texto) }, onSelect: item => { cambiar(item.id); registrar('select', item.id) }, onUsado: item => registrar('usado', item.id) }),
        h('button', { onClick: () => cambiar('') }, 'Reset proveedor'),
        h('button', { onClick: () => guardar([]) }, 'Limpiar eventos'),
        h('output', { 'data-testid': 'eventos-proveedor' }, JSON.stringify(eventos)),
        h(Banco, { id: 'banco-compartido', value: banco, onChange: cambiarBanco }),
        h('output', { 'data-testid': 'banco-guardado' }, banco),
        h(Ruc, { ariaLabel: 'RUC seguro', value: ruc, onChange: cambiarRuc, onDatos: aceptar }),
        h('output', { 'data-testid': 'ruc-aceptado' }, JSON.stringify(identidad)))
    }
    const nodo = document.createElement('div')
    document.body.replaceChildren(nodo)
    const renderer = ReactDOM.default || ReactDOM
    renderer.createRoot(nodo).render(h(Campos))
  }, banco)
}

test('Proveedor compartido confirma texto una vez, busca por sigla y respeta reset', async ({ page }) => {
  await montarCamposCompartidos(page)
  const campo = page.getByRole('combobox', { name: 'Proveedor' })
  await campo.fill('Nuevo proveedor QA')
  await campo.press('Enter')
  await page.getByRole('button', { name: 'Limpiar eventos' }).focus()
  await expect(page.getByTestId('eventos-proveedor')).toHaveText('[["libre","Nuevo proveedor QA"]]')
  await page.getByRole('button', { name: 'Reset proveedor' }).click()
  await expect(campo).toHaveValue('')
  await page.getByRole('button', { name: 'Limpiar eventos' }).click()
  await campo.fill('agil')
  await page.getByRole('option', { name: /Proveedor Ágil/ }).click()
  await expect(campo).toHaveValue('Proveedor Ágil')
  await expect(page.getByTestId('eventos-proveedor')).toHaveText('[["select","a"],["usado","a"]]')
  await page.getByRole('button', { name: 'Reset proveedor' }).click()
  await page.getByRole('button', { name: 'Limpiar eventos' }).click()
  await campo.fill('Otro proveedor')
  await page.getByRole('button', { name: 'Limpiar eventos' }).focus()
  await expect(page.getByTestId('eventos-proveedor')).toHaveText('[["libre","Otro proveedor"]]')
})

for (const original of ['Financiera Finexpar', 'Financiera El Comercio', 'Banco desconocido QA']) {
  test(`Banco compartido conserva ${original} hasta elegir otra institución`, async ({ page }) => {
    await montarCamposCompartidos(page, original)
    const campo = page.locator('#banco-compartido')
    await campo.focus()
    await campo.press('Escape')
    await expect(campo).toHaveValue(original)
    await expect(page.getByTestId('banco-guardado')).toHaveText(original)
    await campo.fill('Ueno')
    await page.getByRole('option', { name: 'ueno bank', exact: true }).click()
    await expect(campo).toHaveValue('ueno bank')
    await expect(page.getByTestId('banco-guardado')).toHaveText('ueno bank')
  })
}


test('RUC compartido: 9 dígitos, nombre oficial, descartar y consentimiento antes de aplicar', async ({ page }) => {
  const oficial = 'PÉREZ LÓPEZ, JUAN S.A.'
  await page.route('**/api/ruc?*', route => route.fulfill({ json: {
    query: { normalized: '123456789', fullRuc: '123456789-0' }, reviewRequired: true, source: { provider: 'OwnData' },
    result: { ruc: '123456789', dv: '0', fullRuc: '123456789-0', nameOfficial: oficial, name: 'NO USAR ALIAS', stateRaw: 'ACTIVO', equivalenceRaw: '' },
  } }))
  await montarCamposCompartidos(page)
  const campo = page.getByRole('textbox', { name: 'RUC seguro' })
  await expect(campo).toHaveValue('123456789')
  const raiz = page.locator('.mobos-ruc-field')
  const extraer = raiz.getByRole('button', { name: 'Extraer los datos del RUC' })
  await extraer.click()
  await expect(raiz.getByRole('status')).toContainText(oficial)
  await expect(page.getByTestId('ruc-aceptado')).toHaveText('null')
  await raiz.getByRole('button', { name: 'Descartar' }).click()
  await expect(raiz.getByRole('status')).toHaveCount(0)
  await extraer.click()
  await raiz.getByRole('button', { name: 'Usar estos datos' }).click()
  const aceptado = JSON.parse(await page.getByTestId('ruc-aceptado').innerText())
  expect(aceptado.nameOfficial).toBe(oficial)
  expect(aceptado.fullRuc).toBe('123456789-0')
  await extraer.click()
  await expect(raiz.getByRole('status')).toBeVisible()
  await campo.fill('12345678')
  await expect(raiz.getByRole('status')).toHaveCount(0)
})
