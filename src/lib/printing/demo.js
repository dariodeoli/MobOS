// Datos ficticios de impresión para el modo demo (#194).
//
// La pantalla de Impresoras (impresoras, cola, actividad y verificación en
// papel) tiene que verse y funcionar en /demo **sin llamar al backend real ni
// al agente local**. Estos datos viven en memoria y las acciones (confirmar,
// reintentar, limpiar, cancelar, guardar) se simulan sobre el estado local.
//
// La verificación en papel compara contra el `sufijo` ficticio de la fila: es
// una simulación local del hash del servidor, y se avisa en pantalla.

const haceMinutos = (minutos) => new Date(Date.now() - minutos * 60_000).toISOString()
const haceSegundos = (segundos) => new Date(Date.now() - segundos * 1000).toISOString()

// Store con la misma forma que la caché del agente (versión 2).
export function storeDemo() {
  return {
    version: 2,
    syncedAt: haceSegundos(20),
    importedAt: null,
    localBridgeId: 'puente-demo',
    remoteEnabled: true,
    agentUrl: '',
    agentToken: '',
    bridges: [
      {
        id: 'puente-demo',
        nombre: 'Mac del mostrador (demo)',
        branchId: 'suc-demo',
        url: '',
        token: '',
        online: true,
        predeterminado: true,
        ultimaSenal: haceSegundos(12),
      },
    ],
    sucursales: [{ id: 'suc-demo', nombre: 'Casa central (demo)', activa: true, hasSales: true }],
    impresoras: [
      {
        id: 'imp-demo-80',
        nombre: 'Térmica mostrador (demo)',
        marca: 'ZKP',
        modelo: 'ZKP8008',
        ubicacion: 'Mostrador',
        conexion: 'lan',
        destino: 'lan:192.168.1.23:9100',
        ancho: 80,
        copias: 1,
        corte: true,
        densidad: 3,
        caracteres: true,
        predeterminada: true,
        activa: true,
        bridgeId: 'puente-demo',
        branchId: 'suc-demo',
        ultimaPrueba: { ok: true, fecha: haceMinutos(34), tipo: 'prueba-corta', validacion: 'DEMO-80', ref: 'DEMO-80', metodo: 'LAN (TCP directo)', transporte: 'directo', jobId: 'demo-job-impreso', corte: true },
        origen: 'backend',
      },
      {
        id: 'imp-demo-58',
        nombre: 'Térmica depósito (demo)',
        marca: 'Epson',
        modelo: 'TM-T20',
        ubicacion: 'Depósito',
        conexion: 'cups',
        destino: 'cups:MobOS_LAN',
        ancho: 58,
        copias: 1,
        corte: true,
        densidad: 3,
        caracteres: true,
        predeterminada: false,
        activa: true,
        bridgeId: 'puente-demo',
        branchId: 'suc-demo',
        ultimaPrueba: null,
        origen: 'backend',
      },
    ],
  }
}

// Fila de actividad (misma forma que el historial del agente + tiempos de la
// telemetría). `sufijo` es el número ficticio que valida la verificación.
const fila = (datos) => ({
  cliente: 'Demo',
  puente: 'Mac del mostrador (demo)',
  tokenPista: 'a1b2…',
  modo: 'lan',
  ancho: 80,
  origen: 'local',
  estadoRemoto: '',
  enColaMs: 0,
  totalMs: 0,
  ...datos,
})

export function historialDemo() {
  return [
    fila({
      jobId: 'demo-job-1',
      fecha: haceMinutos(2),
      usuario: 'Dario (Dueño)',
      impresora: 'lan:192.168.1.23:9100',
      impresoraNombre: 'Térmica mostrador (demo)',
      resultado: 'aceptado',
      confirmadoEn: null,
      error: '',
      bytes: 1180,
      ref: 'DEMO-#0001',
      tipo: 'comprobante',
      validacion: 'DEMO-01',
      // Prueba de un dígito: valida sola apenas se escribe.
      sufijo: '4',
      sufijoLargo: 1,
      transporte: 'directo',
      enColaMs: 320,
      totalMs: 1450,
    }),
    fila({
      jobId: 'demo-job-2',
      fecha: haceMinutos(7),
      usuario: 'Lucía (Vendedora)',
      impresora: 'cups:MobOS_LAN',
      impresoraNombre: 'Térmica depósito (demo)',
      resultado: 'aceptado',
      confirmadoEn: null,
      error: '',
      bytes: 940,
      ref: 'DEMO-#0002',
      tipo: 'nota-entrega',
      validacion: 'DEMO-02',
      // Sufijo de cuatro dígitos: valida al completar el largo.
      sufijo: '1234',
      sufijoLargo: 4,
      transporte: 'cups',
      enColaMs: 870,
      totalMs: 2600,
    }),
    fila({
      jobId: 'demo-job-3',
      fecha: haceMinutos(12),
      usuario: 'Dario (Dueño)',
      impresora: 'lan:192.168.1.23:9100',
      impresoraNombre: 'Térmica mostrador (demo)',
      resultado: 'pendiente',
      confirmadoEn: null,
      error: 'connect ECONNREFUSED 192.168.1.23:9100',
      bytes: 760,
      ref: 'DEMO-#0003',
      tipo: 'proforma',
      validacion: 'DEMO-03',
      // Todavía no salió: no hay número del papel (sin auto-validación).
      sufijo: '',
      sufijoLargo: 0,
      transporte: '',
    }),
    fila({
      jobId: 'demo-job-4',
      fecha: haceMinutos(25),
      usuario: 'Lucía (Vendedora)',
      impresora: 'lan:192.168.1.23:9100',
      impresoraNombre: 'Térmica mostrador (demo)',
      resultado: 'incierto',
      confirmadoEn: null,
      error: 'El puente se reinició durante la impresión.',
      bytes: 1120,
      ref: 'DEMO-#0004',
      tipo: 'recibo-interno',
      validacion: 'DEMO-04',
      sufijo: '',
      sufijoLargo: 0,
      transporte: '',
    }),
    fila({
      jobId: 'demo-job-5',
      fecha: haceMinutos(48),
      usuario: 'Dario (Dueño)',
      impresora: 'cups:MobOS_LAN',
      impresoraNombre: 'Térmica depósito (demo)',
      resultado: 'fallido',
      confirmadoEn: null,
      error: 'Sin respuesta de 192.168.1.23:9100 en 6000 ms.',
      bytes: 640,
      ref: 'DEMO-#0005',
      tipo: 'etiqueta',
      validacion: 'DEMO-05',
      sufijo: '',
      sufijoLargo: 0,
      transporte: '',
    }),
    fila({
      jobId: 'demo-job-6',
      fecha: haceMinutos(75),
      usuario: 'Marcos (Gerente)',
      impresora: 'lan:192.168.1.23:9100',
      impresoraNombre: 'Térmica mostrador (demo)',
      resultado: 'cancelado',
      confirmadoEn: null,
      error: '',
      bytes: 520,
      ref: 'DEMO-#0006',
      tipo: 'comprobante',
      validacion: 'DEMO-06',
      sufijo: '',
      sufijoLargo: 0,
      transporte: '',
    }),
  ]
}

// Cola del agente (misma forma que `colaAgente()`), para el modal «Ver cola».
const trabajoCola = (datos) => ({
  origen: 'local',
  cliente: 'Demo',
  puente: 'Mac del mostrador (demo)',
  modo: 'lan',
  ancho: 80,
  sufijo: '',
  sufijoLargo: 0,
  tokenPista: 'a1b2…',
  ...datos,
})

export function colaDemo() {
  return {
    pendientes: [
      trabajoCola({ id: 'demo-cola-1', creadoEn: haceMinutos(1), impresora: 'lan:192.168.1.23:9100', usuario: 'Dario (Dueño)', estado: 'pendiente', intentos: 0, error: '', bytes: 760, ref: 'DEMO-#0003', tipo: 'proforma', validacion: 'DEMO-03' }),
      trabajoCola({ id: 'demo-cola-2', creadoEn: haceMinutos(4), impresora: 'cups:MobOS_LAN', usuario: 'Lucía (Vendedora)', estado: 'pendiente', intentos: 1, error: 'connect ECONNREFUSED 192.168.1.23:9100', bytes: 880, ref: 'DEMO-#0007', tipo: 'nota-entrega', validacion: 'DEMO-07' }),
    ],
    inciertos: [
      trabajoCola({ id: 'demo-cola-3', creadoEn: haceMinutos(25), impresora: 'lan:192.168.1.23:9100', usuario: 'Lucía (Vendedora)', estado: 'incierto', intentos: 2, error: 'El agente se reinició durante la impresión.', bytes: 1120, ref: 'DEMO-#0004', tipo: 'recibo-interno', validacion: 'DEMO-04' }),
    ],
    fallidos: [
      trabajoCola({ id: 'demo-cola-4', creadoEn: haceMinutos(48), impresora: 'cups:MobOS_LAN', usuario: 'Dario (Dueño)', estado: 'fallido', intentos: 3, error: 'Sin respuesta de 192.168.1.23:9100 en 6000 ms.', bytes: 640, ref: 'DEMO-#0005', tipo: 'etiqueta', validacion: 'DEMO-05' }),
    ],
  }
}
