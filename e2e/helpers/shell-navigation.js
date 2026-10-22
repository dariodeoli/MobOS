import { expect } from '@playwright/test'

// Explicit journey contracts, independent of application authorization catalogs.
// Each entry is [primary section, context group (level 1 tab id), destination
// (level 2 / catalog id)]. Tabs are driven by click through `data-tab-id`.
export const SHELL_DESTINATIONS = {
  Inicio: ['Inicio', 'resumen', 'resumen'],
  POS: ['Vender', 'cargar', 'cargar'],
  'Nueva venta': ['Vender', 'cargar', 'cargar'],
  Pedidos: ['Pedidos', 'pedidos', 'pedidos'],
  'Mis pedidos': ['Pedidos', 'pedidos', 'pedidos'],
  Cotizaciones: ['Pedidos', 'cotizaciones', 'cotizaciones'],
  Delivery: ['Pedidos', 'repartos', 'repartos'],
  Autorizaciones: ['Pedidos', 'autorizaciones', 'autorizaciones'],
  Clientes: ['Clientes', 'clientes', 'clientes'],
  Promociones: ['Clientes', 'promociones', 'promociones'],
  Plantillas: ['Clientes', 'plantillas', 'plantillas'],
  'Taller y garantías': ['Taller', 'servicio', 'servicio'],
  'Unidades (IMEI)': ['Stock', 'unidades', 'unidades'],
  Unidades: ['Stock', 'unidades', 'unidades'],
  'Productos (stock)': ['Stock', 'productos', 'productos'],
  Productos: ['Stock', 'productos', 'productos'],
  'Traslados y tránsito': ['Stock', 'traslados', 'traslados'],
  Traslados: ['Stock', 'traslados', 'traslados'],
  Control: ['Stock', 'control', 'control'],
  Precios: ['Stock', 'precios', 'precios'],
  'Lista por modelo': ['Stock', 'precios', 'celulares'],
  Comparador: ['Stock', 'precios', 'comparador'],
  'Centro de Control': ['Stock', 'precios', 'centro-control'],
  // Compras es un grupo de Stock; Abastecimiento (módulo) es su grupo segmentado.
  Compras: ['Stock', 'compras', 'compras'],
  'Por comprar': ['Stock', 'abastecimiento', 'abastecimiento'],
  'Compras del Centro': ['Stock', 'abastecimiento', 'compras-centro'],
  'Preparar compra': ['Stock', 'abastecimiento', 'preparacion'],
  'Preparar lote': ['Stock', 'abastecimiento', 'lotes'],
  Recepción: ['Stock', 'abastecimiento', 'recepcion'],
  'Métricas de abastecimiento': ['Stock', 'abastecimiento', 'metricas'],
  Finanzas: ['Finanzas', 'finanzas', 'finanzas'],
  // Análisis es Inicio › Reportes (la URL /analisis no cambia).
  Análisis: ['Inicio', 'analisis', 'analisis'],
  // Último destino principal del dueño; sus secciones son el riel de la página.
  Configuración: ['Configuración', 'equipo', 'equipo'],
  'Tablero de operaciones': ['Inicio', 'ops', 'ops'],
  'Mis repartos': ['Entregas', 'repartos', 'repartos'],
  Rendiciones: ['Entregas', 'rendiciones', 'rendiciones'],
}
// Catalog-style label of every destination id (what the old menu called it).
const DESTINATION_LABEL = {
  resumen: 'Inicio',
  ops: 'Tablero de operaciones',
  cargar: 'Nueva venta',
  cotizador: 'Trade-In',
  pedidos: 'Pedidos',
  cotizaciones: 'Cotizaciones',
  repartos: 'Delivery',
  autorizaciones: 'Autorizaciones',
  clientes: 'Clientes',
  promociones: 'Promociones',
  plantillas: 'Plantillas',
  servicio: 'Taller y garantías',
  'tradein-admin': 'Trade-In',
  unidades: 'Unidades (IMEI)',
  productos: 'Productos (stock)',
  traslados: 'Traslados y tránsito',
  control: 'Control',
  precios: 'Precios',
  celulares: 'Lista por modelo',
  comparador: 'Comparador',
  'centro-control': 'Centro de Control',
  compras: 'Compras',
  abastecimiento: 'Por comprar',
  'compras-centro': 'Compras del Centro',
  preparacion: 'Preparar compra',
  lotes: 'Preparar lote',
  recepcion: 'Recepción',
  metricas: 'Métricas de abastecimiento',
  finanzas: 'Finanzas',
  analisis: 'Análisis',
  rendiciones: 'Rendiciones',
}
export async function shellPrimary(page) {
  // The aside is always rendered (CSS hides it below lg): once it is attached
  // the shell has mounted and the visibility check below is reliable.
  const lateral = page.getByTestId('shell-lateral')
  await lateral.waitFor({ state: 'attached' })
  const desktop = lateral.getByRole('navigation', { name: 'Navegación principal', exact: true })
  return (await desktop.isVisible()) ? desktop : page.getByTestId('shell-bottom-nav')
}
// Click a primary section and wait until the shell marks it current: the
// context tabs render in that same pass, so reading them earlier races the
// route change. Sections that live in the mobile "Más" sheet are reached
// through it; single-section roles have no primary navigation at all.
async function enterShellSection(page, primary, section) {
  const button = primary.getByRole('button', { name: section, exact: true })
  if (await button.count()) {
    await button.click()
    await expect.poll(() => button.getAttribute('aria-current')).toBe('page')
    return
  }
  const more = page.getByTestId('shell-mas')
  // «Más» es de la barra inferior (móvil): en escritorio el menú lateral lista todo.
  if (await more.count() && await more.isVisible()) {
    await more.click()
    await page
      .getByTestId('shell-mas-hoja')
      .getByRole('button', { name: section, exact: true })
      .click()
    await expect.poll(() => more.getAttribute('aria-current')).toBe('page')
  }
}
// Click a tab of a SectionTabs container by its id. A tab that does not fit on
// desktop lives in the "Más" popover. Returns false when the container does
// not offer that id (e.g. the section has a single destination).
async function clickTab(container, id) {
  const tab = container.locator(`[data-tab-id="${id}"]`)
  if (await tab.count()) await tab.click()
  else {
    const more = container.locator('[data-tab-more]')
    if (!(await more.count())) return false
    await more.click()
    const item = container.locator(`[role="menuitem"][data-tab-id="${id}"]`)
    if (!(await item.count())) {
      await more.click()
      return false
    }
    await item.click()
  }
  // Inicio › Reportes: dentro de Análisis, sus pestañas propias ocupan el lugar del
  // grupo en la misma fila y la activa es «reportes» (la primera de Análisis).
  const activa = id === 'analisis' ? 'reportes' : id
  await expect
    .poll(() => container.locator(`[data-tab-id="${activa}"][aria-current="page"]`).count())
    .toBe(1)
  return true
}
// Every tab id of a container, including the ones inside the "Más" popover.
async function tabIds(container) {
  const read = () =>
    container.locator('[data-tab-id]').evaluateAll(nodes => nodes.map(n => n.dataset.tabId))
  const ids = await read()
  const more = container.locator('[data-tab-more]')
  if (await more.count()) {
    await more.click()
    ids.push(...(await read()).filter(id => !ids.includes(id)))
    await more.click()
  }
  return ids
}
// Click a tab of a shell tab row (`shell-contexto`, `shell-subcontexto`) by id.
export async function clickShellTab(page, containerTestId, id) {
  const container = page.getByTestId(containerTestId)
  await container.waitFor({ state: 'attached' })
  if (!(await clickTab(container, id))) throw new Error(`Tab ${id} not offered in ${containerTestId}`)
}
export async function openShellProfile(page) {
  const dialog = page.getByRole('dialog', { name: 'Perfil y preferencias', exact: true })
  if (!(await dialog.isVisible())) {
    // Keep visibility inside the locator so click waits for the shell to mount.
    await page
      .getByTestId('shell-perfil')
      .or(page.getByTestId('shell-perfil-mobile'))
      .filter({ visible: true })
      .click()
  }
  await expect(dialog).toBeVisible()
  return dialog
}
export async function lockShell(page) {
  const profile = await openShellProfile(page)
  await profile.getByTestId('shell-bloquear').click()
}
export async function openShellDestination(page, label) {
  if (['Ayuda', 'Mi perfil'].includes(label)) {
    const profile = await openShellProfile(page)
    await profile.getByRole('button', { name: label, exact: true }).click()
    return
  }
  const primary = await shellPrimary(page)
  let target = SHELL_DESTINATIONS[label]
  if (label === 'Trade-In')
    target = (await primary.getByRole('button', { name: 'Inicio', exact: true }).count())
      ? ['Vender', 'cotizador', 'tradein-admin']
      : ['Vender', 'cotizador', 'cotizador']
  if (!target) throw new Error(`Unknown shell journey: ${label}`)
  const [section, group, destination] = target
  await enterShellSection(page, primary, section)
  // Level 1 tabs exist only when the section has more than one group.
  const context = page.getByTestId('shell-contexto')
  if (await context.count()) await clickTab(context, group)
  // Level 2 (segmented) exists only for groups with several destinations.
  const segments = page.getByTestId('shell-subcontexto')
  // Precios pone su segundo nivel en la barra de la vista (carga perezosa): esperar la fila.
  if (group === 'precios') await segments.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {})
  if (await segments.count()) await clickTab(segments, destination)
}
// In-page sections (Análisis, Finanzas, Configuración) are SectionTabs: tabs
// below lg / inline with a "Más" popover on desktop, a vertical rail for
// Configuración on desktop. All share the aria-label of the old selectors.
export async function selectSectionOption(page, ariaLabel, label) {
  const nav = page.getByRole('navigation', { name: ariaLabel, exact: true })
  // The tabs mount with the section: wait for them before choosing a branch.
  await nav.waitFor({ state: 'attached' })
  const tab = nav.getByRole('button', { name: label, exact: true })
  if (await tab.count()) await tab.click()
  else {
    await nav.locator('[data-tab-more]').click()
    await nav.getByRole('menuitem', { name: label, exact: true }).click()
  }
  await expect(nav.getByRole('button', { name: label, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
}
export const selectAnalysisSection = (page, label) =>
  selectSectionOption(page, 'Secciones de Análisis', label)
export const selectFinanceSection = (page, label) =>
  selectSectionOption(page, 'Secciones de Finanzas', label)
// Configuración (#410): en escritorio las secciones son el menú de la segunda
// columna (siguen visibles); en celular son una lista y la sección elegida abre
// su propia pantalla, así que la lista desaparece y el título es el de la sección.
export async function selectConfigSection(page, label) {
  const nav = page.getByRole('navigation', { name: 'Secciones de Configuración', exact: true })
  await nav.waitFor({ state: 'attached' })
  await nav.getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible()
}
// Sections with one destination show no tabs: the catalog label is the section's.
const SINGLE_SECTION_LABEL = {
  Inicio: 'Inicio',
  Vender: 'Nueva venta',
  Finanzas: 'Finanzas',
  Configuración: 'Configuración',
  Taller: 'Taller y garantías',
}
// Read every permitted context through UI navigation, not direct routes.
// Texto visible del botón sin el contador de pendientes (badge), que es un
// dato aparte del nombre de la sección.
const textosSinBadge = locator => locator.evaluateAll(els => els.map(el => {
  const copia = el.cloneNode(true)
  copia.querySelectorAll('[data-testid^="menu-badge"]').forEach(b => b.remove())
  return copia.textContent || ''
}))

export async function shellCatalog(page) {
  const primary = await shellPrimary(page)
  const sections = (await textosSinBadge(primary.getByRole('button')))
    .map(s => s.trim())
    .filter(s => s && s !== 'Más')
  const more = page.getByTestId('shell-mas')
  // «Más» es de la barra inferior (móvil): en escritorio el menú lateral lista todo.
  if (await more.count() && await more.isVisible()) {
    await more.click()
    const sheet = page.getByTestId('shell-mas-hoja')
    const extra = (await textosSinBadge(sheet.getByRole('button'))).map(s => s.trim())
    await page.keyboard.press('Escape')
    sections.push(...extra.filter(s => s !== 'Ayuda'))
  }
  const owner = sections.includes('Inicio')
  const destinations = new Set()
  const label = id =>
    id === 'pedidos' && !owner
      ? 'Mis pedidos'
      : id === 'productos' && !owner
        ? 'Productos'
        : DESTINATION_LABEL[id] || id
  for (const section of sections) {
    await enterShellSection(page, primary, section)
    const context = page.getByTestId('shell-contexto')
    if (!(await context.count())) {
      destinations.add(SINGLE_SECTION_LABEL[section] || section)
      continue
    }
    for (const group of await tabIds(context)) {
      await clickTab(context, group)
      const segments = page.getByTestId('shell-subcontexto')
      if (group === 'precios') await segments.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {})
      if (await segments.count()) for (const id of await tabIds(segments)) destinations.add(label(id))
      else
        destinations.add(
          section === 'Entregas' && group === 'repartos' ? 'Mis repartos' : label(group),
        )
    }
  }
  const profile = await openShellProfile(page)
  const profileLabels = await profile.getByRole('button').allTextContents()
  await page.keyboard.press('Escape')
  return {
    primary: sections,
    destinations: [...destinations],
    profile: profileLabels.map(s => s.trim()),
  }
}
// Stock (rediseño 2A): las pestañas son del shell (Unidades · Productos ·
// Traslados · Control · Precios) y las vistas de cada una un segundo nivel en la
// barra de la pestaña (`subtabs-inventario`). Vendidos y Eliminados son opciones
// del chip «Estado» de Unidades. Las doce vistas siguen alcanzables por clic.
const ETIQUETA_VISTA = { unidades: 'Unidades', reservas: 'Reservas', ubicaciones: 'Ubicaciones', alertas: 'Alertas', transito: 'En tránsito', traslados: 'Traslados', vendidos: 'Vendidos', eliminados: 'Eliminados', taller: 'Taller', conteos: 'Conteos', compartido: 'Compartido', autorizaciones: 'Autorizaciones' }
const GRUPO_DE_VISTA = { unidades: 'unidades', vendidos: 'unidades', eliminados: 'unidades', traslados: 'traslados', transito: 'traslados', conteos: 'control', alertas: 'control', autorizaciones: 'control', taller: 'control', ubicaciones: 'control', compartido: 'control', reservas: 'control' }
export async function selectInventorySection(page, value) {
  await clickShellTab(page, 'shell-contexto', GRUPO_DE_VISTA[value])
  if (value === 'vendidos' || value === 'eliminados') {
    // Desktop: chip «Estado» con su lista. Celular: hoja «Filtros».
    await page.getByTestId('filtro-estado-abrir').or(page.getByTestId('filtros-abrir')).first().click()
    await page.getByTestId(`filtro-estado-${value}`).click()
    if (await page.getByTestId('filtros-hoja').count()) await page.keyboard.press('Escape')
    await expect(page.getByTestId('inventario-lista')).toHaveAttribute('data-vista', value)
    return
  }
  if (value === 'unidades') {
    await expect(page.getByTestId('inventario-lista')).toHaveAttribute('data-vista', 'unidades')
    return
  }
  const vistas = page.getByTestId('subtabs-inventario')
  await vistas.getByRole('tab', { name: ETIQUETA_VISTA[value], exact: false }).first().click()
  await expect(vistas.getByRole('tab', { name: new RegExp(`^${ETIQUETA_VISTA[value]}`) })).toHaveAttribute('aria-selected', 'true')
}

// #396: Taller mantiene las vistas alternativas en «Más acciones» para
// dejar espacio a las órdenes; la barra segmentada aparece en la vista Todo.
export async function openTallerTabs(page) {
  const tabs = page.getByRole('group', { name: 'Ver taller o garantías', exact: true })
  if (!(await tabs.isVisible())) {
    await page.locator('.taller-f3').getByRole('button', { name: /^Más acciones/ }).click()
    await page.getByRole('menuitem', { name: 'Ver todo', exact: true }).click()
  }
  await expect(tabs).toBeVisible()
  return tabs
}
