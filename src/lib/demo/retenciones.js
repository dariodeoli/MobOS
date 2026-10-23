// Retención de IMEI del carrito en la demo: simulada en memoria de la pestaña.
// No toca el store de unidades: el contador corre y el latido renueva, pero
// nadie más retiene (no hay otros vendedores reales en la demo).
const TTL_SEGUNDOS = 300
const retenidas = new Map()

const respuesta = (serials, ahora = Date.now()) => ({
  held: serials.map(serial => ({ serial, reservedUntil: new Date(ahora + TTL_SEGUNDOS * 1000).toISOString(), holdStartedAt: new Date(ahora).toISOString(), secondsLeft: TTL_SEGUNDOS })),
  ttlSeconds: TTL_SEGUNDOS,
  maxMinutes: 60,
  serverNow: new Date(ahora).toISOString(),
})

export function retenerDemo({ cartId, serials = [] } = {}) {
  for (const serial of serials) retenidas.set(serial, cartId)
  return respuesta(serials)
}

export function renovarDemo({ cartId, serials = [] } = {}) {
  const vivos = serials.filter(serial => retenidas.get(serial) === cartId)
  return { ...respuesta(vivos), lost: serials.filter(serial => !vivos.includes(serial)) }
}

export function liberarDemo({ cartId, serials = [] } = {}) {
  let liberadas = 0
  for (const [serial, dueno] of [...retenidas]) {
    if ((serials.length ? serials.includes(serial) : dueno === cartId)) { retenidas.delete(serial); liberadas += 1 }
  }
  return { released: liberadas, own: liberadas, others: 0, serverNow: new Date().toISOString() }
}
