// Historial de ventas del modo demo (#451): ~120 días de movimiento con ritmo
// realista (más ventas viernes y sábado, picos de quincena alrededor del 1 y el
// 15) para que los gráficos de 30/90 días estén llenos. Determinista: la misma
// semilla y el mismo `hoy` producen exactamente las mismas ventas. Datos
// ficticios de Paraguay en guaraníes; los IMEI salen de `imeiDemo`.
//
// Cada venta usa la forma canónica de `VENTAS_DEMO` y cumple: total = líneas +
// delivery, y pagos + saldo = total (el saldo es lo que no se cobró).
import { CATALOGO_VENTA } from './catalogoPro.js'
import { imeiDemo } from './iphones.js'
import { diaDemo } from './reloj.js'

const SEMILLA = 451
export const DIAS_HISTORIAL = 120
const PRIMER_NUMERO = 16 // AUR-0001..0015 son las ventas manuales de `VENTAS_DEMO`.
const COTIZACION_USD = 7300

function mulberry32(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Vendedores con volúmenes distintos (suman 1).
export const VENDEDORES_PESO = [
  ['demo-user-vendedor', 0.32],
  ['demo-user-vendedora', 0.27],
  ['demo-user-gerente', 0.17],
  ['demo-user', 0.16],
  ['demo-user-cajera', 0.08],
]

// Clientes minoristas y mayoristas (los mayoristas compran por volumen y a crédito).
export const CLIENTES_MINORISTAS = [
  ['demo-cliente-maria', 'María González'], ['demo-cliente-juan', 'Juan Pereira'], ['demo-cliente-ana', 'Ana Villalba'],
  ['demo-cliente-estela', 'Estela Ramírez'], ['demo-cliente-fernando', 'Fernando Ortellado'], ['demo-cliente-gloria', 'Gloria Martínez'],
  ['demo-cliente-hugo', 'Hugo Benítez'], ['demo-cliente-carlos-benitez', 'Carlos Benítez'], ['demo-cliente-lucia-franco', 'Lucía Franco'],
  ['demo-cliente-patricia', 'Patricia Duarte'], ['demo-cliente-ricardo', 'Ricardo Amarilla'],
  ['demo-cliente-sandra', 'Sandra Báez'], ['demo-cliente-osvaldo', 'Osvaldo Rojas'], ['demo-cliente-natalia', 'Natalia Britez'],
  ['demo-cliente-bruno', 'Bruno Insfrán'], ['demo-cliente-camila', 'Camila Arévalo'], ['demo-cliente-derlis', 'Derlis Giménez'],
  ['demo-cliente-mirta', 'Mirta Samaniego'], ['demo-cliente-lorena', 'Lorena Servín'],
]
export const CLIENTES_MAYORISTAS = [
  ['demo-cliente-ramiro', 'Ramiro Cáceres'], ['demo-cliente-distribuidora-luque', 'Distribuidora Luque S.A.'],
]

const BANCOS = ['Itaú · Cuenta corriente', 'Continental · Cuenta corriente', 'Ueno · Caja de ahorro']
const DESTINOS_ENCOMIENDA = ['Ciudad del Este · Nueva Línea', 'Encarnación · Cruce del Sur', 'Pedro Juan Caballero · Nasa', 'Concepción · Rysa', 'Villarrica · La Santaniana']
const MOTIVOS_ENTREGA = ['Llamar al llegar.', 'Dejar con portería.', 'Cobrar al entregar.', 'Coordinar por WhatsApp.']

// Popularidad por categoría de accesorio.
const PESO_CATEGORIA = { Protectores: 3, Accesorios: 4, Audio: 1.3, Smartwatch: 0.5, 'Power banks': 1 }

const accesorios = () => Object.values(CATALOGO_VENTA).filter((item) => !item.celular)
const celulares = () => Object.values(CATALOGO_VENTA).filter((item) => item.celular)

const elegirPonderado = (rng, lista, peso) => {
  const total = lista.reduce((suma, item) => suma + peso(item), 0)
  let punto = rng() * total
  for (const item of lista) {
    punto -= peso(item)
    if (punto <= 0) return item
  }
  return lista[lista.length - 1]
}

// Factor de demanda del día: fin de semana fuerte, quincena y tendencia.
export function factorDeDia(fecha, diasAtras) {
  const calendario = new Date(`${diaDemo(0, fecha)}T00:00:00Z`)
  const semana = [0.55, 0.8, 0.9, 1, 1.05, 1.55, 1.8][calendario.getUTCDay()] // dom..sáb
  const dia = calendario.getUTCDate()
  const quincena = (dia <= 3 || (dia >= 15 && dia <= 17) || dia >= 30) ? 1.4 : 1
  const tendencia = 0.8 + 0.2 * (1 - diasAtras / DIAS_HISTORIAL)
  return semana * quincena * tendencia
}

function pagosDe({ rng, id, total, diasAtras, mayorista, hora, minuto }) {
  const hh = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
  const pago = (indice, medioPago, cuenta, monto, extra = {}) => ({ id: `${id}-p${indice}`, medioPago, cuenta, monto, hora: hh, ...extra })
  const banco = () => BANCOS[Math.floor(rng() * BANCOS.length)]
  const tirada = rng()

  if (mayorista || (total >= 1500000 && tirada < 0.07)) {
    // Crédito / cuotas: entrega inicial y saldo. Lo viejo ya está cobrado en cuotas; lo reciente queda con deuda.
    const entrega = Math.round((total * (0.3 + rng() * 0.2)) / 1000) * 1000
    const pagos = [pago(0, 'TRANSFERENCIA', banco(), entrega)]
    const saldo = total - entrega
    if (diasAtras >= 60) {
      const cuota = Math.round((saldo / 2) / 1000) * 1000
      pagos.push(pago(1, 'TRANSFERENCIA', banco(), cuota, { diasDespues: 20 }))
      pagos.push(pago(2, 'DINERO', '', saldo - cuota, { diasDespues: 40 }))
    } else if (diasAtras >= 30 && rng() < 0.5) {
      pagos.push(pago(1, 'TRANSFERENCIA', banco(), Math.round((saldo / 2) / 1000) * 1000, { diasDespues: 15 }))
    }
    return { pagos, observacion: mayorista ? 'Venta mayorista a crédito (30 días)' : 'Crédito en cuotas' }
  }
  if (tirada < 0.3) return { pagos: [pago(0, 'DINERO', '', total)] }
  if (tirada < 0.55) return { pagos: [pago(0, 'TRANSFERENCIA', banco(), total)] }
  if (tirada < 0.72) return { pagos: [pago(0, 'POS UENO', 'Ueno · Tarjeta', total)] }
  if (tirada < 0.82) return { pagos: [pago(0, 'QR', 'QR · Bancard', total)] }
  if (tirada < 0.91) {
    const usd = Math.floor((total * 0.5) / (COTIZACION_USD * 10)) * COTIZACION_USD * 10
    if (usd <= 0) return { pagos: [pago(0, 'DINERO', '', total)] }
    return { pagos: [pago(0, 'DINERO USD', 'Caja · Dólares', usd), pago(1, 'DINERO', '', total - usd)], observacion: 'Pago en dólares y guaraníes' }
  }
  if (tirada < 0.95) {
    const credito = Math.min(total, Math.round((total * (0.1 + rng() * 0.2)) / 1000) * 1000)
    return { pagos: [pago(0, 'SALDO A FAVOR', 'Saldo a favor', credito), pago(1, 'DINERO', '', total - credito)], observacion: 'Devolución previa aplicada como saldo a favor' }
  }
  if (tirada < 0.975) {
    const tarjeta = Math.min(total, Math.round((total * 0.3) / 1000) * 1000)
    return { pagos: [pago(0, 'GIFT CARD', 'Gift card', tarjeta), pago(1, 'DINERO', '', total - tarjeta)], observacion: 'Pagó parte con una gift card' }
  }
  return { pagos: [pago(0, 'TRANSFERENCIA', banco(), total)], observacion: 'Cambio de equipo registrado (misma diferencia abonada)' }
}

/**
 * Ventas históricas deterministas. `hoy` fija el calendario (para tests);
 * `diasAtras` 0 es hoy. Devuelve las ventas ordenadas de la más vieja a la más nueva.
 */
export function generarVentasHistorial({ hoy = new Date(), dias = DIAS_HISTORIAL, semilla = SEMILLA } = {}) {
  const rng = mulberry32(semilla)
  const lista = []
  const catalogoAcc = accesorios()
  const catalogoCel = celulares()
  let serie = 0
  let numero = PRIMER_NUMERO

  for (let diasAtras = dias - 1; diasAtras >= 0; diasAtras -= 1) {
    const fecha = new Date(`${diaDemo(diasAtras, hoy)}T15:00:00Z`)
    // Hasta el día 8 conviven con las ventas manuales: se agrega menos volumen.
    const base = factorDeDia(fecha, diasAtras) * (diasAtras <= 8 ? 1.2 : 2.6)
    const cantidad = Math.max(0, Math.round(base + (rng() - 0.5) * 1.6))
    for (let n = 0; n < cantidad; n += 1) {
      const id = `demo-hist-${String(diasAtras).padStart(3, '0')}-${n + 1}`
      const mayorista = rng() < 0.06
      const [clienteId, cliente] = mayorista
        ? CLIENTES_MAYORISTAS[Math.floor(rng() * CLIENTES_MAYORISTAS.length)]
        : CLIENTES_MINORISTAS[Math.floor(rng() * CLIENTES_MINORISTAS.length)]
      const vendedorId = elegirPonderado(rng, VENDEDORES_PESO, (fila) => fila[1])[0]

      const items = []
      const linea = (producto, cantidadLinea, precioUnitario, seriales = []) => items.push({
        productoId: producto.id, descripcion: producto.descripcion, modelo: producto.modelo, categoria: producto.categoria,
        cantidad: cantidadLinea, precioUnitario, totalPyg: cantidadLinea * precioUnitario, seriales,
      })
      const precioDe = (producto) => (mayorista ? Math.round((producto.precio * 0.9) / 1000) * 1000 : producto.precio)

      if (!mayorista && rng() < 0.2) {
        const equipo = elegirPonderado(rng, catalogoCel, (item) => 1e7 / item.precio)
        serie += 1
        linea(equipo, 1, equipo.precio, [imeiDemo(5000 + serie)])
        if (rng() < 0.4) linea(CATALOGO_VENTA['demo-vidrio-15-pro'], 1, CATALOGO_VENTA['demo-vidrio-15-pro'].precio)
        if (rng() < 0.3) linea(CATALOGO_VENTA['demo-funda-silicona-negra'], 1, CATALOGO_VENTA['demo-funda-silicona-negra'].precio)
      } else {
        const lineas = mayorista ? 2 : 1 + (rng() < 0.45 ? 1 : 0) + (rng() < 0.15 ? 1 : 0)
        const usados = new Set()
        for (let i = 0; i < lineas; i += 1) {
          const producto = elegirPonderado(rng, catalogoAcc, (item) => (usados.has(item.id) ? 0 : (PESO_CATEGORIA[item.categoria] || 1)))
          usados.add(producto.id)
          const unidades = mayorista ? 5 + Math.floor(rng() * 11) : (rng() < 0.2 ? 2 : 1)
          linea(producto, unidades, precioDe(producto))
        }
      }

      // Entrega: retiro, delivery propio o encomienda al interior.
      const tipoEntrega = rng()
      let entrega = 'RETIRO'
      let montoDelivery = 0
      let fulfillment = 'PICKED_UP'
      let observacionEntrega = ''
      if (tipoEntrega < 0.17) {
        entrega = 'DELIVERY'
        montoDelivery = [20000, 25000, 30000, 35000][Math.floor(rng() * 4)]
        observacionEntrega = MOTIVOS_ENTREGA[Math.floor(rng() * MOTIVOS_ENTREGA.length)]
      } else if (tipoEntrega < 0.22) {
        entrega = 'DELIVERY'
        montoDelivery = [45000, 55000, 65000, 80000][Math.floor(rng() * 4)]
        observacionEntrega = `Encomienda a ${DESTINOS_ENCOMIENDA[Math.floor(rng() * DESTINOS_ENCOMIENDA.length)]}`
      }
      const estados = ['PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED']
      if (entrega === 'DELIVERY') fulfillment = diasAtras <= 8 ? estados[Math.floor(rng() * estados.length)] : 'DELIVERED'

      const total = items.reduce((suma, item) => suma + item.totalPyg, 0) + montoDelivery
      const hora = 9 + Math.floor(rng() * 10)
      const minuto = Math.floor(rng() * 60)
      let { pagos, observacion } = pagosDe({ rng, id, total, diasAtras, mayorista, hora, minuto })
      // Los pedidos aún sin entregar y recientes pueden estar sin cobrar (contra entrega).
      if (entrega === 'DELIVERY' && fulfillment !== 'DELIVERED' && rng() < 0.5) {
        pagos = []
        observacion = 'Cobro contra entrega'
      }
      lista.push({
        id, numero: `AUR-${String(numero).padStart(4, '0')}`, diasAtras, hora, minuto,
        clienteId, cliente, vendedorId, entrega, fulfillment, montoDelivery,
        items, pagos,
        observacion: [observacion, observacionEntrega].filter(Boolean).join(' · ') || 'Venta de mostrador',
      })
      numero += 1
    }
  }
  return lista
}
