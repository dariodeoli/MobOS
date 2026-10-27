// Mini ilustraciones de la pantalla «Módulos»: una maqueta de UI hecha en
// HTML/CSS por módulo, con datos ficticios de una tienda de celulares en
// Paraguay. Son decorativas (aria-hidden): la tarjeta dice debajo que los datos
// no son reales. Las micro-animaciones viven en modulos.css y se apagan con
// prefers-reduced-motion.
import { cn } from '@/lib/utils'

const TONO = { ok: 'mod-tono-ok', warn: 'mod-tono-warn', mute: 'mod-tono-mute', accent: 'mod-tono-accent' }

function Chip({ children, tono = 'accent', pulso = false }) {
  return (
    <span className={cn('mod-chip', TONO[tono])}>
      {pulso && <span className="mod-pulso" />}
      {children}
    </span>
  )
}

function Cabecera({ titulo, chip, tono, pulso }) {
  return (
    <div className="mod-ilus-cabecera">
      <span className="mod-ilus-titulo">{titulo}</span>
      {chip && <Chip tono={tono} pulso={pulso}>{chip}</Chip>}
    </div>
  )
}

// Filas con etiqueta, detalle y valor; opcionalmente una barrita de nivel.
function Filas({ titulo, chip, tono, pulso, filas }) {
  return (
    <>
      <Cabecera titulo={titulo} chip={chip} tono={tono} pulso={pulso} />
      <div className="mod-filas">
        {filas.map((fila, i) => (
          <div key={i} className={cn('mod-fila', fila.destacada && 'mod-fila-destacada')} style={{ '--i': i }}>
            <div className="min-w-0 flex-1">
              <span className="mod-fila-a">{fila.a}</span>
              {fila.b && <span className="mod-fila-b">{fila.b}</span>}
              {fila.p != null && <span className={cn('mod-nivel', TONO[fila.tono])}><span style={{ '--p': `${fila.p}%` }} /></span>}
            </div>
            {fila.v && (fila.tono ? <Chip tono={fila.tono}>{fila.v}</Chip> : <span className="mod-fila-v">{fila.v}</span>)}
          </div>
        ))}
      </div>
    </>
  )
}

// Barras que crecen; la última va con el acento.
function Barras({ titulo, chip, tono, pulso, barras, etiquetas }) {
  return (
    <>
      <Cabecera titulo={titulo} chip={chip} tono={tono} pulso={pulso} />
      <div className="mod-barras">
        {barras.map((alto, i) => (
          <div key={i} className="mod-barra-col">
            <span className={cn('mod-barra', i === barras.length - 1 && 'mod-barra-fuerte')} style={{ '--h': `${alto}%`, '--i': i }} />
            <span className="mod-barra-etiqueta">{etiquetas[i]}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// Montos en líneas, una barra de progreso que se llena y un pie.
function Progreso({ titulo, chip, tono, pulso, lineas, p, pie, pieTono }) {
  return (
    <>
      <Cabecera titulo={titulo} chip={chip} tono={tono} pulso={pulso} />
      <div className="mod-lineas">
        {lineas.map(([a, v], i) => (
          <div key={a} className="mod-linea" style={{ '--i': i }}>
            <span>{a}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <span className="mod-progreso"><span style={{ '--p': `${p}%` }} /></span>
      {pie && <div className="mod-pie">{pieTono ? <Chip tono={pieTono}>{pie}</Chip> : pie}</div>}
    </>
  )
}

// Ticket de venta con total y una columna de opciones (medios, precios, papel).
function Ticket({ titulo, items, total, opcionesTitulo, opciones, elegida, accion }) {
  return (
    <div className="mod-ticket">
      <div className="mod-ticket-venta">
        <span className="mod-ilus-titulo">{titulo}</span>
        {items.map(([a, v], i) => (
          <div key={a} className="mod-linea" style={{ '--i': i }}>
            <span>{a}</span>
            <b>{v}</b>
          </div>
        ))}
        <div className="mod-linea mod-ticket-total" style={{ '--i': items.length }}>
          <span>Total</span>
          <b>{total}</b>
        </div>
      </div>
      <div className="mod-ticket-opciones">
        <span className="mod-ilus-titulo">{opcionesTitulo}</span>
        {opciones.map((opcion, i) => (
          <span key={opcion} className={cn('mod-opcion', opcion === elegida && 'mod-opcion-elegida')} style={{ '--i': i }}>{opcion}</span>
        ))}
        {accion && <span className="mod-opcion mod-opcion-accion">{accion}</span>}
      </div>
    </div>
  )
}

// Conversación: burbujas que aparecen de a una.
function Chat({ titulo, chip, tono, burbujas, pie }) {
  return (
    <>
      <Cabecera titulo={titulo} chip={chip} tono={tono} />
      <div className="mod-chat">
        {burbujas.map(([quien, texto], i) => (
          <span key={texto} className={cn('mod-burbuja', quien === 'yo' ? 'mod-burbuja-yo' : 'mod-burbuja-otro')} style={{ '--i': i }}>{texto}</span>
        ))}
      </div>
      {pie && <div className="mod-pie">{pie}</div>}
    </>
  )
}

// Cupón con código y cuántas veces se usó.
function Cupon({ codigo, detalle, usos, barras }) {
  return (
    <>
      <div className="mod-cupon">
        <div className="flex items-center justify-between gap-2">
          <b className="mod-cupon-codigo">{codigo}</b>
          <Chip tono="ok">Vigente</Chip>
        </div>
        <span className="mod-fila-b">{detalle}</span>
      </div>
      <div className="mod-cupon-usos">
        <div>
          <span className="mod-fila-b">Ventas con este cupón</span>
          <b className="mod-cupon-numero">{usos}</b>
        </div>
        <div className="mod-barras mod-barras-mini">
          {barras.map((alto, i) => (
            <div key={i} className="mod-barra-col">
              <span className={cn('mod-barra', i === barras.length - 1 && 'mod-barra-fuerte')} style={{ '--h': `${alto}%`, '--i': i }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// Tarjeta de regalo con saldo y movimientos.
function Tarjeta({ saldo, movimientos }) {
  return (
    <div className="mod-ticket">
      <div className="mod-gift">
        <span className="mod-gift-titulo">Gift card</span>
        <span className="mod-gift-saldo-label">Saldo</span>
        <b className="mod-gift-saldo">{saldo}</b>
        <span className="mod-gift-codigo">···· 4821</span>
      </div>
      <div className="mod-ticket-opciones">
        <span className="mod-ilus-titulo">Movimientos</span>
        {movimientos.map(([a, v], i) => (
          <div key={a} className="mod-linea mod-linea-apilada" style={{ '--i': i }}>
            <span>{a}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// Qué dibuja cada módulo (los próximamente también tienen la suya).
const ILUSTRACIONES = {
  'inventario-unidades': { tipo: Filas, titulo: 'iPhone 15 · unidades', chip: 'IMEI', filas: [
    { a: 'IMEI ···4821', b: '128 GB · Negro', v: 'En stock', tono: 'ok' },
    { a: 'IMEI ···0937', b: '256 GB · Azul', v: 'Reservado', tono: 'warn', destacada: true },
    { a: 'IMEI ···5512', b: '128 GB · Rosa', v: 'Vendido', tono: 'mute' },
  ] },
  'venta-sin-stock': { tipo: Filas, titulo: 'Por comprar', chip: 'Sobre pedido', tono: 'warn', filas: [
    { a: 'iPhone 16 Pro 256 GB', b: 'Seña Gs. 1.500.000 · Ana B.', v: 'Pedido', tono: 'warn' },
    { a: 'AirPods Pro 2', b: 'Para Marcos V.', v: 'Pedido', tono: 'warn' },
    { a: 'Funda MagSafe', b: '3 unidades', v: 'Falta', tono: 'mute' },
  ] },
  mayoristas: { tipo: Ticket, titulo: 'Venta mayorista', items: [['iPhone 13 x3', '14.550.000'], ['Cargador 20 W x10', '650.000']], total: '15.200.000', opcionesTitulo: 'Precio', opciones: ['Minorista', 'Mayorista'], elegida: 'Mayorista', accion: 'Cobrar' },
  tradein: { tipo: Progreso, titulo: 'Tasación · iPhone 12 64 GB', chip: 'Usado', lineas: [['Valor base', '2.100.000'], ['Batería 82%', '− 150.000'], ['Toma como parte de pago', '1.950.000']], p: 82, pie: 'Toma aceptada', pieTono: 'ok' },
  'catalogo-modelos': { tipo: Filas, titulo: 'Modelos Apple', chip: 'Colores', filas: [
    { a: 'iPhone 16 Pro', b: '128 · 256 · 512 GB · 1 TB', v: '4 colores' },
    { a: 'iPhone 15', b: '128 · 256 · 512 GB', v: '5 colores' },
    { a: 'iPad Air M2', b: '128 · 256 GB', v: '4 colores' },
  ] },
  servicios: { tipo: Progreso, titulo: 'Orden #1042 · iPhone 13', chip: 'En reparación', tono: 'warn', pulso: true, lineas: [['Cambio de pantalla', '650.000'], ['Entrega', 'Jueves 18:00']], p: 60, pie: 'Diagnóstico › Reparación › Listo' },
  delivery: { tipo: Progreso, titulo: 'Reparto · Lambaré', chip: 'En camino', pulso: true, lineas: [['Entregados', '5 de 8'], ['Cobrado en la calle', '3.200.000']], p: 62, pie: 'Rendición al cerrar el día' },
  'campanas-recompra': { tipo: Chat, titulo: 'Para escribir hoy', chip: '12 clientes', burbujas: [['otro', 'Ana compró un iPhone 11 hace 3 años'], ['yo', 'Hola Ana, ¿te mostramos el iPhone 15 con tu usado como parte de pago?']], pie: 'También: aviso de fin de garantía' },
  'campanas-mensajes': { tipo: Chat, titulo: 'Envío · clientes con iPhone 12', chip: '248 contactos', burbujas: [['yo', 'Llegaron los iPhone 16. Reservá el tuyo con Gs. 500.000 de seña.']], pie: 'Entregados 231 de 248' },
  publicidad: { tipo: Barras, titulo: 'Ventas por campaña', chip: 'Esta semana', barras: [30, 45, 38, 60, 52, 74, 92], etiquetas: DIAS },
  comisiones: { tipo: Filas, titulo: 'Comisiones · octubre', chip: 'A liquidar', filas: [
    { a: 'Lucía R.', b: '14 ventas', v: '1.240.000', p: 90 },
    { a: 'Diego A.', b: '9 ventas', v: '780.000', p: 58 },
    { a: 'Sofía M.', b: '6 ventas', v: '410.000', p: 34 },
  ] },
  cuotas: { tipo: Progreso, titulo: 'Crédito · iPhone 14', chip: 'Al día', tono: 'ok', lineas: [['Cuota 4 de 12', '520.000'], ['Próximo vencimiento', '15/11'], ['Saldo', '4.160.000']], p: 33 },
  conciliacion: { tipo: Progreso, titulo: 'Cierre del día', chip: 'Cuadra', tono: 'ok', pulso: true, lineas: [['Cobros con tarjeta', '8.450.000'], ['Acreditado en el banco', '8.450.000'], ['Diferencia', '0']], p: 100 },
  'gift-cards': { tipo: Tarjeta, saldo: 'Gs. 750.000', movimientos: [['Compra', '+ 1.000.000'], ['Canje · funda', '− 250.000']] },
  promociones: { tipo: Cupon, codigo: 'IPHONE10', detalle: '10% en fundas y vidrios · código de influencer', usos: 37, barras: [25, 40, 32, 58, 80] },
  'listas-precios': { tipo: Filas, titulo: 'Lista · Cliente corporativo', chip: 'Negociada', filas: [
    { a: 'iPhone 15 128 GB', b: 'De 1 a 4', v: '6.900.000' },
    { a: 'iPhone 15 128 GB', b: '5 o más', v: '6.600.000', destacada: true },
    { a: 'AirPods 3', b: 'Precio fijo', v: '1.350.000' },
  ] },
  comparador: { tipo: Filas, titulo: 'Lista por modelo', chip: 'Compartir', filas: [
    { a: 'iPhone 16', b: '128 GB', v: '7.900.000' },
    { a: 'iPhone 15', b: '128 GB', v: '6.900.000' },
    { a: 'iPhone 14', b: '128 GB', v: '5.600.000' },
  ] },
  abastecimiento: { tipo: Filas, titulo: 'Qué comprar', chip: 'Sugerido', filas: [
    { a: 'Cargador 20 W', b: 'Quedan 3 · comprar 20', p: 12, tono: 'warn', v: 'Bajo' },
    { a: 'Vidrio iPhone 15', b: 'Quedan 8 · comprar 30', p: 30, tono: 'warn', v: 'Bajo' },
    { a: 'Funda MagSafe', b: 'Quedan 12', p: 72, tono: 'ok', v: 'Bien' },
  ] },
  multisucursal: { tipo: Progreso, titulo: 'Traslado · Central › San Lorenzo', chip: 'En tránsito', pulso: true, lineas: [['Equipos', '6 iPhone'], ['Salió', 'Hoy 10:30']], p: 55, pie: 'Llega hoy' },
  'stock-avanzado': { tipo: Progreso, titulo: 'Conteo · vitrina 1', chip: 'En curso', tono: 'warn', pulso: true, lineas: [['Contados', '42 de 50'], ['Diferencias', '1']], p: 84 },
  ops: { tipo: Barras, titulo: 'Ventas de hoy', chip: 'En vivo', pulso: true, barras: [20, 42, 65, 48, 70, 88], etiquetas: ['9', '11', '13', '15', '17', '19'] },
  'ia-conectores': { tipo: Chat, titulo: 'Asistente', chip: 'Tus datos', burbujas: [['yo', '¿Cuánto vendí esta semana?'], ['otro', 'Gs. 48.300.000, un 12% más que la semana pasada.']] },
  'portal-clientes': { tipo: Progreso, titulo: 'Pedido #2381 · iPhone 15', chip: 'Listo para retirar', tono: 'ok', lineas: [['Garantía', 'Hasta 10/2027'], ['Comprobante', 'Descargar']], p: 100, pie: 'Enlace seguro para el cliente' },
  'verificacion-imei': { tipo: Filas, titulo: 'Consulta de IMEI', chip: 'Sin reportes', tono: 'ok', filas: [
    { a: 'IMEI', b: '35 284711 ··· 4821' },
    { a: 'Bloqueo de iCloud', v: 'No', tono: 'ok' },
    { a: 'Reporte de robo', v: 'No', tono: 'ok' },
  ] },
  'impresion-pro': { tipo: Ticket, titulo: 'Ticket', items: [['iPhone 15 128 GB', '6.900.000'], ['Vidrio templado', '80.000']], total: '6.980.000', opcionesTitulo: 'Papel', opciones: ['58 mm', '80 mm', 'A4'], elegida: '80 mm', accion: 'Imprimir' },
  asistentes: { tipo: Chat, titulo: 'Asistente guiado', chip: 'Pronto', tono: 'mute', burbujas: [['otro', 'Hoy vencen 3 cuotas. ¿Les mandamos el recordatorio?'], ['yo', 'Sí, mandalo']] },
  facturacion: { tipo: Ticket, titulo: 'Factura', items: [['iPhone 15 128 GB', '6.900.000'], ['IVA 10%', '627.273']], total: '6.900.000', opcionesTitulo: 'Envío', opciones: ['Proveedor', 'Correo'], elegida: 'Proveedor' },
  autofacturacion: { tipo: Filas, titulo: 'Autofactura', chip: 'Pronto', tono: 'mute', filas: [
    { a: 'Cliente', b: 'RUC 80012345-6' },
    { a: 'iPhone 13 usado', v: '3.200.000' },
    { a: 'Estado', v: 'Borrador', tono: 'mute' },
  ] },
  'facturacion-electronica': { tipo: Filas, titulo: 'Factura electrónica', chip: 'SIFEN', tono: 'mute', filas: [
    { a: 'CDC', b: '0180 0123 4567 ···' },
    { a: 'Timbrado', b: '12345678' },
    { a: 'Estado', v: 'Aprobado', tono: 'ok' },
  ] },
  salud: { tipo: Filas, titulo: 'Ficha', chip: 'Privada', tono: 'mute', filas: [
    { a: 'Paciente', b: 'Datos protegidos' },
    { a: 'Acceso', v: 'Solo dueño', tono: 'mute' },
  ] },
}

/** Mini ilustración del módulo (decorativa); apagada se ve en gris. */
export default function IlustracionModulo({ id, apagado = false }) {
  const datos = ILUSTRACIONES[id]
  if (!datos) return null
  const { tipo: Tipo, ...props } = datos
  return (
    <div aria-hidden="true" className={cn('mod-ilus', apagado && 'mod-ilus-apagada')} data-ilustracion={id}>
      <Tipo {...props} />
    </div>
  )
}

export const tieneIlustracion = id => Boolean(ILUSTRACIONES[id])
