// IMEI ficticio con checksum Luhn válido y **alta entropía** para los specs que
// siembran unidades. La receta anterior (`Date.now()` últimos 11 + 1 dígito
// aleatorio) permitía que dos specs en paralelo generaran el mismo IMEI en el
// mismo milisegundo y el POST de la unidad devolviera 409 «Ya existen» (#245).
export function imeiValido() {
  const base = `35${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}${String(Date.now() % 1000).padStart(3, '0')}`.slice(0, 14)
  let suma = 0
  for (let i = 0; i < 14; i += 1) {
    let digito = Number(base[13 - i])
    if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 }
    suma += digito
  }
  return base + String((10 - (suma % 10)) % 10)
}
