import { validarImei } from '../../backend/lib/imei-input.mjs'

/** Comparte normalización y Luhn con la autoridad del backend. */
export const validarImeiConsulta = validarImei

/** El paso de confirmación solo corre cuando el precheck terminó bien. */
export async function ejecutarConsultaCompleta({ precheck, confirmar, alCompletar }) {
  if (!await precheck()) return false
  if (!await confirmar()) return false
  alCompletar?.()
  return true
}
