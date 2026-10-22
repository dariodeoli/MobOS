// Ventas de cobertura de la demo: pequeñas ventas de mostrador repartidas en
// todos los medios de cobro y en todos los períodos (hace minutos, hoy, ayer,
// esta semana, este mes y meses anteriores), con señas y saldos cobrados
// después. Así ninguna cuenta (caja, bancos, billeteras, tarjetas) ni ningún
// filtro de período (Hoy, Ayer, 7 días, Mes, Mes anterior) queda vacío, sea cual
// sea el día y la hora en que se carga la demo. Determinista y sin azar.
import { CATALOGO_VENTA } from './catalogoPro.js'
import { CLIENTES_MINORISTAS, VENDEDORES_PESO } from './ventasHistorial.js'

// [medio legacy, cuenta, producto]
const MEDIOS = [
  ['DINERO', '', 'demo-cargador-usbc-20w'],
  ['DINERO USD', 'Caja · Dólares', 'demo-cable-usbc-lightning-1m'],
  ['TRANSFERENCIA', 'Itaú · Cuenta corriente', 'demo-funda-silicona-negra'],
  ['TRANSFERENCIA', 'Continental · Cuenta corriente', 'demo-powerbank-10000'],
  ['POS UENO', 'Ueno · Tarjeta', 'demo-vidrio-15-pro'],
  ['TARJETA', 'Dinelco · Tarjeta', 'demo-auriculares-usbc'],
  ['PIX', 'Pix · Itaú', 'demo-cable-usbc-usbc-2m'],
  ['USDT - CRIPTO', 'USDT · Binance', 'demo-cargador-magsafe-15w'],
  ['QR', 'QR · Bancard', 'demo-lamina-hidrogel-17'],
  ['TRANSFERENCIA', 'Ueno · Caja de ahorro', 'demo-soporte-auto'],
  ['CANJE', 'Canje · Equipos', 'demo-correa-apple-watch'],
]
// Cuándo ocurren: `min` = hoy (hace unos minutos), `dias` = días atrás.
// Separación máxima de 14 días: cualquier ventana de un mes tiene al menos un cobro por medio.
const MOMENTOS = [{ min: 0 }, { dias: 1 }, { dias: 3 }, { dias: 10 }, { dias: 24 }, { dias: 38 }, { dias: 52 }, { dias: 66 }, { dias: 80 }, { dias: 94 }]

const redondear = (valor) => Math.round(valor / 1000) * 1000

export function ventasCobertura() {
  const ventas = []
  let numero = 500
  MEDIOS.forEach(([medioPago, cuenta, productoId], i) => {
    MOMENTOS.forEach((momento, p) => {
      const producto = CATALOGO_VENTA[productoId]
      const [clienteId, cliente] = CLIENTES_MINORISTAS[(i * 3 + p) % CLIENTES_MINORISTAS.length]
      const vendedorId = VENDEDORES_PESO[(i + p) % VENDEDORES_PESO.length][0]
      const total = producto.precio
      const sena = (p + i) % 3 === 0
      const id = `demo-cob-${i + 1}-${p + 1}`
      const base = momento.min != null
        ? { diasAtras: 0, hora: 0, minuto: 0, haceMin: 14 + i * 17 }
        : { diasAtras: momento.dias, hora: 9 + ((i * 2 + p) % 9), minuto: (i * 7 + p * 11) % 60 }
      const hora = momento.min != null ? '00:00' : `${String(base.hora).padStart(2, '0')}:${String(base.minuto).padStart(2, '0')}`
      const primero = sena ? redondear(total / 2) : total
      const pagos = [{ id: `${id}-p0`, medioPago, cuenta, monto: primero, hora }]
      // Algunas señas se completan después (saldo cobrado en otra fecha).
      if (sena && momento.dias >= 3 && (p + i) % 2 === 0) pagos.push({ id: `${id}-p1`, medioPago: 'DINERO', cuenta: '', monto: total - primero, hora: '17:10', diasDespues: 1 })
      const saldada = pagos.length > 1 || !sena
      ventas.push({
        id, numero: `AUR-${String(numero).padStart(4, '0')}`, ...base,
        clienteId, cliente, vendedorId, entrega: 'RETIRO',
        fulfillment: saldada ? 'PICKED_UP' : (momento.min != null ? 'PROCESSING' : 'READY_FOR_PICKUP'), montoDelivery: 0,
        items: [{ productoId, descripcion: producto.descripcion, modelo: producto.modelo, categoria: producto.categoria, cantidad: 1, precioUnitario: total, totalPyg: total, seriales: [] }],
        pagos,
        observacion: sena ? (saldada ? 'Seña del 50% y saldo cobrado al retirar' : 'Seña del 50%, el resto al retirar') : 'Venta de mostrador',
      })
      numero += 1
    })
  })
  return ventas
}
