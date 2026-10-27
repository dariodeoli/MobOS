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
// Submenú lateral (escritorio ≥1024 con el menú expandido): la sección actual
// despliega sus páginas en el acordeón del menú lateral y las filas de pestañas
// del header (`shell-contexto` / `shell-pestanas` / `shell-subcontexto`) quedan
// montadas pero ocultas (`lg:hidden`). Nivel 1 = grupos de la sección (o las
// pestañas propias de Finanzas); nivel 2 = vistas del grupo activo.
const visible = async locator => (await locator.count()) > 0 && locator.first().isVisible()
export async function shellSubmenuLateral(page) {
  const acordeon = page
    .getByTestId('shell-lateral')
    .locator('[data-shell-acordeon]:has(> div > button[aria-current="page"])')
  await expect(acordeon).toHaveCount(1)
  const chevron = acordeon.locator('[data-testid^="shell-desplegar-"]')
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click()
  await expect(chevron).toHaveAttribute('aria-expanded', 'true')
  return acordeon
}
const ENTRADA_LATERAL = {
  1: (acordeon, id) => acordeon.locator(`ul[aria-label^="Páginas de"] > li > [data-shell-sub="${id}"]`),
  2: (acordeon, id) => acordeon.locator(`ul[aria-label^="Vistas de"] [data-shell-sub="${id}"]`),
}
// Pliega o expande el menú lateral de escritorio (con el menú plegado vuelven
// las pestañas del header).
export async function setShellCollapsed(page, plegado) {
  const lateral = page.getByTestId('shell-lateral')
  const boton = lateral.getByRole('button', { name: plegado ? 'Colapsar menú' : 'Expandir menú', exact: true })
  if (await boton.count()) await boton.click()
  await expect(lateral).toHaveAttribute('data-shell-collapsed', plegado ? '1' : '0')
}
// Las páginas de la sección se ofrecen visibles: en la fila `shell-contexto`
// (celular, menú plegado) o, en escritorio con el menú expandido, en el submenú
// lateral con la fila del header oculta (no se repite el mismo menú).
export async function expectShellGroupsVisible(page, ids) {
  const fila = page.getByTestId('shell-contexto')
  await fila.waitFor({ state: 'attached' })
  if (await fila.isVisible()) {
    for (const id of ids) await expect(fila.locator(`[data-tab-id="${id}"]`)).toBeVisible()
    return
  }
  const acordeon = await shellSubmenuLateral(page)
  for (const id of ids) await expect(ENTRADA_LATERAL[1](acordeon, id)).toBeVisible()
  await expect(fila).toBeHidden()
}
// Ids de un nivel del submenú lateral de la sección actual.
export async function lateralIds(page, nivel = 1) {
  const acordeon = await shellSubmenuLateral(page)
  const selector = nivel === 1 ? 'ul[aria-label^="Páginas de"] > li > [data-shell-sub]' : 'ul[aria-label^="Vistas de"] [data-shell-sub]'
  return acordeon.locator(selector).evaluateAll(nodes => nodes.map(n => n.dataset.shellSub))
}
// Abre una página del submenú lateral por id (primero en el nivel pedido; los
// ids de nivel 1 y 2 pueden coincidir, p. ej. Precios › Listas = «precios»).
// Devuelve false cuando la sección no ofrece ese id.
export async function clickLateral(page, id, { nivel = 1 } = {}) {
  const acordeon = await shellSubmenuLateral(page)
  for (const n of nivel === 2 ? [2, 1] : [1, 2]) {
    const entrada = ENTRADA_LATERAL[n](acordeon, id)
    if (!(await entrada.count())) continue
    await entrada.click()
    await expect(ENTRADA_LATERAL[n](acordeon, id)).toHaveAttribute('aria-current', 'true')
    return true
  }
  return false
}
// Clic en una fila de pestañas del shell; con la fila oculta por el submenú
// lateral se navega por el acordeón y se verifica que la fila (montada) quedó
// en el mismo destino: las dos vías son equivalentes.
async function clickShellRow(page, container, id, nivel) {
  if (await visible(container)) return clickTab(container, id)
  if (!(await clickLateral(page, id, { nivel }))) return false
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
  const nivel = containerTestId === 'shell-subcontexto' ? 2 : 1
  if (!(await clickShellRow(page, container, id, nivel))) throw new Error(`Tab ${id} not offered in ${containerTestId}`)
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
  if (await context.count()) await clickShellRow(page, context, group, 1)
  // Level 2 (segmented) exists only for groups with several destinations.
  const segments = page.getByTestId('shell-subcontexto')
  // Precios pone su segundo nivel en la barra de la vista (carga perezosa): esperar la fila.
  if (group === 'precios') await segments.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {})
  if (await segments.count()) await clickShellRow(page, segments, destination, 2)
}
// In-page sections (Análisis, Finanzas, Configuración) are SectionTabs: tabs
// below lg / inline with a "Más" popover on desktop, a vertical rail for
// Configuración on desktop. All share the aria-label of the old selectors.
export async function selectSectionOption(page, ariaLabel, label) {
  // includeHidden: en escritorio con el menú expandido la fila sigue montada
  // pero oculta, y la sección se elige en el submenú lateral.
  const nav = page.getByRole('navigation', { name: ariaLabel, exact: true, includeHidden: true })
  // The tabs mount with the section: wait for them before choosing a branch.
  await nav.waitFor({ state: 'attached' })
  if (!(await nav.isVisible())) {
    const acordeon = await shellSubmenuLateral(page)
    // Análisis: sus secciones son las vistas (nivel 2) del grupo «Reportes»,
    // que se llama igual que la primera; Finanzas las lista en el nivel 1.
    const vista = acordeon.locator('ul[aria-label^="Vistas de"]').getByRole('link', { name: label, exact: true })
    const entrada = (await vista.count()) ? vista : acordeon.getByRole('link', { name: label, exact: true })
    await entrada.click()
    await expect(entrada).toHaveAttribute('aria-current', 'true')
    // La fila oculta queda en la misma sección: las dos vías son equivalentes.
    await expect(nav.getByRole('button', { name: label, exact: true, includeHidden: true })).toHaveAttribute('aria-current', 'page')
    return
  }
  const tab = nav.getByRole('button', { name: label, exact: true })
  // El ancho se mide al montar y se reajusta (fuentes, barra lateral): la
  // pestaña puede pasar un instante por «Más». Se reintenta hasta que el clic
  // llegue, por la pestaña o por el menú, sin depender de una foto fija.
  await expect(async () => {
    if (await tab.count()) await tab.click({ timeout: 1500 })
    else {
      await nav.locator('[data-tab-more]').click({ timeout: 1500 })
      await nav.getByRole('menuitem', { name: label, exact: true }).click({ timeout: 1500 })
    }
  }).toPass({ timeout: 15_000 })
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
    const groups = await tabIds(context)
    // Escritorio con menú expandido: el submenú lateral ofrece los mismos grupos.
    const lateral = !(await visible(context))
    if (lateral) expect(await lateralIds(page, 1)).toEqual(groups)
    for (const group of groups) {
      await clickShellRow(page, context, group, 1)
      const segments = page.getByTestId('shell-subcontexto')
      if (group === 'precios') await segments.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {})
      if (await segments.count()) {
        const ids = await tabIds(segments)
        if (lateral) expect(await lateralIds(page, 2)).toEqual(ids)
        for (const id of ids) destinations.add(label(id))
      }
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

// Taller muestra siempre su selector de vista (Todo · Tablero · Servicio · Garantías).
export async function openTallerTabs(page) {
  const tabs = page.getByRole('group', { name: 'Ver taller o garantías', exact: true })
  await expect(tabs).toBeVisible()
  return tabs
}
