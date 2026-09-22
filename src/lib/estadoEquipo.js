// Estados de la inspección del equipo (#240, PhoneCheck): semáforo por ítem del
// checklist, locks del dispositivo, salud de batería y grado de condición.
// Etiqueta, tono e ícono viven acá para que el checklist, la ficha, el informe
// publicado y el rack lean igual; las pantallas aportan los datos y las acciones.
// Sin lógica de negocio y sin textos sueltos por pantalla.

// 1) Ítems del checklist: bien / con observación / falla / sin verificar.
export const ESTADOS_ITEM = {
  ok: { etiqueta: 'Bien', tono: 'ok', icono: 'check' },
  aviso: { etiqueta: 'Con observación', tono: 'warn', icono: 'alert' },
  falla: { etiqueta: 'Falla', tono: 'bad', icono: 'close' },
  sinVerificar: { etiqueta: 'Sin verificar', tono: 'mute', icono: 'clock' },
}

export const estadoItem = (clave) => ESTADOS_ITEM[clave] || ESTADOS_ITEM.sinVerificar

// Chips de estado del equipo en consola/rack: certificado, en revisión,
// pendiente y con fallas. `pass` es el verde de certificado del tema consola.
export const ESTADOS_CHIP = {
  pass: { etiqueta: 'Certificado', tono: 'pass', icono: 'check' },
  revision: { etiqueta: 'En revisión', tono: 'info', icono: 'refresh' },
  pendiente: { etiqueta: 'Pendiente', tono: 'mute', icono: 'clock' },
  falla: { etiqueta: 'Con fallas', tono: 'bad', icono: 'alert' },
}

export const estadoChip = (clave) => ESTADOS_CHIP[clave] || ESTADOS_CHIP.pendiente

// Clases de los tonos por uso (el mismo tono en punto, chip y texto). Misma
// forma que la biblioteca (`TONOS.punto` / `TONOS.chip` / `TONOS.texto`).
export const TONOS = {
  punto: {
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    bad: 'bg-bad/15 text-bad',
    mute: 'bg-ink-700 text-mute',
    info: 'bg-info/15 text-info',
    pass: 'bg-pass/15 text-pass',
  },
  chip: {
    ok: 'border-ok/30 bg-ok/10 text-ok',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    bad: 'border-bad/30 bg-bad/10 text-bad',
    mute: 'border-ink-600 bg-ink-800/40 text-mute',
    info: 'border-info/30 bg-info/10 text-info',
    pass: 'border-pass/30 bg-pass/10 text-pass',
  },
  texto: { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', mute: 'text-mute', info: 'text-info', pass: 'text-pass' },
}

// 2) Locks del dispositivo: el nombre canónico de cada chip (el estado lo
// aporta el diagnóstico: iCloud/Find My, MDM, ESN/lista negra, carrier/SIM).
export const LOCKS_DISPOSITIVO = {
  icloud: 'iCloud / Find My',
  mdm: 'MDM',
  esn: 'ESN / lista negra',
  carrier: 'Carrier / SIM lock',
  oem: 'Repuesto no OEM',
}

export const ESTADOS_LOCK = {
  libre: { etiqueta: 'Libre', tono: 'ok', icono: 'unlock' },
  activo: { etiqueta: 'Activo', tono: 'bad', icono: 'lock' },
  desconocido: { etiqueta: 'Sin dato', tono: 'mute', icono: 'clock' },
}

export const estadoLock = (clave) => ESTADOS_LOCK[clave] || ESTADOS_LOCK.desconocido

// 3) Batería: 90 % o más está bien; 80–89 % pide atención; por debajo, cambio.
export const UMBRAL_BATERIA_OK = 90
export const UMBRAL_BATERIA_ATENCION = 80

export function tonoBateria(porcentaje) {
  if (porcentaje === null || porcentaje === undefined || porcentaje === '') return 'mute'
  const valor = Number(porcentaje)
  if (!Number.isFinite(valor)) return 'mute'
  if (valor >= UMBRAL_BATERIA_OK) return 'ok'
  if (valor >= UMBRAL_BATERIA_ATENCION) return 'warn'
  return 'bad'
}

// 4) Grado de condición: A como nuevo, B marcas leves, C marcas visibles. El
// grado alimenta precio, etiqueta, certificado y valuación del trade-in.
export const GRADOS_CONDICION = {
  A: { etiqueta: 'Grado A', tono: 'ok', descripcion: 'Como nuevo, sin marcas visibles' },
  B: { etiqueta: 'Grado B', tono: 'warn', descripcion: 'Marcas leves de uso' },
  C: { etiqueta: 'Grado C', tono: 'bad', descripcion: 'Marcas o detalles visibles' },
}

export const gradoCondicion = (clave) => GRADOS_CONDICION[String(clave || '').trim().toUpperCase()] || null

// Tono semántico → color del Badge compartido (el Badge usa nombres de color).
export const COLOR_BADGE = { ok: 'green', warn: 'orange', bad: 'red', mute: 'slate', info: 'blue', pass: 'green' }
export const colorBadge = (tono) => COLOR_BADGE[tono] || 'slate'
