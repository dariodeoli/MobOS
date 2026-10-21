import '../control/inicioPosF2.css'
import './posCobro.css'
import './posUnaPantalla.css'
import './posRediseno.css'
import CheckAnimado from '@/components/shared/CheckAnimado'
import { cloneElement, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import {
  getProductos,
  modoDatosActual,
  productosById,
  addProducto,
  addProductoApi,
  updateProducto,
  addVenta,
  guardarOrdenApi,
  contextoActual,
  MEDIOS_PAGO,
  ESTADOS_PAGO,
  ENTREGA,
} from '@/lib/storage'
import { leerCarrito, guardarCarrito, borrarCarrito, lineasParaResumen } from '@/lib/posCart'
import { leerUltimo, recordarUltimo } from '@/lib/ultimoUsado'
import { encolarVenta } from '@/lib/offline/ventas'
import { preferenciaPos, recordarPos } from '@/lib/preferenciasPos'
import { listarBorradoresDemo, guardarBorradorDemo, borrarBorradorDemo, marcarBorradorRetomadoDemo } from '@/lib/borradoresDemo'
import { descartarPreCliente } from '@/lib/preClientes'
import { checkoutVisibleName, checkoutBillingPayload, restoreBillingIdentity } from '@/lib/checkoutIdentity'
import { customerIdentityPayload } from '@/lib/customerIdentity'
import { codigoPedido } from '@/utils/pedido'
import { esErrorDeRed } from '@/lib/offline/queue'
import { fechaClave, num, gs } from '@/utils/calculos'
import { datosEncomienda, montoEnvioEfectivo, notasDeEntrega, pagaAlRecibirVigente, recordarEmpresa } from '@/utils/cobroPos'
import { mensajeMontosFueraDeRango, montosFueraDeRango } from '@/utils/limitesVenta'
import { allocateCheckout } from '@/utils/checkout'
import { tradeInDraftPayment } from '@/utils/tradeInCheckout'
import { validateDemoPromotionItems, recordDemoPromotionUsage } from '@/lib/demoPromotions'
import { guardarClienteDemo, listarClientesDemo, registrarPedidoDemoDeVenta } from '@/lib/demoClientes'
import { evaluarCredito, preguntaEntregaAplica } from '@/lib/credito'
import { autorizacionCreditoDemo, evaluarCreditoDemo } from '@/lib/demoCreditoStore'
import EntregaPregunta from './venta/EntregaPregunta'
import { tomarNumeroPedidoDemo } from '@/lib/demoTenant'
import { resources } from '@/lib/api'
import { api } from '@/lib/api/client'
import { alInvalidarSnapshots } from '@/lib/offline/snapshot'
import { useRepartidores } from '@/hooks/useRepartidores'
import { agruparProductos } from '@/utils/colores'
import { pedidoPosDemo } from '@/lib/demo/pedidoPos.js'
import { Aviso, Button, Card, EmptyState, Input, Label, useToast } from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/shared/popupKit'
import Icon from '@/components/shared/Icon'
import BarraModulo from '@/components/shared/BarraModulo'
import { parsePercent } from '@/components/shared/PercentField'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { validateDemoTradeIns, recordDemoTradeIns } from '@/lib/tradeInPipeline'
import { accountPayment, pagosSinVuelto, vueltoEfectivoExtranjero } from '@/utils/pagoCuenta'
import ComprobantePreview from '@/components/shared/ComprobantePreview'
import ColaOffline from './ColaOffline'
import GiftCardsPos from './venta/GiftCardsPos'
import { buscarGiftCardDemo, canjearGiftCardDemo, normalizarCodigoGiftCard } from '@/lib/giftCards'
import { puedeCanjearGiftCard } from '@/lib/validacionGlobal'
import { whatsappTrackingLink } from './PagosPedido'
import { telefonoValido, MENSAJE_TELEFONO, whatsappUrl } from '@/utils/telefono'
import SerialUnitPicker from '@/components/inventory/SerialUnitPicker'
import PasoProductos, { PosCustomer } from './venta/PasoProductos'
import { usePosCatalogoServidor } from '@/hooks/usePosCatalogoServidor'
import { categoriaAccesorioDe } from '@/lib/categoriasAccesorio'
import { subirFotosPendientes } from '@/components/productos/GaleriaFotosProducto'
import PasoCarrito from './venta/PasoCarrito'
import PasoCobro from './venta/PasoCobro'
import { orderDetailPath } from '@/lib/orderDetailNavigation'
import { CELDA_IDENTIDAD_GRANDE } from '@/components/shared/tabla'
import { PIE_ACCIONES_REVERSO } from '@/components/shared/formulario'
import { useMediaQuery } from '@/components/shared/useMediaQuery'
import { AccionesInicio, BarraCarrito } from './movil/InicioMovil'
import { HojaCarrito, HojaCliente, HojaEnvio, HojaExito, HojaNota, HojaSinStock } from './movil/HojasMovil'
import CobroMovil from './movil/CobroMovil'
import { pagoDeMedio, vueltoDePagos } from './movil/posMovil'
import { CONSULTA_MOVIL, etiquetaConfirmar } from './movil/posMovil'
import { isNativeIOS } from '@/lib/plataforma'
import { compartirNativo } from '@/lib/nativo/compartir'

// Recuerda el último vendedor elegido en esta compu, para no re-seleccionarlo
// en cada venta (suelen ser ráfagas de la misma persona).
// Último vendedor del POS: último usado como predeterminado (#209). El
// namespace viejo (`fono:`) se migra al leer.
const ULTIMO_VENDEDOR = 'pos:vendedor'

// Montos en ₲ son enteros y se escriben con puntos de miles ("20.000"). Tomamos
// solo los dígitos para no confundir el punto con un decimal (evita 20.000 20).
const gsNum = v => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

const VACIO = vendedorId => ({
  vendedorId: vendedorId || '',
  cliente: '',
  productoId: '',
  estadoPago: ESTADOS_PAGO[0],
  fecha: fechaClave(),
  fechaManual: false, // true si el usuario eligió una fecha distinta a mano
  precio: '',
  couponCode: null,
  soldWithoutInsurance: false,
  serials: [],
  medioPago: MEDIOS_PAGO[0],
  entrega: ENTREGA[0],
  montoDelivery: '',
  encEmpresa: '',
  encSucursal: '',
  encDireccionId: '',
  entregaDireccionId: '',
  entregaDireccion: '',
  repartidorId: '',
  observacion: '',
  specialOrder: false,
  expectedAt: '',
})

const PAGO_VACIO = { medioPago: MEDIOS_PAGO[0], cuenta: '', monto: '' }

// #275: al confirmar la venta (completa, parcial o a crédito) la app va sola al
// detalle del pedido recién creado, también en la demo. La pausa deja a la vista
// la animación de confirmación y el número del pedido antes de cambiar de
// pantalla.
const MS_CONFIRMACION_ANTES_DEL_DETALLE = 1500

function Atajo({ k, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded border border-ink-500 bg-ink-700 px-1.5 py-0.5 font-mono text-xs text-fono-light">
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  )
}

// Recupera el carrito persistido de esta empresa/sucursal. Las líneas que ya
// no corresponden a un producto activo se descartan en silencio para que un
// carrito viejo no rompa el formulario.
function leerCarritoInicial() {
  try {
    const { empresaId, sucursalId, userId } = contextoActual()
    if (!empresaId) return null
    const guardado = leerCarrito(empresaId, sucursalId, userId)
    if (!guardado) return null
    const prods = productosById()
    const items = Array.isArray(guardado.items)
      ? guardado.items
          .filter(it => it && (prods[it.productoId] || it.nombre || it.productoId))
          .map(it => ({
            ...it,
            nombre: prods[it.productoId]?.nombre || it.nombre || 'Producto',
            quantity: Number.isInteger(it.quantity) && it.quantity > 0 ? it.quantity : 1,
            serials: Array.isArray(it.serials) ? it.serials : [],
          }))
      : []
    const customer =
      guardado.customer && typeof guardado.customer === 'object' ? guardado.customer : null
    return {
      items,
      customer: customer
        ? {
            name: '',
            phone: '',
            countryCode: '+595',
            email: '',
            document: '',
            ...customer,
            addresses: Array.isArray(customer.addresses) ? customer.addresses : [],
          }
        : null,
      descuento:
        guardado.descuento !== undefined && guardado.descuento !== null
          ? String(guardado.descuento)
          : '',
      pagos: Array.isArray(guardado.pagos) ? guardado.pagos : [],
      entrega: guardado.entrega,
      montoDelivery: typeof guardado.montoDelivery === 'string' ? guardado.montoDelivery : '',
      observacion: typeof guardado.observacion === 'string' ? guardado.observacion : '',
    }
  } catch {
    return null
  }
}

const CLIENTE_VACIO = {
  name: '',
  phone: '',
  countryCode: '+595',
  email: '',
  document: '',
  addresses: [],
}

// Cliente guardado (carrito local o venta suspendida): completa los campos que
// el formulario espera para que un registro viejo no lo rompa.
function clienteGuardado(valor) {
  if (!valor || typeof valor !== 'object') return { ...CLIENTE_VACIO }
  return {
    ...CLIENTE_VACIO,
    ...valor,
    addresses: Array.isArray(valor.addresses) ? valor.addresses : [],
  }
}

// Líneas recuperadas de una venta suspendida: se descartan las que no tienen
// producto y se normalizan cantidad, seriales y clave de fila. El resto de los
// campos viaja tal cual (precio manual, cupón, combo, descuentos, etc.).
function itemsGuardados(valor) {
  if (!Array.isArray(valor)) return []
  return valor
    .filter(it => it && typeof it === 'object' && it.productoId)
    .map((it, index) => ({
      ...it,
      key: typeof it.key === 'string' && it.key ? it.key : `suspendida-${Date.now()}-${index}`,
      nombre: typeof it.nombre === 'string' ? it.nombre : '',
      precio: Number(it.precio) || 0,
      quantity: Number.isInteger(it.quantity) && it.quantity > 0 ? it.quantity : 1,
      serials: Array.isArray(it.serials) ? it.serials.filter(serial => typeof serial === 'string') : [],
    }))
}

// Resumen fijo de la venta: total, cantidades, ajustes y el día del vendedor en
// una tira compacta que cruza las dos columnas en desktop. En pantallas
// angostas queda al pie (después del cobro) y la barra superior sigue siendo el
// acceso rápido al carrito.
function ResumenVenta({ items, unidades, montoDescuento, montoDelivery, dia }) {
  return (
    <section
      data-testid="resumen-compra"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-fono/50 bg-ink-700 px-4 py-3 shadow-lg shadow-fono/10"
    >
      {/* #309: el total dejó de repetirse acá (vive una sola vez, más
          destacado, en el pie del carrito y en la barra fija del celular). */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-mute">
          Esta venta
        </span>
        <span className="text-xs text-mute">
          {items.length} {items.length === 1 ? 'producto' : 'productos'} · {unidades}{' '}
          {unidades === 1 ? 'unidad' : 'unidades'}
        </span>
      </div>
      {montoDescuento > 0 && (
        <span className="text-xs font-semibold text-warn">Descuento − {gs(montoDescuento)}</span>
      )}
      {montoDelivery > 0 && (
        <span className="text-xs text-mute">Entrega + {gs(montoDelivery)}</span>
      )}
      {items.length === 0 && (
        <span className="text-xs text-mute">Agregá productos para empezar la venta.</span>
      )}
      {dia && dia.cant > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs lg:ml-auto">
          <span className="font-bold uppercase tracking-wider text-mute">Tu día</span>
          <span className="text-mute">
            {dia.cant} {dia.cant === 1 ? 'venta' : 'ventas'} ·{' '}
            {dia.cant} {dia.cant === 1 ? 'pedido' : 'pedidos'}
          </span>
          <span className="text-mute">
            Facturación <b className="tabular-nums text-fore">{gs(dia.total)}</b>
          </span>
        </div>
      )}
    </section>
  )
}

// POS en escritorio (≥1024 px): todo el POS cabe en UNA pantalla, sin deslizar
// la página. El alto de la grilla es el que queda desde donde empieza hasta el
// borde inferior (menos lo que haya debajo); dentro, solo las listas
// (catálogo, productos de la venta, pagos) se desplazan.
function useAlturaPos(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return undefined
    const escritorio = window.matchMedia('(min-width: 1024px)')
    let raf = 0
    const medir = () => {
      raf = 0
      if (!escritorio.matches) { el.style.removeProperty('--pos-alto'); return }
      // Con la grilla "infinita" lo que sobra en el documento es exactamente lo
      // que hay debajo de ella (resumen, márgenes del shell).
      const PRUEBA = 9000
      el.style.setProperty('--pos-alto', `${PRUEBA}px`)
      const arriba = el.getBoundingClientRect().top + window.scrollY
      const debajo = document.documentElement.scrollHeight - arriba - PRUEBA
      const alto = Math.max(420, Math.floor(window.innerHeight - arriba - Math.max(0, debajo)))
      el.style.setProperty('--pos-alto', `${alto}px`)
    }
    const pedir = () => { if (!raf) raf = requestAnimationFrame(medir) }
    medir()
    // Re-mide cuando el contenido de la página cambia de alto (fuentes, avisos,
    // resumen) en vez de esperar un tiempo fijo.
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(pedir) : null
    observador?.observe(document.body)
    window.addEventListener('resize', pedir)
    document.addEventListener('toggle', pedir, true)
    return () => {
      observador?.disconnect()
      window.removeEventListener('resize', pedir)
      document.removeEventListener('toggle', pedir, true)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref])
}

// Divisor arrastrable entre el catálogo y la venta: la proporción se guarda por
// persona en este dispositivo. Doble clic la restablece; con el teclado, ← →.
const LIMITE_DIVISOR = [0.3, 0.7]
function leerDivisor(clave) {
  try {
    const v = Number(localStorage.getItem(clave))
    return v >= LIMITE_DIVISOR[0] && v <= LIMITE_DIVISOR[1] ? v : null
  } catch { return null }
}
function useDivisorPos(layoutRef, clave) {
  const [izq, setIzq] = useState(() => leerDivisor(clave))
  useEffect(() => { setIzq(leerDivisor(clave)) }, [clave])
  const guardar = (valor) => {
    try { if (valor == null) localStorage.removeItem(clave); else localStorage.setItem(clave, String(valor)) } catch { /* sin almacenamiento */ }
  }
  const limitar = (v) => Math.min(LIMITE_DIVISOR[1], Math.max(LIMITE_DIVISOR[0], v))
  const desdePuntero = (e) => {
    const layout = layoutRef.current
    const r = layout?.getBoundingClientRect()
    if (!r) return null
    const gap = Number.parseFloat(window.getComputedStyle(layout).columnGap) || 12
    return limitar(Number(((e.clientX - r.left - gap / 2) / (r.width - gap)).toFixed(3)))
  }
  const props = {
    onPointerDown: (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); e.preventDefault() },
    onPointerMove: (e) => { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) { const v = desdePuntero(e); if (v != null) setIzq(v) } },
    onPointerUp: (e) => { e.currentTarget.releasePointerCapture?.(e.pointerId); const v = desdePuntero(e); if (v != null) { setIzq(v); guardar(v) } },
    onDoubleClick: () => { setIzq(null); guardar(null) },
    onKeyDown: (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      // Sin ajuste previo el ticket mide fijo: se parte del reparto real.
      const layout = layoutRef.current
      const izqReal = layout?.querySelector('.pos-col-izq')?.getBoundingClientRect().width
      const gap = layout ? Number.parseFloat(window.getComputedStyle(layout).columnGap) || 12 : 12
      const base = izq ?? (izqReal && layout ? Number((izqReal / (layout.getBoundingClientRect().width - gap)).toFixed(3)) : (window.innerWidth >= 1280 ? 0.5 : 0.55))
      const v = limitar(Number((base + (e.key === 'ArrowLeft' ? -0.02 : 0.02)).toFixed(3)))
      setIzq(v); guardar(v)
    },
  }
  return { izq, props }
}

export default function FormularioVenta({
  onGuardado,
  onCarrito,
  resumenDia,
  tradeInDraft,
  onTradeInConsumed,
  onBloquear,
  onIr,
}) {
  const { sesion, esDemo, empresa, sucursal } = useSesion()
  const navigate = useNavigate()
  const layoutRef = useRef(null)
  useAlturaPos(layoutRef)
  // «Listo, ir a cobrar»: el carrito se resume y el cobro gana la altura.
  const [modoCobro, setModoCobro] = useState(false)
  // Al entrar o salir del cobro cambia lo que hay bajo la grilla (resumen del
  // día): se vuelve a medir el alto de la pantalla.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const marco = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(marco)
  }, [modoCobro])
  const divisor = useDivisorPos(layoutRef, `mobos:pos-divisor:${contextoActual().userId || 'anon'}`)
  // POS en celular (#429): <768 px cambia solo la presentación (acciones,
  // barra del carrito y hojas). Es la misma venta: el estado, el guardado y
  // las reglas siguen siendo los de abajo.
  const esMovil = useMediaQuery(CONSULTA_MOVIL)
  const esMovilRef = useRef(esMovil)
  esMovilRef.current = esMovil
  const [hoja, setHoja] = useState(null) // carrito | cliente | envio | nota | sinstock | cobro | exito
  // Vuelto de la venta recién confirmada (se congela al guardar; los pagos se vacían).
  const [vueltoExito, setVueltoExito] = useState(0)
  const puedeDescontar = esDemo || ['dueno', 'GERENTE'].includes(sesion?.rol)
  const productos = getProductos().filter(p => p.activo)
  const familias = agruparProductos(productos)
  // Carrito persistido: se restaura una sola vez al montar el formulario.
  const [cartInicial] = useState(() => leerCarritoInicial())
  const [f, setF] = useState(() => ({
    ...VACIO(sesion?.vendedorId || leerUltimo(ULTIMO_VENDEDOR, { porDefecto: '', legado: 'fono:ultimoVendedor' })),
    ...(cartInicial?.customer?.name ? { cliente: cartInicial.customer.name } : {}),
    ...(ENTREGA.includes(cartInicial?.entrega) ? { entrega: cartInicial.entrega } : {}),
    ...(cartInicial?.montoDelivery ? { montoDelivery: cartInicial.montoDelivery } : {}),
    ...(cartInicial?.observacion ? { observacion: cartInicial.observacion } : {}),
  }))
  const [customer, setCustomer] = useState(
    () =>
      cartInicial?.customer || {
        name: '',
        phone: '',
        countryCode: '+595',
        email: '',
        document: '',
        addresses: [],
      },
  )
  const [nuevoProd, setNuevoProd] = useState(false)
  const puedeCrearProducto = esDemo || Boolean(sesion?.esPropietario) || ['ADMIN', 'GERENTE'].includes(sesion?.rol)
  const [nombreProd, setNombreProd] = useState('')
  const [coloresNuevos, setColoresNuevos] = useState([])
  const [colorInput, setColorInput] = useState('')
  // Detalles del producto nuevo del POS: categoría, condición, precios y costo.
  const [nuevoDetalles, setNuevoDetalles] = useState({ categoria: 'Accesorios', condicion: 'NEW', precio: '', mayorista: '', costo: '' })
  const [creandoProd, setCreandoProd] = useState(false)
  const [combos, setCombos] = useState([])
  const [noticeCombo, setNoticeCombo] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  // #354: en cuenta real el catálogo del POS se pagina y busca en el servidor;
  // sin conexión (o en demo) sigue el catálogo completo del espejo local.
  const [accesorio, setAccesorio] = useState('todas')
  const fotosNuevas = useRef([])
  const catalogoServidor = usePosCatalogoServidor({ q: busquedaProducto, accesorio: accesorio === 'todas' ? '' : accesorio, habilitado: !esDemo && modoDatosActual() === 'api' })
  // Fila de la venta cuyo selector de IMEI está abierto.
  const [imeiPara, setImeiPara] = useState(null)
  const [accesoStockInvalidado, setAccesoStockInvalidado] = useState(false)
  // #511: la purga privada puede retirar el producto mientras se elige IMEI.
  // El aviso vive fuera del selector; nunca se conserva su DTO como respaldo.
  useEffect(() => {
    if (!imeiPara) return undefined
    return alInvalidarSnapshots(() => {
      setAccesoStockInvalidado(true)
      setImeiPara(null)
    })
  }, [imeiPara])
  const [unidadesDeImei, setUnidadesDeImei] = useState(0)
  const [ok, setOk] = useState(false)
  const [items, setItems] = useState(() =>
    Array.isArray(cartInicial?.items) ? cartInicial.items : [],
  ) // carrito: varios productos del mismo cliente
  const [descuento, setDescuento] = useState(() => cartInicial?.descuento || '')
  // Autorización DISCOUNT vigente que cubre el descuento global del carrito
  // (solo para vendedores sin permiso de aprobar descuentos).
  const [authDescuento, setAuthDescuento] = useState(null)
  const onAuthDescuento = useCallback(auth => setAuthDescuento(auth), [])
  // Autorización BELOW_LIST_PRICE vigente que cubre la diferencia entre el
  // precio de lista y el precio manual cargado en las líneas.
  const [authPrecio, setAuthPrecio] = useState(null)
  const [pagos, setPagos] = useState(() =>
    Array.isArray(cartInicial?.pagos) ? cartInicial.pagos : [],
  )
  const [errorVenta, setErrorVenta] = useState('')
  // Los avisos de validación se traen a la vista: si el guardado se bloquea
  // mientras el usuario está en el cobro, el error queda visible (#148 §9).
  const avisoErrorRef = useRef(null)
  useEffect(() => {
    if (errorVenta) avisoErrorRef.current?.scrollIntoView({ block: 'center' })
  }, [errorVenta])
  const [guardando, setGuardando] = useState(false)
  const [cuentas, setCuentas] = useState(null)
  const [errorCuentas, setErrorCuentas] = useState('')
  const [intentoCuentas, setIntentoCuentas] = useState(0)
  // Venta a crédito: plazo en días y límite del cliente.
  const [venderACredito, setVenderACredito] = useState(false)
  // «Paga al recibir» (#390): vive acá para resetearse con la venta y viajar en la suspensión.
  const [pagaAlRecibir, setPagaAlRecibir] = useState(false)
  const [creditoDias, setCreditoDias] = useState('')
  // Crédito sobre el límite: PIN de gerente/administrador o «autorizo yo». Nunca
  // se guardan en el carrito ni en la cola sin conexión.
  const [creditoPin, setCreditoPin] = useState('')
  const [creditoAutorizoYo, setCreditoAutorizoYo] = useState(false)
  const [deudaCliente, setDeudaCliente] = useState(null)
  // Venta recién cerrada en celular a la que falta preguntar si el cliente ya se la llevó.
  const [preguntaEntrega, setPreguntaEntrega] = useState(null)
  // Factura a otro titular (esposo/a, padre, empresa) con RUC.
  const [billingTo, setBillingTo] = useState({ name: '', document: '' })
  const [lastOrder, setLastOrder] = useState(null)
  const [comprobante, setComprobante] = useState(false)
  const guardadoEnCurso = useRef(false)
  // Temporizador de la ida automática al detalle (#275): se cancela si el POS
  // se desmonta antes de que dispare.
  const irAlDetalleRef = useRef(null)
  const [guardadoIncompleto, setGuardadoIncompleto] = useState(false)
  // Misma clave idempotente para todos los reintentos de una misma venta;
  // se regenera recién cuando la venta quedó confirmada.
  const idempotencyKeyRef = useRef(null)
  const usaCuentas = Boolean(cuentas?.length)
  const appliedTradeIn = useRef(null)

  // Ventas suspendidas (carrito en espera): lista de la sucursal, alta con
  // etiqueta opcional, recuperación y descarte.
  const [suspendidasOpen, setSuspendidasOpen] = useState(false)
  const [filtroSuspendidas, setFiltroSuspendidas] = useState('pendientes')
  const [suspendidas, setSuspendidas] = useState([])
  const [cargandoSuspendidas, setCargandoSuspendidas] = useState(false)
  const [errorSuspendidas, setErrorSuspendidas] = useState('')
  // #309: menú «Más» del encabezado (cierra al elegir una herramienta).
  const toast = useToast()
  // Delivery propio (#461): repartidores asignables; solo se piden con «Delivery» elegido.
  const repartidores = useRepartidores({ activo: f.entrega === 'Delivery', esDemo })
  // #308: familia con más de una variante esperando elección explícita.
  const [variantePara, setVariantePara] = useState(null)
  const [suspenderOpen, setSuspenderOpen] = useState(false)
  const [labelSuspender, setLabelSuspender] = useState('')
  const [errorSuspender, setErrorSuspender] = useState('')
  const [suspendiendo, setSuspendiendo] = useState(false)
  const [recuperarPendiente, setRecuperarPendiente] = useState(null)
  // Aviso de disponibilidad al retomar un borrador: productos que ya no tienen
  // stock para la cantidad pedida, con salida "volver" o "vender igualmente".
  const [stockPendiente, setStockPendiente] = useState(null)
  // Enlace público del borrador recién generado (se muestra una sola vez).
  const [enlacePublico, setEnlacePublico] = useState(null)
  const [avisoEnlace, setAvisoEnlace] = useState('')
  // Producto leído por el escáner: se muestra y se agrega recién al confirmar
  // (evita sumar al carrito por una lectura accidental).
  const [escaneado, setEscaneado] = useState(null)
  const [descartarPendiente, setDescartarPendiente] = useState(null)
  const [descartando, setDescartando] = useState(false)
  const [avisoSuspension, setAvisoSuspension] = useState('')
  // Aviso de la última venta que quedó en la cola local por falta de conexión.
  const [avisoOffline, setAvisoOffline] = useState('')
  const [avisoEnlaceDemo, setAvisoEnlaceDemo] = useState(null)
  // Gift cards (#280): emisión/consulta desde el POS y canje dentro del cobro.
  const [giftCardsOpen, setGiftCardsOpen] = useState(false)

  // Un pago que entra por otro camino (canje borrador, venta recuperada) apaga
  // «Paga al recibir»: nunca quedan pagos ocultos.
  useEffect(() => { if (pagos.length > 0) setPagaAlRecibir(false) }, [pagos.length])

  // #275: si el POS se desmonta antes de que dispare la ida automática al
  // detalle, no navegamos en nombre del usuario.
  useEffect(() => () => { if (irAlDetalleRef.current) clearTimeout(irAlDetalleRef.current) }, [])

  useEffect(() => {
    if (!tradeInDraft || !cuentas || appliedTradeIn.current === tradeInDraft.id) return
    try {
      const payment = tradeInDraftPayment(tradeInDraft, cuentas, pagos)
      appliedTradeIn.current = tradeInDraft.id
      setPagos(current => [...current, payment])
      setErrorVenta('')
      onTradeInConsumed?.()
    } catch (error) {
      setErrorVenta(error.message)
    }
  }, [tradeInDraft, cuentas, pagos, onTradeInConsumed])

  useEffect(() => {
    let vigente = true
    setCuentas(null)
    setErrorCuentas('')
    Promise.resolve()
      .then(() => getPaymentAccounts())
      .then(result => {
        if (!Array.isArray(result)) throw new Error('Respuesta inválida al cargar cuentas.')
        if (vigente) setCuentas(result)
      })
      .catch(error => {
        if (vigente)
          setErrorCuentas(error?.message || 'No se pudieron cargar las cuentas de cobro.')
      })
    return () => {
      vigente = false
    }
  }, [esDemo, intentoCuentas])

  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))

  // Unidad preseleccionada desde Inventario (botón Vender): se restaura una
  // sola vez y el vendedor completa el precio de venta.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('mobos:venta-handoff')
      if (!raw) return
      const handoff = JSON.parse(raw)
      sessionStorage.removeItem('mobos:venta-handoff')
      if (!handoff?.productId || Date.now() - (Number(handoff.ts) || 0) > 10 * 60 * 1000) return
      const product = productos.find(p => p.id === handoff.productId)
      if (!product) return
      const serial = typeof handoff.serial === 'string' && handoff.serial.trim() ? handoff.serial.trim() : ''
      agregarProducto(product)
      if (serial) {
        setItems(arr => arr.map(it => (it.productoId === product.id ? { ...it, serials: [serial] } : it)))
      }
      // Reserva desde Inventario: el cliente queda precargado (y la búsqueda lo ofrece).
      const clienteReserva = typeof handoff.customerName === 'string' ? handoff.customerName.trim() : ''
      if (clienteReserva) {
        setCustomer(current => ({ ...current, name: clienteReserva }))
        setF(current => ({ ...current, cliente: clienteReserva }))
      }
    } catch { /* handoff corrupto: se ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos])

  // Persiste la venta a medio armar (productos, cliente, pagos, descuento y
  // entrega) para recuperarla si se recarga la página o se cambia de vendedor.
  // Un carrito vacío se borra para no dejar basura en localStorage.
  useEffect(() => {
    const { empresaId, sucursalId, userId } = contextoActual()
    if (!empresaId) return
    const vacio =
      items.length === 0 &&
      pagos.length === 0 &&
      !descuento &&
      f.entrega === ENTREGA[0] &&
      !f.montoDelivery &&
      !f.observacion &&
      !(
        customer.name ||
        customer.phone ||
        customer.email ||
        customer.document ||
        customer.addresses?.length
      )
    if (vacio) {
      borrarCarrito(empresaId, sucursalId, userId)
      return
    }
    guardarCarrito(empresaId, sucursalId, userId, {
      items,
      customer,
      descuento,
      pagos,
      entrega: f.entrega,
      montoDelivery: f.montoDelivery,
      observacion: f.observacion,
    })
  }, [items, customer, descuento, pagos, f.entrega, f.montoDelivery, f.observacion])

  // Si cambia el día (o se corrige el reloj) con la app abierta, resincroniza la
  // fecha a HOY, salvo que la hayas elegido a mano.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== 'visible') return
      setF(s => (s.fechaManual || s.fecha === fechaClave() ? s : { ...s, fecha: fechaClave() }))
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    const id = setInterval(sync, 60000)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
      clearInterval(id)
    }
  }, [])

  // Sin productos no queda nada que descontar: el descuento global no puede
  // quedar "residual" de una venta anterior.
  useEffect(() => {
    if (items.length === 0 && gsNum(descuento) > 0) setDescuento('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])
  // Combos activos de la tienda para agregarlos como varias líneas de una vez.
  useEffect(() => {
    if (esDemo) { setCombos([]); return }
    resources.combos.list().then(setCombos).catch(() => setCombos([]))
  }, [esDemo])

  function nombreDe(id) {
    return productos.find(p => p.id === id)?.nombre || ''
  }
  // Resolución autoritativa de precio por lista de cliente (issue #28): el
  // servidor decide escalón > lista > mayorista > minorista > USD. La UI cachea
  // por cliente+producto+cantidad y guarda el origen resuelto en la fila para
  // mostrarlo y para calcular la venta bajo lista.
  const preciosCache = useRef(new Map())
  const clientePreciosRef = useRef('__inicial__')
  const itemsRef = useRef(items)
  itemsRef.current = items

  // Unidades disponibles del producto que se está por vender: con stock en la
  // sucursal no se puede "sobre pedir" (el servidor exige el IMEI exacto); el
  // modal lo avisa. #263: mismo alcance que el selector (producto + sucursal)
  // para que el aviso y el server no se contradigan.
  useEffect(() => {
    const fila = itemsRef.current.find(it => it.key === imeiPara)
    const producto = fila ? productos.find(p => p.id === fila.productoId) : null
    if (!imeiPara || !producto || esDemo) { setUnidadesDeImei(0); return undefined }
    let vivo = true
    resources.inventoryUnits.list('', 'active', { productId: producto.id, status: 'AVAILABLE', ...(sucursal?.id ? { branchId: sucursal.id } : {}) })
      .then(rows => { if (vivo) setUnidadesDeImei((rows || []).filter(unit => unit.productId === producto.id && unit.status === 'AVAILABLE').length) })
      .catch(() => { if (vivo) setUnidadesDeImei(0) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imeiPara, sucursal?.id])

  async function resolverPrecio(productoId, quantity) {
    if (esDemo || !productoId) return null
    const clienteId = customer?.id || ''
    const clave = `${clienteId}:${productoId}:${quantity}`
    if (preciosCache.current.has(clave)) return preciosCache.current.get(clave)
    try {
      const info = await resources.priceLists.pricing({
        productId: productoId,
        quantity: String(quantity),
        ...(clienteId ? { customerId: clienteId } : {}),
      })
      preciosCache.current.set(clave, info)
      return info
    } catch {
      return null
    }
  }

  // Display-only quote for one unit. Never seed the cart cache or change sale lines.
  const resolverPreciosCatalogo = useCallback(async productIds => {
    const ids = [...new Set(productIds)].filter(Boolean)
    const clienteId = customer?.id || ''
    const params = { quantity: '1', ...(clienteId ? { customerId: clienteId } : {}) }
    const prices = {}
    if (esDemo) {
      for (const productId of ids) prices[productId] = await resources.priceLists.pricing({ ...params, productId })
    } else {
      for (let offset = 0; offset < ids.length; offset += 100) {
        const response = await resources.priceLists.pricing({ ...params, productIds: ids.slice(offset, offset + 100).join(',') })
        if (!response || typeof response.prices !== 'object' || !response.prices) throw new Error('Precio no disponible')
        for (const id of ids.slice(offset, offset + 100)) if (response.prices[id]) prices[id] = { ...response.prices[id], priceList: response.priceList ?? null }
      }
    }
    return prices
  }, [customer?.id, esDemo])
  const contextoPreciosCatalogo = `${empresa?.id || ''}:${sucursal?.id || ''}:${customer?.id || ''}`

  // Aplica el precio resuelto por el servidor salvo que la fila tenga precio
  // manual o un cupón (el cupón ya viene cotizado por el servidor).
  async function aplicarPrecioResuelto(key, productoId, quantity) {
    const info = await resolverPrecio(productoId, quantity)
    if (!info) return
    setItems(arr => arr.map(it => {
      if (it.key !== key || it.precioManual || it.couponCode || it.combo) return it
      const esUsd = info.currency === 'USD'
      // El fallback USD→retail lo decide el servidor (#79); la UI solo lo usa.
      const precioPyg = Number(info.unitPricePygFallback ?? info.unitPricePyg) || 0
      return {
        ...it,
        precio: precioPyg,
        precioOrigen: info.origin,
        precioLista: info.priceList?.name || null,
        precioMinQty: info.minQty ?? null,
        precioUsd: esUsd ? Number(info.unitPriceUsd) : null,
        precioListaValor: esUsd ? null : precioPyg,
      }
    }))
  }

  // Al cambiar de cliente se descarta la caché y se vuelven a resolver las
  // filas sin precio manual, cupón ni combo. Corre también al montar para
  // refrescar un carrito restaurado.
  useEffect(() => {
    if (esDemo) return
    if (clientePreciosRef.current === (customer?.id || '')) return
    clientePreciosRef.current = customer?.id || ''
    preciosCache.current.clear()
    for (const fila of itemsRef.current) {
      if (!fila.precioManual && !fila.couponCode && !fila.combo) aplicarPrecioResuelto(fila.key, fila.productoId, fila.quantity || 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, esDemo])

  // Precio de lista que corresponde a esta venta: mayorista si el cliente lo es.
  function precioListaDe(id, quantity = 1) {
    const producto = productos.find(p => p.id === id)
    if (!producto) return undefined
    const info = preciosCache.current.get(`${customer?.id || ''}:${id}:${quantity}`)
    if (info) return Number(info.unitPricePygFallback ?? info.unitPricePyg) || 0
    if (customer?.pricingTier === 'WHOLESALE' && Number(producto.wholesalePricePyg) > 0) return Number(producto.wholesalePricePyg)
    return Number(producto.precioVenta) || 0
  }
  // Venta bajo lista: diferencia acumulada entre el precio de lista y el precio
  // manual de cada línea (espejo del control del servidor). Los cupones ya
  // vienen cotizados por el servidor y no cuentan como precio discrecional.
  const bajoLista = items.reduce((acc, it) => {
    if (it.couponCode || it.combo) return acc
    const lista = precioListaDe(it.productoId, it.quantity || 1)
    if (lista === undefined) return acc
    const gap = (Number(lista) - Number(it.precio || 0)) * (it.quantity || 1)
    if (gap <= 0) return acc
    acc.total += gap
    acc.base += Number(lista) * (it.quantity || 1)
    acc.productos.add(it.productoId)
    return acc
  }, { total: 0, base: 0, productos: new Set() })
  const descuentoPorPrecio = bajoLista.total
  const productoBajoId = bajoLista.productos.size === 1 ? [...bajoLista.productos][0] : null
  // Hasta el porcentaje configurado por la empresa (default 10%) la venta bajo
  // lista no pide autorización: solo el excedente se autoriza.
  const pctBajoListaPermitido = Number(empresa?.belowListPct ?? 10)
  const excedenteBajoLista = Math.max(0, descuentoPorPrecio - Math.floor((bajoLista.base * pctBajoListaPermitido) / 100))
  // Sin excedente que autorizar no hace falta la autorización: se limpia la selección.
  useEffect(() => { if (excedenteBajoLista <= 0 && authPrecio) setAuthPrecio(null) }, [excedenteBajoLista, authPrecio])
  function agregarCombo(combo) {
    const componentes = (Array.isArray(combo.items) ? combo.items : []).map(item => {
      const producto = productos.find(p => p.id === item.productId)
      return producto ? { producto, cantidad: Number(item.quantity) || 1 } : null
    }).filter(Boolean)
    if (componentes.length < 2) return
    const totalLista = componentes.reduce((sum, { producto, cantidad }) => sum + (Number(producto.precioVenta) || 0) * cantidad, 0)
    const precioCombo = Number(combo.pricePyg) || 0
    let asignado = 0
    const nuevas = componentes.map(({ producto, cantidad }, index) => {
      const base = (Number(producto.precioVenta) || 0) * cantidad
      const share = index === componentes.length - 1 ? Math.max(0, precioCombo - asignado) : Math.round(totalLista > 0 ? (precioCombo * base) / totalLista : precioCombo / componentes.length)
      asignado += share
      return {
        key: `${Date.now()}-${Math.random()}`,
        productoId: producto.id,
        nombre: producto.nombre,
        precio: cantidad > 0 ? Math.round(share / cantidad) : share,
        quantity: cantidad,
        couponCode: null,
        soldWithoutInsurance: false,
        serials: [],
        sobrePedido: false,
        combo: combo.name,
        comboId: combo.id,
      }
    })
    setItems(arr => [...arr, ...nuevas])
    setNoticeCombo(`Combo ${combo.name} agregado: ${nuevas.length} componentes por ${gs(precioCombo)}.`)
  }

  // Precio con el que entra un producto a la venta: mayorista si el cliente lo es.
  function precioDe(producto) {
    if (!producto) return 0
    if (customer?.pricingTier === 'WHOLESALE' && Number(producto.wholesalePricePyg) > 0) {
      return Number(producto.wholesalePricePyg)
    }
    return Number(producto.precioVenta) || 0
  }

  // Clic en el buscador: el producto entra a la venta y se termina de editar
  // (cantidad, precio, color, IMEI) en la lista.
  function agregarProducto(producto) {
    if (!producto) return
    const key = `${Date.now()}-${Math.random()}`
    const existente = itemsRef.current.find(
      it => it.productoId === producto.id && !it.serials?.length && !it.couponCode && !it.combo,
    )
    setItems(arr => {
      const indice = arr.findIndex(
        it => it.productoId === producto.id && !it.serials?.length && !it.couponCode,
      )
      if (indice >= 0) {
        return arr.map((it, i) => (i === indice ? { ...it, quantity: (it.quantity || 1) + 1 } : it))
      }
      return [
        ...arr,
        {
          key,
          productoId: producto.id,
          nombre: producto.nombre,
          precio: precioDe(producto),
          quantity: 1,
          couponCode: null,
          soldWithoutInsurance: false,
          serials: [],
          sobrePedido: false,
        },
      ]
    })
    setErrorVenta('')
    detectarUnidades(producto, key)
    // El precio local es solo el adelanto: el servidor confirma el precio de
    // lista del cliente (o el mayorista/minorista) para esta cantidad.
    if (existente && !existente.precioManual) aplicarPrecioResuelto(existente.key, producto.id, (existente.quantity || 1) + 1)
    else if (!existente) aplicarPrecioResuelto(key, producto.id, 1)
  }

  // Los productos con unidades serializadas piden IMEI en su fila.
  function detectarUnidades(producto, key) {
    // #263: unidades del producto en la sucursal de la venta (mismo alcance que
    // el selector y el servidor). Antes se buscaba por SKU/nombre y el tope de
    // la API podía devolver cero con unidades reales en stock: la guía no pedía
    // el IMEI y el guardado moría con el 400 del servidor.
    resources.inventoryUnits.list('', 'active', {
      productId: producto.id,
      ...(sucursal?.id ? { branchId: sucursal.id } : {}),
    })
      .then(rows => {
        const unidades = (rows || []).filter(unit => unit.productId === producto.id && unit.status === 'AVAILABLE').length
        if (!unidades) return
        setItems(arr => arr.map(it => (it.key === key ? { ...it, requiereSerie: true, unidades } : it)))
      })
      .catch(() => {})
  }

  function quitarItem(key) {
    setItems(arr => arr.filter(x => x.key !== key))
  }
  function editarItem(key, patch) {
    setItems(arr => arr.map(x => {
      if (x.key !== key) return x
      const siguiente = { ...x, ...patch }
      // Marcar el precio como manual (no lo pisa la resolución de lista) y
      // limpiarlo al cambiar de producto o variante.
      if (patch.precio !== undefined) siguiente.precioManual = true
      if (patch.productoId !== undefined) { siguiente.precioManual = false; siguiente.couponCode = null }
      return siguiente
    }))
    if (patch.quantity !== undefined || patch.productoId !== undefined) {
      const fila = itemsRef.current.find(x => x.key === key)
      if (fila) aplicarPrecioResuelto(key, patch.productoId || fila.productoId, Number(patch.quantity ?? fila.quantity) || 1)
    }
  }
  // Descuento por línea: porcentual si hay %, si no el fijo en guaraníes.
  const descuentoItem = it => {
    const pct = parsePercent(it.descuentoPct) ?? 0
    if (pct > 0) return Math.round((it.precio * (it.quantity || 1) * pct) / 100)
    return Math.min(gsNum(it.descuento || 0), it.precio * (it.quantity || 1))
  }

  const totalCarrito = items.reduce((a, it) => a + it.precio * (it.quantity || 1) - descuentoItem(it), 0)
  const tieneCupon = items.some(it => it.couponCode)
  const subtotal = totalCarrito
  // Retiro en tienda no cobra envío: si quedó un monto cargado (p. ej. un
  // borrador viejo), la venta lo ignora y no lo manda al backend (#187).
  const montoDeliveryEfectivo = montoEnvioEfectivo(f.entrega, gsNum(f.montoDelivery))
  const totalGeneral = Math.max(0, subtotal - gsNum(descuento) + montoDeliveryEfectivo)
  // «No pagado» (#148 §11): un bloque marcado así no suma a lo cobrado y la
  // venta queda con ese saldo pendiente (el pago viaja con estado PENDING).
  const totalPagado = pagos.reduce((s, p) => s + (p.noPagado ? 0 : gsNum(p.monto)), 0)
  // Descuento sugerido por el medio elegido (ej. efectivo 5%).
  const descuentoMedioPct = Math.max(0, ...pagos.map(pago => Number(cuentas?.find(cuenta => cuenta.id === pago.accountId)?.discountPct || 0)), 0)
  const descuentoMedioGs = Math.round((subtotal * descuentoMedioPct) / 100)
  const pendiente = Math.max(0, totalGeneral - totalPagado)
  // Crédito: anticipa lo que el servidor va a decidir (límite − deuda abierta).
  // Quien puede autorizar es el dueño o un gerente; los demás usan el PIN de uno.
  // «Autorizo yo»: solo el dueño/administrador; un gerente no se aprueba su propia venta (usa el PIN de otro).
  const puedeAutorizarCredito = ['dueno', 'ADMIN'].includes(sesion?.rol)
  const evaluacionCredito = venderACredito && customer?.id
    ? evaluarCredito({ limite: customer.creditLimitPyg, deuda: deudaCliente, saldo: pendiente })
    : null
  // Efectivo en dólares: se puede entregar de más y se devuelve el vuelto en Gs.
  const vueltoExtranjero = usaCuentas ? vueltoEfectivoExtranjero(pagos, cuentas, totalGeneral) : { exceso: 0, vuelto: 0, permitido: true }
  const excedePagos = totalPagado > totalGeneral && !vueltoExtranjero.permitido

  // Guía inline (#148 §11): líneas que hoy bloquean el guardado — sin IMEI
  // elegido o sin stock y sin marcar «sobre pedido» — con su acción para
  // resolverlas desde el cobro.
  const pendientesVenta = items.flatMap(it => {
    const producto = productos.find(p => p.id === it.productoId)
    const sinImei = Boolean(it.requiereSerie) && !(it.serials?.length) && !it.sobrePedido
    // Serializadas: manda el selector de unidades, no el contador (#148 §11).
    const sinStock = !it.sobrePedido && !it.requiereSerie && Boolean(producto) && num(producto.stock) < (it.quantity || 1)
    if (!sinImei && !sinStock) return []
    return [{
      key: it.key,
      nombre: it.nombre || 'Producto',
      motivo: sinImei ? 'imei' : 'stock',
      unidades: Number(it.unidades) || 0,
    }]
  })

  const cantTotal = items.reduce((a, it) => a + (it.quantity || 1), 0)
  // #263: se puede vender sin cliente → «Cliente ocasional»; el botón nunca se
  // deshabilita en silencio: los motivos se listan debajo.
  const clienteEfectivo = String(f.cliente ?? '').trim() || 'Cliente ocasional'
  const motivosBloqueo = [
    !sesion?.vendedorId && 'Ingresá con tu PIN para vender.',
    accesoStockInvalidado && 'Verificá el acceso al stock antes de continuar.',
    cantTotal === 0 && 'Agregá al menos un producto.',
    excedePagos && 'Los pagos superan el total de la venta.',
    gsNum(descuento) > subtotal && 'El descuento supera el subtotal.',
  ].filter(Boolean)
  const valido = !accesoStockInvalidado && sesion?.vendedorId && cantTotal > 0 && !excedePagos && gsNum(descuento) <= subtotal

  // Informa al contenedor lo que lleva esta compra, para pintarlo en la barra
  // compacta de pantallas angostas. Cada línea viaja con su subtotal ya
  // calculado (precio unitario × cantidad) para no volver a multiplicar.
  useEffect(() => {
    if (!onCarrito) return
    onCarrito({
      items: lineasParaResumen(items),
      quitar: quitarItem,
      puedeRevisar: items.length > 0,
      irARevisar: () =>
        document.getElementById('pos-resumen-venta')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, f.cliente])
  // Escaneo de etiqueta (MOBOS:PROD:<sku>): el lector USB escribe como teclado.
  // Se muestra el producto y se agrega al confirmar, no de prepo.
  useEffect(() => {
    const match = busquedaProducto.trim().toUpperCase().match(/^MOBOS:PROD:([A-Z0-9-]+)$/)
    if (!match) return
    const producto = productos.find(item => String(item.sku || '').toUpperCase() === match[1])
    setBusquedaProducto('')
    if (producto) setEscaneado(producto)
    else setErrorVenta(`El código escaneado no está en el catálogo (${match[1]}).`)
  }, [busquedaProducto, productos])

  const familiasVisibles = familias.filter(fam => {
    if (accesorio !== 'todas' && !fam.items.some(item => categoriaAccesorioDe(item) === accesorio)) return false
    const query = busquedaProducto.trim().toLocaleLowerCase()
    if (!query) return true
    // Nombre, modelo/variante y SKU: tipear el código a mano tiene que
    // encontrar el producto igual que el escaneo (#148 §11).
    return [fam.base, ...fam.items.map(item => item.nombre), ...fam.items.map(item => String(item.sku || ''))].some(text =>
      text.toLocaleLowerCase().includes(query),
    )
  })
  // Página del servidor: se agrupa en familias, pero cada familia se completa
  // con sus variantes del espejo local para que el selector no quede a medias
  // cuando una familia cruza el límite de página.
  const familiasServidor = catalogoServidor.activo
    ? agruparProductos(catalogoServidor.items.filter(p => p.activo)).map(fam => familias.find(f => f.base === fam.base) ?? fam)
    : null

  function agregarColor() {
    const c = colorInput.trim()
    if (!c) return
    if (!coloresNuevos.some(x => x.toLowerCase() === c.toLowerCase()))
      setColoresNuevos(s => [...s, c])
    setColorInput('')
  }

  function cancelarNuevoProd() {
    setNuevoProd(false)
    setNombreProd('')
    setColoresNuevos([])
    setColorInput('')
    setNuevoDetalles({ categoria: 'Accesorios', condicion: 'NEW', precio: '', mayorista: '', costo: '', accesorio: '' })
  }

  // SKU legible y estable a partir del nombre; si ya existe, el backend le
  // agrega un sufijo numérico (antes se le metía un timestamp y quedaba
  // ilegible: "CABLE-USB-C-MU5C3F2").
  const skuDe = texto => texto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'PRODUCTO'

  async function crearProducto() {
    const base = nombreProd.trim()
    if (!base || creandoProd) return
    const precioNuevo = gsNum(nuevoDetalles.precio)
    const costoNuevo = nuevoDetalles.costo === '' ? undefined : gsNum(nuevoDetalles.costo)
    const mayoristaNuevo = nuevoDetalles.mayorista === '' ? undefined : gsNum(nuevoDetalles.mayorista)
    if (precioNuevo <= 0) { setErrorVenta('Ingresá el precio de venta del producto nuevo.'); return }
    setCreandoProd(true); setErrorVenta('')
    try {
      const crear = async (nombre) => {
        if (esDemo) {
          const creado = addProducto(nombre, nuevoDetalles.categoria)
          updateProducto(creado.id, { precioVenta: precioNuevo, precioCosto: costoNuevo ?? 0, condicion: nuevoDetalles.condicion, mayorista: mayoristaNuevo ?? 0 })
          return creado
        }
        const creado = await addProductoApi({ nombre, sku: skuDe(nombre), precioVenta: precioNuevo, precioCosto: costoNuevo, category: nuevoDetalles.categoria, condition: nuevoDetalles.condicion, ...(mayoristaNuevo ? { wholesalePricePyg: mayoristaNuevo } : {}), ...(nuevoDetalles.accesorio ? { accessoryCategory: nuevoDetalles.accesorio } : {}), stock: 0 })
          // #404: las fotos preparadas en el alta suben apenas existe el producto.
          if (fotosNuevas.current.length) {
            try { await subirFotosPendientes(creado.id, fotosNuevas.current) } catch (cause) { console.error('[fotos-producto] alta sin fotos', cause); setErrorVenta('El producto se creó, pero no se pudieron subir las fotos. Agregalas desde su ficha.') }
          }
          return creado
        }
      if (coloresNuevos.length === 0) {
        // Producto sin colores: entra directo a la venta.
        agregarProducto(await crear(base))
      } else {
        // Con colores se crea una variante por color ("Base Color"); la primera
        // entra a la venta y el color se cambia en la fila.
        const items = []
        for (const c of coloresNuevos) items.push({ ...(await crear(`${base} ${c}`)), color: c })
        agregarProducto(items[0])
      }
      setNuevoProd(false)
      setNombreProd('')
      setColoresNuevos([])
      setColorInput('')
      setNuevoDetalles({ categoria: 'Accesorios', condicion: 'NEW', precio: '', mayorista: '', costo: '', accesorio: '' })
    } catch (error) {
      setErrorVenta(error?.message || 'No se pudo crear el producto.')
    } finally {
      setCreandoProd(false)
    }
  }

  // #308: elegir la variante exacta (o cerrar el selector sin agregar nada).
  function elegirVariante(familia, { elegir = false } = {}) {
    if (elegir) {
      agregarProducto(familia)
      setVariantePara(null)
      return
    }
    setVariantePara(familia)
  }

  // #309: la barra fija del celular vuelve al carrito sin buscar el bloque.
  function irAlCarrito() {
    if (esMovil) { setHoja('carrito'); return }
    document.getElementById('pos-resumen-venta')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Venta rápida: después de confirmar el cliente, la siguiente acción es
  // buscar/agregar productos. Mantener el foco acá evita que Enter termine
  // enviando el formulario completo por accidente.
  const enfocarBusquedaProducto = useCallback(() => {
    if (esMovilRef.current) return
    window.requestAnimationFrame(() => {
      const campo = document.querySelector('#pos-busqueda-producto input')
      campo?.focus()
      campo?.select?.()
    })
  }, [])

  const irACobrarRapido = useCallback(() => {
    if (!items.length) return
    setModoCobro(true)
    window.requestAnimationFrame(() => {
      document.querySelector('[data-testid="pos-cobro"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [items.length])

  async function guardar(e) {
    e.preventDefault()
    if (guardando || guardadoEnCurso.current || guardadoIncompleto || accesoStockInvalidado) return
    const lista = [...items]
    if (!sesion?.vendedorId || lista.length === 0) return
    if (excedePagos) { setErrorVenta('Los pagos superan el total de la venta: ajustá los montos.'); return }
    if (gsNum(descuento) > subtotal) { setErrorVenta('El descuento supera el subtotal de la venta.'); return }
    const orderItems = lista.map(it => {
      const pct = parsePercent(it.descuentoPct) ?? 0
      const fijo = gsNum(it.descuento || 0)
      return {
        productId: it.productoId,
        description: it.nombre || nombreDe(it.productoId),
        quantity: it.quantity || 1,
        unitPricePyg: it.precio,
        soldWithoutInsurance: Boolean(it.soldWithoutInsurance),
        // Venta sin unidad/stock decidida por el vendedor (#148 §11) y, si
        // aplica, la reserva anticipada de un lote en tránsito (#309; la
        // conciliación del lote la hace Inventario).
        ...(it.sobrePedido ? { backorder: true } : {}),
        ...(it.enTransito ? { enTransito: true, asignacionAnticipada: true } : {}),
        ...(it.serials?.length ? { inventoryUnitSerials: it.serials } : {}),
        ...(it.couponCode ? { couponCode: it.couponCode } : {}),
        ...(it.comboId ? { comboId: it.comboId } : it.combo ? { comboName: it.combo } : {}),
        ...(pct > 0 ? { discountPct: pct } : fijo > 0 ? { discountPyg: fijo } : {}),
      }
    })
    // La venta se registra por unidad: las filas con cantidad > 1 se expanden
    // para que descuento, pagos y stock se repartan por unidad (sin esto, el
    // total sumaba el precio unitario y los pagos "superaban el total").
    const listaDemo = lista.flatMap(it =>
      Array.from({ length: it.quantity || 1 }, () => ({ ...it, quantity: 1 })),
    )
    setErrorVenta('')
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = `pos-${crypto.randomUUID()}`
    // Trabajando sin conexión: los chequeos que dependen de la red (cuentas de
    // cobro, stock real, IMEI) se relajan; la venta se encola con `offline:
    // true` y el backend la recibe con stock laxo, marcada para revisión.
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false
    let lineas
    let payments
    try {
      // #148 §9: los importes viven en columnas de 32 bits. Los campos ya acotan
      // el tope real y lo marcan (MoneyInput), pero el guardado seguía de largo
      // y el backend lo rechazaba sin decir qué monto era el problema: acá se
      // bloquea con el detalle antes de armar el pedido.
      const excesos = montosFueraDeRango({
        lineas: lista.map(it => ({
          nombre: it.nombre || nombreDe(it.productoId),
          precio: gsNum(it.precio),
          cantidad: it.quantity || 1,
          descuento: descuentoItem(it),
        })),
        descuento: gsNum(descuento),
        envio: montoDeliveryEfectivo,
        pagos: pagos.map(p => ({ monto: gsNum(p.monto) })),
        totalGeneral,
        totalPagado,
      })
      if (excesos.length) throw new Error(mensajeMontosFueraDeRango(excesos))
      // #263: la detección de unidades es asíncrona (y puede fallar): al guardar
      // se confirma contra el servidor que ninguna línea sin serial tenga stock
      // serializado, así no se manda un pedido incompleto que el API rechace.
      const sinSerial = lista.filter(it => !it.serials?.length && !it.sobrePedido && !it.requiereSerie)
      const conUnidades = []
      for (const it of sinSerial) {
        const productoUnidades = productos.find(p => p.id === it.productoId)
        if (!productoUnidades) continue
        try {
          const filas = await resources.inventoryUnits.list(productoUnidades.sku || productoUnidades.nombre || '')
          const disponibles = (filas || []).filter(unit => unit.productId === productoUnidades.id
            && unit.status === 'AVAILABLE'
            && (!productoUnidades.branchId || !unit.branchId || unit.branchId === productoUnidades.branchId)).length
          if (disponibles) conUnidades.push({ ...it, unidades: disponibles })
        } catch { /* sin conexión: queda la validación local */ }
      }
      const sinImei = lista.filter(it => it.requiereSerie && !it.serials?.length && !it.sobrePedido)
      for (const extra of conUnidades) if (!sinImei.some(it => it.key === extra.key)) sinImei.push(extra)
      if (sinImei.length && !sinRed) {
        // Guía dentro del flujo (#263): se abre el selector del primer equipo
        // que falta y el aviso nombra a todos los que necesitan serial.
        setImeiPara(sinImei[0].key)
        throw new Error(
          `Falta elegir el IMEI/serial de ${sinImei.map(it => `«${it.nombre}»`).join(', ')}. Elegí la unidad exacta en el selector (o marcalo como «sobre pedido»).`,
        )
      }
      if (tieneCupon && gsNum(descuento) > 0)
        throw new Error('Quitá el descuento extra para utilizar un cupón. No son acumulables.')
      if (customer.phone?.trim() && !telefonoValido(customer.phone, customer.countryCode))
        throw new Error(MENSAJE_TELEFONO)
      const descuentoGlobal = gsNum(descuento)
      // Descuento global sin permiso: exige una autorización DISCOUNT aprobada
      // que alcance para el monto. Las líneas siguen bloqueadas como antes.
      if (!puedeDescontar && descuentoGlobal > 0) {
        if (!authDescuento)
          throw new Error(
            'El descuento necesita autorización de gerencia. Solicitá autorización y actualizá el estado.',
          )
        if (descuentoGlobal > Number(authDescuento.maxDiscountPyg || 0))
          throw new Error(
            `La autorización no alcanza para este descuento (máx ${gs(Number(authDescuento.maxDiscountPyg || 0))}). Solicitá una nueva.`,
          )
      }
      if (!puedeDescontar && items.some(it => descuentoItem(it) > 0))
        throw new Error('Solo administradores y gerentes pueden aplicar descuentos por línea.')
      // Venta bajo lista sin permiso: hasta el porcentaje configurado no pide
      // autorización; el excedente exige una autorización BELOW_LIST_PRICE que
      // lo cubra.
      if (!puedeDescontar && excedenteBajoLista > 0) {
        if (!authPrecio)
          throw new Error(
            `El precio está más de ${pctBajoListaPermitido}% por debajo de lista y necesita autorización de gerencia. Solicitá autorización desde el carrito y actualizá el estado.`,
          )
        if (excedenteBajoLista > Number(authPrecio.maxDiscountPyg || 0))
          throw new Error(
            `La autorización de precio no alcanza para esta venta (excedente bajo lista ${gs(excedenteBajoLista)}, máx ${gs(Number(authPrecio.maxDiscountPyg || 0))}). Solicitá una nueva.`,
          )
      }
      if (venderACredito && customer.blocked)
        throw new Error(`Cliente bloqueado${customer.blockedReason ? `: ${customer.blockedReason}` : ''}. No se puede vender a crédito.`)
      // Sin crédito (o por encima del disponible) la venta no se bloquea acá: el
      // servidor la deja «Pendiente de autorización de crédito» o la autoriza
      // gerencia con su PIN. Lo que sí hace falta es un cliente con ficha.
      if (venderACredito && !customer.id)
        throw new Error('Elegí un cliente con ficha para vender a crédito.')
      if (esDemo) validateDemoPromotionItems(orderItems, productos, gsNum(descuento))
      if (!sinRed && (!cuentas || errorCuentas))
        throw new Error(errorCuentas || 'Esperá a que terminen de cargar las cuentas.')
      // Sin conexión no se pueden armar filas con cuenta de cobro (necesitan la
      // lista de cuentas): se avisa en vez de encolar algo que va a fallar.
      if (sinRed && !cuentas && pagos.some(p => p.accountId))
        throw new Error('Sin conexión no se pueden usar las cuentas de cobro ya cargadas. Recargá el cobro o esperá la conexión.')
      if (!usaCuentas && pagos.some(p => !String(p.monto).trim() || gsNum(p.monto) <= 0))
        throw new Error('Ingresá un monto positivo en cada pago o quitá la fila vacía.')
      // Gift cards (#280): la fila propia lleva código y monto; el saldo se
      // valida en el servidor, pero pedimos la consulta previa para no cobrar a
      // ciegas. Sin conexión no se puede validar el saldo, así que no se canjea.
      const filasGiftCard = pagos.filter(p => p.giftCardCode !== undefined)
      if (filasGiftCard.length) {
        if (sinRed) throw new Error('Sin conexión no se pueden canjear gift cards: la validación del saldo necesita la conexión.')
        const incompleta = filasGiftCard.find(p => !normalizarCodigoGiftCard(p.giftCardCode) || gsNum(p.monto) <= 0)
        if (incompleta) throw new Error('Revisá la gift card: el código tiene que ser GC-XXXX-XXXX-XXXX y el monto mayor a cero.')
        const sinConsultar = filasGiftCard.find(p => !p.giftCard?.id)
        if (sinConsultar) throw new Error('Consultá el saldo de la gift card antes de cobrar (botón «Consultar saldo»).')
        const excedida = filasGiftCard.find(p => gsNum(p.monto) > Number(p.giftCard?.balancePyg || 0))
        if (excedida) throw new Error('El monto de la gift card supera su saldo disponible. Ajustalo o consultá el saldo.')
      }
      // Pago de una gift card: el código viaja con el pago y el servidor
      // descuenta el saldo en la misma transacción de la venta.
      const pagoGiftCard = p => ({
        method: 'GIFT_CARD',
        amountPyg: gsNum(p.monto),
        status: p.noPagado ? 'PENDING' : 'CONFIRMED',
        giftCardCode: normalizarCodigoGiftCard(p.giftCardCode) || p.giftCardCode,
        // El medio legacy de la demo (Caja/conciliación) no cuenta la gift card
        // como efectivo: el canje no mueve plata.
        medioPago: 'Gift card',
      })
      // Forma legacy (sin cuentas de cobro): solo método, monto en ₲ y estado.
      // Los campos de moneda (originalAmount/currency/exchangeRatePyg) se
      // rechazan sin accountId.
      // «No pagado» (#148 §11): el bloque queda PENDING y no cuenta como cobrado.
      // Vuelto en dólares: al servidor viaja solo lo aplicado a la venta.
      const pagosParaServidor = usaCuentas && vueltoExtranjero.exceso > 0 ? pagosSinVuelto(pagos, cuentas, totalGeneral) : pagos
      if (!pagosParaServidor) throw new Error('Para dar vuelto en dólares hace falta una cuenta de efectivo en guaraníes.')
      payments = usaCuentas
        ? pagosParaServidor.map(p => (p.giftCardCode !== undefined ? pagoGiftCard(p) : { ...accountPayment(p, cuentas), status: p.noPagado ? 'PENDING' : 'CONFIRMED' }))
        : pagos.map(p => (p.giftCardCode !== undefined
          ? pagoGiftCard(p)
          : {
              method: /efectivo/i.test(p.medioPago)
                ? 'CASH'
                : /tarjeta|pos/i.test(p.medioPago)
                  ? 'CARD'
                  : 'TRANSFER',
              amountPyg: gsNum(p.monto),
              status: p.noPagado ? 'PENDING' : 'CONFIRMED',
              ...([p.medioPago, p.cuenta].filter(Boolean).join(' · ').trim()
                ? { reference: [p.medioPago, p.cuenta].filter(Boolean).join(' · ') }
                : {}),
            }))
      if (esDemo)
        payments = payments.map(p => {
          const account = cuentas.find(a => a.id === p.accountId)
          return {
            ...p,
            id: crypto.randomUUID(),
            ...(account
              ? {
                  currency: account.currency,
                  accountSnapshot: { ...account },
                  medioPago: account.name,
                  cuenta: account.name,
                }
              : {}),
          }
        })
      // Solo se exige stock a las líneas que no van marcadas «sobre pedido» y a
      // las no serializadas (#148 §11): las marcadas se crean como pedido sin
      // descontar existencia y las serializadas las gobierna el selector de
      // unidades (el backend valida la unidad exacta).
      const cantidades = new Map()
      for (const item of lista) {
        if (item.sobrePedido || item.requiereSerie) continue
        cantidades.set(
          item.productoId,
          (cantidades.get(item.productoId) || 0) + (item.quantity || 1),
        )
      }
      for (const [id, cantidad] of cantidades) {
        const producto = productos.find(p => p.id === id)
        if (!producto) throw new Error('No encontramos uno de los productos de la venta.')
        // Sin conexión el stock local puede estar viejo: se permite la venta
        // (stock laxo) y el backend la marca para revisión.
        if (!sinRed && num(producto.stock) < cantidad)
          throw new Error(`Sin stock de ${producto?.nombre || 'un producto'}: marcalo como «sobre pedido» para crear el pedido igual.`)
      }
      lineas = allocateCheckout(
        listaDemo,
        gsNum(descuento),
        montoDeliveryEfectivo,
        usaCuentas
          ? pagos.map((p, i) => ({ ...p, ...payments[i], monto: payments[i].amountPyg }))
          : pagos.map((p, i) => ({ ...p, ...payments[i], monto: gsNum(p.monto) })),
      )
    } catch (error) {
      setErrorVenta(error.message)
      return
    }

    // Fecha real de hoy, salvo que se haya elegido una a mano (para no guardar
    // con una fecha vieja si la app quedó abierta desde ayer).
    const fechaVenta = f.fechaManual ? f.fecha : fechaClave()

    // Si hay más de un producto, los marcamos como una misma compra para que el
    // historial los muestre agrupados.
    const compraId = listaDemo.length > 1 ? `compra-${Date.now().toString(36)}` : undefined

    // Una venta por producto, compartiendo cliente/vendedor/pago. El costo de
    // envío se cobra una sola vez (va en el primer producto).
    setGuardando(true)
    guardadoEnCurso.current = true
    let ventaPersistida = false
    let completedOrder = null
    const orderContext = contextoActual()
    // Payload de la venta tal como viajaría a la API: si la conexión se corta,
    // se encola este mismo objeto (con `offline: true`) sin perder nada.
    let payloadParaCola = null
    // Delivery (#461): dirección y repartidor; el nombre del repartidor solo va en el texto de la demo.
    const repartidorElegido = repartidores.find(r => r.id === f.repartidorId) || null
    const notasEntrega = notasDeEntrega(f.entrega, f, customer.addresses, esDemo ? repartidorElegido : null)
    try {
      if (!esDemo) {
        const orderPayload = {
            ...(customer.id
              ? {
                  customerId: customer.id,
                  // Contacto corregido en el POS: viaja para persistirlo en la
                  // ficha (el correo dejaba de guardarse al editar y vender).
                  ...(customer.email?.trim() || customer.phone?.trim() || Object.keys(customerIdentityPayload(customer)).length
                    ? {
                        customer: {
                          ...(customer.email?.trim() ? { email: customer.email.trim() } : {}),
                          ...(customer.phone?.trim() ? { phone: customer.phone.trim() } : {}),
                          ...customerIdentityPayload(customer),
                        },
                      }
                    : {}),
                }
              : {
                  customer: {
                    // El nombre visible de mostrador viaja separado de la identidad fiscal exacta.
                    name: checkoutVisibleName(customer, clienteEfectivo),
                    ...customerIdentityPayload(customer),
                    ...(customer.phone?.trim() ? { phone: customer.phone.trim() } : {}),
                    ...(customer.countryCode ? { countryCode: customer.countryCode } : {}),
                    ...(customer.email?.trim() ? { email: customer.email.trim() } : {}),
                    ...(customer.document?.trim() ? { document: customer.document.trim() } : {}),
                    ...(customer.addresses?.length
                      ? {
                          addresses: customer.addresses
                            .filter(address => address.address?.trim())
                            .map((address, index) => ({
                              label: address.label?.trim() || `Dirección ${index + 1}`,
                              address: address.address.trim(),
                              ...(address.city?.trim() ? { city: address.city.trim() } : {}),
                              ...(address.department?.trim() ? { department: address.department.trim() } : {}),
                              country: address.country?.trim() || 'Paraguay',
                              ...(address.notes?.trim() ? { notes: address.notes.trim() } : {}),
                              isDefault: address.isDefault === true,
                            })),
                        }
                      : {}),
                  },
                }),
            items: orderItems,
            payments,
            discountPyg: gsNum(descuento),
            // Vendedor sin permiso: la venta viaja con la autorización aprobada.
            ...(!puedeDescontar && gsNum(descuento) > 0 && authDescuento
              ? { discountAuthorizationId: authDescuento.id }
              : {}),
            ...(!puedeDescontar && excedenteBajoLista > 0 && authPrecio
              ? { priceAuthorizationId: authPrecio.id }
              : {}),
            deliveryPyg: montoDeliveryEfectivo,
            // La API rechaza observaciones vacías: se omiten en vez de mandar ''.
            ...(notasEntrega ? { deliveryNotes: notasEntrega } : {}),
            deliveryType: f.entrega,
            // «Paga al recibir» (#399): la marca viaja solo si estaba activa al enviar.
            ...(pagaAlRecibirVigente(pagaAlRecibir, pagos) ? { paymentOnDelivery: true } : {}),
            ...datosEncomienda(f.entrega, f, customer.addresses),
            // Factura a otro titular: solo viaja si se completó nombre o RUC.
            ...(billingTo.name.trim() || billingTo.document.trim()
              ? {
                  billingTo: checkoutBillingPayload(billingTo),
                }
              : {}),
            // Venta a crédito: plazo en días; el vencimiento lo calcula el backend.
            ...(venderACredito ? { creditDays: Number(creditoDias) || 0 } : {}),
            // Autorización en el mostrador: el servidor la ignora si no hace falta.
            ...(venderACredito && creditoAutorizoYo && puedeAutorizarCredito ? { creditSelfApproval: true } : {}),
            ...(venderACredito && !creditoAutorizoYo && creditoPin ? { creditApprovalPin: creditoPin } : {}),
            // Pedido especial con seña: la seña es el pago parcial ya cargado;
            // solo viaja la marca y la fecha esperada opcional.
            ...(f.specialOrder
              ? { specialOrder: true, ...(f.expectedAt ? { expectedAt: f.expectedAt } : {}) }
              : {}),
        }
        // Sin conexión no hay sin conexión que valga: la venta viaja con
        // `offline` para que el backend relaje el stock y la marque a revisar.
        payloadParaCola = orderPayload
        const order = await guardarOrdenApi(orderPayload, { idempotencyKey: idempotencyKeyRef.current })
        if (!order?.id || order.error || order.ok === false)
          throw new Error(order?.error || 'No se recibió confirmación de la orden.')
        ventaPersistida = true
        completedOrder = order
        if (f.entrega === 'Encomienda') recordarEmpresa(f.encEmpresa)
        // Repartidor elegido en el POS: queda asignado al pedido. Si falla no se pierde la
        // venta: se avisa y se asigna después desde Entregas.
        if (f.entrega === 'Delivery' && f.repartidorId) {
          try {
            await api.post(`/api/orders/${encodeURIComponent(order.id)}/assignment`, { assignedToId: f.repartidorId })
          } catch (causa) {
            console.error('[pos] no se pudo asignar el repartidor', causa)
            toast.error('Venta guardada, repartidor sin asignar', 'Asignalo desde Entregas.')
          }
        }
      } else {
        const validation = await validateDemoTradeIns(payments)
        if (validation === false || validation?.error || validation?.ok === false)
          throw new Error(validation?.error || 'No se pudo validar el canje.')
        const clientesDemo = listarClientesDemo()
        const clienteDemo = customer.id
          ? customer
          : clientesDemo.find(
              c =>
                String(c.name || '').toLowerCase() === String(customer.name || '').trim().toLowerCase() &&
                (!customer.phone || c.phone === customer.phone),
            ) || { ...customer, name: typeof customer.nameOfficial === 'string' ? customer.nameOfficial : customer.name.trim(), id: crypto.randomUUID() }
        // Gift cards demo (#280): se valida el saldo antes de crear la venta y
        // el canje se aplica al store local con la misma forma que el backend.
        const canjesGiftCard = payments.filter(p => p.method === 'GIFT_CARD')
        for (const canje of canjesGiftCard) {
          const tarjeta = buscarGiftCardDemo(canje.giftCardCode)
          if (tarjeta.status !== 'ACTIVE') throw new Error('La gift card está anulada o vencida.')
          if (Number(tarjeta.balancePyg) < canje.amountPyg) throw new Error(`La gift card no tiene saldo suficiente (disponible ${gs(Number(tarjeta.balancePyg))}).`)
        }
        // El número de pedido se toma ANTES de persistir la venta para que cada
        // venta demo lo guarde igual que una orden real (#275): el listado y el
        // detalle del pedido muestran AUR-#0001, no el id interno.
        // Crédito sobre el límite (misma regla que el servidor): sin crédito o por
        // encima del disponible la venta queda pendiente de autorización y no se
        // entrega. Un PIN incorrecto corta la venta antes de crearla.
        const creditoDemo = venderACredito
          ? autorizacionCreditoDemo({
              evaluacion: evaluarCreditoDemo({ clienteId: clienteDemo.id, limite: clienteDemo.creditLimitPyg, saldo: pendiente }),
              pin: creditoAutorizoYo ? '' : creditoPin,
              yoAutorizo: creditoAutorizoYo,
              sesion,
            })
          : null
        const plazoDemo = venderACredito ? Number(creditoDias) || Number(clienteDemo.creditDays) || 0 : 0
        const numeroPedidoDemo = tomarNumeroPedidoDemo()
        // Un pedido persistido con todas sus líneas: el detalle y los cobros
        // vuelven a leer este mismo ID, igual que con la API real (#487).
        const venta = await addVenta({
          ...pedidoPosDemo(lineas, productos),
          compraId,
          orderNumber: numeroPedidoDemo,
          vendedorId: sesion.vendedorId,
          vendedorNombre: sesion.nombre,
          cliente: String(f.cliente ?? '').trim(),
          clienteId: clienteDemo.id,
          clienteTelefono: clienteDemo.phone,
          clienteDireccion: clienteDemo.address,
          fecha: fechaVenta,
          medioPago: f.medioPago,
          entrega: f.entrega,
          observacion: notasEntrega,
          pagos: payments.map((pago, indice) => ({ ...pagos[indice], ...pago, monto: pago.amountPyg })),
          isSpecialOrder: Boolean(f.specialOrder),
          ...(f.expectedAt ? { expectedAt: f.expectedAt } : {}),
          ...(venderACredito ? { creditDays: plazoDemo } : {}),
          ...(creditoDemo ? { creditAuthorization: creditoDemo } : {}),
        })
        if (!venta?.id || venta.error || venta.ok === false)
          throw new Error(venta?.error || 'No se recibió confirmación de la venta demo.')
        ventaPersistida = true
        const ventas = [venta]
        for (const canje of canjesGiftCard) {
          canjearGiftCardDemo({ code: canje.giftCardCode, amountPyg: canje.amountPyg, orderId: ventas[0]?.id, orderNumber: numeroPedidoDemo })
        }
        if (!clientesDemo.some(c => c.id === clienteDemo.id))
          guardarClienteDemo(clienteDemo)
        // La venta entra en la ficha del cliente (#160/#194): la vista por
        // actividad, los agregados (#221), la ficha y el portal leen sus
        // pedidos, así que se actualizan como en la cuenta real.
        registrarPedidoDemoDeVenta(clienteDemo.id, {
          numero: numeroPedidoDemo,
          total: totalGeneral,
          pagado: totalPagado,
          fecha: fechaVenta,
          vendedor: sesion?.nombre || '',
          sucursal: sucursal?.nombre || '',
          estado: pendiente === 0 ? 'COMPLETED' : 'PENDING',
          credito: creditoDemo,
          creditDays: venderACredito ? plazoDemo : null,
          items: orderItems.map(item => {
            const producto = productos.find(p => p.id === item.productId)
            return {
              id: item.productId,
              description: item.description || producto?.nombre || '',
              quantity: item.quantity || 1,
              model: producto?.atributos?.modelo || '',
              category: producto?.categoria || '',
              serials: item.inventoryUnitSerials || [],
            }
          }),
        })
        const order = {
          ...ventas[0],
          orderNumber: numeroPedidoDemo,
          id: ventas[0].id,
          compraId,
          cliente: String(f.cliente ?? '').trim(),
          vendedorId: sesion.vendedorId,
          seller: { id: sesion.vendedorId, name: sesion.nombre },
          fecha: fechaVenta,
          totalPyg: totalGeneral,
          payments: venta.pagos,
          ventas,
          // El comprobante imprime `order.items`: sin esto el papel demo salía
          // sin la lista de artículos (#206).
          items: venta.items,
          isSpecialOrder: Boolean(f.specialOrder),
          ...(f.expectedAt ? { expectedAt: f.expectedAt } : {}),
        }
        const result = await recordDemoTradeIns(order, payments)
        if (result === false || result?.error || result?.ok === false)
          throw new Error(result?.error || 'No se pudo registrar el canje demo.')
        recordDemoPromotionUsage(orderItems, productos, gsNum(descuento))
        completedOrder = order
      }

      recordarUltimo(ULTIMO_VENDEDOR, f.vendedorId)
      idempotencyKeyRef.current = null // la próxima venta arranca con clave nueva
      const { empresaId, sucursalId, userId } = contextoActual()
      // La ficha ya existe (o la creó la venta): el borrador del RUC sobra.
      if (customer.document) descartarPreCliente(empresaId, customer.document)
      borrarCarrito(empresaId, sucursalId, userId)
      setCustomer({ ...CLIENTE_VACIO })
      setItems([])
      setDescuento('')
      setAuthDescuento(null)
      setVueltoExito(vueltoDePagos(pagos) + vueltoExtranjero.vuelto)
      setPagos([])
      setPagaAlRecibir(false)
      setVenderACredito(false)
      setCreditoDias('')
      setF(VACIO(f.vendedorId))
      setBusquedaProducto('')
      setLastOrder(completedOrder)
      // En celular la pregunta vive en la hoja de recibo; en escritorio, en el detalle.
      setPreguntaEntrega(esMovilRef.current && preguntaEntregaAplica(completedOrder) ? completedOrder : null)
      if (completedOrder?.creditAuthorization?.status === 'PENDING') {
        toast.info('Pendiente de autorización de crédito', 'Avisamos a gerencia. No se entrega hasta que lo autorice.')
      }
      setOk(true)
      setTimeout(() => setOk(false), 2500)
      onGuardado?.()
      // #275: al confirmar, la app va sola al detalle del pedido recién creado
      // —también en la demo—. Aplica a venta completa, parcial y a crédito; la
      // espera deja ver la animación de confirmación con el número del pedido.
      const pedidoId = completedOrder?.id
      // En celular la confirmación es una hoja con recibo y «Listo»: no se navega sola.
      if (pedidoId && !esMovilRef.current) {
        if (irAlDetalleRef.current) clearTimeout(irAlDetalleRef.current)
        irAlDetalleRef.current = setTimeout(() => {
          irAlDetalleRef.current = null
          // Si el vendedor ya se movió a otra pantalla, no lo interrumpimos.
          const path = orderDetailPath(completedOrder, orderContext, contextoActual(), window.location.pathname)
          // El detalle pregunta «¿ya se llevó el producto?»: la venta no se marca retirada sola.
          if (path) navigate(path, { state: { preguntaEntrega: true } })
        }, MS_CONFIRMACION_ANTES_DEL_DETALLE)
      }
    } catch (error) {
      // Sin conexión (o se cortó justo al enviar): la venta no se pierde. Queda
      // en la cola local con la misma Idempotency-Key y se reintenta al
      // reconectar; el backend la recibe con `offline` y la marca para revisión.
      if (!esDemo && payloadParaCola && esErrorDeRed(error)) {
        try {
          const item = await encolarVenta({
            // El PIN de un gerente y el «Autorizo yo» nunca se guardan en la cola local: la venta a crédito sobre el límite se sincroniza retenida, pendiente de autorización.
            payload: { ...payloadParaCola, creditApprovalPin: undefined, creditSelfApproval: undefined, offline: true },
            idempotencyKey: idempotencyKeyRef.current,
            resumen: { cliente: f.cliente, total: totalGeneral, items: orderItems.length },
          })
          recordarUltimo(ULTIMO_VENDEDOR, f.vendedorId)
          idempotencyKeyRef.current = null
          const { empresaId, sucursalId, userId } = contextoActual()
          borrarCarrito(empresaId, sucursalId, userId)
          setCustomer({ ...CLIENTE_VACIO })
          setItems([])
          setDescuento('')
          setAuthDescuento(null)
          setVueltoExito(0)
          setPagos([])
          setPagaAlRecibir(false)
          setVenderACredito(false)
          setCreditoDias('')
          setF(VACIO(f.vendedorId))
          setBusquedaProducto('')
          setAvisoOffline(
            `Venta guardada sin conexión${item?.resumen?.cliente ? ` (${item.resumen.cliente})` : ''}. Se sincroniza sola al volver la conexión.`,
          )
          setErrorVenta('')
          onGuardado?.()
          return
        } catch {
          /* si tampoco se puede encolar, sigue el error normal de abajo */
        }
      }
      if (ventaPersistida) setGuardadoIncompleto(true)
      setErrorVenta(
        ventaPersistida
          ? `La venta se guardó, pero quedó un paso incompleto: ${error?.message || 'error al finalizar'}. Revisá el registro antes de volver a vender; se bloqueó el reintento para evitar duplicados.`
          : error?.message || 'No se pudo guardar la venta. Tu carrito sigue disponible.',
      )
    } finally {
      setGuardando(false)
      guardadoEnCurso.current = false
    }
  }

  // `prefill.monto` llega de «Dividir saldo» (el saldo que falta): en el cobro
  // legacy se precarga tal cual; con cuentas, el monto lo propone la cuenta al
  // elegirla (PaymentAccountFields conoce el pendiente).
  function agregarPago(prefill = {}) {
    // #297: sin total por cobrar no se carga un pago.
    if (!cuentas || totalGeneral <= 0) return
    setPagos(arr => [
      ...arr,
      usaCuentas
        // #283: el pago arranca SIN cuenta (la predeterminada de #272 se
        // elimina) y el monto se edita en `originalAmount` (moneda de la
        // cuenta): al elegirla se propone el saldo que falta.
        // «Dividir pago» / «Completar en Gs»: la fila nueva sale con el saldo
        // que falta (o con la cuenta indicada ya elegida).
        ? (prefill.cuenta && prefill.monto > 0
          ? pagoDeMedio(prefill.cuenta, prefill.monto)
          : { ...PAGO_VACIO, accountId: '', originalAmount: prefill.monto > 0 ? String(Math.round(prefill.monto)) : '', exchangeRatePyg: '' })
        : { ...PAGO_VACIO, monto: prefill.monto ? String(prefill.monto) : pendiente > 0 ? String(pendiente) : '' },
    ])
  }

  // Gift card (#280): fila de cobro propia. El código se consulta contra el
  // saldo y el monto se propone con lo que falta pagar (nunca más que el saldo).
  function agregarGiftCard() {
    // #297: canjear con total Gs 0 o sin saldo pendiente no tiene sentido.
    if (!cuentas || !puedeCanjearGiftCard({ cantTotal, totalGeneral, pendiente })) return
    setPagos(arr => [
      ...arr,
      { ...PAGO_VACIO, giftCardCode: '', giftCard: null, monto: pendiente > 0 ? '' : '' },
    ])
  }

  async function consultarGiftCard(indice) {
    const fila = pagos[indice]
    const codigo = normalizarCodigoGiftCard(fila?.giftCardCode || '')
    if (!codigo) {
      setErrorVenta('El código de gift card no es válido. Revisalo (GC-XXXX-XXXX-XXXX).')
      return
    }
    setErrorVenta('')
    setPagos(arr => arr.map((pago, i) => (i === indice ? { ...pago, giftCard: { ...(pago.giftCard || {}), consultando: true } } : pago)))
    try {
      const tarjeta = await resources.giftCards.lookup(codigo)
      const saldo = Number(tarjeta?.balancePyg) || 0
      setPagos(arr => arr.map((pago, i) => (i === indice
        ? {
            ...pago,
            giftCardCode: codigo,
            giftCard: tarjeta,
            monto: String(Math.max(0, Math.min(saldo, pendiente > 0 ? pendiente : totalGeneral) || 0)),
          }
        : pago)))
    } catch (cause) {
      setPagos(arr => arr.map((pago, i) => (i === indice ? { ...pago, giftCard: null } : pago)))
      setErrorVenta(cause?.message || 'No se pudo consultar la gift card.')
    }
  }

  // Último usado como predeterminado en la venta (#209): el tipo de entrega se
  // recuerda solo; un borrador retomado manda. La cuenta de cobro dejó de
  // recordarse (#283: se elige a propósito y el selector desaparece al elegir).
  useEffect(() => {
    if (cartInicial) return
    const ultima = preferenciaPos('entrega')
    if (ultima) setF(actual => (actual.entrega === ultima ? actual : { ...actual, entrega: ultima }))
  }, [cartInicial])
  useEffect(() => {
    if (f.entrega) recordarPos('entrega', f.entrega)
  }, [f.entrega])

  // ── Ventas suspendidas ──────────────────────────────────────────────
  const carritoConDatos = Boolean(
    items.length ||
      pagos.length ||
      gsNum(descuento) ||
      customer.name ||
      customer.phone ||
      customer.email ||
      customer.document ||
      customer.addresses?.length,
  )
  const puedeGestionarSuspendidas = Boolean(
    sesion?.esPropietario || ['ADMIN', 'GERENTE', 'dueno'].includes(sesion?.rol),
  )
  const fechaSuspendida = value => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString('es-PY', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
  }
  // #279 A2: el borrador guardado es compartido; la lista muestra quién lo creó
  // y, cuando alguien ya lo tomó, quién lo retomó. Por defecto se ven los
  // pendientes; los retomados quedan en su pestaña como registro.
  const suspendidasPendientes = suspendidas.filter(fila => !fila.resumedAt)
  const suspendidasRetomadas = suspendidas.filter(fila => fila.resumedAt)
  const suspendidasVisibles =
    filtroSuspendidas === 'retomadas' ? suspendidasRetomadas : suspendidasPendientes
  // Deja el carrito sin descuentos: el global y los de cada línea (los dos
  // botones de limpieza del carrito).
  function borrarDescuentos() {
    setDescuento('')
    setItems(arr => arr.map(it =>
      it.descuento || it.descuentoPct ? { ...it, descuento: '', descuentoPct: '' } : it,
    ))
  }
  // Cambiar o quitar el cliente apaga «Vender a crédito»: el crédito es de la ficha anterior.
  function cambiarCliente(siguiente) {
    if ((siguiente?.id ?? null) !== (customer?.id ?? null)) setVenderACredito(false)
    setCustomer(siguiente)
  }
  function limpiarCarrito() {
    const { empresaId, sucursalId, userId } = contextoActual()
    borrarCarrito(empresaId, sucursalId, userId)
    setItems([])
    setDescuento('')
    setPagos([])
    setVueltoExito(0)
    setPagaAlRecibir(false)
    setAuthDescuento(null)
    setAuthPrecio(null)
    setBillingTo({ name: '', document: '' })
    setVenderACredito(false)
    setCreditoDias('')
    setCustomer({ ...CLIENTE_VACIO })
    setF(VACIO(f.vendedorId))
  }
  // Al apagar «Vender a crédito» se olvidan el PIN y la autorización propia.
  useEffect(() => {
    if (!venderACredito) { setCreditoPin(''); setCreditoAutorizoYo(false) }
  }, [venderACredito])
  async function abrirSuspendidas() {
    setSuspendidasOpen(true)
    setFiltroSuspendidas('pendientes')
    setErrorSuspendidas('')
    if (esDemo) {
      // En la demo los borradores viven en el navegador (#148 §20).
      setSuspendidas(listarBorradoresDemo())
      setCargandoSuspendidas(false)
      return
    }
    setCargandoSuspendidas(true)
    try {
      const { sucursalId } = contextoActual()
      const filas = await api.get(
        `/api/suspended-sales${sucursalId ? `?branchId=${encodeURIComponent(sucursalId)}` : ''}`,
      )
      if (!Array.isArray(filas))
        throw new Error('Respuesta inválida al cargar las ventas suspendidas.')
      setSuspendidas(filas)
    } catch (error) {
      setErrorSuspendidas(error?.message || 'No se pudieron cargar las ventas suspendidas.')
    } finally {
      setCargandoSuspendidas(false)
    }
  }
  function abrirSuspender() {
    setLabelSuspender('')
    setErrorSuspender('')
    setSuspenderOpen(true)
  }
  // Guarda el carrito completo en el servidor y limpia el formulario: la venta
  // queda en espera para retomarla desde esta u otra computadora de la sucursal.
  async function suspenderVenta() {
    if (suspendiendo) return
    setSuspendiendo(true)
    setErrorSuspender('')
    try {
      const { sucursalId } = contextoActual()
      if (esDemo) {
        guardarBorradorDemo({
          id: `demo-${Date.now().toString(36)}`,
          label: labelSuspender.trim(),
          createdAt: new Date().toISOString(),
          customer,
          userId: sesion?.vendedorId,
          user: { id: sesion?.vendedorId, name: sesion?.nombre || 'Equipo demo' },
          payload: {
            items,
            customer,
            descuento,
            pagos,
            entrega: f.entrega,
            montoDelivery: f.montoDelivery,
            observacion: f.observacion,
            billingTo,
            venderACredito,
            pagaAlRecibir: pagaAlRecibirVigente(pagaAlRecibir, pagos),
            creditoDias,
            specialOrder: f.specialOrder,
            expectedAt: f.expectedAt,
          },
        })
        setSuspenderOpen(false)
        setLabelSuspender('')
        limpiarCarrito()
        setAvisoSuspension('Venta suspendida en la demo. Podés retomarla desde “Ventas suspendidas”.')
        return
      }
      await api.post('/api/suspended-sales', {
        ...(sucursalId ? { branchId: sucursalId } : {}),
        ...(customer.id ? { customerId: customer.id } : {}),
        ...(labelSuspender.trim() ? { label: labelSuspender.trim() } : {}),
        payload: {
          items,
          customer,
          descuento,
          pagos,
          entrega: f.entrega,
          montoDelivery: f.montoDelivery,
          observacion: f.observacion,
          billingTo,
          venderACredito,
          pagaAlRecibir: pagaAlRecibirVigente(pagaAlRecibir, pagos),
          creditoDias,
          specialOrder: f.specialOrder,
          expectedAt: f.expectedAt,
        },
      })
      setSuspenderOpen(false)
      setLabelSuspender('')
      limpiarCarrito()
      setAvisoSuspension('Venta suspendida. Podés retomarla desde “Ventas suspendidas”.')
    } catch (error) {
      setErrorSuspender(error?.message || 'No se pudo suspender la venta.')
    } finally {
      setSuspendiendo(false)
    }
  }
  // Productos del borrador que ya no tienen stock para lo pedido.
  const faltantesDe = (suspendida) => {
    const filas = Array.isArray(suspendida?.payload?.items) ? suspendida.payload.items : []
    return filas
      .map((fila) => {
        const producto = productos.find((p) => p.id === fila.productoId)
        if (!producto) return null
        const pedido = Number(fila.quantity || 1)
        const stock = Number(producto.stock) || 0
        return stock < pedido ? { nombre: fila.nombre || producto.nombre, pedido, stock } : null
      })
      .filter(Boolean)
  }
  function pedirRecuperar(suspendida) {
    // Si cambió la disponibilidad, primero se avisa: volver o vender igual.
    const faltantes = faltantesDe(suspendida)
    if (faltantes.length) {
      setStockPendiente({ suspendida, faltantes })
      return
    }
    if (carritoConDatos) {
      setRecuperarPendiente(suspendida)
      return
    }
    recuperarSuspendida(suspendida)
  }
  // Enlace público del borrador: se genera (o regenera) y se muestra para
  // copiar, mandar por WhatsApp o por correo. El token solo viaja una vez.
  async function generarEnlacePublico(suspendida) {
    try {
      const data = await api.patch('/api/suspended-sales', { id: suspendida.id, regenerate: true })
      if (!data?.token) throw new Error('El servidor no devolvió el enlace.')
      setEnlacePublico({ id: suspendida.id, url: `${window.location.origin}/carrito/${data.token}` })
      setAvisoEnlace('')
      setErrorSuspendidas('')
    } catch (error) {
      setErrorSuspendidas(error?.message || 'No se pudo generar el enlace público.')
    }
  }
  // Carga el payload guardado en el formulario y recién después descarta la
  // suspendida: el backend no la borra sola al recuperarla.
  async function recuperarSuspendida(suspendida, { venderIgual = false } = {}) {
    setRecuperarPendiente(null)
    const payload = suspendida?.payload
    if (!payload || typeof payload !== 'object') {
      setErrorSuspendidas(
        'El servidor no devolvió el carrito guardado: no se puede recuperar esta venta.',
      )
      return
    }
    const cliente = clienteGuardado(payload.customer)
    // "Vender igualmente": las líneas sin stock quedan marcadas como sobre
    // pedido (el IMEI/stock se completa al entregar).
    const recuperados = itemsGuardados(payload.items).map((item) => {
      if (!venderIgual) return item
      const producto = productos.find((p) => p.id === item.productoId)
      return producto && Number(producto.stock) < Number(item.quantity || 1) ? { ...item, sobrePedido: true } : item
    })
    setItems(recuperados)
    setCustomer(cliente)
    setDescuento(
      payload.descuento === undefined || payload.descuento === null
        ? ''
        : String(payload.descuento),
    )
    setPagos(Array.isArray(payload.pagos) ? payload.pagos : [])
    setBillingTo(restoreBillingIdentity(payload.billingTo))
    setVenderACredito(Boolean(payload.venderACredito))
    setPagaAlRecibir(Boolean(payload.pagaAlRecibir) && !(Array.isArray(payload.pagos) && payload.pagos.length))
    setCreditoDias(
      payload.creditoDias === undefined || payload.creditoDias === null
        ? ''
        : String(payload.creditoDias),
    )
    setF({
      ...VACIO(f.vendedorId),
      cliente: cliente.name,
      ...(ENTREGA.includes(payload.entrega) ? { entrega: payload.entrega } : {}),
      montoDelivery: typeof payload.montoDelivery === 'string' ? payload.montoDelivery : '',
      observacion: typeof payload.observacion === 'string' ? payload.observacion : '',
      specialOrder: Boolean(payload.specialOrder),
      expectedAt: typeof payload.expectedAt === 'string' ? payload.expectedAt : '',
    })
    setSuspendidas(list => list.map(item => item.id === suspendida.id
      ? {
          ...item,
          resumedAt: item.resumedAt || new Date().toISOString(),
          resumedBy: item.resumedBy || { id: sesion?.vendedorId, name: sesion?.nombre || 'Vendedor' },
        }
      : item))
    setAvisoSuspension('Venta recuperada. Revisá el carrito antes de cobrar.')
    if (esDemo) {
      // #279 A2: la demo guarda el mismo registro de quién la retomó.
      marcarBorradorRetomadoDemo(suspendida.id, { id: sesion?.vendedorId, name: sesion?.nombre || 'Equipo demo' })
      setSuspendidasOpen(false)
      return
    }
    try {
      // #279 A2: el borrador compartido no se borra al retomarlo: queda
      // registrado quién lo retomó y cuándo; el creador o gerencia lo descartan.
      const marcada = await api.patch('/api/suspended-sales', { id: suspendida.id, action: 'resume' })
      setSuspendidas(list => list.map(item => item.id === suspendida.id
        ? { ...item, resumedAt: marcada?.resumedAt || item.resumedAt, resumedBy: marcada?.resumedBy || item.resumedBy }
        : item))
      setSuspendidasOpen(false)
    } catch (error) {
      setErrorSuspendidas(
        error?.message ||
          'La venta se recuperó, pero no se pudo registrar quién la retomó: descartala si ya no la vas a usar.',
      )
    }
  }
  async function descartarSuspendida() {
    if (!descartarPendiente || descartando) return
    setDescartando(true)
    setErrorSuspendidas('')
    if (esDemo) {
      borrarBorradorDemo(descartarPendiente.id)
      setSuspendidas(list => list.filter(item => item.id !== descartarPendiente.id))
      setDescartarPendiente(null)
      setDescartando(false)
      return
    }
    try {
      await api.delete(`/api/suspended-sales?id=${encodeURIComponent(descartarPendiente.id)}`)
      setSuspendidas(list => list.filter(item => item.id !== descartarPendiente.id))
      setDescartarPendiente(null)
    } catch (error) {
      setErrorSuspendidas(error?.message || 'No se pudo descartar la venta suspendida.')
      setDescartarPendiente(null)
    } finally {
      setDescartando(false)
    }
  }

  // Atajos del POS. Solo actúan mientras esta vista está visible (el panel la
  // mantiene montada con `hidden`) y nunca cuando se escribe en un campo,
  // salvo Escape. Los handlers usan el estado del render actual; el efecto se
  // re-suscribe en cada render para no manejar closures viejos.
  useEffect(() => {
    const onKey = event => {
      const busqueda = document.getElementById('pos-busqueda-producto')
      if (busqueda && busqueda.closest('[hidden]')) return
      const target = event.target
      const editable =
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      if (event.key === 'Escape') return
      if (event.key === 'F2') {
        // F2 is the checkout shortcut, even when the search field currently
        // owns focus. Keep dialogs/overlays in control of their own keys.
        if (document.querySelector('[role="dialog"]:not([hidden])')) return
        event.preventDefault()
        irACobrarRapido()
        return
      }
      if (editable) return
      if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        if (
          valido &&
          !guardando &&
          !guardadoEnCurso.current &&
          !guardadoIncompleto &&
          cuentas &&
          !errorCuentas
        ) {
          event.preventDefault()
          guardar({ preventDefault: () => {} })
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // Las herramientas del POS viven en el encabezado del bloque Productos: sin
  // una franja propia sobre la grilla.
  const barraPos = (
      <BarraModulo
        titulo="Nueva venta"
        testId="barra-pos"
        className="w-auto justify-end border-b-0 pb-0"
      >
        {items.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="pos-accion-icono"
            onClick={abrirSuspender}
            disabled={guardando}
            title="Suspender venta"
            aria-label="Suspender venta"
          >
            <Icon name="save" className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="outline" className="pos-accion-icono" data-testid="pos-suspendidas" onClick={abrirSuspendidas} title="Ventas suspendidas" aria-label="Ventas suspendidas">
          <Icon name="clock" className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" className="pos-accion-icono" data-testid="pos-gift-cards" onClick={() => setGiftCardsOpen(true)} title="Gift cards" aria-label="Gift cards">
          <Icon name="card" className="h-4 w-4" />
        </Button>
      </BarraModulo>
  )

  // ── POS en celular (#429) ───────────────────────────────────────────
  // El bloque de escritorio de abajo pasa cada pieza por `pos(...)`: en
  // pantallas anchas la devuelve tal cual; en celular la guarda acá para
  // montarla dentro de una hoja (con sus mismas props y reglas) y no dibuja nada
  // en la grilla de escritorio.
  const elementosPos = {}
  const pos = (nombre, elemento) => {
    elementosPos[nombre] = elemento
    return esMovil ? null : elemento
  }
  // Mismo criterio que «Sobre pedido» del cobro de escritorio: cualquier vendedor.
  const puedeVenderSinStock = true
  const pendientesMovil = pendientesVenta.map(p => ({
    ...p,
    stock: num(productos.find(prod => prod.id === items.find(it => it.key === p.key)?.productoId)?.stock),
  }))
  // «Cobrar» desde el carrito: si hay líneas sin stock o sin IMEI, primero se
  // resuelve en la hoja «El artículo no tiene stock»; si no, se abre el cobro.
  function cobrarMovil() {
    setHoja(pendientesVenta.length ? 'sinstock' : 'cobro')
  }
  function venderIgualMovil() {
    // Solo líneas sin stock (nunca IMEI) y solo con permiso: ver clasificarPendientes.
    if (!puedeVenderSinStock) return
    for (const p of pendientesVenta) {
      if (p.motivo === 'stock') editarItem(p.key, { sobrePedido: true, serials: [], reservado: false })
    }
    setHoja(pendientesVenta.some(p => p.motivo === 'imei') ? 'sinstock' : 'cobro')
  }
  const etiquetaConfirmarMovil = etiquetaConfirmar({
    guardando,
    valido: Boolean(valido),
    totalGeneral,
    totalPagado,
    venderACredito,
    pagaAlRecibir: pagaAlRecibirVigente(pagaAlRecibir, pagos),
  })
  const accionesMovil = [
    { id: 'cliente', icono: 'user', titulo: customer.name || 'Agregar cliente', detalle: customer.name ? 'Cliente' : '', onClick: () => setHoja('cliente') },
    { id: 'personalizada', icono: 'plus', titulo: 'Venta personalizada', detalle: 'Producto nuevo', disabled: !puedeCrearProducto,
      onClick: () => { setNuevoProd(true); requestAnimationFrame(() => document.querySelector('[data-testid="pos-bloque-productos"]')?.scrollIntoView({ block: 'start' })) } },
    { id: 'envio', icono: 'truck', titulo: 'Agregar envío', detalle: f.entrega && f.entrega !== ENTREGA[0] ? f.entrega : '', onClick: () => setHoja('envio') },
    { id: 'cotizacion', icono: 'report', titulo: 'Crear cotización', disabled: !onIr, onClick: () => onIr?.('cotizaciones') },
    ...(items.length > 0 ? [{ id: 'suspender', icono: 'save', titulo: 'Suspender venta', onClick: abrirSuspender, disabled: guardando }] : []),
    { id: 'suspendidas', testId: 'pos-suspendidas', icono: 'clock', titulo: 'Ventas suspendidas', onClick: abrirSuspendidas },
    { id: 'bloquear', icono: 'lock', titulo: 'Bloquear', disabled: !onBloquear, onClick: () => onBloquear?.() },
    { id: 'nota', icono: 'edit', titulo: 'Agregar nota', detalle: f.observacion ? 'Con nota' : '', onClick: () => setHoja('nota') },
    { id: 'giftcards', testId: 'pos-gift-cards', icono: 'card', titulo: 'Gift cards', onClick: () => setGiftCardsOpen(true) },
  ]
  // Si el carrito queda vacío (venta guardada, cola sin conexión o vaciado),
  // las hojas del carrito y del cobro se cierran. Va antes del efecto de abajo
  // para que, al confirmar, gane la hoja de recibo.
  useEffect(() => {
    if (items.length === 0) setHoja(actual => (actual === 'carrito' || actual === 'cobro' || actual === 'sinstock' ? null : actual))
  }, [items.length])
  // Al confirmarse una venta en celular se abre la hoja con el recibo.
  useEffect(() => {
    if (esMovilRef.current && lastOrder) setHoja('exito')
  }, [lastOrder])

  return (
    <Card className="p-3 md:p-4">
      {accesoStockInvalidado && (
        <Aviso tono="error" como="div" role="alert" className="mb-4" data-testid="pos-acceso-stock-invalidado">
          <p>El acceso al stock cambió. Verificá tu sesión y sucursal antes de continuar.</p>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>Verificar acceso</Button>
        </Aviso>
      )}
      {ok && !esMovil && (
        <Aviso tono="ok" como="div" aria-live="polite" data-testid="pos-exito-escritorio" className="pos-exito-escritorio mb-4 flex flex-wrap items-center gap-3 rounded-xl p-4">
          <CheckAnimado size={36} className="shrink-0" />
          <span className="min-w-0">
            <b className="block">
              {lastOrder?.orderNumber ? `Pedido ${codigoPedido(lastOrder.orderNumber)} creado` : 'Venta registrada'}
            </b>
            Venta registrada correctamente. Ya podés cargar la siguiente.
            {lastOrder?.creditAuthorization?.status === 'PENDING' && (
              <span className="mt-1 block font-semibold">Pendiente de autorización de crédito: no se entrega hasta que gerencia lo autorice.</span>
            )}
            {esDemo && (
              <span className="mt-1 block text-xs font-semibold text-mute">
                Modo demo: la venta queda guardada solo en este navegador, no en una tienda real.
              </span>
            )}
          </span>
          {lastOrder && (
            <>
              {whatsappTrackingLink(lastOrder) && (
                <a
                  className="rounded-lg bg-ok px-3 py-2 text-sm font-semibold text-black"
                  href={whatsappTrackingLink(lastOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => toast.info('Abriendo WhatsApp', 'Revisá el mensaje y enviálo desde tu teléfono.')}
                >
                  Seguimiento por WhatsApp
                </a>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  toast.info('Comprobante abierto', 'Revisalo y confirmá la impresión.')
                  setComprobante(true)
                }}
              >
                Imprimir comprobante
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/pedidos/${encodeURIComponent(lastOrder.id)}`)}
              >
                Ver pedido
              </Button>
            </>
          )}
        </Aviso>
      )}
      {avisoSuspension && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-fono/30 bg-fono/10 p-4 text-sm text-fono-light"
        >
          <span>{avisoSuspension}</span>
          <button
            type="button"
            onClick={() => setAvisoSuspension('')}
            className="rounded-md p-1 text-mute transition hover:bg-ink-700 hover:text-fore"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}
      {avisoOffline && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn"
        >
          <span>{avisoOffline}</span>
          <button
            type="button"
            onClick={() => setAvisoOffline('')}
            className="rounded-md p-1 text-mute transition hover:bg-ink-700 hover:text-fore"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}
      {/* Cola local de ventas sin sincronizar (offline-first). */}
      <div className="mb-4 empty:hidden">
        <ColaOffline />
      </div>
      {pagos.some(p => p.tradeIn) && (
        <p role="status" className="mb-4 rounded-xl border border-fono/30 bg-fono/10 p-3 text-sm">
          Canje preparado como parte de pago. Revisá sus datos y el saldo pendiente en Cobrar.
        </p>
      )}
      <form
        id="pos-venta-form"
        onSubmit={guardar}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          const target = event.target
          if (!(target instanceof HTMLElement)) return
          if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.tagName === 'A') return
          // Celular: Enter en un campo nunca guarda la venta; solo el botón explícito.
          if (esMovilRef.current && target.tagName === 'INPUT') event.preventDefault()
        }}
        className="pos-f2 flex flex-col gap-4"
      >
        {errorVenta && (
          <div ref={avisoErrorRef}>
            <Aviso tono="error" className="px-3.5 py-2.5 text-sm rounded-xl">
              {errorVenta}
            </Aviso>
          </div>
        )}

        {/* Resumen fijo: cruza las dos columnas en desktop y queda al pie en
            pantallas angostas (ahí la barra superior es el acceso rápido). */}
        <div
          data-testid="resumen-columna"
          className={esMovil ? 'order-last hidden' : 'order-last'}
        >
          <details className="inicio-disclosure"><summary>Detalles de la venta y del día</summary>
          <p className="mb-2 text-xs text-mute">Fecha: {fechaClave().split('-').reverse().join('/')}</p>
          <ResumenVenta
            items={items}
            unidades={cantTotal}
            montoDescuento={gsNum(descuento)}
            montoDelivery={montoDeliveryEfectivo}
            dia={resumenDia}
          />
          </details>
        </div>

        {/* Operación (cliente + buscador + productos) | carrito y cobro. */}
        <div
          ref={layoutRef}
          data-testid="pos-layout"
          data-cobro={modoCobro && !esMovil && items.length > 0 ? 'si' : undefined}
          data-divisor={divisor.izq != null ? 'manual' : undefined}
          style={divisor.izq != null ? { '--pos-izq': divisor.izq } : undefined}
          className={`pos-layout relative grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] xl:grid-cols-2${esMovil ? ' hidden' : ''}`}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Ajustar ancho del catálogo y de la venta"
            aria-valuemin={30}
            aria-valuemax={70}
            aria-valuenow={Math.round((divisor.izq ?? 0.5) * 100)}
            tabIndex={0}
            data-testid="pos-divisor"
            title="Arrastrá para cambiar el ancho (doble clic: restablecer)"
            className="pos-divisor hidden lg:block"
            {...divisor.props}
          />
          <div className="pos-col-izq flex min-w-0 flex-col gap-3">
            {pos('productos',
            <PasoProductos
              sesion={sesion}
              esDemo={esDemo}
              customer={customer}
              setCustomer={setCustomer}
              billingTo={billingTo}
              setBillingTo={setBillingTo}
              setF={setF}
              productos={productos}
              nuevoProd={nuevoProd}
              setNuevoProd={setNuevoProd}
              nombreProd={nombreProd}
              setNombreProd={setNombreProd}
              nuevoDetalles={nuevoDetalles}
              setNuevoDetalles={setNuevoDetalles}
              colorInput={colorInput}
              setColorInput={setColorInput}
              coloresNuevos={coloresNuevos}
              setColoresNuevos={setColoresNuevos}
              agregarColor={agregarColor}
              puedeCrearProducto={puedeCrearProducto}
              crearProducto={crearProducto}
              creandoProd={creandoProd}
              cancelarNuevoProd={cancelarNuevoProd}
              setBusquedaProducto={setBusquedaProducto}
              accesorio={accesorio}
              onFotosNuevas={fotos => { fotosNuevas.current = fotos }}
              setAccesorio={setAccesorio}
              combos={combos}
              agregarCombo={agregarCombo}
              noticeCombo={noticeCombo}
              resolverPreciosCatalogo={resolverPreciosCatalogo}
              contextoPreciosCatalogo={contextoPreciosCatalogo}
              familiasVisibles={familiasServidor ?? familiasVisibles}
              catalogoServidor={catalogoServidor.activo ? catalogoServidor : null}
              agregarProducto={agregarProducto}
              guardando={guardando}
              variantePara={variantePara}
              onElegirVariante={(familia, opciones) => elegirVariante(familia, opciones)}
              onCerrarVariante={() => setVariantePara(null)}
              hayItems={items.length > 0}
              onAgregarOtro={enfocarBusquedaProducto}
              onCobrar={irACobrarRapido}
              acciones={barraPos}
            />)}

            {/* Atajos al pie de la operación (en pantallas angostas no se muestran). */}
            <div className="hidden items-center gap-x-4 gap-y-1.5 text-xs text-mute md:flex">
              <span className="font-semibold uppercase tracking-wider text-mute">Atajos</span>
              <Atajo k="F2" label="Cobrar" />
              <Atajo k="Ctrl+S" label="Guardar venta" />
              <Atajo k="Esc" label="Cerrar ventana" />
            </div>
          </div>

          {/* Columna de la venta (carrito + cobro y entrega): pegada como un solo
              bloque al deslizar el catálogo; si es más alta que la pantalla se
              desplaza por dentro y «Cobrar» queda fijo al pie. */}
          <div
            data-testid="pos-columna-venta"
            className="pos-columna-venta flex min-w-0 flex-col gap-2"
          >
            {/* El cliente queda junto al ticket y al total; el catálogo conserva el foco de búsqueda. */}
            {pos('cliente',
            <PosCustomer
              sesion={sesion} esDemo={esDemo} customer={customer} setCustomer={cambiarCliente}
              billingTo={billingTo} setBillingTo={setBillingTo} setF={setF} onStats={setDeudaCliente} onSelected={enfocarBusquedaProducto}
            />)}
            {pos('carrito',
            <PasoCarrito
              items={items}
              productos={productos}
              familias={familias}
              esDemo={esDemo}
              guardando={guardando}
              puedeDescontar={puedeDescontar}
              precioDe={precioDe}
              totalCarrito={totalCarrito}
              totalGeneral={totalGeneral}
              montoDelivery={montoDeliveryEfectivo}
              quitarItem={quitarItem}
              editarItem={editarItem}
              onImei={setImeiPara}
              descuento={descuento}
              setDescuento={setDescuento}
              montoDescuento={gsNum(descuento)}
              onBorrarDescuentos={borrarDescuentos}
              onVaciarCarrito={limpiarCarrito}
              customer={customer}
              onAuthDescuento={onAuthDescuento}
              montoPrecioBajo={excedenteBajoLista}
              productoBajoId={productoBajoId}
              onAuthPrecio={setAuthPrecio}
              tieneCupon={tieneCupon}
              modoCobro={modoCobro && !esMovil && items.length > 0}
              onListo={() => setModoCobro(true)}
              onEditar={() => setModoCobro(false)}
            />)}

            <div data-testid="pos-cobro-stage" className="flex min-w-0 flex-col gap-2">
              {/* The cart footer owns the single transition into checkout. The
                  separate CTA used to repeat the same action immediately below
                  it and made the POS feel cramped. */}
              {items.length > 0 && <div className={!esMovil && !modoCobro ? 'hidden' : undefined}>
              {pos('cobro', <PasoCobro
              customer={customer}
              repartidores={repartidores}
              pagaAlRecibir={pagaAlRecibir}
              setPagaAlRecibir={setPagaAlRecibir}
              venderACredito={venderACredito}
              setVenderACredito={setVenderACredito}
              creditoDias={creditoDias}
              setCreditoDias={setCreditoDias}
              evaluacionCredito={evaluacionCredito}
              creditoPin={creditoPin}
              setCreditoPin={setCreditoPin}
              creditoAutorizoYo={creditoAutorizoYo}
              setCreditoAutorizoYo={setCreditoAutorizoYo}
              puedeAutorizarCredito={puedeAutorizarCredito}
              cuentas={cuentas}
              usaCuentas={usaCuentas}
              errorCuentas={errorCuentas}
              onReintentarCuentas={() => setIntentoCuentas(n => n + 1)}
              pagos={pagos}
              setPagos={setPagos}
              onAgregarPago={agregarPago}
              onAgregarGiftCard={agregarGiftCard}
              onConsultarGiftCard={consultarGiftCard}
              guardando={guardando}
              guardadoIncompleto={guardadoIncompleto}
              descuentoMedioPct={descuentoMedioPct}
              descuentoMedioGs={descuentoMedioGs}
              subtotal={subtotal}
              puedeDescontar={puedeDescontar}
              setDescuento={setDescuento}
              totalGeneral={totalGeneral}
              totalPagado={totalPagado}
              pendiente={pendiente}
              vuelto={vueltoExtranjero.permitido ? vueltoExtranjero.vuelto : 0}
              f={f}
              setF={setF}
              set={set}
              valido={valido}
              motivos={motivosBloqueo}
              cantTotal={cantTotal}
              ok={ok}
              pendientes={pendientesVenta}
              onIrAlCarrito={irAlCarrito}
              onElegirUnidad={setImeiPara}
              onSobrePedido={key => editarItem(key, { sobrePedido: true, serials: [], reservado: false })}
              onTransito={key => editarItem(key, { sobrePedido: true, enTransito: true, serials: [], reservado: false })}
              />)}
              </div>}
            </div>
          </div>
        </div>

        {/* POS en celular (#429): mismos elementos de arriba (capturados con
            `pos`), repartidos en acciones, barra del carrito y hojas. */}
        {esMovil && (
          <div data-testid="pos-movil" role="region" aria-label="Nueva venta" className="flex flex-col gap-3 pb-[calc(56px+5rem+env(safe-area-inset-bottom,0px))]">
            <AccionesInicio acciones={accionesMovil} />
            {elementosPos.productos && cloneElement(elementosPos.productos, { acciones: null })}
          </div>
        )}
        {esMovil && <BarraCarrito cantidad={cantTotal} total={totalGeneral} onAbrir={() => setHoja('carrito')} />}
        {esMovil && (
          <>
            <HojaCarrito
              open={hoja === 'carrito'}
              onClose={() => setHoja(null)}
              cliente={customer.name}
              onCliente={() => setHoja('cliente')}
              total={totalGeneral}
              cantidad={cantTotal}
              onCobrar={cobrarMovil}
            >
              {elementosPos.carrito}
            </HojaCarrito>
            <HojaCliente open={hoja === 'cliente'} onClose={() => setHoja(null)}>{elementosPos.cliente}</HojaCliente>
            <HojaEnvio open={hoja === 'envio'} onClose={() => setHoja(null)} f={f} setF={setF} />
            <HojaNota open={hoja === 'nota'} onClose={() => setHoja(null)} f={f} setF={setF} />
            <HojaSinStock
              open={hoja === 'sinstock'}
              onClose={() => setHoja('carrito')}
              pendientes={pendientesMovil}
              permiso={puedeVenderSinStock}
              onVenderIgual={venderIgualMovil}
              onElegirUnidad={key => { setHoja('carrito'); setImeiPara(key) }}
            />
            {hoja === 'cobro' && (
              <CobroMovil
                open
                onClose={() => setHoja(null)}
                cuentas={cuentas}
                usaCuentas={usaCuentas}
                errorCuentas={errorCuentas}
                onReintentarCuentas={() => setIntentoCuentas(n => n + 1)}
                pagos={pagos}
                setPagos={setPagos}
                totalGeneral={totalGeneral}
                totalPagado={totalPagado}
                pendiente={pendiente}
                cantTotal={cantTotal}
                customer={customer}
                pagaAlRecibir={pagaAlRecibir}
                setPagaAlRecibir={setPagaAlRecibir}
                venderACredito={venderACredito}
                setVenderACredito={setVenderACredito}
                evaluacionCredito={evaluacionCredito}
                creditoPin={creditoPin}
                setCreditoPin={setCreditoPin}
                creditoAutorizoYo={creditoAutorizoYo}
                setCreditoAutorizoYo={setCreditoAutorizoYo}
                puedeAutorizarCredito={puedeAutorizarCredito}
                guardando={guardando}
                guardadoIncompleto={guardadoIncompleto}
                valido={Boolean(valido)}
                motivos={motivosBloqueo}
                errorVenta={errorVenta}
                etiquetaConfirmar={etiquetaConfirmarMovil}
                completo={totalGeneral > 0 && totalPagado >= totalGeneral}
                masContenido={elementosPos.cobro && cloneElement(elementosPos.cobro, { modoMovil: true })}
              />
            )}
            <HojaExito
              open={hoja === 'exito' && Boolean(lastOrder)}
              onClose={() => { setHoja(null); setVueltoExito(0) }}
              titulo={lastOrder?.orderNumber ? `Pedido ${codigoPedido(lastOrder.orderNumber)} creado` : ''}
              total={Number(lastOrder?.totalPyg) || 0}
              vuelto={vueltoExito}
              cliente={lastOrder?.customer?.name || lastOrder?.cliente || ''}
              nota={lastOrder?.notes || lastOrder?.observacion || ''}
              onVerCliente={!esDemo && lastOrder?.customer?.id ? () => { setHoja(null); setVueltoExito(0); navigate(`/clientes?cliente=${encodeURIComponent(lastOrder.customer.id)}`) } : undefined}
              whatsapp={lastOrder ? whatsappTrackingLink(lastOrder) : ''}
              onImprimir={() => { toast.info('Comprobante abierto', 'Revisalo y confirmá la impresión.'); setComprobante(true) }}
              onVerPedido={() => { setHoja(null); setVueltoExito(0); navigate(`/pedidos/${encodeURIComponent(lastOrder.id)}`) }}
              esDemo={esDemo}
              creditoPendiente={lastOrder?.creditAuthorization?.status === 'PENDING'}
              pregunta={preguntaEntrega ? (
                <EntregaPregunta
                  order={preguntaEntrega}
                  esDemo={esDemo}
                  onEntregado={() => { setPreguntaEntrega(null); toast.success('Pedido retirado', 'Quedó marcado como retirado.') }}
                  onNoTodavia={() => setPreguntaEntrega(null)}
                />
              ) : null}
            />
          </>
        )}
      </form>

      <Modal
        open={Boolean(imeiPara) && !accesoStockInvalidado}
        onClose={() => setImeiPara(null)}
        title="Elegir IMEI de esta venta" size="formulario">
        {(() => {
          const fila = items.find(it => it.key === imeiPara)
          const productoFila = fila ? productos.find(p => p.id === fila.productoId) : null
          if (!fila || !productoFila) return null
          // #308: la línea se cierra con una decisión explícita (unidad exacta
          // o «vender sin IMEI»), no por omisión.
          const decidido = Boolean(fila.serials?.length) || Boolean(fila.sobrePedido)
          return (
            <div className="space-y-3">
              <p className="text-sm text-mute">
                {fila.nombre} · {gs(Number(fila.precio) || 0)} c/u
              </p>
              <SerialUnitPicker
                product={productoFila}
                branchId={sucursal?.id || ''}
                customerName={customer.name || f.cliente}
                selectedSerials={fila.serials || []}
                // Elegir unidad en el picker crea la reserva: la línea lo muestra.
                onChange={serials => editarItem(fila.key, { serials, reservado: serials.length > 0 })}
                onRequiresSerial={(requiere, unidades) => {
                  // #263: la marca sigue el estado real del selector (antes solo
                  // se encendía y una línea sin unidades en la sucursal quedaba
                  // exigiendo un IMEI que no se podía elegir).
                  editarItem(fila.key, { requiereSerie: Boolean(requiere), unidades })
                }}
                disabled={guardando}
              />
              <label className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${unidadesDeImei > 0 ? 'border-ink-600 bg-ink-800/40 text-mute/70' : 'border-warn/30 bg-warn/5 text-mute'}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-warn disabled:opacity-40"
                  disabled={unidadesDeImei > 0}
                  checked={Boolean(fila.sobrePedido)}
                  onChange={event => editarItem(fila.key, { sobrePedido: event.target.checked, serials: event.target.checked ? [] : fila.serials || [], ...(event.target.checked ? { reservado: false } : {}) })}
                />
                <span>
                  {unidadesDeImei > 0
                    ? <>Con stock no se vende sin IMEI: elegí la unidad de arriba (hay {unidadesDeImei} disponible{unidadesDeImei === 1 ? '' : 's'}).</>
                    : <>Vender <b className="text-fore">sin IMEI (sobre pedido)</b>: el cliente reserva sin stock; el IMEI se completa al entregar.</>}
                </span>
              </label>
              {!decidido && (
                <p role="status" data-testid="imei-falta-eleccion" className="text-xs font-semibold text-warn">
                  Elegí la unidad exacta o marcá «vender sin IMEI» para cerrar la línea.
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => setImeiPara(null)}
                  disabled={!decidido}
                  title={!decidido ? 'Elegí la unidad exacta o marcá «vender sin IMEI».' : undefined}
                >
                  Listo
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>
      <Modal
        open={suspenderOpen}
        onClose={suspendiendo ? undefined : () => setSuspenderOpen(false)}
        title="Suspender venta" size="corto">
        <div className="space-y-3">
          <p className="text-sm text-mute">
            {esDemo
              ? 'El carrito queda guardado en este navegador, con el cliente, la entrega, la facturación, los pagos y el descuento cargados. Podés retomarlo desde “Ventas suspendidas”.'
              : 'El carrito queda guardado en el servidor para esta sucursal, con el cliente, la entrega, la facturación, los pagos y el descuento cargados. Cualquier persona con permiso de venta puede retomarlo.'}
          </p>
          <div>
            <Label htmlFor="etiqueta-suspendida">Etiqueta (opcional)</Label>
            <Input
              id="etiqueta-suspendida"
              maxLength={120}
              value={labelSuspender}
              onChange={event => setLabelSuspender(event.target.value)}
              placeholder="Ej: nombre del cliente o seña"
              autoCapitalize="sentences"
            />
          </div>
          {errorSuspender && (
            <Aviso tono="error" className="rounded-xl">
              {errorSuspender}
            </Aviso>
          )}
          <div className={PIE_ACCIONES_REVERSO}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSuspenderOpen(false)}
              disabled={suspendiendo}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={suspenderVenta} disabled={suspendiendo || !items.length}>
              {suspendiendo ? 'Suspendiendo…' : 'Suspender venta'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={suspendidasOpen}
        onClose={descartando ? undefined : () => setSuspendidasOpen(false)}
        title="Ventas suspendidas" size="amplio">
        <div className="space-y-3">
          <p className="text-sm text-mute">
            {esDemo
              ? 'Carritos en espera guardados en este navegador (compartidos en la demo). Al recuperar uno, tu carrito privado se reemplaza y el borrador queda marcado como retomado.'
              : 'Carritos en espera de esta sucursal, compartidos con el equipo. Al recuperar uno, tu carrito privado se reemplaza y el borrador queda registrado con quién lo retomó.'}
          </p>
          {!cargandoSuspendidas && !errorSuspendidas && (suspendidasPendientes.length > 0 || suspendidasRetomadas.length > 0) && (
            // #279 A2: los pendientes son los que se pueden tomar; los
            // retomados quedan como registro de quién los tomó.
            <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1" role="tablist" aria-label="Filtro de ventas suspendidas">
              {[
                ['pendientes', `Pendientes (${suspendidasPendientes.length})`],
                ['retomadas', `Retomadas (${suspendidasRetomadas.length})`],
              ].map(([clave, etiqueta]) => (
                <button
                  key={clave}
                  type="button"
                  role="tab"
                  aria-selected={filtroSuspendidas === clave}
                  onClick={() => setFiltroSuspendidas(clave)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filtroSuspendidas === clave ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          )}
          {cargandoSuspendidas && (
            <p role="status" className="text-sm text-mute">
              Cargando ventas suspendidas…
            </p>
          )}
          {errorSuspendidas && (
            <Aviso tono="error" className="rounded-xl">
              {errorSuspendidas}
            </Aviso>
          )}
          {!cargandoSuspendidas && !suspendidasVisibles.length && !errorSuspendidas && (
            <EmptyState
              compact
              icon="cart"
              title={filtroSuspendidas === 'retomadas'
                ? 'No hay ventas retomadas en esta sucursal.'
                : esDemo
                  ? 'No hay borradores guardados en este navegador.'
                  : 'No hay ventas suspendidas en esta sucursal.'}
            />
          )}
          <div className="space-y-2">
            {suspendidasVisibles.map(suspendida => (
              <article
                key={suspendida.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className={CELDA_IDENTIDAD_GRANDE}>
                    {suspendida.label?.trim() || 'Sin etiqueta'}
                  </p>
                  <p className="mt-0.5 text-xs text-mute">
                    {suspendida.customer?.name || 'Sin cliente'} · Creada por{' '}
                    {suspendida.user?.name || 'Vendedor'} · {fechaSuspendida(suspendida.createdAt)}
                  </p>
                  {suspendida.resumedAt && (
                    <p className="mt-0.5 text-xs font-semibold text-warn">
                      Retomada por {suspendida.resumedBy?.name || 'un vendedor'} · {fechaSuspendida(suspendida.resumedAt)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={descartando}
                    onClick={() => {
                      if (esDemo) {
                        setAvisoEnlaceDemo({ id: suspendida.id, texto: 'En la demo el enlace público no se genera.' })
                        return
                      }
                      generarEnlacePublico(suspendida)
                    }}
                  >
                    Enlace público
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={descartando}
                    onClick={() => pedirRecuperar(suspendida)}
                  >
                    Recuperar
                  </Button>
                  {(puedeGestionarSuspendidas || suspendida.userId === sesion?.vendedorId) && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={descartando}
                      onClick={() => {
                        setErrorSuspendidas('')
                        setDescartarPendiente(suspendida)
                      }}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                      Descartar
                    </Button>
                  )}
                </div>
                {avisoEnlaceDemo?.id === suspendida.id && (
                  <p role="status" className="w-full text-xs text-mute">{avisoEnlaceDemo.texto}</p>
                )}
                {enlacePublico?.id === suspendida.id && (
                  <div className="w-full space-y-2 rounded-xl border border-fono/30 bg-fono/[.06] p-3">
                    <p className="text-xs text-mute">Enlace público del carrito (sin sesión). Se muestra una sola vez: copialo o compartilo ahora.</p>
                    <p className="truncate rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 font-mono text-[11px] text-fono-light">{enlacePublico.url}</p>
                    {avisoEnlace && <p role="status" className="text-xs text-ok">{avisoEnlace}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => {
                        const nativo = isNativeIOS()
                        const accion = nativo ? compartirNativo({ titulo: 'Carrito', url: enlacePublico.url, dialogo: 'Compartir carrito' }) : copiarAlPortapapeles(enlacePublico.url)
                        accion.then(ok => {
                          if (nativo) {
                            // El helper también atiende cancelación: no afirmar envío.
                            setAvisoEnlace(ok ? 'Se abrieron las opciones para compartir.' : 'No se pudo compartir el enlace.')
                          } else {
                            setAvisoEnlace(ok ? 'Enlace copiado: mandalo al cliente para que confirme.' : 'No se pudo copiar el enlace.')
                          }
                        })
                      }}>{isNativeIOS() ? 'Compartir' : 'Copiar'}</Button>
                      <a
                        className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore"
                        href={whatsappUrl(suspendida.customer?.phone, `Hola${suspendida.customer?.name ? ` ${suspendida.customer.name}` : ''}, te comparto el carrito${suspendida.label ? ` "${suspendida.label}"` : ''}: ${enlacePublico.url}`, suspendida.customer?.countryCode)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => toast.info('Abriendo WhatsApp', 'El enlace del carrito va en el mensaje.')}
                      >
                        Enviar por WhatsApp
                      </a>
                      <a
                        className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore"
                        href={`mailto:${suspendida.customer?.email || ''}?subject=${encodeURIComponent(`Carrito${suspendida.label ? ` ${suspendida.label}` : ''}`)}&body=${encodeURIComponent(`Te comparto el carrito para que lo confirmes: ${enlacePublico.url}`)}`}
                      >
                        Enviar por correo
                      </a>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSuspendidasOpen(false)}
              disabled={descartando}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(recuperarPendiente)}
        onCancel={() => setRecuperarPendiente(null)}
        onConfirm={() => recuperarSuspendida(recuperarPendiente)}
        title="Reemplazar el carrito actual"
        description="Tenés una venta en curso. Si recuperás la venta suspendida, el carrito actual se reemplaza por el guardado."
        confirmLabel="Reemplazar y recuperar"
      />

      <ConfirmDialog
        open={Boolean(stockPendiente)}
        onCancel={() => setStockPendiente(null)}
        onConfirm={() => {
          const { suspendida } = stockPendiente
          setStockPendiente(null)
          if (carritoConDatos) setRecuperarPendiente(suspendida)
          else recuperarSuspendida(suspendida, { venderIgual: true })
        }}
        title="Cambió la disponibilidad"
        description={`Estos productos ya no tienen stock para lo pedido: ${(stockPendiente?.faltantes || []).map((f) => `${f.nombre} (pedido ${f.pedido}, hay ${f.stock})`).join(' · ')}. Podés volver atrás o vender igualmente: las líneas quedan como sobre pedido.`}
        confirmLabel="Vender igualmente"
        cancelLabel="Volver atrás"
      />

      <ConfirmDialog
        open={Boolean(descartarPendiente)}
        onCancel={() => {
          if (!descartando) setDescartarPendiente(null)
        }}
        onConfirm={descartarSuspendida}
        title="Descartar venta suspendida"
        description={`Se elimina definitivamente la venta suspendida${
          descartarPendiente?.label?.trim() ? ` “${descartarPendiente.label.trim()}”` : ''
        }. No se puede deshacer.`}
        confirmLabel="Descartar"
        variant="danger"
        busy={descartando}
      />

      <GiftCardsPos
        open={giftCardsOpen}
        onClose={() => setGiftCardsOpen(false)}
        cuentas={cuentas || []}
        customer={customer}
      />

      {/* Código escaneado: se confirma antes de sumarlo a la venta. */}
      <Modal open={Boolean(escaneado)} onClose={() => setEscaneado(null)} title="Producto escaneado" size="corto">
        {escaneado && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {escaneado.imagen || escaneado.imageUrl ? (
                <img src={escaneado.imagen || escaneado.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-fono/10 text-fono-light">
                  <Icon name="box" className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{escaneado.nombre || escaneado.name}</p>
                <p className="text-xs text-mute">
                  {[escaneado.sku, escaneado.model || escaneado.modelo, escaneado.capacity || escaneado.capacidad].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-0.5 text-sm">
                  {gs(Number(escaneado.precioVenta) || 0)} ·{' '}
                  {num(escaneado.stock) > 0
                    ? <span className="font-semibold text-fore">{num(escaneado.stock)} en stock</span>
                    : <span className="text-bad">Agotado</span>}
                </p>
              </div>
            </div>
            <div className={PIE_ACCIONES_REVERSO}>
              <Button type="button" variant="ghost" onClick={() => setEscaneado(null)}>Cancelar</Button>
              <Button
                type="button"
                onClick={() => { agregarProducto(escaneado); setEscaneado(null) }}
              >
                Agregar a la venta
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {lastOrder && <ComprobantePreview order={lastOrder} open={comprobante} onClose={() => setComprobante(false)} />}
    </Card>
  )
}
