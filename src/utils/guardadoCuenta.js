// Guardado de Configuración contra la API de la cuenta (lote F): el backend
// exige reautenticación reciente (10 minutos) para las acciones sensibles y
// responde 403 con un mensaje que pide reautenticar. Estas funciones puras
// deciden el estado que ve el usuario; la pantalla las usa desde
// `src/components/control/GuardadoCuenta.jsx` (probadas en
// `src/utils/guardadoCuenta.test.js`).

export function esReautenticacionRequerida(error) {
  return error?.status === 403 && /reautentic/i.test(error?.message || '')
}

/** Texto del estado tras un error de guardado (no se guardó nada). */
export function mensajeDeErrorDeGuardado(error, respaldo = 'No se pudieron guardar los cambios.') {
  if (esReautenticacionRequerida(error)) return 'Falta verificar tu contraseña: los cambios no se guardaron todavía.'
  return error?.message || respaldo
}

/** Texto del chip de éxito ("Guardado." o "Guardado: <detalle>."). */
export function mensajeDeGuardado(detalle) {
  return detalle ? `Guardado: ${detalle}.` : 'Guardado.'
}
