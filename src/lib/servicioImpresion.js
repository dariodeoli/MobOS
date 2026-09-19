// Impresos de Servicio Técnico: hoja de recepción (A4 en dos mitades o 80 mm) y
// reporte técnico. Son funciones puras que devuelven HTML, igual que el
// comprobante de venta: quien las usa decide dónde imprimirlas.

import { CHECKLISTS, ESTADO_FISICO, PRUEBAS_EJECUTADAS, TEXTO_LEGAL_CONFORMIDAD, TEXTO_LEGAL_DESLINDE, TEXTO_LEGAL_RECEPCION } from './servicioChecklist.js'

const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[caracter]))
const fecha = (valor) => (valor ? new Date(valor).toLocaleDateString('es-PY') : '—')
const gs = (valor) => `Gs. ${Number(valor || 0).toLocaleString('es-PY')}`

// Dibujo compacto con los puntos numerados que se corresponden con el checklist.
export function esquemaSvg(tipo) {
  const puntos = CHECKLISTS[tipo] || CHECKLISTS.Otros
  const marcas = puntos.slice(0, 8).map((_punto, indice) => {
    const x = 74 + (indice % 4) * 18
    const y = 18 + Math.floor(indice / 4) * 96
    return `<g><circle cx="${x}" cy="${y}" r="7" fill="#fff" stroke="#0b1822" stroke-width="1"/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="8" font-family="Arial" fill="#0b1822">${indice + 1}</text></g>`
  }).join('')
  return `<svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="Esquema del equipo">
    <rect x="46" y="10" width="58" height="120" rx="12" fill="none" stroke="#0b1822" stroke-width="2"/>
    <rect x="52" y="20" width="46" height="96" rx="4" fill="none" stroke="#0b1822" stroke-width="1"/>
    <rect x="62" y="13" width="26" height="4" rx="2" fill="#0b1822"/>
    <circle cx="75" cy="124" r="4" fill="none" stroke="#0b1822" stroke-width="1"/>
    ${marcas}
  </svg>`
}

const filasChecklist = (order) => {
  const tipo = order.deviceType || 'iPhone'
  const marcados = order.checklist && typeof order.checklist === 'object' ? order.checklist : {}
  const puntos = CHECKLISTS[tipo] || CHECKLISTS.Otros
  return puntos.map((punto) => `<tr><td class="chk">${marcados[punto] ? '☑' : '☐'}</td><td>${escapar(punto)}</td></tr>`).join('')
}

const filasEstado = (estado = {}) => ESTADO_FISICO.map((punto) => `<tr><td>${escapar(punto)}</td><td class="chk">${estado[punto] === true ? 'SI ☑' : estado[punto] === false ? 'NO ☑' : 'SI ☐ &nbsp; NO ☐'}</td></tr>`).join('')

const bloqueDatos = (order) => `
  <table class="datos">
    <tr><td class="label">Modelo</td><td>${escapar(order.device)}</td><td class="label">Fecha</td><td>${fecha(order.receivedAt || order.createdAt)}</td></tr>
    <tr><td class="label">Correo</td><td>${escapar(order.customerEmail || '')}</td><td class="label">Precio</td><td>${gs(order.pricePyg)}</td></tr>
    <tr><td class="label">Contraseña / código</td><td>${escapar(order.unlockCode || '')}${order.unlockPattern?.length ? ` · patrón ${escapar(order.unlockPattern.join('-'))}` : ''}</td><td class="label">Código / serie</td><td>${escapar(order.serial || '')}</td></tr>
    <tr><td class="label">Cliente</td><td>${escapar(order.customerName)}</td><td class="label">Orden</td><td>${escapar(order.serviceNumber || '')}</td></tr>
  </table>`

const cierreLegal = () => `
  <p class="legal">${escapar(TEXTO_LEGAL_DESLINDE)}</p>
  <p class="legal">${escapar(TEXTO_LEGAL_CONFORMIDAD)}</p>
  <table class="firmas"><tr><td>CLIENTE: ______________________</td><td>C.I.: ______________</td><td>Nº CELULAR: ______________</td><td>FIRMA: ____________</td></tr></table>`

const pie = (empresa = {}) => `<p class="pie">${escapar(empresa.nombre || '')}${empresa.sucursal ? ` · ${escapar(empresa.sucursal)}` : ''}${empresa.telefono ? ` · Tel. ${escapar(empresa.telefono)}` : ''}${empresa.web ? ` · ${escapar(empresa.web)}` : ''} · Delivery gratuito</p>`

const estilos = (thermal) => `
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#0b1822;margin:0;padding:${thermal ? '6px' : '18px'};font-size:${thermal ? '11px' : '12px'}}
  .mitad{${thermal ? '' : 'page-break-after:always;min-height:46vh;padding-bottom:10px;border-bottom:1px dashed #999;'}margin-bottom:10px}
  .mitad:last-child{page-break-after:auto;border-bottom:none}
  h1{font-size:${thermal ? '13px' : '15px'};margin:0 0 4px}
  .aviso{font-weight:bold;font-size:${thermal ? '10px' : '11px'};border:2px solid #0b1822;padding:6px;margin:6px 0}
  .datos{width:100%;border-collapse:collapse;margin:6px 0}
  .datos td{border:1px solid #0b1822;padding:3px 5px}
  .datos .label{background:#eee;font-weight:bold;width:${thermal ? '26%' : '18%'}}
  .cuerpo{display:flex;gap:10px;align-items:flex-start}
  table.chk{border-collapse:collapse;width:100%}
  table.chk td{border:1px solid #999;padding:2px 5px}
  td.chk{width:18px;text-align:center;font-size:14px}
  .legal{font-size:${thermal ? '9px' : '10px'};text-align:justify;margin:6px 0}
  .obs{border-bottom:1px dotted #444;height:14px;margin:5px 0}
  .firmas{width:100%;margin-top:10px;font-size:${thermal ? '9px' : '10px'}}
  .pie{margin-top:8px;font-size:${thermal ? '9px' : '10px'};text-align:center;color:#444}
  @media print{ .mitad{break-inside:avoid} }
  ${thermal ? '@page{size:80mm auto;margin:4mm}' : '@page{size:A4;margin:12mm}'}`

function half(order, empresa, logoUrl) {
  return `<div class="mitad">
    ${logoUrl ? `<img src="${escapar(logoUrl)}" alt="" style="max-height:42px;max-width:150px;object-fit:contain" />` : ''}
    <h1>${escapar(empresa.nombre || 'Servicio Técnico')} · ORDEN DE SERVICIO Nº ${escapar(order.serviceNumber || '')}</h1>
    <p class="aviso">${escapar(TEXTO_LEGAL_RECEPCION)}</p>
    ${bloqueDatos(order)}
    <div class="cuerpo">
      ${esquemaSvg(order.deviceType || 'iPhone')}
      <table class="chk">${filasChecklist(order)}</table>
    </div>
    <p style="margin:6px 0 2px"><b>Estado físico</b></p>
    <table class="chk"><tbody>${filasEstado(order.estadoFisico)}</tbody></table>
    <p style="margin:6px 0 2px"><b>Observaciones</b></p>
    <div class="obs"></div><div class="obs"></div><div class="obs"></div>
    ${cierreLegal()}
    ${pie({ ...empresa })}
  </div>`
}

export function buildServiceIntakeHtml(order, { empresa = {}, logoUrl = '', format = 'a4' } = {}) {
  const thermal = format === 'thermal'
  const mitades = thermal ? half(order, empresa, logoUrl) : half(order, empresa, logoUrl) + half(order, empresa, logoUrl)
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recepción ${escapar(order.serviceNumber || '')}</title><style>${estilos(thermal)}</style></head><body>${mitades}</body></html>`
}

export function buildServiceReportHtml(order, { empresa = {}, logoUrl = '' } = {}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte técnico ${escapar(order.serviceNumber || '')}</title><style>${estilos(true)}
    .b{border:1px solid #0b1822;padding:6px;margin:4px 0}
    .t{background:#eee;font-weight:bold;padding:3px 5px;border-bottom:1px solid #0b1822}
  </style></head><body>
    ${logoUrl ? `<img src="${escapar(logoUrl)}" alt="" style="max-height:40px;max-width:150px;object-fit:contain" />` : ''}
    <h1>REPORTE TÉCNICO · ORDEN ${escapar(order.serviceNumber || '')}</h1>
    <div class="b"><div class="t">Información del cliente</div>Código: ${escapar(order.customerId || order.id)}<br>Nombre: ${escapar(order.customerName)}<br>Teléfono: ${escapar(order.customerPhone || '')} · Email: ${escapar(order.customerEmail || '')}</div>
    <div class="b"><div class="t">Información del producto</div>IMEI/Serie: ${escapar(order.serial || '')}<br>Modelo: ${escapar(order.device)}${order.serviceName ? ` · ${escapar(order.serviceName)}` : ''}<br>Estado del servicio: ${escapar(order.status || '')}</div>
    <div class="b"><div class="t">Informe técnico</div>
      <b>Prob. notificado:</b> ${escapar(order.reportedIssue || '—')}<br>
      <b>Prob. constatado:</b> ${escapar(order.diagnosis || '—')}<br>
      <b>Estado físico:</b> ${escapar(ESTADO_FISICO.filter((punto) => order.estadoFisico?.[punto] === true).join(', ') || 'Sin marcar')}<br>
      <b>Pruebas ejecutadas:</b> ${escapar((order.pruebas?.length ? order.pruebas : PRUEBAS_EJECUTADAS).join(', '))}<br>
      <b>Informe:</b> ${escapar(order.diagnosis || order.notes || '—')}<br>
      <b>Solución propuesta:</b> ${escapar(order.solucion || 'A definir con el cliente')}<br>
      <b>Observaciones:</b> ${escapar(order.notes || 'Ninguna')}
    </div>
    ${cierreLegal()}
    ${pie(empresa)}
  </body></html>`
}

// La orden que devuelve el API (con `desbloqueo` y `checklist`) se normaliza al
// formato de los impresos: un solo lugar donde se decide qué se imprime.
export function ordenParaImpresion(row = {}) {
  const desbloqueo = row.desbloqueo || {}
  const checklist = row.checklist && typeof row.checklist === 'object' ? row.checklist : {}
  const estadoFisico = {}
  for (const punto of ESTADO_FISICO) if (typeof checklist[punto] === 'boolean') estadoFisico[punto] = checklist[punto]
  return {
    ...row,
    deviceType: row.deviceType || (row.serviceName || '').split(' · ')[0] || 'iPhone',
    customerEmail: row.customerEmail || '',
    unlockCode: desbloqueo.pin || '',
    unlockPattern: Array.isArray(desbloqueo.patron) ? desbloqueo.patron : [],
    estadoFisico,
  }
}
