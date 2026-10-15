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
