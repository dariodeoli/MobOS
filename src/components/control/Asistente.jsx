import { useState } from 'react'
import { listVentas, listGastos, listAds, productosById, getVendedores } from '@/lib/storage'
import { responder, SUGERENCIAS } from '@/utils/asistente'
import { Card, Button, Input, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'

const TONO = {
  bueno: 'text-ok',
  malo: 'text-bad',
  neutro: 'text-white',
}

function Respuesta({ r }) {
  if (!r) return null
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{r.emoji}</span>
        <div>
          <h3 className="font-bold leading-tight">{r.titulo}</h3>
          {r.periodo && <Badge color="blue">{r.periodo}</Badge>}
        </div>
      </div>

      <div className="divide-y divide-ink-600">
        {r.filas.map((f, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2">
            <span className={'text-sm ' + (f.fuerte ? 'font-bold text-white' : 'text-mute')}>
              {f.k}
            </span>
            <span
              className={
                (f.fuerte ? 'text-lg font-extrabold ' : 'text-sm font-semibold ') +
                (TONO[f.tono] || 'text-white')
              }
            >
              {f.v}
            </span>
          </div>
        ))}
      </div>

      {r.lista && (
        <div className="rounded-xl bg-ink-700 p-3">
          {r.listaTitulo && (
            <div className="text-xs font-bold uppercase tracking-wide text-mute mb-1.5">
              {r.listaTitulo}
            </div>
          )}
          <div className="divide-y divide-ink-600/60">
            {r.lista.map((x, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="text-mute truncate">{x.izq}</span>
                <span className="font-semibold shrink-0">{x.der}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.nota && <p className="text-sm text-mute bg-fono/10 rounded-xl px-3 py-2">{r.nota}</p>}
    </Card>
  )
}

export default function Asistente() {
  const [pregunta, setPregunta] = useState('')
  const [resp, setResp] = useState(null)

  function consultar(q) {
    const texto = (q ?? pregunta).trim()
    if (!texto) return
    const data = {
      ventas: listVentas(),
      gastos: listGastos(),
      ads: listAds(),
      prodsById: productosById(),
      vendedores: getVendedores(),
    }
    setResp(responder(texto, data))
    setPregunta(texto)
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">
            <Icon name="sparkles" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-bold leading-tight">Asistente de ganancias</h2>
            <p className="text-sm text-mute">
              Preguntá en tus palabras. Entiende temas (ganancia, gastos, ads, comisiones,
              productos, vendedores) y períodos (hoy, semana, mes, año).
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            consultar()
          }}
          className="flex gap-2"
        >
          <Input
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            placeholder="Ej: ¿cuánto gané esta semana?"
            autoCapitalize="sentences"
          />
          <Button type="submit" className="shrink-0">
            Preguntar
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {SUGERENCIAS.map((s) => (
            <button
              key={s.label}
              onClick={() => consultar(s.q)}
              className="rounded-full border-2 border-ink-600 px-3 py-1.5 text-xs font-bold text-mute hover:border-fono hover:text-fono transition"
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      {resp ? (
        <Respuesta r={resp} />
      ) : (
        <Card className="text-center text-mute py-10">
          <div className="text-4xl mb-2"></div>
          <p className="text-sm">Tocá una pregunta sugerida o escribí la tuya para empezar.</p>
        </Card>
      )}
    </div>
  )
}
