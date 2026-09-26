// Escaneo de seriales (F3/F5): normalización y validación **previa** del lote,
// espejo de las reglas de `cuadrarSeriales` del backend para avisar antes de
// mandar (el backend sigue siendo la autoridad: rechaza con 409/400 y audita).
export const MAX_SERIAL = 64

export const MOTIVO = {
  VACIO: 'Vacío',
  LUHN: 'IMEI inválido (dígito verificador)',
  FORMATO: 'Formato inválido (mínimo 4, letras/números/guiones)',
  REPETIDO: 'Repetido en el lote',
  YA_CARGADO: 'Ya estaba cargado',
  EXCEDE: 'Supera la cantidad comprada',
  DESCONOCIDO: 'No está en el manifiesto',
}

export function normalizarSerial(valor) {
  return String(valor ?? '').trim().toUpperCase().slice(0, MAX_SERIAL)
}

/** Luhn sobre IMEI de 15 dígitos; cualquier otro largo no es IMEI y no aplica. */
export function luhnValido(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '')
  if (digitos.length !== 15) return true
  let suma = 0
  for (let indice = 0; indice < digitos.length; indice += 1) {
    let digito = Number(digitos[digitos.length - 1 - indice])
    if (indice % 2 === 1) {
      digito *= 2
      if (digito > 9) digito -= 9
    }
    suma += digito
  }
  return suma % 10 === 0
}

export function analizarSerial(valor) {
  const serial = normalizarSerial(valor)
  if (!serial) return { ok: false, serial, motivo: 'VACIO' }
  const soloDigitos = /^\d+$/.test(serial)
  if (soloDigitos && serial.length === 15 && !luhnValido(serial)) return { ok: false, serial, motivo: 'LUHN' }
  if (!soloDigitos && !/^[A-Z0-9-]{4,}$/.test(serial)) return { ok: false, serial, motivo: 'FORMATO' }
  return { ok: true, serial }
}

/**
 * Valida un lote (array o texto pegado con comas/espacios/saltos).
 * `yaCargados`: seriales que la línea ya tiene; `limite`: cuántos entran
 * todavía; `permitidos`: Set de seriales esperados (recepción contra manifiesto).
 */
export function validarLote({ entradas, yaCargados = [], limite = null, permitidos = null } = {}) {
  const lista = Array.isArray(entradas) ? entradas : String(entradas ?? '').split(/[\s,;]+/)
  const cargados = new Set(yaCargados.map(normalizarSerial))
  const vistos = new Set()
  const validos = []
  const errores = []
  for (const bruto of lista) {
    const analisis = analizarSerial(bruto)
    if (!analisis.ok) {
      errores.push({ serial: analisis.serial, motivo: analisis.motivo })
      continue
    }
    const { serial } = analisis
    if (vistos.has(serial)) { errores.push({ serial, motivo: 'REPETIDO' }); continue }
    if (cargados.has(serial)) { errores.push({ serial, motivo: 'YA_CARGADO' }); continue }
    if (permitidos && !permitidos.has(serial)) { errores.push({ serial, motivo: 'DESCONOCIDO' }); continue }
    if (limite != null && validos.length >= limite) { errores.push({ serial, motivo: 'EXCEDE' }); continue }
    vistos.add(serial)
    validos.push(serial)
  }
  return { validos, errores }
}

export const textoMotivo = (motivo) => MOTIVO[motivo] || motivo
