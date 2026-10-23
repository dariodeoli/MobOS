import { digitoVerificadorRuc } from '../../lib/demoRuc.js'
import { nombreDesdeRuc } from '../../lib/nombreDesdeRuc.js'

// Suma a la consulta admitida el nombre ya resuelto por la regla única
// (nombreDesdeRuc): tipo, nombres, apellidos, nombreCompleto y razonSocial.
// nameOfficial/name quedan exactos: son el dato fiscal.
export function conNombreDesdeRuc(datos) {
  return datos ? { ...datos, ...nombreDesdeRuc(datos) } : datos
}

// A DV is explicit only after a hyphen; the ninth digit is still part of the base.
export function formatRucInput(value) {
  return String(value ?? '').replace(/[^\d-]/g, '')
}

export function parseRucInput(value) {
  const raw = String(value ?? '').trim()
  if (!raw || raw.length > 32 || /[^\d.\s-]/.test(raw)) return null
  const query = raw.replace(/[.\s]/g, '')
  const match = /^([1-9]\d{0,8})(?:-(\d))?$/.exec(query)
  if (!match) return null
  const [, base, explicitDv] = match
  const dv = digitoVerificadorRuc(base)
  if (explicitDv !== undefined && explicitDv !== dv) return null
  return { base, dv, query, fullRuc: `${base}-${dv}` }
}

export function admitRucResponse(payload, identity, demo = false) {
  const result = demo ? payload : payload?.result
  if (!identity || !result || typeof result !== 'object' || Array.isArray(result)) return null
  const nameOfficial = demo ? result.name : result.nameOfficial
  if (typeof nameOfficial !== 'string' || !nameOfficial.trim() || result.fullRuc !== identity.fullRuc) return null
  if (demo) {
    if (result.simulado !== true) return null
  } else if (payload.reviewRequired !== true || payload.source?.provider !== 'OwnData'
    || payload.query?.normalized !== identity.query || payload.query?.fullRuc !== identity.fullRuc
    || result.ruc !== identity.base || result.dv !== identity.dv
    || ('equivalenceRaw' in result && typeof result.equivalenceRaw !== 'string')
    || ('sourcePartition' in result && (!Number.isInteger(result.sourcePartition) || result.sourcePartition < 0 || result.sourcePartition > 9))
    || result.simulado === true) return null
  // Compatibility name is an exact alias, never a display-name transformation.
  return { name: nameOfficial, nameOfficial, ruc: result.ruc, dv: result.dv, fullRuc: result.fullRuc,
    ...(typeof result.equivalenceRaw === 'string' ? { equivalenceRaw: result.equivalenceRaw } : {}),
    ...(typeof result.sourcePartition === 'number' ? { sourcePartition: result.sourcePartition } : {}),
    ...(demo ? { simulado: true } : {}),
  }
}

// Cancellation is best-effort; generation and scope identity remain authoritative.
export function createRucRequestGuard() {
  let generation = 0
  let controller = null
  return {
    cancel() {
      generation += 1
      controller?.abort()
      controller = null
    },
    begin(scope) {
      this.cancel()
      controller = new AbortController()
      const signal = controller.signal
      const ticket = generation
      return {
        signal,
        isCurrent(currentScope) {
          return !signal.aborted && ticket === generation
            && scope.query === currentScope.query && scope.demo === currentScope.demo
            && scope.disabled === currentScope.disabled
            && scope.lookupDisabled === currentScope.lookupDisabled
            && scope.visible === currentScope.visible
        },
      }
    },
  }
}

export async function lookupDemoRuc(identity, mockLookup) {
  // The legacy mock accepts 5+ digits. Padding preserves its digit-sum seed
  // only inside the simulation; the admitted identity stays the user's exact base.
  const result = await mockLookup(identity.base.padStart(5, '0'))
  return admitRucResponse({ ...result, fullRuc: identity.fullRuc }, identity, true)
}
