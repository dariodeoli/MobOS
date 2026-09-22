// Auth flows against the real API (fresh context, no storageState).
// The seeded company and sellers come from global-setup.

import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'
import { SEED } from './helpers/seed-data.js'
import { loginCompany, completeSellerPin, logout } from './helpers/login.js'

test.describe('login', () => {
  test('wrong company password shows an error and stays on /login', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Correo', { exact: true }).fill(SEED.company.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-equivocada')
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()

    await expect(page.getByText('Credenciales inválidas.')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('seller logs in with company credentials + PIN and lands on /pos', async ({ page }) => {
    await loginCompany(page)
    await completeSellerPin(page, { sellerName: SEED.sellers[0].name, pin: SEED.sellers[0].pin })

    // Seller role redirects to the checkout view ("Nueva venta" form).
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    await expect(page.getByPlaceholder('Buscar producto…')).toBeVisible()
  })

  test('logout returns to /login', async ({ page }) => {
    await loginCompany(page)
    await completeSellerPin(page, { sellerName: SEED.sellers[0].name, pin: SEED.sellers[0].pin })
    await logout(page)

    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible()
  })
})

// Los enlaces del correo traen el token en el path (/restablecer-contrasena/<token>
// y /verificar-correo/<token>): la ruta tiene que aceptarlo, no solo la raíz.
test('los enlaces del correo con token abren su pantalla', async ({ page }) => {
  const token = 'a'.repeat(64)
  await page.goto(`/restablecer-contrasena/${token}`)
    await expect(page.getByRole('heading', { name: 'Elegí una nueva contraseña' })).toBeVisible({ timeout: 60000 })
  await expect(page.getByLabel('Nueva contraseña')).toBeVisible()
  await expect(page).toHaveURL(/\/restablecer-contrasena\/?$/)

  await page.goto(`/verificar-correo/${token}`)
  await expect(page.getByRole('heading', { name: 'Verificación de correo' })).toBeVisible()
  // Con token la pantalla verifica sola; no tiene que pedir pegar el enlace.
  await expect(page.getByLabel('Pegá tu enlace completo')).toHaveCount(0)
})

// Del acceso a recuperación: el correo ya escrito viaja y queda precargado.
test('recuperar contraseña lleva el correo que escribí en el acceso', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Correo').fill('dueno@tienda.test')
  await page.getByRole('link', { name: /Recuperar/ }).click()
  await expect(page).toHaveURL(/email=dueno%40tienda\.test/)
  await expect(page.getByLabel('Correo de la empresa')).toHaveValue('dueno@tienda.test')
})

// #129: el portal de clientes llama al API desde su propio origen. Preflight y
// llamada real contra el middleware, y los orígenes existentes siguen igual.
test('el portal de clientes puede llamar al API por CORS', async ({ request }) => {
  const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
  const portal = 'https://clientes.moboss.online'

  const preflight = await request.fetch(`${API}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: portal, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'content-type' },
  })
  expect(preflight.status()).toBe(204)
  expect(preflight.headers()['access-control-allow-origin']).toBe(portal)
  expect(preflight.headers()['access-control-allow-credentials']).toBe('true')

  const real = await request.get(`${API}/api/health`, { headers: { Origin: portal } })
  expect(real.ok()).toBeTruthy()
  expect(real.headers()['access-control-allow-origin']).toBe(portal)

  for (const origin of ['https://app.moboss.online', 'https://moboss.online', 'http://localhost:5175']) {
    const res = await request.get(`${API}/api/health`, { headers: { Origin: origin } })
    expect(res.headers()['access-control-allow-origin'], `${origin} debe seguir permitido`).toBe(origin)
  }

  // Sin comodines: un origen ajeno no se refleja.
  const ajeno = await request.get(`${API}/api/health`, { headers: { Origin: 'https://otro.example' } })
  expect(ajeno.headers()['access-control-allow-origin']).toBeUndefined()
})

// Demo (#187/#189): el clic en la fila abre la ficha con los datos del
// navegador y ?cliente= resuelve contra la demo, sin pegarle al API real.
test('demo: la ficha del cliente abre sin sesión y no consulta el API', async ({ page }) => {
  const apiClientes = []
  page.on('request', (request) => { if (/\/api\/customers\/|\/api\/message-templates/.test(request.url())) apiClientes.push(request.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  // La guía de la demo se abre sola la primera vez por pestaña (#201).
  await cerrarGuiaDemo(page)
  await page.locator('aside nav, nav').first().getByRole('button', { name: 'Clientes', exact: true }).click()
  await expect(page.getByRole('button', { name: '+ Crear cliente' })).toBeVisible()

  const marca = `DEMOQA${Date.now().toString(36).toUpperCase()}`
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  await page.getByLabel('Primer nombre', { exact: true }).fill('Ficha')
  await page.getByLabel(/Segundo nombre/).fill(marca)
  const modalAlta = page.locator('form').filter({ hasText: 'Límite de crédito (Gs)' })
  await modalAlta.getByPlaceholder('981 123 456').fill('0981222333')
  await page.getByRole('button', { name: 'Guardar cliente' }).click()
  await page.getByLabel('Buscar clientes').fill(marca)

  const fila = page.getByTestId('cliente-fila').filter({ hasText: marca }).first()
  await expect(fila).toBeVisible()
  await fila.click()
  const ficha = page.getByRole('dialog')
  await expect(ficha.getByRole('heading', { name: new RegExp(`Cliente: Ficha ${marca}`) })).toBeVisible()
  await expect(ficha.getByText(/Modo demo/)).toBeVisible()
  // Las acciones de la ficha quedan deshabilitadas en demo.
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  await expect(ficha.getByRole('button', { name: 'Guardar notas' })).toBeDisabled()
  await expect(ficha.getByRole('switch', { name: 'Seguro del cliente activo' })).toBeDisabled()
  // El menú de WhatsApp usa las plantillas demo (sin ir al API) y recuerda la
  // última elegida como predeterminada (#209).
  const menuWa = () => page.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
  const chevronWa = () => ficha.getByRole('button', { name: /Elegir plantilla de WhatsApp para/ })
  await chevronWa().click()
  // La ficha en demo usa las plantillas del contexto cliente (#160/#194).
  await expect(menuWa().getByText('Saldo pendiente')).toBeVisible()
  await menuWa().getByRole('button', { name: 'Saldo pendiente' }).click()
  await expect(menuWa().getByRole('button', { name: /Saldo pendiente/ }).getByText('Última usada')).toBeVisible()
  await expect(menuWa().getByLabel('Mensaje de WhatsApp')).toHaveValue(/saldo pendiente/i)
  // Cerrar y reabrir: la última usada sigue siendo la predeterminada.
  await chevronWa().click()
  await chevronWa().click()
  await expect(menuWa().getByRole('button', { name: /Saldo pendiente/ }).getByText('Última usada')).toBeVisible()
  await chevronWa().click()

  // ?cliente=<id demo> abre la misma ficha (resuelto contra el navegador).
  // El demo vive en memoria de la pestaña (#204): se usa un cliente del seed,
  // estable tras la recarga, y el id sale del atributo de la fila.
  await page.goto('/clientes')
  const semilla = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await expect(semilla).toBeVisible()
  const idDemo = await semilla.getAttribute('data-id')
  expect(idDemo).toBeTruthy()
  await page.goto(`/clientes?cliente=${encodeURIComponent(idDemo)}`)
  await expect(page.getByRole('dialog').getByText(/Modo demo/)).toBeVisible()

  expect(apiClientes, `la demo no debe consultar el API real: ${apiClientes.join(', ')}`).toEqual([])
})

// Demo completo del CRM (#194): datos ficticios visibles (deuda, cronología,
// seguro), portal por token local y Servicio Técnico, sin llamar al API real.
test('demo: ficha con deuda, cronología, seguro, portal y servicio', async ({ page }) => {
  const apiReal = []
  page.on('request', (request) => {
    if (/\/api\/(customers|message-templates|service-orders|service-items|service-checklists|portal|public\/portal|imei)/.test(request.url())) apiReal.push(request.url())
  })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  // La guía de la demo se abre sola la primera vez por pestaña (#201).
  await cerrarGuiaDemo(page)
  await page.locator('aside nav, nav').first().getByRole('button', { name: 'Clientes', exact: true }).click()

  await page.getByLabel('Buscar clientes').fill('Lucía')
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await expect(fila).toBeVisible()
  // Agregados del listado calculados desde los pedidos demo (#221), como la
  // cuenta real: total gastado, teléfono con código de país.
  await expect(fila).toContainText('Gs 7.750.000')
  await expect(fila).toContainText('+595 981 123 456')
  await fila.click()
  const ficha = page.getByRole('dialog')
  await expect(ficha.getByText(/Modo demo/)).toBeVisible()
  await page.screenshot({ path: '/tmp/qa221-lista-demo.png' })

  // Resumen con deuda y últimas órdenes del seed.
  await expect(ficha.getByText('Saldo pendiente: Gs 1.500.000')).toBeVisible()
  await expect(ficha.getByText('Gs 1.500.000').first()).toBeVisible()
  await expect(ficha.getByText('Total gastado')).toBeVisible()
  await expect(ficha.getByText('Gs 7.750.000').first()).toBeVisible()
  await expect(ficha.getByText('Últimas órdenes')).toBeVisible()
  await expect(ficha.getByText('MOB-#0008').first()).toBeVisible()
  // El seguro del seed se ve en los datos clave del Resumen.
  await expect(ficha.getByTestId('perfil-datos-clave').getByText(/Activo · 12,5%/)).toBeVisible()

  // Cronología con eventos ficticios.
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(ficha.getByText('Pedido creado').first()).toBeVisible()
  await expect(ficha.getByText('Comentario del equipo').first()).toBeVisible()

  // Estadísticas calculadas de verdad desde los pedidos demo (#221).
  await ficha.getByRole('tab', { name: /^Estadísticas/ }).click()
  await expect(ficha.getByText('Gs 1.550.000')).toBeVisible()
  await expect(ficha.getByText('iPhone 15 · 128 GB').first()).toBeVisible()
  await expect(ficha.getByText(/Cada 172 días/)).toBeVisible()
  await expect(ficha.getByText('Gasto por mes')).toBeVisible()
  await page.screenshot({ path: '/tmp/qa221-estadisticas-demo.png' })

  // El control del seguro queda activo (12,5%) y deshabilitado en demo.
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  const interruptorSeguro = ficha.getByRole('switch', { name: 'Seguro del cliente activo' })
  await expect(interruptorSeguro).toBeChecked()
  await expect(interruptorSeguro).toBeDisabled()
  await expect(ficha.getByLabel('Porcentaje del cliente')).toHaveValue('12,5')

  // Comprobante de verificación de IMEI (#203): en demo se simula y se puede
  // adjuntar al comentario interno (sin consultar al proveedor).
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  await ficha.getByRole('button', { name: 'Verificación IMEI' }).first().click()
  const imeiModal = page.getByRole('dialog', { name: 'Verificación de IMEI' })
  await expect(imeiModal.getByText('Simulada en demo')).toBeVisible()
  await expect(imeiModal.getByText(/IMEI verificado: sin reportes/i)).toBeVisible()
  await expect(imeiModal.getByText(/Fuente IMEIcheck\.net/)).toBeVisible()
  await imeiModal.getByRole('button', { name: 'Adjuntar al comentario' }).click()
  await expect(page.getByText('Agregado al comentario interno.')).toBeVisible()
  // Imprimir en demo: se avisa que es ficticio, sin abrir nada.
  await imeiModal.getByRole('button', { name: 'Imprimir comprobante' }).click()
  await expect(page.getByText(/impresión no está disponible en el demo/i)).toBeVisible()
  await page.screenshot({ path: '/tmp/qa203-demo-imei.png' })
  await imeiModal.getByRole('button', { name: 'Cerrar' }).click()
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(ficha.getByText(/fuente IMEIcheck\.net/).first()).toBeVisible()

  // Portal de ejemplo por token local (sin sesión ni API).
  await ficha.getByRole('button', { name: /Portal del cliente/ }).click()
  await expect(page.getByAltText('QR del portal del cliente')).toBeVisible()
  const enlace = await page.locator('p.break-all').textContent()
  expect(enlace).toMatch(/\/cuenta\/demo-demo-cliente-lucia-rapido$/)
  await page.goto(enlace)
  await expect(page.getByRole('heading', { name: 'Aurora Móviles' })).toBeVisible()
  await expect(page.getByText('Gs 1.500.000').first()).toBeVisible()
  await page.goto(enlace.replace('/cuenta/', '/portal/'))
  await expect(page.getByRole('heading', { name: 'Aurora Móviles' })).toBeVisible()
  await expect(page.getByText('MOB-#0008').first()).toBeVisible()

  // Servicio Técnico demo con casos en el pipeline.
  await page.goto('/servicio')
  await expect(page.getByText('OS-#0001')).toBeVisible()
  await expect(page.getByText('OS-#0002')).toBeVisible()

  // Un solo módulo “Servicio y Garantías” (#224): en “Todo” cada registro
  // muestra su tipo y la garantía ya convertida conserva su vínculo.
  await page.getByRole('group', { name: 'Ver servicio o garantías' }).getByRole('button', { name: 'Todo', exact: true }).click()
  const filasDemo = page.getByTestId('servicio-garantia-fila')
  await expect(filasDemo.filter({ hasText: 'OS-#0001' }).getByText('Desde garantía')).toBeVisible()
  await expect(page.locator('[data-testid="servicio-garantia-fila"][data-tipo="GARANTIA"]').filter({ hasText: 'Lucía Fernández' }).getByText('En servicio')).toBeVisible()
  await expect(filasDemo.filter({ hasText: 'DEMO-W-0002' }).getByText('Garantía', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/qa224-demo-todo.png' })

  // La garantía pendiente pasa al taller: la orden queda vinculada al caso.
  const pendiente = page.locator('[data-testid="servicio-garantia-fila"][data-tipo="GARANTIA"]').filter({ hasText: 'DEMO-W-0002' })
  await pendiente.getByRole('button', { name: 'Pasar a servicio' }).click()
  await page.getByRole('dialog', { name: 'Pasar la garantía a servicio' }).getByRole('button', { name: 'Pasar a servicio' }).click()
  await expect(page.getByText(/quedó vinculada y el historial se conserva en este navegador/)).toBeVisible()
  await expect(pendiente.getByText('En servicio')).toBeVisible()
  await expect(page.locator('[data-testid="servicio-garantia-fila"][data-tipo="SERVICIO"]').filter({ hasText: 'OS-#0005' })).toContainText('Desde garantía')
  await page.screenshot({ path: '/tmp/qa224-demo-conversion.png' })

  expect(apiReal, `la demo no debe llamar al API real: ${apiReal.join(', ')}`).toEqual([])
})
