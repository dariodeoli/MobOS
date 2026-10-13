import { expect } from '@playwright/test'

// Explicit journey contracts, independent of application authorization catalogs.
export const SHELL_DESTINATIONS = {
  Inicio: ['Inicio', 'resumen', 'resumen'],
  POS: ['Vender', 'cargar', 'cargar'],
  'Nueva venta': ['Vender', 'cargar', 'cargar'],
  Pedidos: ['Ventas', 'pedidos', 'pedidos'],
  'Mis pedidos': ['Ventas', 'pedidos', 'pedidos'],
  Cotizaciones: ['Ventas', 'cotizaciones', 'cotizaciones'],
  Clientes: ['Ventas', 'clientes', 'clientes'],
  Promociones: ['Ventas', 'clientes', 'promociones'],
  Plantillas: ['Ventas', 'clientes', 'plantillas'],
  Delivery: ['Ventas', 'entregas', 'repartos'],
  'Taller y garantías': ['Ventas', 'taller', 'servicio'],
  Autorizaciones: ['Ventas', 'pedidos', 'autorizaciones'],
  'Unidades (IMEI)': ['Stock', 'inventario', 'unidades'],
  Unidades: ['Stock', 'inventario', 'unidades'],
  'Productos (stock)': ['Stock', 'inventario', 'productos'],
  Productos: ['Stock', 'inventario', 'productos'],
  Compras: ['Stock', 'compras', 'compras'],
  'Por comprar': ['Stock', 'compras', 'abastecimiento'],
  'Compras del Centro': ['Stock', 'compras', 'compras-centro'],
  'Preparar compra': ['Stock', 'compras', 'preparacion'],
  'Preparar lote': ['Stock', 'compras', 'lotes'],
  Recepción: ['Stock', 'compras', 'recepcion'],
  'Métricas de abastecimiento': ['Stock', 'compras', 'metricas'],
  'Traslados y tránsito': ['Stock', 'traslados', 'traslados'],
  Precios: ['Stock', 'precios', 'precios'],
  'Lista por modelo': ['Stock', 'precios', 'celulares'],
  Comparador: ['Stock', 'precios', 'comparador'],
  'Centro de Control': ['Stock', 'precios', 'centro-control'],
  Finanzas: ['Finanzas', 'finanzas', 'finanzas'],
  Análisis: ['Finanzas', 'analisis', 'analisis'],
  'Tablero de operaciones': ['Inicio', 'ops', 'ops'],
  'Mis repartos': ['Entregas', 'repartos', 'repartos'],
  Rendiciones: ['Entregas', 'rendiciones', 'rendiciones'],
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
// context/sub-context selectors render in that same pass, so reading them
// earlier races the route change (count() does not auto-wait).
async function enterShellSection(primary, section) {
  const button = primary.getByRole('button', { name: section, exact: true })
  await button.click()
  await expect.poll(() => button.getAttribute('aria-current')).toBe('page')
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
  if (['Configuración', 'Ayuda', 'Mi perfil'].includes(label)) {
    const profile = await openShellProfile(page)
    await profile.getByRole('button', { name: label, exact: true }).click()
    return
  }
  const primary = await shellPrimary(page)
  let target = SHELL_DESTINATIONS[label]
  if (label === 'Trade-In')
    target = (await primary.getByRole('button', { name: 'Inicio', exact: true }).count())
      ? ['Ventas', 'taller', 'tradein-admin']
      : ['Vender', 'cotizador', 'cotizador']
  if (
    label === 'Taller y garantías' &&
    (await primary.getByRole('button', { name: 'Taller', exact: true }).count())
  )
    target = ['Taller', 'servicio', 'servicio']
  if (!target) throw new Error(`Unknown shell journey: ${label}`)
  const [section, group, destination] = target
  await enterShellSection(primary, section)
  const context = page.getByTestId('shell-contexto')
  if (await context.count()) {
    // The group <select> is display:none from lg up (wrapping links take over),
    // so a role query never sees it on desktop: read it as a plain element.
    const select = context.locator('select')
    if (await select.isVisible()) await select.selectOption(group)
    else {
      const text = await select.locator(`option[value="${group}"]`).textContent()
      await context.getByRole('button', { name: text, exact: true }).click()
    }
  }
  const subcontext = page.getByTestId('shell-subcontexto').getByRole('combobox')
  if (await subcontext.count()) {
    await subcontext.selectOption(destination)
    await expect.poll(() => subcontext.inputValue()).toBe(destination)
  }
}
// In-page sections (Análisis, Finanzas, Configuración) use SectionSelector: a
// native <select> that stays visible for long lists (and below lg) and a row of
// buttons marked aria-current for short lists on desktop. Both share the
// aria-label, which replaces the old role=tab rows.
export async function selectSectionOption(page, ariaLabel, label) {
  const select = page.locator(`select[aria-label="${ariaLabel}"]`)
  if (await select.isVisible()) {
    await select.selectOption({ label })
    await expect.poll(() => select.locator('option:checked').textContent()).toBe(label)
  } else {
    const link = page
      .getByRole('navigation', { name: ariaLabel, exact: true })
      .getByRole('button', { name: label, exact: true })
    await link.click()
    await expect(link).toHaveAttribute('aria-current', 'page')
  }
}
export const selectAnalysisSection = (page, label) =>
  selectSectionOption(page, 'Secciones de Análisis', label)
export const selectFinanceSection = (page, label) =>
  selectSectionOption(page, 'Secciones de Finanzas', label)
export const selectConfigSection = (page, label) =>
  selectSectionOption(page, 'Secciones de Configuración', label)
// Read every permitted context through UI navigation, not direct routes.
export async function shellCatalog(page) {
  const primary = await shellPrimary(page)
  const sections = await primary.getByRole('button').allTextContents()
  const destinations = new Set()
  for (const section of sections.map(s => s.trim())) {
    await enterShellSection(primary, section)
    const context = page.getByTestId('shell-contexto')
    const select = context.locator('select')
    if (!(await select.count())) {
      destinations.add(
        section === 'Vender'
          ? 'Nueva venta'
          : section === 'Taller'
            ? 'Taller y garantías'
            : section,
      )
      continue
    }
    const groups = await select
      .locator('option')
      .evaluateAll(options =>
        options.filter(o => o.value).map(o => ({ value: o.value, label: o.textContent })),
      )
    for (const group of groups) {
      // Single-destination labels are read without leaving the shell (e.g. /ops).
      if (group.value === 'ops') {
        destinations.add(group.label)
        continue
      }
      if (await select.isVisible()) await select.selectOption(group.value)
      else await context.getByRole('button', { name: group.label, exact: true }).click()
      // The shell re-renders the sub-context in the pass that makes the group current.
      await expect.poll(() => select.inputValue()).toBe(group.value)
      const sub = page.getByTestId('shell-subcontexto').getByRole('combobox')
      if (await sub.count()) {
        for (const text of await sub.locator('option').allTextContents()) destinations.add(text)
      } else {
        const owner = sections.includes('Inicio')
        const singleLabels = {
          inventario: 'Productos',
          pedidos: owner ? 'Pedidos' : 'Mis pedidos',
          entregas: 'Delivery',
          traslados: 'Traslados y tránsito',
          taller: 'Taller y garantías',
        }
        destinations.add(singleLabels[group.value] || group.label)
      }
    }
  }
  const profile = await openShellProfile(page)
  const profileLabels = await profile.getByRole('button').allTextContents()
  await page.keyboard.press('Escape')
  return {
    primary: sections.map(s => s.trim()),
    destinations: [...destinations],
    profile: profileLabels.map(s => s.trim()),
  }
}
export async function selectInventorySection(page, value) {
  const select = page.getByTestId('tabs-inventario')
  await select.selectOption(value)
  await expect(select).toHaveValue(value)
}
