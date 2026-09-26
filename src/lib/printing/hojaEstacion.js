import { escapeHtml } from '../../utils/printHtml.js'
import { estadoInventario } from '../../utils/inventario.js'
import { bateriaDe, gradoDe } from '../tallerRack.js'

// Hoja de estación del modo taller (#240 §4): lista imprimible de los equipos
// de un carril/estación para trabajar en el depósito (modelo, IMEI, estado,
// ubicación y los datos de la inspección cuando existan). HTML A4 sin
// dependencias del agente: se imprime con `printHtml`.
//
// - `buildStationSheetHtml(unidades, { estacion })`: una hoja (uso clásico).
// - `buildStationSheetsHtml(grupos, { fecha })`: **en serie**, una hoja por
//   estación en un solo documento (cada carril sale en su propia página).
export function buildStationSheetHtml(unidades = [], { estacion = 'Taller', fecha = new Date() } = {}) {
  return documentoDeHojas([{ estacion, unidades }], { fecha })
}

export function buildStationSheetsHtml(grupos = [], { fecha = new Date() } = {}) {
  const lista = (Array.isArray(grupos) ? grupos : [])
    .map(({ estacion, unidades } = {}) => ({ estacion: estacion || 'Taller', unidades: Array.isArray(unidades) ? unidades : [] }))
    .filter((grupo) => grupo.unidades.length)
  return documentoDeHojas(lista.length ? lista : [{ estacion: 'Taller', unidades: [] }], { fecha })
}

const fechaLarga = (fecha) => (fecha instanceof Date && !Number.isNaN(fecha.getTime())
  ? fecha.toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '')

function hojaDeEstacion({ estacion = 'Taller', unidades = [] } = {}, { fecha } = {}) {
  const filas = unidades.map((unit, indice) => {
    const nombre = unit?.product?.name || unit?.product?.nombre || 'Equipo'
    const estado = estadoInventario(unit)
    const ubicacion = unit?.location?.name || unit?.locationName || '—'
    const grado = gradoDe(unit)
    const bateria = bateriaDe(unit)
    const extras = [grado ? `Grado ${grado}` : '', bateria !== null ? `${bateria}% batería` : ''].filter(Boolean).join(' · ')
    return `<tr>
      <td class="n">${indice + 1}</td>
      <td><span class="modelo">${escapeHtml(nombre)}</span>${extras ? `<span class="extras">${escapeHtml(extras)}</span>` : ''}</td>
      <td class="imei">${escapeHtml(unit?.serial || '')}</td>
      <td>${escapeHtml(estado.label)}</td>
      <td>${escapeHtml(ubicacion)}</td>
    </tr>`
  }).join('')
  const fechaTexto = fechaLarga(fecha)

  return `<section class="hoja">
<div class="brand"><b>MobOS · Modo taller</b><span>${escapeHtml(estacion)}</span></div>
<h1>Equipos en preparación</h1>
<p class="meta">${unidades.length} equipo(s)${fechaTexto ? ` · ${escapeHtml(fechaTexto)}` : ''}</p>
<table><thead><tr><th>#</th><th>Modelo</th><th>IMEI / serial</th><th>Estado</th><th>Ubicación</th></tr></thead><tbody>${filas || '<tr><td colspan="5">Sin equipos en esta estación.</td></tr>'}</tbody>
<tfoot><tr><td colspan="5">Total: ${unidades.length} equipo(s) · Marcá cada uno al verificarlo.</td></tr></tfoot></table>
<footer><span>Hoja de estación generada por MobOS</span><span>Firma / control: ______________</span></footer>
</section>`
}

function documentoDeHojas(grupos, { fecha } = {}) {
  const hojas = grupos.map((grupo) => hojaDeEstacion(grupo, { fecha })).join('')
  const titulo = grupos.length === 1 ? `Hoja de estación · ${grupos[0].estacion}` : `Hojas de estación (${grupos.length})`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title><style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{margin:0;font:12px/1.45 ui-sans-serif,system-ui,sans-serif;color:#10161f}
.hoja{page-break-after:always}
.hoja:last-child{page-break-after:auto}
.brand{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #0c8876;padding-bottom:6px}
.brand b{font-size:15px;letter-spacing:-.01em}
.brand span{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#0c8876;font-weight:800}
h1{font-size:18px;margin:10px 0 2px}
.meta{color:#5b6570;font-size:11px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}
th{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#5b6570;text-align:left;border-bottom:1px solid #cfd6dd;padding:5px 6px}
td{border-bottom:1px solid #e6eaee;padding:5px 6px;vertical-align:top}
td.n{width:24px;color:#8b949e}
.modelo{display:block;font-weight:600}
.extras{display:block;font-size:9.5px;color:#5b6570}
.imei{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;white-space:nowrap}
tfoot td{border:0;padding-top:8px;font-weight:700}
footer{margin-top:14px;border-top:1px dashed #b6bec7;padding-top:6px;font-size:9.5px;color:#5b6570;display:flex;justify-content:space-between}
@media print{.hoja{margin:0}}
</style></head><body>${hojas}</body></html>`
}
