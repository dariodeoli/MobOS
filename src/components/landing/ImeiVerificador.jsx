import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, RefreshCw, ScanLine, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { publicUrls } from '@/lib/urls'
import { fechaDia, fechaHora } from '@/utils/fecha'
import { FUENTE_DEMO, IMEI_EJEMPLO, consultaImeiEjemplo, enmascararImeiDemo, validarImeiDemo } from '@/lib/imeiDemoLanding'

// Verificador de IMEI de la landing (#202): demo visual, sin llamadas ni
// cargos. Usa la misma forma de mock que la demo (#200/#201) y marca siempre
// que el resultado es simulado; el caso "pendiente" muestra el estado honesto
// ("No verificado") en vez de inventar un "Limpio".

const PASOS = [
  'Validando el IMEI (15 dígitos y dígito control)',
  'Consultando listas de reportes y blacklist',
  'Revisando Find My / iCloud, SIM lock y garantía',
]

function imeiAleatorioValido() {
  let base = '35'
  while (base.length < 14) base += String(Math.floor(Math.random() * 10))
  let suma = 0
  for (let i = 0; i < 14; i += 1) {
    let digito = Number(base[13 - i])
    if (i % 2 === 0) {
      digito *= 2
      if (digito > 9) digito -= 9
    }
    suma += digito
  }
  return `${base}${(10 - (suma % 10)) % 10}`
}

function CampoResultado({ campo, indice }) {
  const hora = campo.hora ? fechaHora(campo.hora, '') : ''
  return (
    <div className="mobos-aparece rounded-xl border border-fore/[.08] bg-fore/[.025] p-3" style={{ animationDelay: `${indice * 70}ms` }}>
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-mute">{campo.etiqueta}</p>
      <p className="mt-1 text-sm font-semibold">{campo.valor}</p>
      <p className="mt-0.5 text-[10px] text-mute">{campo.fuente}{hora ? ` · ${hora}` : ''}</p>
    </div>
  )
}

export default function ImeiVerificador() {
  const { app } = publicUrls
  const [imei, setImei] = useState(IMEI_EJEMPLO)
  const [fase, setFase] = useState('listo')
  const [paso, setPaso] = useState(0)
  const [consulta, setConsulta] = useState(null)
  const [error, setError] = useState('')
  const timers = useRef([])

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  function programar(escenario) {
    const validacion = validarImeiDemo(imei)
    if (!validacion.ok) {
      setFase('error')
      setConsulta(null)
      setError(validacion.error)
      return
    }
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const porPaso = reducido ? 90 : 720
    timers.current.forEach(clearTimeout)
    timers.current = []
    setError('')
    setConsulta(null)
    setPaso(0)
    setFase('escaneando')
    PASOS.forEach((_, indice) => {
      timers.current.push(setTimeout(() => setPaso(indice + 1), porPaso * (indice + 1)))
    })
    timers.current.push(setTimeout(() => {
      setConsulta(consultaImeiEjemplo(validacion.imei, { escenario }))
      setFase('resultado')
    }, porPaso * (PASOS.length + 1)))
  }

  function cambiarImei(valor) {
    setImei(String(valor).replace(/[^\d ]/g, '').slice(0, 19))
    if (fase !== 'listo') { setFase('listo'); setConsulta(null); setError('') }
  }

  function otroEjemplo() {
    setImei(imeiAleatorioValido())
    setFase('listo')
    setConsulta(null)
    setError('')
  }

  const verificado = consulta?.estado === 'verificado'

  return (
    <div className="grid gap-8 lg:grid-cols-[.95fr_1.05fr] lg:items-start">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-fono/25 bg-fono/[.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-fono-dark">
          <ScanLine size={13} />
          Verificación de IMEI
        </p>
        <h2 className="mt-5 font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
          Un IMEI deja de ser un número suelto.
        </h2>
        <p className="mt-5 leading-7 text-mute">
          Antes de recibir un equipo o tomarlo en parte de pago, la ficha muestra
          su estado: blacklist actual e historial, Find My / iCloud, SIM lock, MDM
          y garantía. Cada consulta indica <b className="text-fore">fuente y hora</b> y queda
          auditada; un resultado pendiente, parcial o sin dato queda
          como <b className="text-fore">“No verificado”</b>, nunca un “limpio” inventado.
        </p>
        <ul className="mt-6 space-y-3 text-sm text-mute">
          <li className="flex gap-3"><Check size={16} className="mt-0.5 shrink-0 text-fono-dark" />Se consulta solo cuando alguien lo confirma: no hay cargos automáticos.</li>
          <li className="flex gap-3"><Check size={16} className="mt-0.5 shrink-0 text-fono-dark" />El resultado se puede adjuntar a la nota del cliente o al comprobante.</li>
          <li className="flex gap-3"><Check size={16} className="mt-0.5 shrink-0 text-fono-dark" />En el demo se muestra <b className="text-fore">simulado</b>, con datos ficticios y sin consultar al proveedor.</li>
        </ul>
        <p className="mt-6 rounded-2xl border border-fore/10 bg-ink p-4 text-xs leading-6 text-mute">
          <b className="text-fore">Honestidad ante todo:</b> la verificación corre en <b className="text-fore">modo mock
          (Fase 1)</b>: valida el IMEI (15 dígitos y dígito control), usa estados honestos, exige costo
          confirmado y deja registro auditable, sin llamadas reales al proveedor salvo configuración
          explícita. Acá la ficha es una demostración visual con datos ficticios.
        </p>
      </div>

      <div className="rounded-[1.75rem] border border-fore/10 bg-ink p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="font-display text-lg">Probá la ficha de verificación</b>
          <span className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-warn">
            Ejemplo simulado
          </span>
        </div>
        <form
          className="mt-4"
          onSubmit={(evento) => { evento.preventDefault(); programar('ok') }}
        >
          <label htmlFor="imei-ejemplo" className="text-xs font-semibold text-mute">IMEI del equipo</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <Input
              id="imei-ejemplo"
              value={imei}
              onChange={(evento) => cambiarImei(evento.target.value)}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="imei-ayuda"
              placeholder="15 dígitos"
              className="font-mono tracking-wider"
            />
            <Button type="submit" className="shrink-0" disabled={fase === 'escaneando'}>
              {fase === 'escaneando' ? 'Verificando…' : 'Verificar IMEI'}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p id="imei-ayuda" className="text-[11px] text-mute">Ejemplo precargado · {IMEI_EJEMPLO}</p>
            <div className="flex flex-wrap gap-3 text-[11px]">
              <button type="button" onClick={otroEjemplo} className="inline-flex items-center gap-1 font-semibold text-fono-dark transition hover:text-fono">
                <RefreshCw size={12} /> Otro ejemplo
              </button>
              <button type="button" onClick={() => programar('pendiente')} className="font-semibold text-mute transition hover:text-fore">
                Ver caso pendiente
              </button>
              <button type="button" onClick={() => programar('parcial')} className="font-semibold text-mute transition hover:text-fore">
                Ver caso parcial
              </button>
            </div>
          </div>
        </form>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>
        )}

        {fase === 'escaneando' && (
          <div className="mt-5" role="status" aria-live="polite">
            <div className="relative overflow-hidden rounded-2xl border border-fono/25 bg-gradient-to-br from-fono/[.10] to-transparent p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm tracking-[.18em] text-mute">{enmascararImeiDemo(imei.replace(/\D/g, '') || IMEI_EJEMPLO)}</span>
                <span className="text-[10px] font-bold uppercase tracking-[.16em] text-fono-dark">Escaneando</span>
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 mobos-escaneo bg-[linear-gradient(180deg,transparent,rgb(var(--c-fono)/.28),transparent)]" />
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-fore/10">
              <span
                className="block h-full rounded-full bg-fono transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round((paso / PASOS.length) * 100)}%` }}
              />
            </div>
            <ol className="mt-4 space-y-2 text-sm">
              {PASOS.map((texto, indice) => {
                const hecho = paso > indice
                const actual = paso === indice
                return (
                  <li key={texto} className={`flex items-center gap-3 ${hecho || actual ? 'text-fore' : 'text-mute'}`}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${hecho ? 'border-fono bg-fono text-onbrand' : actual ? 'border-fono text-fono-dark' : 'border-fore/15'}`}>
                      {hecho ? <Check size={12} /> : indice + 1}
                    </span>
                    {texto}
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {fase === 'resultado' && consulta && (
          <div className="mt-5 mobos-aparece">
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${verificado ? 'border-ok/35 bg-ok/10' : 'border-warn/35 bg-warn/10'}`}>
              <div className="flex items-center gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${verificado ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'}`}>
                  {verificado ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
                </span>
                <div>
                  <b className="block text-sm">{consulta.etiqueta}</b>
                  <span className="font-mono text-xs text-mute">{consulta.imeiMasked}</span>
                </div>
              </div>
              <div className="text-right text-[10px] text-mute">
                <p className="font-semibold text-fore">{consulta.fuente}</p>
                <p>{fechaHora(consulta.fecha)} · costo US$ {consulta.costoUsd.toFixed(2)}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {consulta.campos.map((campo, indice) => <CampoResultado key={campo.clave} campo={campo} indice={indice} />)}
            </div>

            {verificado && (
              <p className="mt-3 rounded-xl border border-fore/10 bg-fore/[.02] p-3 text-[11px] leading-5 text-mute">
                Listo para la nota del cliente: <b className="text-fore">“IMEI verificado: sin reportes al {fechaDia(consulta.fecha)} — fuente {FUENTE_DEMO}”</b>
              </p>
            )}

            <p className="mt-3 text-[11px] leading-5 text-mute">
              Demostración visual con datos ficticios: acá no se consulta al proveedor ni se cobra. En la tienda
              la Fase 1 corre en <b className="text-fore">modo mock</b>, con costo confirmado e idempotencia; lo
              pendiente, parcial o sin dato queda como <b className="text-fore">“No verificado”</b>.
            </p>
            <a href={`${app}/demo`} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-fono-dark transition hover:text-fono">
              Ver cómo queda en el demo <ArrowRight size={16} />
            </a>
          </div>
        )}

        {fase === 'listo' && (
          <p className="mt-5 rounded-2xl border border-dashed border-fore/15 px-4 py-6 text-center text-sm text-mute">
            Tocá <b className="text-fore">Verificar IMEI</b> para ver la animación de escaneo y la ficha de
            resultado (modelo, lista negra, Find My, SIM lock, MDM y garantía).
          </p>
        )}
      </div>
    </div>
  )
}
