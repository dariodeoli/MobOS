// Comprobante de verificación de IMEI (#203) para la nota/comprobante del
// cliente. Consume el dato de INV (#193/#200) tal como lo devuelve /api/imei.
// Reglas duras: solo estado, fecha y fuente; nunca costos, ids externos ni la
// respuesta cruda del proveedor; en demo se marca "simulada".

export const FUENTE_IMEI = 'IMEIcheck.net'

// Campos del proveedor que pueden mostrarse al cliente (hechos del equipo).
const CAMPOS_PUBLICOS = new Set(['blacklist', 'findMy', 'simLock', 'mdm', 'garantia', 'blacklistHistorial', 'usBlock'])

/** Máscara del IMEI: solo los últimos 4 dígitos (igual que el backend). */
export function enmascararImei(valor, visibles = 4) {
  const limpio = String(valor ?? '').replace(/\D/g, '')
  if (limpio.length <= visibles) return '•'.repeat(limpio.length)
  return `${'•'.repeat(limpio.length - visibles)}${limpio.slice(-visibles)}`
}

/** IMEI de 15 dígitos con dígito control (Luhn): el endpoint filtra por IMEI
 * solo cuando es válido, así que la ficha no consulta con seriales comunes. */
export function imeiValido(valor) {
  const imei = String(valor ?? '').replace(/\D/g, '')
  if (imei.length !== 15) return false
  let suma = 0
  for (let i = 0; i < 15; i += 1) {
    let digito = Number(imei[14 - i])
    if (i % 2 === 1) { digito *= 2; if (digito > 9) digito -= 9 }
    suma += digito
  }
  return suma % 10 === 0
}

const fechaTexto = (valor) => {
  const fecha = valor ? new Date(valor) : null
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleDateString('es-PY') : ''
}
const fechaHoraTexto = (valor) => {
  const fecha = valor ? new Date(valor) : null
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short', hour12: false }) : ''
}

/** Frase mínima y honesta según lo verificado (nunca "limpio" por defecto). */
export function detalleImei(consulta) {
  const campos = Array.isArray(consulta?.normalized) ? consulta.normalized : []
  const blacklist = campos.find((campo) => campo?.clave === 'blacklist' || campo?.clave === 'blacklistHistorial')
  const estado = String(consulta?.status || '')
  const fecha = fechaTexto(consulta?.resolvedAt || consulta?.requestedAt)
  if (estado === 'pendiente') return 'Consulta en curso: todavía no hay resultado'
  if (estado !== 'verificado' && estado !== 'parcial') return `No verificado${fecha ? ` (${fecha})` : ''}`
  const valor = String(blacklist?.valor ?? '').toLowerCase()
  if (valor.includes('sin reportes')) return `IMEI verificado: sin reportes${fecha ? ` al ${fecha}` : ''}`
  if (valor.includes('reportado')) return `IMEI verificado: con reportes${fecha ? ` al ${fecha}` : ''}`
  return `IMEI verificado${fecha ? ` al ${fecha}` : ''}`
}

/**
 * Resumen público de una consulta de /api/imei: lo que ve el cliente y lo que
 * se imprime. Sin costos ni datos internos.
 */
export function resumenImei(consulta = {}, { cliente = '' } = {}) {
  const campos = (Array.isArray(consulta.normalized) ? consulta.normalized : [])
    .filter((campo) => campo && CAMPOS_PUBLICOS.has(String(campo.clave)))
    .map((campo) => ({ etiqueta: campo.etiqueta || campo.clave, valor: campo.valor == null || campo.valor === '' ? 'Sin dato' : String(campo.valor) }))
  return {
    id: consulta.id || '',
    imei: enmascararImei(consulta.imei || ''),
    etiqueta: consulta.etiqueta || (consulta.status === 'verificado' ? 'Verificado' : 'No verificado'),
    estado: String(consulta.status || ''),
    fecha: consulta.resolvedAt || consulta.requestedAt || null,
    fechaTexto: fechaHoraTexto(consulta.resolvedAt || consulta.requestedAt),
    fuente: FUENTE_IMEI,
    simulado: consulta.esMock === true,
    detalle: detalleImei(consulta),
    campos,
    cliente,
  }
}

/** Texto que se adjunta a un comentario interno o a la nota pública. */
export function textoNota(resumen) {
  const simulado = resumen?.simulado ? ' (simulada en demo)' : ''
  const extra = Array.isArray(resumen?.campos) && resumen.campos.length
    ? ` · ${resumen.campos.map((campo) => `${campo.etiqueta}: ${campo.valor}`).join(' · ')}`
    : ''
  return `${resumen?.detalle || 'IMEI no verificado'} · fuente ${FUENTE_IMEI}${simulado}${extra}`
}

/** HTML A4 del comprobante (respaldo cuando no hay agente de impresión). */
export function htmlComprobanteImei(resumen, { tienda = '' } = {}) {
  // Escape: los valores vienen del proveedor y de la empresa; el documento se
  // abre para imprimir, así que no puede inyectar markup (#205).
  const escapar = (valor) => String(valor ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  const filas = (resumen?.campos || [])
    .map((campo) => `<tr><th>${escapar(campo.etiqueta)}</th><td>${escapar(campo.valor)}</td></tr>`)
    .join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Verificación de IMEI</title>
<style>@page{size:A4;margin:14mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;font-weight:600;color:#555;margin:0 0 16px}table{border-collapse:collapse;margin:16px 0;width:100%;max-width:460px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px}th{color:#555;font-weight:600;width:45%}.aviso{margin-top:16px;padding:8px 10px;border:1px solid #e0b400;background:#fff8e1;font-size:12px}.pie{margin-top:24px;font-size:11px;color:#777}@media print{body{margin:0;color:#000}th,td,h1,h2,.aviso,.pie{color:#000}.aviso{border-color:#000;background:#fff}}</style></head>
<body><h1>Verificación de IMEI</h1><h2>${escapar(tienda || resumen?.cliente || '')}</h2>
<table><tr><th>IMEI</th><td>${escapar(resumen?.imei || '—')}</td></tr><tr><th>Estado</th><td>${escapar(resumen?.etiqueta || 'No verificado')}</td></tr><tr><th>Detalle</th><td>${escapar(resumen?.detalle || '—')}</td></tr>${filas}<tr><th>Fecha</th><td>${escapar(resumen?.fechaTexto || '—')}</td></tr><tr><th>Fuente</th><td>${escapar(resumen?.fuente || FUENTE_IMEI)}</td></tr></table>
${resumen?.simulado ? '<p class="aviso">Simulada en demo: el resultado es ficticio y no consulta al proveedor.</p>' : ''}
<p class="pie">Comprobante informativo: no acredita propiedad ni reemplaza la verificación oficial del equipo. Documento no fiscal.</p></body></html>`
}

/** Consulta simulada para el demo (#194/#200): nunca sale del navegador. */
export function demoConsultaImei(imei) {
  const hora = new Date().toISOString()
  return {
    id: 'demo-imei-check',
    imei: enmascararImei(imei),
    status: 'verificado',
    etiqueta: 'Verificado',
    provider: 'imeicheck.net',
    serviceName: 'Apple Basic (demo)',
    normalized: [
      { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales', fuente: FUENTE_IMEI, hora },
      { clave: 'findMy', etiqueta: 'Find My / iCloud', valor: 'Apagado', fuente: FUENTE_IMEI, hora },
      { clave: 'simLock', etiqueta: 'SIM lock', valor: 'Liberado', fuente: FUENTE_IMEI, hora },
      { clave: 'garantia', etiqueta: 'Garantía', valor: 'Vencida', fuente: FUENTE_IMEI, hora: null },
    ],
    requestedAt: hora,
    resolvedAt: hora,
    esMock: true,
  }
}
