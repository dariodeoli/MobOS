// ── Coerción y formato ──────────────────────────────────────────────
export function num(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.-]/g, '')) : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function gs(v) {
  return 'Gs ' + Math.round(num(v)).toLocaleString('es-PY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

// Formato de entrada para guaraníes: solo enteros y separador de miles con
// puntos. El valor almacenado sigue siendo numérico, sin formato.
export function gsInput(v) {
  const digits = String(v ?? '').replace(/\D/g, '')
  return digits ? Number(digits).toLocaleString('es-PY') : ''
}

export function pct(v) {
  return Math.round(num(v) * 100) + '%'
}

// ── Fechas (clave YYYY-MM-DD en hora local) ─────────────────────────
export function fechaClave(d = new Date()) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function claveAyer() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return fechaClave(d)
}

function lunesDeEstaSemana() {
  const d = new Date()
  const dow = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - dow)
  return fechaClave(d)
}

function primerDiaDelMes() {
  const d = new Date()
  return fechaClave(new Date(d.getFullYear(), d.getMonth(), 1))
}

function primerDiaDelAnio() {
  const d = new Date()
  return fechaClave(new Date(d.getFullYear(), 0, 1))
}

// Devuelve la clave "desde" según el período pedido.
export function desdeDePeriodo(periodo) {
  switch (periodo) {
    case 'dia':
      return fechaClave()
    case 'semana':
      return lunesDeEstaSemana()
    case 'mes':
      return primerDiaDelMes()
    case 'anio':
      return primerDiaDelAnio()
    default:
      return fechaClave()
  }
}

// ── Filtros sobre ventas ────────────────────────────────────────────
// Cada venta: { vendedorId, fecha (YYYY-MM-DD), precio, ... }
export function ventasDelDia(ventas, clave = fechaClave(), vendedorId = null) {
  return ventas.filter(
    (v) => v.fecha === clave && (vendedorId == null || v.vendedorId === vendedorId),
  )
}

export function ventasDeRango(ventas, desde, vendedorId = null) {
  return ventas.filter(
    (v) => v.fecha >= desde && (vendedorId == null || v.vendedorId === vendedorId),
  )
}

export function sumaPrecios(ventas) {
  return ventas.reduce((acc, v) => acc + num(v.precio), 0)
}

// ── Totales para el tablero ─────────────────────────────────────────
export function totalesVendedor(ventas, vendedorId) {
  const hoy = sumaPrecios(ventasDelDia(ventas, fechaClave(), vendedorId))
  const ayer = sumaPrecios(ventasDelDia(ventas, claveAyer(), vendedorId))
  const semana = sumaPrecios(ventasDeRango(ventas, lunesDeEstaSemana(), vendedorId))
  const mes = sumaPrecios(ventasDeRango(ventas, primerDiaDelMes(), vendedorId))
  return { hoy, ayer, semana, mes }
}

export function totalesTienda(ventas) {
  return totalesVendedor(ventas, null)
}

// ── Semáforo: hoy vs ayer (la venta de ayer es la meta) ─────────────
export function semaforo(hoy, ayer) {
  // Sin referencia de ayer: arrancamos en neutro hasta que haya con qué comparar.
  if (ayer <= 0) {
    return {
      estado: hoy > 0 ? 'verde' : 'neutro',
      meta: 0,
      falta: 0,
      superado: hoy > 0,
    }
  }
  const superado = hoy >= ayer
  return {
    estado: superado ? 'verde' : 'rojo',
    meta: ayer,
    falta: Math.max(0, ayer - hoy),
    superado,
  }
}

// ── Comisión: monto fijo por producto vendido ───────────────────────
// productosById: { [id]: { comision } }
export function comisionDeVentas(ventas, productosById) {
  return ventas.reduce((acc, v) => {
    const p = productosById[v.productoId]
    // Comisión "foto" de la venta; fallback a la comisión actual del producto.
    return acc + num(v.comision ?? p?.comision)
  }, 0)
}

// ── Ganancia: ingresos − costos − gastos − ads ──────────────────────
// Por período (dia/semana/mes/anio).
export function calcularGanancia(periodo, { ventas, gastos, ads, prodsById }) {
  const desde = desdeDePeriodo(periodo)
  const vs = ventasDeRango(ventas, desde)
  const gs_ = gastos.filter((g) => g.fecha >= desde)
  const ads_ = ads.filter((a) => a.fecha >= desde)

  const ingresos = sumaPrecios(vs)
  // Preferimos el costo "foto" guardado en la venta; si no existe (ventas
  // viejas), caemos al costo actual del producto.
  const costoMercaderia = vs.reduce(
    (acc, v) => acc + num(v.precioCosto ?? prodsById[v.productoId]?.precioCosto),
    0,
  )
  const totalGastos = gs_.reduce((acc, g) => acc + num(g.monto), 0)
  const totalAds = ads_.reduce((acc, a) => acc + num(a.monto), 0)
  const ganancia = ingresos - costoMercaderia - totalGastos - totalAds

  return {
    ingresos,
    costoMercaderia,
    totalGastos,
    totalAds,
    ganancia,
    estado: ganancia > 0 ? 'ganancia' : ganancia < 0 ? 'perdida' : 'empate',
    cantVentas: vs.length,
  }
}

// ── Ganancia de un solo día (clave YYYY-MM-DD) ──────────────────────
// Mismo cálculo que calcularGanancia pero filtrando por fecha exacta.
export function calcularGananciaDia(clave, { ventas, gastos, ads, prodsById }) {
  const vs = ventas.filter((v) => v.fecha === clave)
  const ingresos = sumaPrecios(vs)
  const costoMercaderia = vs.reduce(
    (acc, v) => acc + num(v.precioCosto ?? prodsById[v.productoId]?.precioCosto),
    0,
  )
  const totalGastos = gastos
    .filter((g) => g.fecha === clave)
    .reduce((acc, g) => acc + num(g.monto), 0)
  const totalAds = ads.filter((a) => a.fecha === clave).reduce((acc, a) => acc + num(a.monto), 0)
  const ganancia = ingresos - costoMercaderia - totalGastos - totalAds
  const sinDatos = vs.length === 0 && totalGastos === 0 && totalAds === 0
  return {
    ingresos,
    costoMercaderia,
    totalGastos,
    totalAds,
    ganancia,
    estado: sinDatos ? 'vacio' : ganancia > 0 ? 'ganancia' : ganancia < 0 ? 'perdida' : 'empate',
    cantVentas: vs.length,
  }
}

// ── Productos ganadores por período ─────────────────────────────────
export function productosGanadores(periodo, ventas, prodsById, limite = 5) {
  const desde = desdeDePeriodo(periodo)
  const vs = ventasDeRango(ventas, desde)
  const acc = {}
  vs.forEach((v) => {
    if (!acc[v.productoId]) acc[v.productoId] = { cantidad: 0, monto: 0 }
    acc[v.productoId].cantidad += 1
    acc[v.productoId].monto += num(v.precio)
  })
  return Object.entries(acc)
    .map(([id, d]) => ({
      id,
      nombre: prodsById[id]?.nombre || 'Producto',
      ...d,
    }))
    .sort((a, b) => b.cantidad - a.cantidad || b.monto - a.monto)
    .slice(0, limite)
}
