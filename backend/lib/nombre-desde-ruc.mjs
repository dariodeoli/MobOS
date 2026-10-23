// Regla ÚNICA de nombres que salen de una consulta de RUC/CI (OwnData, demo,
// fichas guardadas). Compartida entre el front (src/lib/nombreDesdeRuc.js) y el
// back: cambiar la regla acá la cambia en toda la app.
//
//  - Persona  -> «Nombres Apellidos», sin coma, en Formato Título.
//  - Empresa  -> razón social tal cual viene (mayúsculas incluidas).
//
// El proveedor entrega las personas como «APELLIDOS, NOMBRES». El nombre fiscal
// crudo (nameOfficial) se conserva aparte para documentos fiscales.

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'van', 'von'])
// Desde este RUC (sin DV) el contribuyente es una sociedad; por debajo, una persona (CI).
export const RUC_EMPRESA_DESDE = 80000000
const TIPO_SOCIETARIO = /\b(S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?C\.?I\.?|S\.?A\.?E\.?|S\.?A\.?S\.?|LTDA\.?|E\.?A\.?S\.?|C[IÍ]A\.?|SOCIEDAD|EMPRESA|COMPA[ÑN][IÍ]A|COOPERATIVA|FUNDACI[OÓ]N|ASOCIACI[OÓ]N|MUNICIPALIDAD|GOBERNACI[OÓ]N|MINISTERIO|UNIVERSIDAD|COLEGIO|CONSORCIO)\b/i

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim()

function capitalizar(palabra) {
  return palabra.toLowerCase().replace(/(^|[-'’.])(\p{L})/gu, (_, sep, letra) => sep + letra.toUpperCase())
}

/** Formato Título de un tramo (nombres o apellidos): partículas en minúscula salvo al inicio del tramo. */
export function formatoTitulo(texto) {
  return limpiar(texto).split(' ').filter(Boolean)
    .map((palabra, i) => (i > 0 && PARTICULAS.has(palabra.toLowerCase()) ? palabra.toLowerCase() : capitalizar(palabra)))
    .join(' ')
}

export function esRazonSocialTexto(texto) {
  return TIPO_SOCIETARIO.test(limpiar(texto))
}

function baseRuc(ruc) {
  const base = String(ruc ?? '').replace(/[.\s]/g, '').split('-')[0]
  return /^\d{1,9}$/.test(base) ? Number(base) : null
}

/** 'persona' | 'empresa' según los datos disponibles (RUC >= 80.000.000 = empresa). */
export function tipoDeContribuyente({ ruc, nameOfficial, givenNames, surnames } = {}) {
  if (limpiar(givenNames) && limpiar(surnames)) return 'persona'
  const base = baseRuc(ruc)
  if (base !== null) return base >= RUC_EMPRESA_DESDE ? 'empresa' : 'persona'
  return esRazonSocialTexto(nameOfficial) ? 'empresa' : 'persona'
}

/** «Nombres Apellidos» (sin coma) desde nombres y apellidos ya separados. */
export function nombreCompletoPersona(nombres, apellidos) {
  return [formatoTitulo(nombres), formatoTitulo(apellidos)].filter(Boolean).join(' ')
}

/**
 * @param {{ nameOfficial?: string, name?: string, givenNames?: string, surnames?: string, ruc?: string, fullRuc?: string }} consulta
 * @returns {{ tipo: 'persona'|'empresa', nombres: string, apellidos: string, nombreCompleto: string, razonSocial: string }}
 */
export function nombreDesdeRuc(consulta = {}) {
  const oficial = limpiar(consulta.nameOfficial ?? consulta.name)
  const tipo = tipoDeContribuyente({ ruc: consulta.fullRuc ?? consulta.ruc, nameOfficial: oficial, givenNames: consulta.givenNames, surnames: consulta.surnames })
  if (tipo === 'empresa') {
    return { tipo, nombres: '', apellidos: '', nombreCompleto: oficial, razonSocial: oficial }
  }
  let nombresCrudo = limpiar(consulta.givenNames)
  let apellidosCrudo = limpiar(consulta.surnames)
  if (!nombresCrudo || !apellidosCrudo) {
    if (oficial.includes(',')) {
      const corte = oficial.indexOf(',')
      apellidosCrudo = limpiar(oficial.slice(0, corte))
      nombresCrudo = limpiar(oficial.slice(corte + 1).replace(/,/g, ' '))
    } else {
      // Sin coma no se inventa el corte: todo el texto queda como nombre.
      nombresCrudo = oficial
      apellidosCrudo = ''
    }
  }
  const nombres = formatoTitulo(nombresCrudo)
  const apellidos = formatoTitulo(apellidosCrudo)
  return { tipo, nombres, apellidos, nombreCompleto: [nombres, apellidos].filter(Boolean).join(' '), razonSocial: oficial }
}
