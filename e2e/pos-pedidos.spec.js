import { test, expect } from './helpers/seller-test.js'
import { openShellDestination } from './helpers/shell-navigation.js'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { codigoPedido } from '../src/utils/pedido.js'
import { SEED } from './helpers/seed-data.js'
import { abrirVistaPreviaComprobante } from './helpers/pedido-imprimir.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

// Navegar a Pedidos muestra la lista (sin popups inesperados) y el detalle
// abre/cierra desde la fila.
test('pedidos: la lista abre sin popups y el detalle se abre y cierra', async ({ page }) => {
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error?.message || error)))
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()

  await openShellDestination(page, 'Mis pedidos')
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  await expect(page.getByTestId("pedido-fila").first()).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // Pago y entrega comparten una celda visual, conservando ambos estados
  // accesibles. La fecha sigue completa y la vista rápida conserva su lugar.
  const fila = page.getByTestId('pedido-fila').first()
  const celdas = fila.locator(':scope > *')
  await expect(celdas).toHaveCount(7)
  await expect(fila.getByRole('group', { name: 'Estado de pago', exact: true })).toBeVisible()
  await expect(fila.getByRole('group', { name: 'Estado de entrega', exact: true })).toBeVisible()
  const fecha = fila.locator('.ventas-f3-order-date')
  expect(await fecha.evaluate(elemento => elemento.scrollWidth <= elemento.clientWidth + 1)).toBeTruthy()

  await page.reload()
  await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // El clic lleva a la página exclusiva del pedido (no a un panel).
  await page.getByTestId('pedido-fila').first().click()
  await expect(page).toHaveURL(/\/pedidos\/[a-z0-9-]+$/i)
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver a pedidos' }).click()
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // El ícono de acciones abre la vista rápida en panel sin redirigir y sin
  // repetir el detalle (#313): resumen + acceso al pedido completo.
  const urlLista = page.url()
  await page.getByRole('button', { name: /Vista rápida de/ }).first().click()
  const panelRapido = page.getByTestId('pedido-vista-rapida')
  await expect(panelRapido).toBeVisible()
  await expect(page).toHaveURL(urlLista)
  await expect(panelRapido.getByText('Artículos preparados')).toHaveCount(0)
  await expect(panelRapido.getByRole('button', { name: 'Ver pedido completo' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(panelRapido).toHaveCount(0)

  expect(errores, `Errores de página: ${errores.join(' | ')}`).toEqual([])
})

// Enlace directo a un pedido que NO está en la página cargada: el drawer tiene
// que resolverlo por API (antes quedaba un popup vacío y fijo).
test('pedidos: enlace directo a un pedido fuera de la página lo resuelve por API', async ({ page }) => {
  await page.goto('/pedidos')
  const ordenes = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
    return response.ok ? await response.json() : []
  }, API)
  const objetivo = ordenes[0]
  expect(objetivo?.id).toBeTruthy()

  // Simula que el pedido no vino en la lista: la página queda vacía.
  await page.route(/\/api\/orders\?/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto(`/pedidos/${objetivo.id}`)
  await expect(page.getByText(codigoPedido(objetivo.orderNumber)).first()).toBeVisible()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
})

// Impresión del pedido: 80 mm (predeterminado), A4 y el rollo de 58 mm con
// diseño vertical propio. Nivel y formato se eligen con íconos (#207/#208).
test('pedidos: el comprobante ofrece 80 mm y A4; el 58 mm solo con el interruptor de Impresión', async ({ page }) => {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await abrirVistaPreviaComprobante(page)

  const formato = page.getByRole('radiogroup', { name: 'Formato de impresión' })
  await expect(formato).toBeVisible()
  const opciones = await formato
    .getByRole('radio')
    .evaluateAll((radios) => radios.map((radio) => radio.getAttribute('aria-label')))
  // Sin el interruptor «Formato 58 mm» (apagado por defecto) solo 80 mm y A4.
  expect(opciones).toEqual(['Formato 80 mm', 'Formato A4'])
  await expect(formato.getByRole('radio', { name: 'Formato 80 mm' })).toBeChecked()

  const nivel = page.getByRole('radiogroup', { name: 'Tipo de comprobante' })
  await expect(nivel.getByRole('radio', { name: 'Comprobante Rápido' })).toBeChecked()

  const frame = page.locator('iframe[title="Vista previa del comprobante"]')
  // Los tres modelos: rápido identifica empresa y sucursal; el detallado imprime
  // la cronología del pedido.
  await nivel.getByRole('radio', { name: 'Comprobante Rápido' }).click()
  await expect(frame).toHaveAttribute('srcdoc', /class="rz">Tienda E2E<\/div><div class="sub">Sucursal E2E/, { timeout: 15000 })
  await nivel.getByRole('radio', { name: 'Comprobante Detallado' }).click()
  await expect(frame).toHaveAttribute('srcdoc', /Cronología/, { timeout: 15000 })

  // 58 mm: una columna, total destacado y alto dinámico (no el A4 encogido).
  // #402: comparte plantilla con A4/80 mm; el marcador del cuerpo (`rollo t58`)
  // y el `@page` con alto automático lo distinguen de los otros formatos.
  await page.evaluate(() => { localStorage.setItem('mobos:impresion:formato-58', '1'); window.dispatchEvent(new Event('mobos:formato-58')) })
  await formato.getByRole('radio', { name: 'Formato 58 mm' }).click()
  await expect(frame).toHaveAttribute('srcdoc', /@page\{size:58mm auto;margin:[^}]+\}/, { timeout: 15000 })
  await expect(frame).toHaveAttribute('srcdoc', /<body class="rollo t58">/)
  await expect(frame).toHaveAttribute('srcdoc', /<tr class="total">/)
  await expect(frame).toHaveAttribute('srcdoc', /Documento no fiscal/)

  await formato.getByRole('radio', { name: 'Formato A4' }).click()
  await expect(frame).toHaveAttribute('srcdoc', /@page\{size:A4;margin:[^}]+\}/, { timeout: 15000 })
  await expect(frame).toHaveAttribute('srcdoc', /<body class="hoja a4">/)
})

// Comprobante como imagen en MobOS (#240/#220, coordinado con POS): desde el
// mismo modal del comprobante se baja el PNG (y se comparte/copia con los otros
// botones del objeto compartido), sin depender del diálogo de impresión.
test('pedidos: el comprobante se descarga como imagen PNG', async ({ page }) => {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await abrirVistaPreviaComprobante(page)
  await expect(page.locator('iframe[title="Vista previa del comprobante"]')).toBeVisible()

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('descargar-png').click(),
  ])
  expect(descarga.suggestedFilename()).toMatch(/^comprobante-.*\.png$/)
  const png = readFileSync(await descarga.path())
  expect(png.length).toBeGreaterThan(10_000)
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
  await expect(page.getByText('Imagen descargada')).toBeVisible({ timeout: 15_000 })
  // El iframe del rasterizado se limpia (no queda basura oculta en el DOM).
  await expect(page.locator('iframe[data-png-documento]')).toHaveCount(0)
  await expect(page.getByTestId('compartir-imagen')).toBeVisible()
  await expect(page.getByTestId('copiar-png')).toBeVisible()
})

// La cronología tiene que mostrar a la persona real que creó el pedido, no un
// genérico "Sistema": el actor sale del usuario que confirmó la venta.
test('pedidos: la cronología muestra al vendedor que creó el pedido', async ({ page }) => {
  await page.goto('/pedidos')
  // Se elige un pedido real con cliente y vendedor (el código comercial puede
  // cambiar por la migración de códigos, así que no se fija ninguno).
  const objetivo = await page.evaluate(async (api) => {
    const rows = await (await fetch(`${api}/api/orders`, { credentials: 'include' })).json()
    const orden = rows.find((row) => row.customer?.name && row.seller?.name)
    return orden ? { orderNumber: orden.orderNumber, seller: orden.seller.name } : null
  }, API)
  expect(objetivo?.orderNumber).toBeTruthy()
  const fila = page
    .getByTestId('pedido-fila')
    .filter({ hasText: codigoPedido(objetivo.orderNumber) })
    .first()
  await expect(fila).toBeVisible()
  await fila.click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()

  // La cronología arranca plegada (#164): se abre para leer los movimientos.
  const creado = page.locator('article').filter({ hasText: 'Pedido creado' }).first()
  await expect(creado).toBeVisible()
  await expect(creado).not.toContainText('Sistema')
  await expect(creado).toContainText(objetivo.seller.split(' ')[0])
})

// #175 (§21): la nota interna del pedido se agrega y edita desde el detalle.
test('pedidos: la nota del pedido se edita desde el detalle', async ({ page }) => {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  const nota = `Nota E2E ${Date.now().toString(36)}`
  await page.getByRole('button', { name: /Agregar nota|Editar nota/ }).click()
  await page.getByLabel('Nota del pedido').fill(nota)
  await page.getByRole('button', { name: 'Guardar nota' }).click()
  await expect(page.getByTestId("pedido-notas").getByText(nota)).toBeVisible({ timeout: 15_000 })
})

// #509: el selector de empresas no debe consultar autorización de cuenta
// personal cuando la sesión real de tienda no tiene esa capacidad.
test('sesión #509 vendedor sin cuenta conserva Pedidos tras recarga y DTO malformado no habilita empresas', async ({page}) => {
  const listado=[]
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/auth/tenants')listado.push(r.url())})
  const me=await page.request.get(`${API}/api/auth/me`,{headers:{Origin:process.env.MOBOS_APP_URL}})
  expect(me.status()).toBe(200)
  expect((await me.json()).user.canManageCompanies).toBe(false)
  await page.goto('/pedidos')
  await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
  for(const malformed of ['true',1,null]){
    await page.route('**/api/auth/me',async route=>{
      const response=await route.fetch(),body=await response.json()
      body.user.canManageCompanies=malformed
      await route.fulfill({response,json:body})
    })
    await page.reload()
    await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
    await page.unroute('**/api/auth/me')
  }
  expect(listado).toEqual([])
})

test('sesión #509 revocada realmente retira datos y respaldo sin perder cola',async({page,context})=>{
  // Empresa/PIN propios: logout también revoca la cookie COMPANY. El estado
  // sembrado es compartido con admin.json y no se debe revocar desde este test.
  const login=await page.request.post(`${API}/api/auth/login`,{data:{email:SEED.company.email,password:SEED.company.password,deviceId:`qa509-revocation-${Date.now()}`}})
  expect(login.status()).toBe(200)
  const seller=(await login.json()).sellers.find(s=>s.name===SEED.sellers[0].name)
  expect(seller?.id).toBeTruthy()
  const pin=await page.request.post(`${API}/api/auth/pin`,{headers:{Origin:process.env.MOBOS_APP_URL},data:{sellerId:seller.id,pin:SEED.sellers[0].pin}})
  expect(pin.status()).toBe(200)
  await page.goto('/pedidos')
  await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
  await page.evaluate(async()=>{
    const store=(await import('/src/lib/offline/idb.js')).crearStoreDeCola()
    await store.guardar({id:'queue509',idempotencyKey:'keep509',payload:{total:1234}})
  })
  const real401=page.waitForResponse(r=>r.url().startsWith(API+'/api/')&&r.status()===401)
  const response=await page.request.post(`${API}/api/auth/logout`,{headers:{Origin:new URL(page.url()).origin}})
  expect(response.status()).toBe(200)
  // Una consulta en background puede invalidar antes del refresco explícito.
  // Acreditamos el401 HTTP real y la purga, no el orden de dos rechazos.
  await page.evaluate(async()=>{await(await import('/src/lib/api/client.js')).api.get('/api/auth/me',{cacheMs:0}).catch(()=>{})})
  expect((await real401).status()).toBe(401)
  const denied=await page.evaluate(async()=>{
    const storage=await import('/src/lib/storage.js')
    await storage.refrescar().catch(()=>{})
    return{products:storage.getProductos(),orders:storage.listVentas()}
  })
  expect(denied).toEqual({products:[],orders:[]})
  await context.setOffline(true)
  const offline=await page.evaluate(async()=>{
    const storage=await import('/src/lib/storage.js')
    await storage.refrescar()
    return{products:storage.getProductos(),orders:storage.listVentas(),queue:await(await import('/src/lib/offline/idb.js')).crearStoreDeCola().listar()}
  })
  expect(offline.products).toEqual([]);expect(offline.orders).toEqual([])
  expect(offline.queue).toEqual([expect.objectContaining({id:'queue509',idempotencyKey:'keep509'})])
  await context.setOffline(false)
})


test('sesión #509 capacidad server y alcance de cuenta personal con HTTP/PG reales',async()=>{
  const databaseUrl=`postgresql://postgres@127.0.0.1:${process.env.MOBOS_E2E_PGPORT}/${process.env.MOBOS_E2E_DB}`
  const result=execFileSync(process.execPath,['backend/tests/auth-context509.mjs',API,databaseUrl],{encoding:'utf8'})
  expect(result).toContain('8 checks PASS')
})
