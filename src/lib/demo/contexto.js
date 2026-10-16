// Contexto de demostración: no representa sesión ni permiso del servidor.
// La instancia activa solo admite Aurora hasta que haya otros escenarios completos.
export function crearContextoDemo({ empresas = ['mobos-demo'], inicial = 'mobos-demo' } = {}) {
  const permitidas = new Set(empresas)
  let revision = 0
  let actual
  const permite = empresaId => empresaId === null || permitidas.has(empresaId)
  function activar({ empresaId = null, sucursalId = null, userId = null } = {}) {
    if (!permite(empresaId)) throw new Error('Empresa de demostración no disponible.')
    if (actual && actual.empresaId === empresaId && actual.sucursalId === sucursalId && actual.userId === userId) return actual
    actual = Object.freeze({ empresaId, sucursalId, userId, revision: ++revision })
    return actual
  }
  function invalidar() {
    actual = Object.freeze({ ...actual, revision: ++revision })
    return actual
  }
  activar({ empresaId: inicial })
  return Object.freeze({ activar, invalidar, permite, capturar: () => actual, vigente: token => token === actual && actual.empresaId !== null })
}

export const contextoDemo = crearContextoDemo()
export const capturarContextoDemo = () => contextoDemo.capturar()
export const contextoDemoVigente = token => contextoDemo.vigente(token)
