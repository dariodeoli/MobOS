// Cola local de ventas del POS (offline-first). Fase 1: encolar, sincronizar y
// reintentar. Fase 2 (#168): clasificación de conflictos para resolverlos,
// límites y expiración de la cola, y métricas/reportes de lo vendido sin
// conexión.
//
// Lógica pura: el almacenamiento y el envío se inyectan, así se prueba sin
// IndexedDB ni red. La cola guarda la venta completa con su Idempotency-Key:
// sincronizar la misma venta dos veces (o reintentar tras un corte) reutiliza la
// orden ya creada en el backend, nunca la duplica.
//
// Estados de un ítem:
// - `pendiente`: esperando conexión (o reintento tras un error de red).
// - `enviada`: el backend confirmó la orden (se conserva como historial acotado).
// - `conflicto`: el backend la rechazó (dato inválido, permiso, precio, etc.) o
//   quedó vieja sin conexión: necesita una persona; no se reintenta sola.
//
// Multi-empresa (#377): cada venta queda marcada con la empresa (`tenantId`) y la
// persona (`userId`) activas al encolarla. El envío usa la sesión de la empresa
// actual, así que SOLO se envían las ventas de esa empresa: las de otras quedan
// intactas como «Pendiente en otra empresa» hasta volver a ella. Las ventas
// viejas, sin empresa, adoptan la empresa activa en la primera carga.

export const ESTADO_PENDIENTE = 'pendiente'
export const ESTADO_ENVIADA = 'enviada'
export const ESTADO_CONFLICTO = 'conflicto'

// Endurecimiento de la cola (#168): techo de ventas sin sincronizar, vencimiento
// de lo que esperó demasiado sin conexión y tope del historial de enviadas.
export const MAX_COLA = 200
export const DIAS_EXPIRACION = 7
export const MAX_HISTORIAL = 50

const DIA_MS = 86400000

// Un error "de red" es el que se resuelve reintentando: sin respuesta del
// servidor (status 0) o timeout. Un 4xx/5xx ya es una respuesta del backend.
export function esErrorDeRed(error) {
  if (!error) return false
  const status = Number(error.status ?? error.statusCode ?? 0)
  if (status > 0) return false
  const code = String(error.code || '')
  if (code === 'NETWORK_ERROR' || code === 'REQUEST_TIMEOUT' || code === 'REQUEST_ABORTED') return true
  // Un fetch que no llega a responder también se ve como TypeError.
  return error.name === 'TypeError' || error.name === 'AbortError'
}

// Por qué el servidor rechazó la venta: define qué puede hacer la persona que la
// revisa (corregir el precio, vender con sobre pedido, descartar el duplicado…).
const TIPOS_CONFLICTO = [
  { tipo: 'duplicada', patron: /duplicad|ya existe|identificador de operación|idempotenc/i, sugerencia: 'Ya estaba registrada: descartala de la cola.' },
  { tipo: 'stock', patron: /stock insuficiente|sin stock|no está disponible|no estan disponibles|agotado|no tiene unidades/i, sugerencia: 'Ajustá el stock o vendé como sobre pedido.' },
  { tipo: 'precio', patron: /precio|cotizaci|cupón|cupon|lista de precios|descuento/i, sugerencia: 'Revisá el precio de la venta y volvé a encolarla.' },
  { tipo: 'cliente', patron: /cliente/i, sugerencia: 'Revisá la ficha del cliente (puede estar duplicado o incompleto).' },
  { tipo: 'permiso', patron: /no autorizado|sin permiso|permiso/i, sugerencia: 'Pedí permiso a gerencia para completar esta venta.' },
]
export function clasificarConflicto(error) {
  if (esErrorDeRed(error)) return { tipo: 'red', sugerencia: 'Sin conexión: se reintenta al volver.' }
  const mensaje = String(error?.message || error?.error || '')
  if (Number(error?.status) === 401 || Number(error?.status) === 403) {
    return { tipo: 'permiso', sugerencia: 'Pedí permiso a gerencia para completar esta venta.' }
  }
  const encontrado = TIPOS_CONFLICTO.find((fila) => fila.patron.test(mensaje))
  return encontrado
    ? { tipo: encontrado.tipo, sugerencia: encontrado.sugerencia }
    : { tipo: 'otro', sugerencia: 'Revisá el detalle y reintentá o descartá la venta.' }
}

export const ETIQUETA_CONFLICTO = {
  red: 'Sin conexión',
  stock: 'Stock',
  precio: 'Precio',
  cliente: 'Cliente',
  duplicada: 'Duplicada',
  permiso: 'Permiso',
  expirada: 'Vencida',
  otro: 'Otro',
}

export const ETIQUETA_OTRA_EMPRESA = 'Pendiente en otra empresa'

// Una venta es de otra empresa solo si tiene empresa y es distinta de la activa.
// Sin empresa activa o sin marca (venta vieja) nunca se considera ajena.
export function esDeOtraEmpresa(item, tenantId) {
  return Boolean(item?.tenantId && tenantId && item.tenantId !== tenantId)
}

const totalDe = (item) => Number(item?.resumen?.total) || 0
const resumenDe = (item) => item?.resumen || null

export function crearColaDeVentas({
  store,
  enviar,
  ahora = () => Date.now(),
  maxCola = MAX_COLA,
  maxHistorial = MAX_HISTORIAL,
  diasExpiracion = DIAS_EXPIRACION,
  // Empresa y persona activas: { tenantId, userId }. Se lee en cada operación
  // (nunca se guarda) porque la persona puede cambiar de empresa en cualquier momento.
  contexto = () => ({ tenantId: null, userId: null }),
}) {
  const activa = () => {
    const actual = contexto() || {}
    return { tenantId: actual.tenantId || null, userId: actual.userId || null }
  }
  const ordenar = (items) => [...items].sort((a, b) => Number(a.creadoEn || 0) - Number(b.creadoEn || 0))
  const vivo = (item) => item.estado !== ESTADO_ENVIADA

  // Las ventas viejas (sin empresa) pasan a la empresa activa la primera vez que
  // se carga la cola. Solo se escribe `tenantId`; nada se borra ni se reenvía a
  // otra empresa. Sin empresa activa no se adopta nada.
  async function adoptarVentasViejas() {
    const { tenantId } = activa()
    if (!tenantId) return 0
    const viejas = (await store.listar()).filter((item) => !item.tenantId)
    for (const item of viejas) await store.guardar({ ...item, tenantId, adoptadaPorEmpresa: true })
    return viejas.length
  }

  async function listar() {
    await adoptarVentasViejas()
    return ordenar(await store.listar())
  }

  // Ventas de la empresa activa (incluye las viejas sin marca hasta que se adopten).
  async function listarDeEmpresaActual() {
    const { tenantId } = activa()
    return (await listar()).filter((item) => !esDeOtraEmpresa(item, tenantId))
  }

  // Ventas sin enviar de otras empresas: se conservan y se avisan, no se envían.
  async function ventasPendientesDeOtraEmpresa() {
    const { tenantId } = activa()
    return (await listar()).filter((item) => vivo(item) && esDeOtraEmpresa(item, tenantId))
  }

  // ¿Hay ventas sin enviar en la empresa activa? El selector de empresa lo usa
  // para advertir antes de cambiar.
  async function hayPendientesEnEmpresaActual() {
    return (await listarDeEmpresaActual()).some(vivo)
  }

  // Encola una venta que no se pudo enviar. El payload viaja tal cual (con
  // `offline: true`): el backend relaja el stock y la marca para revisión.
  async function encolar({ payload, idempotencyKey, resumen }) {
    if (!payload || typeof payload !== 'object') throw new Error('La venta a encolar es obligatoria.')
    if (!idempotencyKey) throw new Error('La venta a encolar necesita su Idempotency-Key.')
    const { tenantId, userId } = activa()
    if (!tenantId) throw new Error('No hay una empresa activa: iniciá sesión antes de dejar la venta en la cola.')
    const items = await listar()
    const vivas = items.filter(vivo).length
    if (vivas >= maxCola) {
      throw new Error(`Hay ${vivas} ventas sin sincronizar (límite ${maxCola}). Conectate para sincronizarlas antes de seguir vendiendo sin conexión.`)
    }
    const creadoEn = ahora()
    const item = {
      id: `cola-${creadoEn.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      idempotencyKey,
      tenantId,
      userId,
      payload,
      resumen: resumenDe({ resumen }) || null,
      estado: ESTADO_PENDIENTE,
      intentos: 0,
      error: '',
      tipo: '',
      creadoEn,
      expiraEn: creadoEn + diasExpiracion * DIA_MS,
      sincronizadaEn: null,
    }
    await store.guardar(item)
    return item
  }

  async function pendientes() {
    return (await listarDeEmpresaActual()).filter((item) => item.estado === ESTADO_PENDIENTE)
  }

  // Las ventas que esperaron más de `diasExpiracion` sin poder sincronizarse
  // pasan a conflicto "vencida": siguen visibles (no se pierden) y se resuelven
  // a mano.
  async function expirarVencidas() {
    const vencidas = (await store.listar()).filter(
      (item) => item.estado === ESTADO_PENDIENTE && Number(item.expiraEn || 0) > 0 && Number(item.expiraEn) <= ahora(),
    )
    for (const item of vencidas) {
      await store.guardar({
        ...item,
        estado: ESTADO_CONFLICTO,
        tipo: 'expirada',
        error: `La venta esperó más de ${diasExpiracion} día(s) sin conexión.`,
      })
    }
    return vencidas.length
  }

  // Sincroniza la cola: envía los pendientes en orden de creación. Un error de
  // red deja el ítem pendiente (se reintenta al reconectar); cualquier otra
  // respuesta lo marca como conflicto clasificado para que lo revise una persona.
  // Solo envía las ventas de la empresa activa y vuelve a comprobarla antes de
  // cada envío: si la persona cambió de empresa a mitad de la sincronización,
  // corta sin enviar nada a la sesión equivocada.
  async function sincronizar() {
    await expirarVencidas()
    const items = await pendientes()
    for (const item of items) {
      const { tenantId } = activa()
      if (!tenantId || item.tenantId !== tenantId) break
      try {
        const orden = await enviar(item)
        await store.guardar({ ...item, estado: ESTADO_ENVIADA, error: '', tipo: '', sincronizadaEn: ahora(), ordenId: orden?.id || null })
      } catch (error) {
        if (esErrorDeRed(error)) {
          await store.guardar({ ...item, intentos: Number(item.intentos || 0) + 1, error: 'Sin conexión con el servidor.' })
          break // sin red no tiene sentido seguir con el resto
        }
        const { tipo } = clasificarConflicto(error)
        await store.guardar({ ...item, estado: ESTADO_CONFLICTO, tipo, error: error?.message || 'El servidor rechazó la venta.' })
      }
    }
    await limpiar()
    return resumen()
  }

  // Un conflicto se puede reintentar a mano (por ejemplo si el dato se corrigió
  // o el permiso ya está): vuelve a pendiente sin perder el payload.
  async function reintentar(id) {
    const item = (await listar()).find((row) => row.id === id)
    if (!item) return null
    const siguiente = { ...item, estado: ESTADO_PENDIENTE, intentos: 0, error: '', tipo: '', expiraEn: ahora() + diasExpiracion * DIA_MS }
    await store.guardar(siguiente)
    return siguiente
  }

  // Solo se descartan ventas de la empresa activa: una venta de otra empresa no
  // se ve ni se decide desde esta, y nunca se pierde por error.
  async function descartar(id) {
    const { tenantId } = activa()
    const item = (await listar()).find((row) => row.id === id)
    if (!item || esDeOtraEmpresa(item, tenantId)) return false
    await store.borrar(id)
    return true
  }

  // Limpieza: el historial de enviadas se conserva acotado (diagnóstico) y los
  // pendientes vencidos pasan a conflicto. Los conflictos no se borran solos:
  // siempre hay una persona que decide.
  async function limpiar() {
    await expirarVencidas()
    const items = await listar()
    const enviadas = items.filter((item) => item.estado === ESTADO_ENVIADA)
    const sobran = enviadas.length - Math.max(0, maxHistorial)
    for (const item of enviadas.slice(0, Math.max(0, sobran))) await store.borrar(item.id)
    return resumen()
  }

  // Los contadores son de la empresa activa; `otraEmpresa` cuenta aparte lo que
  // quedó sin enviar en las demás.
  async function resumen() {
    const { tenantId } = activa()
    const todas = await listar()
    const items = todas.filter((item) => !esDeOtraEmpresa(item, tenantId))
    return {
      pendientes: items.filter((item) => item.estado === ESTADO_PENDIENTE).length,
      conflictos: items.filter((item) => item.estado === ESTADO_CONFLICTO).length,
      enviadas: items.filter((item) => item.estado === ESTADO_ENVIADA).length,
      ultimaSync: items.reduce((max, item) => Math.max(max, Number(item.sincronizadaEn || 0)), 0) || null,
      total: items.length,
      otraEmpresa: todas.filter((item) => vivo(item) && esDeOtraEmpresa(item, tenantId)).length,
    }
  }

  // Reporte del modo offline (#168): qué se vendió sin conexión, cuánto tardó en
  // sincronizarse y con qué éxito.
  async function reporte() {
    return metricasDeCola(await listarDeEmpresaActual(), { ahora: ahora() })
  }

  return {
    encolar,
    listar,
    pendientes,
    sincronizar,
    reintentar,
    descartar,
    limpiar,
    resumen,
    reporte,
    ventasPendientesDeOtraEmpresa,
    hayPendientesEnEmpresaActual,
  }
}

// Métricas puras de la cola (también para la UI). `ahora` permite testear el
// tiempo en cola de lo que sigue pendiente.
export function metricasDeCola(items = [], { ahora = Date.now() } = {}) {
  const filas = Array.isArray(items) ? items : []
  const enviadas = filas.filter((item) => item.estado === ESTADO_ENVIADA)
  const pendientes = filas.filter((item) => item.estado === ESTADO_PENDIENTE)
  const conflictos = filas.filter((item) => item.estado === ESTADO_CONFLICTO)
  const tiempos = enviadas
    .map((item) => Number(item.sincronizadaEn || 0) - Number(item.creadoEn || 0))
    .filter((ms) => Number.isFinite(ms) && ms >= 0)
  const porTipo = {}
  for (const item of conflictos) {
    const tipo = item.tipo || 'otro'
    porTipo[tipo] = (porTipo[tipo] || 0) + 1
  }
  const resueltas = enviadas.length + conflictos.length
  return {
    total: filas.length,
    pendientes: pendientes.length,
    conflictos: conflictos.length,
    enviadas: enviadas.length,
    porTipo,
    // Todo lo vendido sin conexión (sincronizado y no) y lo ya confirmado.
    vendidoPyg: filas.reduce((suma, item) => suma + totalDe(item), 0),
    sincronizadoPyg: enviadas.reduce((suma, item) => suma + totalDe(item), 0),
    enColaPyg: [...pendientes, ...conflictos].reduce((suma, item) => suma + totalDe(item), 0),
    intentos: filas.reduce((suma, item) => suma + Number(item.intentos || 0), 0),
    tiempoPromedioMs: tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0,
    tiempoMaximoMs: tiempos.length ? Math.max(...tiempos) : 0,
    esperaPromedioMs: pendientes.length
      ? Math.round(pendientes.reduce((suma, item) => suma + Math.max(0, ahora - Number(item.creadoEn || 0)), 0) / pendientes.length)
      : 0,
    tasaExito: resueltas ? Math.round((enviadas.length / resueltas) * 100) : 100,
  }
}
