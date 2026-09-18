import { useState } from 'react'
import { Button, Input } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'

// Campo RUC único de la app: input + extractor contra `GET /api/ruc` (cuota,
// auditoría y `manualEntryAllowed` viven en el servidor). El resultado se
// ofrece con "Usar estos datos": nunca pisa lo cargado sin confirmación y, si
// el proveedor no responde, el dato se completa a mano.
export default function RucField({
  id,
  value,
  onChange,
  onAplicar,
  disabled = false,
  consultarDisabled = false,
  mostrarExtractor = true,
  maxLength = 100,
  placeholder = '80012345-6',
  autoComplete = 'off',
  ariaLabel,
}) {
  const [resultado, setResultado] = useState(null)
  const [consultando, setConsultando] = useState(false)
  const [error, setError] = useState('')

  async function consultar() {
    const ruc = String(value || '').trim()
    if (!ruc || consultando) return
    setConsultando(true); setError(''); setResultado(null)
    try {
      const respuesta = await api.get(`/api/ruc?ruc=${encodeURIComponent(ruc)}`)
      if (!respuesta?.result?.name) throw new Error('No encontramos datos para ese RUC.')
      setResultado(respuesta.result)
    } catch (causa) {
      setError(causa?.message || 'No se pudo consultar el RUC. Podés completar los datos manualmente.')
    } finally { setConsultando(false) }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          aria-label={ariaLabel}
          className="min-w-0 flex-1"
          maxLength={maxLength}
          autoComplete={autoComplete}
          disabled={disabled}
          value={value}
          onChange={(event) => { onChange(event.target.value); setResultado(null); setError('') }}
          placeholder={placeholder}
        />
        {mostrarExtractor && (
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={disabled || consultando || consultarDisabled || !String(value || '').trim()}
            onClick={consultar}
            title="Extraer RUC"
          >
            <Icon name="search" className="h-3.5 w-3.5" />{consultando ? 'Consultando…' : 'Extraer RUC'}
          </Button>
        )}
      </div>
      {mostrarExtractor && <span className="block text-xs text-mute">La razón social se aplica solo si la confirmás.</span>}
      {resultado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fono/25 bg-fono/5 p-3 text-sm">
          <span><b>{resultado.name}</b><br /><span className="text-mute">RUC {resultado.fullRuc}</span></span>
          <button type="button" className="font-semibold text-fono-light" onClick={() => { onAplicar?.(resultado); setResultado(null) }}>Usar estos datos</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  )
}
