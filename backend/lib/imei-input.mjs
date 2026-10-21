/** IMEI de 15 dígitos con checksum Luhn. Se valida antes de llamar. */
export function validarImei(valor) {
  const imei = String(valor ?? '').replace(/\D/g, '')
  if (!imei) return { ok: false, error: 'Falta el IMEI.' }
  if (imei.length !== 15) return { ok: false, error: 'El IMEI debe tener 15 dígitos.' }
  let suma = 0
  for (let i = 0; i < 15; i += 1) {
    let digito = Number(imei[14 - i])
    if (i % 2 === 1) { digito *= 2; if (digito > 9) digito -= 9 }
    suma += digito
  }
  if (suma % 10 !== 0) return { ok: false, error: 'El IMEI no tiene un dígito de control válido (Luhn): revisá que esté bien escrito.' }
  return { ok: true, imei }
}
