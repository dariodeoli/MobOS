// Demo funcional: cada acción principal de cada vista se APLICA en pantalla durante
// la sesión (estado nuevo visible, fila nueva, fila borrada, chip activo/inactivo),
// sin avisos de «no se guardó», sin llamadas a la API real, sin escribir nada en
// localStorage y con todo de vuelta al estado inicial al recargar.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo, silenciarAvisoMetricas } from './helpers/demo.js'

test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

const esLlamadaApi = (url) => new URL(url).pathname.startsWith('/api/') && !url.includes('/api/public/track')
const ruidoConocido = (texto) => /Failed to load resource|ERR_UNSAFE_PORT|\/api\/public\/track/.test(texto)

// Vigila lo que la demo no puede hacer: llamar al API real, escribir en
// localStorage (la clave del aviso de métricas es del arnés) o romper la consola.
function vigilar(page) {
  const vigia = { llamadas: [], consola: [] }
  page.on('request', (peticion) => { if (esLlamadaApi(peticion.url())) vigia.llamadas.push(peticion.url()) })
  page.on('console', (mensaje) => { if (mensaje.type() === 'error' && !ruidoConocido(mensaje.text())) vigia.consola.push(mensaje.text().slice(0, 240)) })
  page.on('pageerror', (error) => vigia.consola.push(`PAGEERROR ${String(error).slice(0, 240)}`))
  return vigia
}

async function entrar(page, { ancho = 1280 } = {}) {
  await page.setViewportSize({ width: ancho, height: 900 })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Dueño' }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuiaDemo(page)
}

// Navegación interna (sin recargar): conserva la sesión demo y el estado en memoria.
async function irA(page, ruta) {
  await page.evaluate((destino) => {
    window.history.pushState({}, '', destino)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, ruta)
}

const toastes = (page) => page.locator('[role=status], [role=alert]').filter({ hasNotText: /Demo\s/ })
const principal = (page) => page.locator('main').first()

test.describe('demo · acciones que se aplican en pantalla', () => {
  test('el aviso es un chip fijo «se reinicia al salir» y ningún toast dice «no se guardó»', async ({ page }) => {
    await entrar(page)
    await expect(page.getByTestId('demo-aviso')).toContainText('Demo')
    await expect(page.getByTestId('demo-aviso')).toHaveAttribute('title', /se reinicia al recargar o salir/)
    await irA(page, '/servicio')
    await page.getByRole('button', { name: 'Pasar a Diagnóstico' }).first().click()
    await expect(toastes(page).first()).toBeVisible()
    await expect(page.getByText(/no se guardó/i)).toHaveCount(0)
    await expect(page.getByText('Cambio simulado en la demo')).toHaveCount(0)
  })

  test('taller: avanza el estado de una orden y crea una orden nueva', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/servicio')
    const orden = page.getByText('OS-#0011', { exact: true }).locator('xpath=ancestor::*[.//button[starts-with(@aria-label,"Pasar a")]][1]')
    await expect(orden).toContainText('Diagnóstico')
    await orden.getByRole('button', { name: 'Pasar a Con técnico' }).click()
    await expect(orden).toContainText('Con técnico')
    await expect(orden.getByRole('button', { name: 'Pasar a Esperando repuesto' })).toBeVisible()
    await orden.getByRole('button', { name: 'Pasar a Esperando repuesto' }).click()
    await expect(orden.getByRole('button', { name: 'Pasar a Reparado' })).toBeVisible()
    await expect(orden).toContainText('Esperando repuesto')

    await page.getByRole('button', { name: 'Nueva orden' }).click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Cliente', { exact: true }).fill('Cliente Prueba Taller')
    await dialogo.getByPlaceholder('Buscar por nombre o código…').fill('iPhone 11')
    await page.getByRole('option').first().click()
    await dialogo.locator('#falla-reportada').fill('No carga')
    await dialogo.getByRole('button', { name: /^Guardar|^Crear/ }).last().click()
    await expect(principal(page)).toContainText('Cliente Prueba Taller')
    expect(vigia.llamadas).toEqual([])
  })

  test('trade-in: activa o desactiva un valor de toma y mueve un equipo de estado', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/trade-in')
    const valor = page.getByText('iPhone 15 Pro Max', { exact: true }).first().locator('xpath=ancestor::div[.//button[normalize-space()="Desactivar" or normalize-space()="Activar"]][1]')
    await expect(valor).toContainText('Activo')
    await valor.getByRole('button', { name: 'Desactivar' }).click()
    await expect(valor).toContainText('Inactivo')
    await valor.getByRole('button', { name: 'Activar' }).click()
    await expect(valor).toContainText('Activo')

    await page.getByText('AUR-TI-0001').first().click()
    const detalle = page.getByRole('dialog')
    await detalle.locator('select').first().selectOption('REPAIR')
    await detalle.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expect(page.getByText('Movimiento guardado.')).toBeVisible()
    await expect(detalle).toContainText('En reparación')
    expect(vigia.llamadas).toEqual([])
  })

  test('pedidos: cambia la entrega, etiqueta, archiva y anula un pedido', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/pedidos')
    await page.getByText('AUR-0500').first().click()
    await page.getByLabel('Estado de entrega').selectOption('READY_FOR_PICKUP')
    await expect(page.locator('[aria-current=step]')).toContainText('Listo para retirar')
    await page.getByLabel('Nueva etiqueta').fill('urgente')
    await page.getByRole('button', { name: 'Agregar etiqueta' }).click()
    await expect(page.getByTestId('pedido-etiquetas')).toContainText('urgente')

    await page.getByRole('button', { name: 'Más acciones', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Anular pedido' }).click()
    await page.getByLabel('Motivo de la anulación').fill('Cliente se arrepintió')
    await page.getByTestId('anular-pedido').getByRole('button', { name: 'Anular pedido' }).click()
    await expect(principal(page)).toContainText('Anulado')
    await expect(principal(page)).toContainText('Saldo')

    await page.getByRole('button', { name: 'Más acciones', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Archivar' }).click()
    await expect(page.getByText('Pedido archivado.')).toBeVisible()
    await irA(page, '/pedidos')
    await expect(principal(page)).toBeVisible()
    await expect(page.getByText('AUR-0500')).toHaveCount(0)
    expect(vigia.llamadas).toEqual([])
  })

  test('módulos: desactivar un módulo lo apaga de verdad en el menú y reactivarlo lo devuelve', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/configuracion/modulos')
    const fila = page.getByTestId('modulo-fila-servicios')
    await expect(fila).toHaveAttribute('data-estado', 'activo')
    await expect(page.getByRole('button', { name: 'Taller', exact: true })).toBeVisible()
    await fila.getByRole('button', { name: /^Desactivar/ }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click()
    await expect(fila).toHaveAttribute('data-estado', 'apagado')
    await expect(page.getByRole('button', { name: 'Taller', exact: true })).toHaveCount(0)
    await fila.getByRole('button', { name: /^Activar/ }).click()
    await expect(fila).toHaveAttribute('data-estado', 'activo')
    await expect(page.getByRole('button', { name: 'Taller', exact: true })).toBeVisible()
    expect(vigia.llamadas).toEqual([])
  })

  test('promociones: crea un cupón y lo desactiva y reactiva', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/promociones')
    await page.getByRole('button', { name: 'Nuevo cupón' }).click()
    await page.locator('#cupon-code').fill('DEMOACC10')
    await page.locator('#cupon-name').fill('Cupón de prueba demo')
    await page.locator('#cupon-valor').fill('10')
    await page.locator('#cupon-startsAt').fill('2026-10-01T00:00')
    await page.locator('#cupon-endsAt').fill('2026-12-31T23:59')
    await page.getByRole('button', { name: 'Crear cupón' }).click()
    const fila = page.getByText('DEMOACC10').first().locator('xpath=ancestor::*[.//button[normalize-space()="Desactivar" or normalize-space()="Activar"]][1]')
    await expect(fila).toBeVisible()
    await fila.getByRole('button', { name: 'Desactivar' }).click()
    await expect(fila.getByRole('button', { name: 'Activar' })).toBeVisible()
    await fila.getByRole('button', { name: 'Activar' }).click()
    await expect(fila.getByRole('button', { name: 'Desactivar' })).toBeVisible()
    expect(vigia.llamadas).toEqual([])
  })

  test('cuentas: agrega una cuenta y la activa o desactiva', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/finanzas/bancos')
    const fila = page.getByText('Itaú', { exact: false }).first().locator('xpath=ancestor::*[.//button[normalize-space()="Desactivar" or normalize-space()="Activar"]][1]')
    await fila.getByRole('button', { name: 'Desactivar' }).click()
    await expect(fila.getByRole('button', { name: 'Activar' })).toBeVisible()
    await fila.getByRole('button', { name: 'Activar' }).click()
    await expect(fila.getByRole('button', { name: 'Desactivar' })).toBeVisible()
    expect(vigia.llamadas).toEqual([])
  })

  test('finanzas: registra un gasto y se ve en el libro', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/finanzas/gastos')
    await page.getByRole('button', { name: 'Registrar movimiento' }).click()
    await page.locator('#monto-gasto').fill('123456')
    await page.locator('#descripcion').fill('Gasto de prueba demo')
    await page.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expect(principal(page)).toContainText('Gasto de prueba demo')
    expect(vigia.llamadas).toEqual([])
  })

  test('garantías y plantillas: crea un caso y una plantilla nuevos', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/garantias')
    await page.getByRole('button', { name: 'Nuevo caso' }).click()
    await page.getByPlaceholder('Nombre del cliente').fill('Cliente Garantía Demo')
    await page.getByPlaceholder('Serial o IMEI').fill('353324112900599')
    await page.getByPlaceholder('Falla reportada, revisión solicitada…').fill('Pantalla con línea')
    await page.getByRole('button', { name: 'Registrar caso' }).click()
    await expect(principal(page)).toContainText('Cliente Garantía Demo')

    await irA(page, '/plantillas')
    await page.getByRole('button', { name: 'Nueva plantilla' }).click()
    await page.locator('#plantilla-nombre').fill('Plantilla demo acciones')
    await page.locator('#plantilla-mensaje').fill('Hola {{cliente}}, tu pedido {{pedido}} está listo.')
    await page.getByRole('button', { name: 'Crear plantilla' }).click()
    await expect(principal(page)).toContainText('Plantilla demo acciones')
    expect(vigia.llamadas).toEqual([])
  })

  test('stock: conteo físico (iniciar, escanear, aplicar), reserva y liberación, y guía de un traslado', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/stock/conteos')
    await page.getByRole('button', { name: 'Nuevo conteo' }).click()
    await page.getByRole('button', { name: 'Iniciar conteo' }).click()
    await page.locator('#conteo-serial').fill('353324112900599')
    await page.getByRole('button', { name: 'Escanear', exact: true }).click()
    await expect(page.getByTestId('conteo-linea')).toHaveCount(1)
    await page.getByTestId('aplicar-conteo').click()
    await page.locator('#conteo-motivo').fill('cierre de turno')
    await page.getByRole('button', { name: /^Aplicar/ }).last().click()
    await expect(page.getByText('Conteo aplicado y auditado: no admite más escaneos.')).toBeVisible()

    await irA(page, '/stock/traslados')
    await page.getByRole('button', { name: 'Agregar guía' }).first().click()
    await page.getByLabel('Guía AEX').fill('AEX-777')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Guía AEX adjuntada al traslado.')).toBeVisible()

    await irA(page, '/stock/compartido')
    await page.getByPlaceholder(/Buscar empresa/).fill('Norte')
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await page.getByRole('button', { name: 'Compartir', exact: true }).click()
    await expect(principal(page)).toContainText('Ve tu disponibilidad')
    await page.getByRole('button', { name: 'Revocar' }).click()
    await expect(principal(page)).toContainText('Permiso revocado')
    expect(vigia.llamadas).toEqual([])
  })

  test('autorizaciones: aprobar y rechazar cambia el estado y baja el contador', async ({ page }) => {
    const vigia = vigilar(page)
    await entrar(page)
    await irA(page, '/autorizaciones')
    const aprobar = page.getByRole('button', { name: 'Aprobar', exact: true }).first()
    await expect(aprobar).toBeVisible()
    await page.waitForTimeout(800)
    await aprobar.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /Aprobar/ }).last().click()
    await expect(page.getByText('Solicitud aprobada').first()).toBeVisible()
    await page.getByRole('tab', { name: /Precios/ }).click()
    const fila = page.getByText('Carlos Benítez').first().locator('xpath=ancestor::*[contains(., "Descuento")][1]')
    await expect(fila).toContainText('Aprobada')
    await expect(fila.getByRole('button', { name: 'Aprobar', exact: true })).toHaveCount(0)
    expect(vigia.llamadas).toEqual([])
  })
})
