// Modo demo: entrada con Dueño/Vendedor y selector «Ver como» dentro de la
// demo. Cambia de rol reutilizando la sesión demo (sin API, sin cuenta real) y
// la app refleja el rol elegido. Nunca aparece fuera de la demo.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo, silenciarAvisoMetricas } from './helpers/demo.js'
import { esperarAnimaciones } from './helpers/animaciones.js'

test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

const HOME = { dueno: /\/resumen$/, tecnico: /\/servicio$/, vendedor: /\/pos$/ }

test('Ver como: Vendedor -> Técnico -> Dueño en 2 toques, Esc cierra el desplegable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Vendedor' }).click()
  await expect(page).toHaveURL(HOME.vendedor)
  await cerrarGuiaDemo(page)

  const toggle = page.getByTestId('demo-perspectivas-toggle')
  await expect(page.getByTestId('demo-rol-actual')).toHaveText('Vendedor')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  // Esc cierra y devuelve el foco al disparador.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('demo-ver-como-menu')).toBeHidden()
  await expect(toggle).toBeFocused()

  // Toque 1: abrir. Toque 2: elegir. La app aterriza en el inicio del rol.
  await toggle.click()
  const menu = page.getByTestId('demo-ver-como-menu')
  await expect(menu.getByRole('menuitemradio')).toHaveCount(6)
  await expect(menu.getByRole('menuitemradio', { name: /Vendedor/ })).toHaveAttribute('aria-checked', 'true')
  await menu.getByRole('menuitemradio', { name: /Técnico/ }).click()
  await expect(page).toHaveURL(HOME.tecnico)
  await expect(page.getByTestId('demo-rol-actual')).toHaveText('Técnico')

  await page.getByTestId('demo-perspectivas-toggle').click()
  await page.getByTestId('demo-vista-dueno').click()
  await expect(page).toHaveURL(HOME.dueno)
  await expect(page.getByTestId('demo-rol-actual')).toHaveText('Dueño')
  // El rol queda en la sesión demo de la pestaña.
  expect(await page.evaluate(() => sessionStorage.getItem('mobos:demo-session:role'))).toBe('ADMIN')
})

test('Ver como: el rol elegido cambia los permisos visibles (Vendedor ve menos que Dueño)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Dueño' }).click()
  await expect(page).toHaveURL(HOME.dueno)
  await cerrarGuiaDemo(page)
  const enlaces = () => page.getByTestId('shell-lateral').locator('a, button').count()
  const dueno = await enlaces()
  await page.getByTestId('demo-perspectivas-toggle').click()
  await page.getByTestId('demo-vista-vendedor').click()
  await expect(page).toHaveURL(HOME.vendedor)
  await cerrarGuiaDemo(page)
  await expect(page.getByTestId('shell-lateral')).toBeVisible()
  const vendedor = await enlaces()
  expect(vendedor).toBeGreaterThan(0)
  expect(vendedor).toBeLessThan(dueno)
})

test('Ver como en móvil 375: dentro del menú de perfil y sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Dueño' }).click()
  await expect(page).toHaveURL(HOME.dueno)
  await cerrarGuiaDemo(page)
  await esperarAnimaciones(page)
  // Desplegable del encabezado con targets de 44px.
  const toggle = page.getByTestId('demo-perspectivas-toggle')
  expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44)
  await toggle.click()
  await esperarAnimaciones(page)
  if (process.env.MOBOS_DEMO_CAPTURA) await page.screenshot({ path: `${process.env.MOBOS_DEMO_CAPTURA}/demo-ver-como-375.png` })
  for (const opcion of await page.getByTestId('demo-ver-como-menu').getByRole('menuitemradio').all()) {
    expect((await opcion.boundingBox()).height).toBeGreaterThanOrEqual(44)
  }
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // Y como lista dentro del menú de perfil.
  await page.getByTestId('shell-perfil-mobile').click()
  const lista = page.getByTestId('demo-ver-como-lista')
  await expect(lista).toBeVisible()
  await lista.getByTestId('demo-vista-tecnico').click()
  await expect(page).toHaveURL(HOME.tecnico)
})

test('Ver como: captura opcional de la entrada móvil', async ({ page }) => {
  test.skip(!process.env.MOBOS_DEMO_CAPTURA, 'solo con MOBOS_DEMO_CAPTURA')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/demo')
  await esperarAnimaciones(page)
  await page.screenshot({ path: `${process.env.MOBOS_DEMO_CAPTURA}/demo-entrada-375.png` })
})

test('Ver como no existe en la entrada ni en el acceso real', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByTestId('demo-perspectivas')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Entrar como / })).toHaveCount(2)
  await page.goto('/login')
  await expect(page.getByTestId('demo-perspectivas')).toHaveCount(0)
})
