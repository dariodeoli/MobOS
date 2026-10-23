import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { BotonDentroCampo, Input } from 'owncoding-ui'
import { api, API_URL } from '@/lib/api/client'
import { consultarRucDemoReal } from '@/lib/rucDemoRequest'
import { demoSessionActive, isDemoRuntime } from '@/lib/demoMode'
import { cn } from '@/lib/utils'
import { ANCHO_CAMPO } from './anchoCampos'
import { admitRucResponse, conNombreDesdeRuc, createRucRequestGuard, formatRucInput, parseRucInput } from './rucLookup.js'

// Consulta para el buscador de cliente del POS (sin el campo en pantalla): mismo
// transporte y misma admisión que el extractor del campo, sin cuota nueva.
export async function consultarRucAdmitido(identity, { demo = false, signal } = {}) {
  const respuesta = demo
    ? await consultarRucDemoReal(identity.query, { apiUrl: API_URL, signal })
    : await api.get(`/api/ruc?ruc=${encodeURIComponent(identity.query)}`, { signal, cacheMs: 0, cache: 'no-store' })
  const admitido = admitRucResponse(respuesta, identity, demo && Boolean(respuesta?.demoFixture))
  if (!admitido) throw new Error('No se recibieron datos verificables para ese RUC.')
  return conNombreDesdeRuc(admitido)
}

// Cuentas sin acceso a la consulta (fuera del piloto o sin configurar): el
// buscador solo prellena el documento, sin avisos.
export function sinAccesoConsultaRuc(error) {
  return [401, 403, 404, 503].includes(error?.status)
}

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// Extractor de RUC: al tocar la lupa o apretar Enter, la consulta admitida se
// aplica directo (sin tarjeta de confirmación) y queda una línea breve con
// «Deshacer». Si `onAplicar` devuelve una función, esa función restaura el
// estado previo de la pantalla; sin ella el aviso se muestra sin el botón. Ninguna respuesta se aplica si
// dejó de estar vigente (otra consulta, otro texto, campo deshabilitado).
export default function RucField({
  esDemo = false, value, onChange, onAplicar, onDatos,
  id, ariaLabel, disabled = false, consultarDisabled = false, mostrarExtractor = true,
  maxLength = 32, className = '', placeholder = '80012345-6', consultar: _externalLookup, ...inputProps
}) {
  const guard = useRef(null)
  if (!guard.current) guard.current = createRucRequestGuard()
  const scope = useRef(null)
  const generado = useId()
  const inputId = id || generado
  const errorId = `${inputId}-error`
  const [consultando, setConsultando] = useState(false)
  const [error, setError] = useState('')
  const [aplicado, setAplicado] = useState(null)
  const query = formatRucInput(value)
  const demo = esDemo || isDemoRuntime || demoSessionActive()
  scope.current = { query, demo, disabled, lookupDisabled: consultarDisabled, visible: mostrarExtractor }
  useClientLayoutEffect(() => {
    guard.current.cancel()
    setConsultando(false); setError('')
    // El aviso sobrevive al cambio de texto que provoca la propia aplicación (RUC con DV).
    setAplicado((actual) => (actual?.consultas.includes(query) ? actual : null))
  }, [query, demo, disabled, consultarDisabled, mostrarExtractor])
  useEffect(() => () => guard.current.cancel(), [])

  const consultar = useCallback(async (texto) => {
    const identity = parseRucInput(texto)
    if (!identity) throw new Error('Ingresá un RUC de 1 a 9 dígitos y, si incluís el guion, un dígito verificador válido. Podés completar los datos manualmente.')
    const request = guard.current.begin(scope.current)
    const payload = demo
      ? await consultarRucDemoReal(identity.query, { apiUrl: API_URL, signal: request.signal })
      : await api.get(`/api/ruc?ruc=${encodeURIComponent(identity.query)}`, {
        signal: request.signal, cacheMs: 0, cache: 'no-store',
      })
    // Solo el ejemplo marcado como fixture (OwnData caído en la demo) se admite
    // con el contrato local; el resto de la demo conserva la consulta real.
    const result = admitRucResponse(payload, identity, demo && Boolean(payload?.demoFixture))
    if (!request.isCurrent(scope.current)) return null
    if (!result) throw new Error('No se recibieron datos verificables para ese RUC.')
    return { datos: conNombreDesdeRuc(result), request }
  }, [demo])

  async function extraer() {
    if (consultando || disabled || consultarDisabled || !mostrarExtractor || !query) return
    setConsultando(true); setError(''); setAplicado(null)
    try {
      const resultado = await consultar(query)
      if (!resultado || !resultado.request.isCurrent(scope.current)) return
      guard.current.cancel()
      const aceptar = onAplicar || onDatos
      const restaurar = await aceptar?.(resultado.datos)
      setAplicado({ consultas: [query, resultado.datos.fullRuc], simulado: resultado.datos.simulado === true, restaurar: typeof restaurar === 'function' ? restaurar : null })
      setConsultando(false)
    } catch (causa) {
      if (scope.current.query === query) setError(causa?.message || 'No se pudo consultar el RUC. Podés completar los datos manualmente.')
      setConsultando(false)
    }
  }

  function deshacer() {
    const restaurar = aplicado?.restaurar
    setAplicado(null)
    restaurar?.()
  }

  const hayRuc = /^[1-9][0-9]{0,8}(-[0-9])?$/.test(query)
  return <div className={cn('mobos-ruc-field space-y-1', ANCHO_CAMPO.documento, className)}>
    <Input {...inputProps} id={inputId} aria-label={ariaLabel} type="text" inputMode="numeric" spellCheck={false} autoComplete="off"
      pattern="[1-9][0-9]{0,8}(-[0-9])?" maxLength={Math.min(11, Number(maxLength) || 11)} placeholder={placeholder}
      aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}
      value={query} disabled={disabled}
      onChange={(event) => { guard.current.cancel(); onChange?.(formatRucInput(event.target.value)) }}
      onKeyDown={(event) => {
        inputProps.onKeyDown?.(event)
        if (event.key === 'Enter' && mostrarExtractor && hayRuc && !event.defaultPrevented) { event.preventDefault(); extraer() }
      }}
      fin={mostrarExtractor ? <BotonDentroCampo integrado etiqueta="Extraer los datos del RUC"
        titulo={hayRuc ? 'Extraer los datos del RUC' : 'Ingresá el RUC para extraer los datos'} etiquetaOcupada="Consultando…"
        disabled={disabled || consultarDisabled || !hayRuc} ocupado={consultando} onClick={extraer} /> : undefined} />
    {aplicado && <p role="status" data-testid="ruc-aplicado" className="text-xs font-semibold text-ok">
      {aplicado.simulado ? 'OwnData no respondió: datos de ejemplo cargados' : 'Datos del RUC cargados'}
      {aplicado.restaurar && <> · <button type="button" className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono" onClick={deshacer}>Deshacer</button></>}
    </p>}
    {error && <p id={errorId} role="alert" className="text-sm text-bad-text">{error}</p>}
  </div>
}
