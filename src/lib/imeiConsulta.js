/** Valida un IMEI real antes de solicitar una consulta de proveedor. */
export function validarImeiConsulta(valor) {
  const imei = String(valor ?? '').replace(/\D/g, '')
  if (!imei) return { ok: false, error: 'Falta el IMEI.' }
  if (imei.length !== 15) return { ok: false, error: 'El IMEI debe tener 15 dígitos.' }

  let suma = 0
  for (let i = 0; i < imei.length; i += 1) {
    let digito = Number(imei[imei.length - 1 - i])
    if (i % 2 === 1) {
      digito *= 2
      if (digito > 9) digito -= 9
    }
    suma += digito
  }
  if (suma % 10 !== 0) return { ok: false, error: 'El IMEI no tiene un dígito de control válido: revisá que esté bien escrito.' }
  return { ok: true, imei }
}

/** El paso de confirmación solo corre cuando el precheck terminó bien. */
export async function ejecutarConsultaCompleta({ precheck, confirmar, alCompletar }) {
  if (!await precheck()) return false
  if (!await confirmar()) return false
  alCompletar?.()
  return true
}
