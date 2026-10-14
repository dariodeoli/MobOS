import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { BotonDentroCampo } from 'owncoding-ui'
import { Badge, Input } from '@/components/ui'
import { api } from '@/lib/api/client'
import { consultarRucDemo } from '@/lib/demoRuc'
import { demoSessionActive, isDemoRuntime } from '@/lib/demoMode'
import { admitRucResponse, createRucRequestGuard, formatRucInput, lookupDemoRuc, parseRucInput } from './rucLookup.js'

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function RucField({
  esDemo = false, id, value, onChange, onAplicar, onDatos,
  disabled = false, consultarDisabled = false, mostrarExtractor = true,
  maxLength = 32, placeholder = '80012345-6', autoComplete = 'off', ariaLabel,
  textoAyuda = 'La razón social se aplica solo si la confirmás.', className = '',
  consultar: externalLookup, ...inputProps
}) {
  const generatedId = useId()
  const inputId = id || generatedId
  const [suggestion, setSuggestion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const guard = useRef(null)
  if (!guard.current) guard.current = createRucRequestGuard()
  const scope = useRef(null)
  const query = formatRucInput(value)
  // La sesión demo se relee: `isDemoRuntime` se fija al cargar el módulo y no
  // ve una sesión demo iniciada después sin recargar.
  const demo = esDemo || isDemoRuntime || demoSessionActive()
  scope.current = { query, demo, disabled, lookupDisabled: consultarDisabled, visible: mostrarExtractor }

  function invalidate() {
    guard.current.cancel()
    setLoading(false)
    setSuggestion(null)
    setError('')
  }

  useClientLayoutEffect(() => {
    invalidate()
  }, [query, demo, disabled, consultarDisabled, mostrarExtractor])
  useEffect(() => () => guard.current.cancel(), [])

  async function extract() {
    if (!query || loading || disabled || consultarDisabled || !mostrarExtractor) return
    const identity = parseRucInput(query)
    if (!identity) {
      setError('Ingresá un RUC de 1 a 9 dígitos y, si incluís el guion, un dígito verificador válido. Podés completar los datos manualmente.')
      return
    }
    const request = guard.current.begin(scope.current)
    setLoading(true)
    setError('')
    setSuggestion(null)
    try {
      const result = demo
        ? await lookupDemoRuc(identity, consultarRucDemo)
        : admitRucResponse(await api.get(`/api/ruc?ruc=${encodeURIComponent(identity.query)}`, {
          signal: request.signal, cacheMs: 0, cache: 'no-store',
        }), identity)
      if (!request.isCurrent(scope.current)) return
      if (!result) throw new Error('No se recibieron datos verificables para ese RUC.')
      setSuggestion({ result, request })
    } catch (cause) {
      if (request.isCurrent(scope.current)) {
        setError(`${cause?.message || 'No se pudo consultar el RUC.'} Podés completar los datos manualmente.`)
      }
    } finally {
      if (request.isCurrent(scope.current)) setLoading(false)
    }
  }

  function apply() {
    if (!suggestion?.request.isCurrent(scope.current) || disabled || consultarDisabled || !mostrarExtractor) return
    const result = suggestion.result
    invalidate()
    // Only explicit acceptance emits data; the consumer still owns persistence.
    const accept = onAplicar || onDatos
    accept?.(result)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="relative">
        <Input {...inputProps} id={inputId} aria-label={ariaLabel}
          aria-describedby={[inputProps['aria-describedby'], mostrarExtractor && textoAyuda ? `${inputId}-ayuda` : null, error ? `${inputId}-error` : null].filter(Boolean).join(' ') || undefined}
          aria-invalid={inputProps['aria-invalid'] ?? (error ? true : undefined)}
          type="text" inputMode="numeric" pattern="[1-9][0-9]{0,8}(-[0-9])?" spellCheck={false}
          maxLength={maxLength} placeholder={placeholder} autoComplete={autoComplete}
          disabled={disabled} value={query}
          className={mostrarExtractor ? (loading ? 'pr-32' : 'pr-11') : undefined}
          onChange={(event) => { invalidate(); onChange?.(formatRucInput(event.target.value)) }} />
        {mostrarExtractor && <BotonDentroCampo etiqueta="Extraer los datos del RUC"
          titulo={query ? 'Extraer los datos del RUC' : 'Ingresá el RUC para extraer los datos'}
          etiquetaOcupada="Consultando…" ocupado={loading}
          disabled={disabled || consultarDisabled || !query} onClick={extract} />}
      </div>
      {mostrarExtractor && textoAyuda && <span id={`${inputId}-ayuda`} className="block text-xs text-mute">{textoAyuda}</span>}
      {suggestion && <div role="status" className="space-y-2 rounded-xl border border-fono/25 bg-fono/5 p-3 text-sm">
        <p className="break-words"><b>{suggestion.result.nameOfficial}</b></p>
        <p className="text-mute">RUC {suggestion.result.fullRuc}</p>
        {suggestion.result.simulado && <><Badge color="blue">Simulada en demo</Badge><p className="text-xs text-mute">Resultado ficticio: la demo no consulta registros reales.</p></>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={disabled || consultarDisabled} className="min-h-11 px-2 font-semibold text-fono-light" onClick={apply}>Usar estos datos</button>
          <button type="button" className="min-h-11 px-2 text-mute" onClick={invalidate}>Descartar</button>
        </div>
      </div>}
      {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-bad-text">{error}</p>}
    </div>
  )
}
