import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RucField as CampoRuc, Checkbox } from 'owncoding-ui'
import { api, API_URL } from '@/lib/api/client'
import { consultarRucDemoReal } from '@/lib/rucDemoRequest'
import { demoSessionActive, isDemoRuntime } from '@/lib/demoMode'
import { cn } from '@/lib/utils'
import { ANCHO_CAMPO } from './anchoCampos'
import { admitRucResponse, createRucRequestGuard, formatRucInput, parseRucInput } from './rucLookup.js'

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// El componente compartido dibuja la variante compacta; MobOS conserva la
// admisión fiscal y el contexto privado de cada consulta. Ninguna respuesta
// cambia datos del cliente sin consentimiento y sin seguir vigente.
export default function RucField({
  esDemo = false, value, onChange, onAplicar, onDatos,
  disabled = false, consultarDisabled = false, mostrarExtractor = true,
  maxLength = 32, className = '', consultar: _externalLookup, ...inputProps
}) {
  const [individualConfirmed, setIndividualConfirmed] = useState(false)
  const guard = useRef(null)
  if (!guard.current) guard.current = createRucRequestGuard()
  const scope = useRef(null)
  const query = formatRucInput(value)
  const demo = esDemo || isDemoRuntime || demoSessionActive()
  scope.current = { query, demo, disabled, lookupDisabled: consultarDisabled, visible: mostrarExtractor, individualConfirmed }
  useClientLayoutEffect(() => { guard.current.cancel() }, [query, demo, disabled, consultarDisabled, mostrarExtractor, individualConfirmed])
  useEffect(() => () => guard.current.cancel(), [])

  const consultar = useCallback(async (texto) => {
    const identity = parseRucInput(texto)
    if (!identity) throw new Error('Ingresá un RUC de 1 a 9 dígitos y, si incluís el guion, un dígito verificador válido. Podés completar los datos manualmente.')
    const request = guard.current.begin(scope.current)
    const payload = demo
      ? await consultarRucDemoReal(identity.query, { apiUrl: API_URL, signal: request.signal, individualConfirmed })
      : await api.get(`/api/ruc?ruc=${encodeURIComponent(identity.query)}${individualConfirmed ? '&subjectKind=individual' : ''}`, {
        signal: request.signal, cacheMs: 0, cache: 'no-store',
      })
    // Los RUC de ejemplo marcados como fixture se admiten con el contrato demo
    // local. El resto de la demo conserva la consulta pública de OwnData y sus
    // errores honestos; nunca se convierte un 503 en una razón social inventada.
    const result = admitRucResponse(payload, identity, demo && Boolean(payload?.demoFixture), individualConfirmed)
    if (!request.isCurrent(scope.current)) return null
    if (!result) throw new Error('No se recibieron datos verificables para ese RUC.')
    // name solo adapta la presentación; datos conserva nameOfficial y toda la
    // evidencia admitida, sin renombrar ni inventar identidad fiscal.
    return { name: result.displayName ?? result.nameOfficial, fullRuc: result.fullRuc, simulado: result.simulado, datos: result, request }
  }, [demo, individualConfirmed])

  function aplicar(resultado) {
    if (!resultado?.request.isCurrent(scope.current) || disabled || consultarDisabled || !mostrarExtractor) return
    guard.current.cancel()
    const aceptar = onAplicar || onDatos
    aceptar?.(resultado.datos)
  }

  return <div className={cn('space-y-1', className)}><CampoRuc key={String(individualConfirmed)} {...inputProps} className={cn('mobos-ruc-field', ANCHO_CAMPO.documento)}
    variante="compacta" maxBaseDigits={9} maxLength={maxLength}
    value={query} disabled={disabled} consultarDisabled={consultarDisabled}
    mostrarExtractor={mostrarExtractor} consultar={consultar}
    onChange={(texto) => { guard.current.cancel(); onChange?.(formatRucInput(texto)) }}
    onAplicar={aplicar} onDescartar={() => guard.current.cancel()} />
    {mostrarExtractor && <Checkbox label="Confirmo que es una persona: consultar nombre completo" checked={individualConfirmed}
      disabled={disabled || consultarDisabled} onChange={event => { guard.current.cancel(); setIndividualConfirmed(event.target.checked) }} />}
  </div>
}
