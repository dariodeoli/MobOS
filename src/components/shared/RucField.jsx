import { useState } from 'react'
import { Badge, Input } from '@/components/ui'
import BotonDentroCampo from '@/components/shared/BotonDentroCampo'
import { api } from '@/lib/api/client'
import { consultarRucDemo } from '@/lib/demoRuc'

// Campo RUC único de la app: input con el botón **Extraer** adentro (trailing,
// con tooltip y estado "Consultando…", #234) contra `GET /api/ruc` (cuota,
// auditoría y `manualEntryAllowed` viven en el servidor). El resultado se
// ofrece con "Usar estos datos": nunca pisa lo cargado sin confirmación y, si
// el proveedor no responde, el dato se completa a mano. En la demo resuelve
// contra el mock del navegador (`demoRuc.js`), marcado como simulado.
export default function RucField({
  id,
  value,
  onChange,
  onAplicar,
  disabled = false,
  consultarDisabled = false,
  mostrarExtractor = true,
  esDemo = false,
  maxLength = 100,
  placeholder = '80012345-6',
  autoComplete = 'off',
  ariaLabel,
}) {
  const [resultado, setResultado] = useState(null)
  const [consultando, setConsultando] = useState(false)
  const [error, setError] = useState('')
  const hayRuc = Boolean(String(value || '').trim())

  async function consultar() {
    const ruc = String(value || '').trim()
    if (!ruc || consultando) return
    setConsultando(true); setError(''); setResultado(null)
    try {
      if (esDemo) {
        // Demo funcional (#234): resultado ficticio en el navegador, sin tocar
        // el API real ni consumir cuota.
        setResultado(await consultarRucDemo(ruc))
        return
      }
      const respuesta = await api.get(`/api/ruc?ruc=${encodeURIComponent(ruc)}`)
      if (!respuesta?.result?.name) throw new Error('No encontramos datos para ese RUC.')
      setResultado(respuesta.result)
    } catch (causa) {
      setError(causa?.message || 'No se pudo consultar el RUC. Podés completar los datos manualmente.')
    } finally { setConsultando(false) }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          id={id}
          aria-label={ariaLabel}
          className={mostrarExtractor ? (consultando ? 'pr-32' : 'pr-11') : undefined}
          maxLength={maxLength}
          autoComplete={autoComplete}
          disabled={disabled}
          value={value}
          onChange={(event) => { onChange(event.target.value); setResultado(null); setError('') }}
          placeholder={placeholder}
        />
        {mostrarExtractor && (
          <BotonDentroCampo
            etiqueta="Extraer los datos del RUC"
            titulo={hayRuc ? 'Extraer los datos del RUC' : 'Ingresá el RUC para extraer los datos'}
            etiquetaOcupada="Consultando…"
            disabled={disabled || consultarDisabled || !hayRuc}
            ocupado={consultando}
            onClick={consultar}
          />
        )}
      </div>
      {mostrarExtractor && <span className="block text-xs text-mute">La razón social se aplica solo si la confirmás.</span>}
      {resultado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fono/25 bg-fono/5 p-3 text-sm">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <b className="truncate">{resultado.name}</b>
              {resultado.simulado && <Badge color="blue">Simulada en demo</Badge>}
            </span>
            <span className="block text-mute">RUC {resultado.fullRuc}</span>
            {resultado.simulado && <span className="block text-xs text-mute">Resultado ficticio: la demo no consulta registros reales.</span>}
          </span>
          <button type="button" className="font-semibold text-fono-light" onClick={() => { onAplicar?.(resultado); setResultado(null) }}>Usar estos datos</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  )
}
