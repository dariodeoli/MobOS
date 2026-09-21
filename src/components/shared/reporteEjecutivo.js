import { gs } from '@/utils/calculos'
import { fechaHora } from '@/utils/fecha'
import { printHtml, escapeHtml } from '@/utils/printHtml'
import { APP_NAME } from '@/lib/brand'
import { getLogoDataUrl } from '@/lib/tenantLogo'

const fechaCorta = (valor) => (valor ? new Date(valor).toLocaleDateString('es-PY') : '')
const variacion = (hoy, antes) => (antes > 0 ? ((hoy - antes) / antes) * 100 : null)

// Resumen ejecutivo imprimible (#146): UNA hoja A4 equilibrada, con los mismos
// números que la pantalla (`armarResumenDia`) y lectura garantizada en color y
// en blanco y negro (tramas + contraste, sin depender del verde).
export async function buildResumenEjecutivoHtml(resumen = {}) {
  const logo = await getLogoDataUrl().catch(() => '')
  const top = Array.isArray(resumen.topProductos) ? resumen.topProductos : []
  const medios = Array.isArray(resumen.medios) ? resumen.medios : []
  const serie = Array.isArray(resumen.serie) ? resumen.serie : []
  const stock = Array.isArray(resumen.stockBajo) ? resumen.stockBajo : []
  const creditos = resumen.creditos || null

  const etiqueta = resumen.etiqueta || `${fechaCorta(resumen.rango?.desde)} a ${fechaCorta(resumen.rango?.hasta)}`
  const total = Number(resumen.total) || 0
  const cobrado = Number(resumen.cobrado) || 0
  const pendiente = Number(resumen.pendiente) || 0
  const pctCobrado = total > 0 ? Math.min(100, (cobrado / total) * 100) : 0
  const pctPendiente = Math.max(0, 100 - pctCobrado)
  const delta = variacion(total, Number(resumen.totalAnt) || 0)
  const gastos = Number(resumen.gastos) || 0
  const costoMercaderia = Number(resumen.costoMercaderia) || 0
  const ganancia = Number(resumen.ganancia) || 0
  const descuentos = Number(resumen.descuentos) || 0
  const sinCosto = resumen.sinCosto || { lineas: 0, monto: 0 }
  const ventasConDescuento = (Array.isArray(resumen.act) ? resumen.act : []).filter((venta) => Number(venta.discountPyg) > 0 || (Array.isArray(venta.items) && venta.items.some((item) => Number(item.discountPyg) > 0))).length

  // ── Gráfico de ventas por día (barras sólidas, legibles en B/N) ─────
  const maxSerie = Math.max(...serie.map(([, valor]) => Number(valor) || 0), 1)
  const salto = Math.max(1, Math.ceil(serie.length / 12))
  const barras = serie.map(([fecha, valor], indice) => {
    const alto = Math.max(1.2, Math.round(((Number(valor) || 0) / maxSerie) * 260) / 10)
    const etiqueta = indice % salto === 0 || indice === serie.length - 1 ? `<span class="dia">${fecha.slice(8)}</span>` : '<span class="dia"></span>'
    return `<div class="barra"><span class="valor">${Number(valor) === maxSerie ? gs(valor) : ''}</span><span class="columna" style="height:${alto}mm"></span>${etiqueta}</div>`
  }).join('')
  const mejor = serie.reduce((mejor, fila) => (Number(fila[1]) > Number(mejor[1]) ? fila : mejor), ['', 0])

  // ── Cobros por medio de pago (trama: se distingue sin color) ───────
  const maxMedio = Math.max(...medios.map((medio) => Number(medio.monto) || 0), 1)
  const pagos = medios.slice(0, 6).map((medio) => `
    <div class="pago">
      <div class="fila"><span class="nombre">${escapeHtml(medio.medio || '—')}</span><span class="monto">${escapeHtml(gs(medio.monto))} · ${Math.round(Number(medio.pct) || 0)}%</span></div>
      <div class="track"><span class="fill" style="width:${Math.max(2, Math.round(((Number(medio.monto) || 0) / maxMedio) * 100))}%"></span></div>
    </div>`).join('')

  const productos = top.slice(0, 6).map((producto) => `<tr><td>${escapeHtml(producto.nombre || 'Producto')}</td><td class="num">${escapeHtml(String(producto.cantidad))}</td><td class="num">${escapeHtml(gs(producto.montoPyg))}</td></tr>`).join('')
  const reponer = stock.slice(0, 4).map((producto) => {
    const unidades = Number(producto.stock) || 0
    return `<tr><td>${escapeHtml(producto.nombre || 'Producto')}</td><td class="num">${unidades <= 0 ? 'sin stock' : `${unidades} u.`}</td></tr>`
  }).join('')

  const alertas = [
    pendiente > 0 && `<b>${escapeHtml(gs(pendiente))}</b> facturado y todavía no cobrado (${escapeHtml(String(resumen.sinPagar ?? 0))} ${Number(resumen.sinPagar) === 1 ? 'venta' : 'ventas'} pendientes).`,
    Number(sinCosto.lineas) > 0 && `<b>${escapeHtml(String(sinCosto.lineas))} ${Number(sinCosto.lineas) === 1 ? 'línea' : 'líneas'}</b> sin costo cargado (${escapeHtml(gs(sinCosto.monto))}): el margen es provisorio.`,
    creditos && Number(creditos.overduePyg) > 0 && `<b>${escapeHtml(gs(creditos.overduePyg))}</b> de créditos vencidos por cobrar (${escapeHtml(String(creditos.overdueCustomers ?? 0))} ${Number(creditos.overdueCustomers) === 1 ? 'cliente' : 'clientes'}).`,
  ].filter(Boolean)

  const kpi = (label, valor, nota, destacado = false) => `<div class="kpi${destacado ? ' destacado' : ''}"><span class="l">${escapeHtml(label)}</span><span class="v">${escapeHtml(valor)}</span>${nota ? `<span class="n">${nota}</span>` : ''}</div>`

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen ejecutivo</title><style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; }
body { font: 9.5px/1.35 -apple-system, 'Segoe UI', system-ui, sans-serif; color: #111; }
.page { display: flex; flex-direction: column; gap: 3.8mm; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6mm; border-bottom: 1.6pt solid #111; padding-bottom: 2.4mm; }
.head .marca { display: flex; align-items: center; gap: 3mm; min-width: 0; }
.head img { height: 10mm; max-width: 34mm; object-fit: contain; }
.head h1 { font-size: 15px; margin: 0; letter-spacing: -.02em; }
.head .sub { color: #333; font-size: 9px; margin-top: .8mm; }
.head .meta { text-align: right; font-size: 8px; color: #333; line-height: 1.5; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.4mm; }
.kpi { border: .8pt solid #9a9a9a; border-radius: 1.6mm; padding: 2.2mm 2.4mm; min-width: 0; }
.kpi.destacado { border-color: #111; background: #f0f0f0; }
.kpi .l { display: block; font-size: 7px; text-transform: uppercase; letter-spacing: .09em; color: #444; }
.kpi .v { display: block; font-size: 15px; font-weight: 700; margin-top: .8mm; font-variant-numeric: tabular-nums; white-space: nowrap; }
.kpi .n { display: block; font-size: 7.5px; color: #555; margin-top: .6mm; }
.barra-cobro { display: flex; height: 5.6mm; border: .9pt solid #111; border-radius: 1.2mm; overflow: hidden; margin-top: 1.4mm; }
.barra-cobro .cobrado { background: #1b6b46; }
.barra-cobro .pendiente { background-image: repeating-linear-gradient(45deg, #111 0 1.1mm, #fff 1.1mm 2.3mm); }
.leyenda { display: flex; flex-wrap: wrap; gap: 5mm; font-size: 8px; color: #222; margin-top: 1.2mm; }
.leyenda i { display: inline-block; width: 3.2mm; height: 3.2mm; border: .6pt solid #111; vertical-align: -.5mm; margin-right: 1.2mm; }
.card { border: .8pt solid #b5b5b5; border-radius: 1.6mm; padding: 2.4mm; min-width: 0; }
.card h2 { font-size: 8px; text-transform: uppercase; letter-spacing: .09em; margin: 0 0 1.6mm; color: #222; border-bottom: .7pt solid #b5b5b5; padding-bottom: .9mm; }
.grid2 { display: grid; grid-template-columns: 1.1fr .9fr; gap: 3.2mm; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3.2mm; }
.grafico { display: flex; align-items: flex-end; justify-content: center; gap: .8mm; height: 36mm; margin-top: .6mm; }
.barra { flex: 1 1 8mm; max-width: 14mm; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; min-width: 0; }
.barra .valor { font-size: 6.5px; color: #333; height: 2.6mm; white-space: nowrap; }
.barra .columna { width: 100%; background: #333; border: .5pt solid #111; border-bottom: 0; }
.barra .dia { font-size: 6.5px; color: #444; margin-top: .6mm; height: 3mm; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 7px; text-transform: uppercase; letter-spacing: .06em; color: #444; border-bottom: .6pt solid #bbb; padding: 0 0 .7mm; }
td { padding: .8mm 0; border-bottom: .4pt dotted #c9c9c9; font-variant-numeric: tabular-nums; }
tr:last-child td { border-bottom: 0; }
td.num, th.num { text-align: right; white-space: nowrap; }
.pago { margin-bottom: 1.5mm; }
.pago .fila { display: flex; justify-content: space-between; gap: 2mm; font-size: 8.5px; }
.pago .nombre { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pago .monto { white-space: nowrap; font-weight: 600; }
.track { height: 2.6mm; border: .6pt solid #999; border-radius: .8mm; overflow: hidden; margin-top: .6mm; }
.track .fill { display: block; height: 100%; background-image: repeating-linear-gradient(90deg, #444 0 1mm, #bbb 1mm 2mm); }
.lista { margin: 0; padding: 0; list-style: none; }
.lista li { display: flex; justify-content: space-between; gap: 2mm; padding: .8mm 0; border-bottom: .4pt dotted #c9c9c9; }
.lista li:last-child { border-bottom: 0; }
.lista .k { color: #333; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lista .v { font-weight: 600; white-space: nowrap; }
.lista .total { border-top: .8pt solid #111; border-bottom: 0; margin-top: .6mm; padding-top: 1.2mm; font-size: 10.5px; }
.lista .total .v { font-weight: 700; }
.ganancia { font-size: 12px; }
.nota { font-size: 7.5px; color: #555; margin-top: 1.2mm; }
.alerta { border: .9pt solid #111; border-left: 2.6mm solid #333; border-radius: 1.2mm; padding: 2mm 2.6mm; }
.alerta h2 { font-size: 8px; text-transform: uppercase; letter-spacing: .09em; margin: 0 0 1.2mm; }
.alerta ul { margin: 0; padding-left: 4mm; }
.alerta li { margin-bottom: .6mm; }
.pie { display: flex; justify-content: space-between; gap: 4mm; border-top: .6pt solid #999; padding-top: 1.4mm; font-size: 7.5px; color: #555; }
@media print { .page { break-inside: avoid; } }
</style></head><body><div class="page">

  <header class="head">
    <div class="marca">
      ${logo ? `<img src="${logo}" alt="">` : ''}
      <div>
        <h1>${escapeHtml(resumen.empresa || APP_NAME)}</h1>
        <div class="sub">Resumen ejecutivo · ${escapeHtml(etiqueta)}</div>
      </div>
    </div>
    <div class="meta">
      Generado ${escapeHtml(fechaHora(new Date()))}<br>
      Documento de control interno · no es comprobante fiscal
    </div>
  </header>

  <section class="kpis">
    ${kpi('Ventas', String(resumen.ventas ?? 0), `${resumen.pagadas ?? 0} pagadas · ${resumen.sinPagar ?? 0} pendientes`)}
    ${kpi('Facturado', gs(total), delta === null ? 'Sin período anterior para comparar' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}% vs período anterior`, true)}
    ${kpi('Cobrado', gs(cobrado), `${Math.round(pctCobrado)}% del facturado`)}
    ${kpi('Pendiente', gs(pendiente), `${Math.round(pctPendiente)}% por cobrar`)}
  </section>

  <div class="barra-cobro" role="img" aria-label="Cobrado ${escapeHtml(gs(cobrado))} contra pendiente ${escapeHtml(gs(pendiente))}">
    <span class="cobrado" style="width:${pctCobrado.toFixed(1)}%"></span>
    <span class="pendiente" style="width:${pctPendiente.toFixed(1)}%"></span>
  </div>
  <div class="leyenda">
    <span><i style="background:#1b6b46"></i>Cobrado ${escapeHtml(gs(cobrado))}</span>
    <span><i style="background-image:repeating-linear-gradient(45deg,#111 0 1.1mm,#fff 1.1mm 2.3mm)"></i>Pendiente ${escapeHtml(gs(pendiente))}</span>
    <span>Ticket promedio ${escapeHtml(gs(resumen.ticket))}</span>
  </div>

  <section class="card">
    <h2>Ventas por día${mejor[0] ? ` · mejor día ${escapeHtml(mejor[0].slice(8))}/${escapeHtml(mejor[0].slice(5, 7))} con ${escapeHtml(gs(mejor[1]))}` : ''}</h2>
    ${serie.length ? `<div class="grafico">${barras}</div>` : '<p class="nota">Sin ventas en el período.</p>'}
  </section>

  <div class="grid2">
    <section class="card">
      <h2>Cobros por medio de pago</h2>
      ${pagos || '<p class="nota">Sin cobros en el período.</p>'}
      <ul class="lista">
        <li class="total"><span class="k">Total cobrado</span><span class="v">${escapeHtml(gs(cobrado))}</span></li>
      </ul>
    </section>
    <section class="card">
      <h2>Productos principales</h2>
      <table>
        <thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Monto</th></tr></thead>
        <tbody>${productos || '<tr><td colspan="3" class="nota">Sin ventas en el período.</td></tr>'}</tbody>
      </table>
    </section>
  </div>

  <div class="grid3">
    <section class="card">
      <h2>Rentabilidad estimada</h2>
      <ul class="lista">
        <li><span class="k">Facturado</span><span class="v">${escapeHtml(gs(total))}</span></li>
        <li><span class="k">− Costo de mercadería</span><span class="v">${escapeHtml(gs(costoMercaderia))}</span></li>
        <li><span class="k">− Gastos del período</span><span class="v">${escapeHtml(gs(gastos))}</span></li>
        <li class="total"><span class="k">${ganancia >= 0 ? 'Ganancia' : 'Pérdida'}</span><span class="v ganancia">${escapeHtml(gs(Math.abs(ganancia)))}</span></li>
      </ul>
      ${Number(sinCosto.lineas) > 0 ? `<p class="nota">Provisoria: ${escapeHtml(String(sinCosto.lineas))} ${Number(sinCosto.lineas) === 1 ? 'línea' : 'líneas'} sin costo cargado.</p>` : ''}
      <p class="nota">El detalle con publicidad está en Análisis → Ganancias.</p>
    </section>
    <section class="card">
      <h2>Descuentos y envíos</h2>
      <ul class="lista">
        <li><span class="k">Descuentos otorgados</span><span class="v">${escapeHtml(gs(descuentos))}</span></li>
        <li><span class="k">Ventas con descuento</span><span class="v">${escapeHtml(String(ventasConDescuento))}</span></li>
        <li><span class="k">% del facturado</span><span class="v">${total > 0 ? ((descuentos / total) * 100).toFixed(1) : '0.0'}%</span></li>
        <li><span class="k">Comisiones</span><span class="v">${escapeHtml(gs(resumen.comision))}</span></li>
        <li><span class="k">Envíos cobrados</span><span class="v">${escapeHtml(gs(resumen.delivery))}</span></li>
      </ul>
    </section>
    <section class="card">
      <h2>Stock a reponer (≤ 3 u.)</h2>
      <table><tbody>${reponer || '<tr><td class="nota">Sin productos en el umbral.</td></tr>'}</tbody></table>
      <ul class="lista"><li><span class="k">Productos en alerta</span><span class="v">${escapeHtml(String(stock.length))}</span></li></ul>
    </section>
  </div>

  <section class="alerta">
    <h2>Conciliación</h2>
    ${alertas.length ? `<ul>${alertas.map((alerta) => `<li>${alerta}</li>`).join('')}</ul>` : '<p class="nota">Sin diferencias: el período está cobrado y con costos completos.</p>'}
    <p class="nota">Facturado ${escapeHtml(gs(total))} − cobrado ${escapeHtml(gs(cobrado))} = ${escapeHtml(gs(pendiente))}. La conciliación de caja (esperado vs contado) vive en el cierre de caja.</p>
  </section>

  <footer class="pie">
    <span>Generado por ${escapeHtml(APP_NAME)} · ${escapeHtml(resumen.empresa || '')}</span>
    <span>Período ${escapeHtml(etiqueta)}</span>
  </footer>

</div></body></html>`
  return html
}

export async function printResumenEjecutivo(resumen) {
  return printHtml(await buildResumenEjecutivoHtml(resumen))
}
