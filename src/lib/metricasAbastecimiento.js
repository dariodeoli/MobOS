// Abastecimiento F6 (#250) · lectura FIN del panel de métricas: costo real del
// proveedor, puntualidad de las rutas (CDE → Asunción incluida) y atrasos.
// Lógica pura y testeable; el panel solo la muestra.

/** Badge de puntualidad: verde ≥ 90 %, naranja ≥ 70 %, rojo debajo (gris sin dato). */
export function tonoPuntualidad(pct) {
  if (pct == null || pct === '' || !Number.isFinite(Number(pct))) return 'slate'
  const valor = Number(pct)
  if (valor >= 90) return 'green'
  if (valor >= 70) return 'orange'
  return 'red'
}

/** Resumen de compras de la ventana: monto, unidades y costo real por unidad. */
export function resumenDeCompras(proveedores = []) {
  const filas = Array.isArray(proveedores) ? proveedores : []
  const montoPyg = filas.reduce((suma, fila) => suma + (Number(fila?.costPyg) || 0), 0)
  const unidades = filas.reduce((suma, fila) => suma + (Number(fila?.unidades) || 0), 0)
  return { montoPyg, unidades, costoPromedioUnidadPyg: unidades ? Math.round(montoPyg / unidades) : null }
}

/**
 * Tiempo de las rutas que salen de CDE: promedio de días ponderado por lotes
 * (una ruta con más lotes pesa más) y puntualidad agregada. `null` si ninguna
 * ruta tuvo llegadas medidas.
 */
export function resumenDeRutaCde(rutas = []) {
  const medidas = (Array.isArray(rutas) ? rutas : []).filter((fila) => fila?.origen === 'CDE' && fila?.diasPromedio != null)
  const lotes = medidas.reduce((suma, fila) => suma + (Number(fila.lotes) || 0), 0)
  if (!lotes) return null
  const dias = medidas.reduce((suma, fila) => suma + Number(fila.diasPromedio) * (Number(fila.lotes) || 0), 0)
  const conEta = medidas.filter((fila) => fila?.enTiempoPct != null)
  const lotesConEta = conEta.reduce((suma, fila) => suma + (Number(fila.lotes) || 0), 0)
  const enTiempoPct = lotesConEta
    ? Math.round(conEta.reduce((suma, fila) => suma + Number(fila.enTiempoPct) * (Number(fila.lotes) || 0), 0) / lotesConEta)
    : null
  return { diasPromedio: Number((dias / lotes).toFixed(1)), lotes, enTiempoPct }
}
