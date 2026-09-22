// Cierra la guía "Cómo funciona la demo" (#201) si se abrió sola en la primera
// visita de la pestaña. Espera a que aparezca (monta un render después de
// entrar) y, si no aparece, sigue sin tocar nada. Es determinista en los dos
// casos: en CI la comprobación instantánea perdía la carrera y la guía tapaba
// los clics del panel.
export async function cerrarGuiaDemo(page, { timeout = 4000 } = {}) {
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  const aparecio = await guia.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
  if (!aparecio) return false
  await guia.getByRole('button', { name: 'Cerrar' }).click()
  return true
}
