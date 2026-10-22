// Cierra el aviso de la guía de la demo (#201/#461) si apareció solo en la primera
// visita de la pestaña. Espera a que aparezca (monta un render después de
// entrar) y, si no aparece, sigue sin tocar nada. Es determinista en los dos
// casos: en CI la comprobación instantánea perdía la carrera y la guía tapaba
// los clics del panel.
export async function cerrarGuiaDemo(page, { timeout = 1500 } = {}) {
  // #461: la guía de la primera visita es un aviso que se cierra (ya no un modal).
  const aviso = page.getByTestId('demo-guia-aviso')
  const aparecio = await aviso.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
  if (!aparecio) return false
  await aviso.getByRole('button', { name: 'Cerrar aviso de la demo' }).click()
  return true
}

// El aviso de métricas anónimas (#438) se muestra una vez en la demo y queda
// fijo abajo; tapa el carrito del POS y el perfil. Estas specs no lo prueban
// (lo cubre e2e/frontend/aviso-privacidad), así que llegan con el aviso ya visto.
export function silenciarAvisoMetricas(page) {
  return page.addInitScript(() => { try { localStorage.setItem('mobos:aviso-metricas', '1') } catch { /* sin storage */ } })
}

// La entrada /demo ofrece solo Dueño y Vendedor; los demás roles (Gerente, Caja,
// Técnico, Delivery) se eligen adentro con «Ver como». Entra por la vía que exista
// y espera a que la sesión recargada muestre el rol pedido.
const SESION_DE_ROL = { Dueño: 'ADMIN', Gerente: 'GERENTE', Vendedor: 'VENDEDOR', Caja: 'CAJERA', Técnico: 'TECNICO', Delivery: 'REPARTIDOR' }
export async function entrarDemoComo(page, nombre) {
  const directo = page.getByRole('button', { name: `Entrar como ${nombre}`, exact: true })
  if (await directo.count()) {
    await directo.click()
    return
  }
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  const alternar = page.getByTestId('demo-perspectivas-toggle')
  await alternar.waitFor({ state: 'visible' })
  await alternar.click()
  await page.getByTestId('demo-ver-como-menu').getByRole('menuitemradio', { name: new RegExp(nombre) }).click()
  await page.waitForFunction(
    (rol) => sessionStorage.getItem('mobos:demo-session:role') === rol,
    SESION_DE_ROL[nombre],
  )
  await page.getByTestId('shell').waitFor({ state: 'visible' })
}
