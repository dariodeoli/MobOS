import { useState } from 'react'
import { getTradein, saveTradein, resetTradein, actualizarDolar } from '@/lib/storage'
import { num, gs } from '@/utils/calculos'
import { Card, Button, Input, Label, Badge } from '@/components/ui'

// "hace 2 h", "hace 5 min", "recién" — para mostrar cuándo se actualizó.
function haceCuanto(iso) {
  if (!iso) return null
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

// Multiplicador 0–1 mostrado como % (0.85 → 85)
function pctMult(v) {
  return Math.round(num(v) * 100)
}

function GrupoMultiplicadores({ titulo, ayuda, grupo, onChange }) {
  return (
    <Card>
      <h3 className="font-bold mb-1">{titulo}</h3>
      <p className="text-sm text-slate-500 mb-4">{ayuda}</p>
      <div className="divide-y divide-slate-100">
        {Object.entries(grupo).map(([k, item]) => (
          <div key={k} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{item.label}</div>
              <div className="text-xs text-slate-500 truncate">{item.desc}</div>
            </div>
            <label className="flex items-center gap-1.5 w-28 shrink-0">
              <Input
                inputMode="numeric"
                defaultValue={pctMult(item.value)}
                onBlur={(e) => onChange(k, num(e.target.value) / 100)}
                className="h-9 text-center"
              />
              <span className="text-sm font-bold text-slate-400">%</span>
            </label>
          </div>
        ))}
      </div>
    </Card>
  )
}

const DEV_VACIO = () => ({ model: '', capacities: '', prices: {} })

export default function TradeInAdmin() {
  const cfg = getTradein()
  const [nuevoDev, setNuevoDev] = useState(DEV_VACIO)
  const [actualizando, setActualizando] = useState(false)
  const [aviso, setAviso] = useState(null) // { ok, texto }

  async function actualizarAhora() {
    setActualizando(true)
    setAviso(null)
    const r = await actualizarDolar()
    setActualizando(false)
    setAviso(
      r.ok
        ? { ok: true, texto: `Cotización actualizada: 1 USD = ${gs(r.rate)} (${r.fuente})` }
        : { ok: false, texto: `No se pudo actualizar: ${r.error}` },
    )
  }

  // Guarda una sección y deja que useLive re-renderice.
  function guardar(parcial) {
    saveTradein(parcial)
  }

  function setMult(seccion, key, value) {
    const grupo = { ...cfg[seccion] }
    grupo[key] = { ...grupo[key], value }
    guardar({ [seccion]: grupo })
  }

  function setPrecioDev(idx, cap, valor) {
    const devices = cfg.devices.map((d, i) =>
      i === idx ? { ...d, prices: { ...d.prices, [cap]: num(valor) } } : d,
    )
    guardar({ devices })
  }

  function borrarDev(idx) {
    const dev = cfg.devices[idx]
    if (!confirm(`¿Eliminar ${dev.model} del Trade-In?`)) return
    guardar({ devices: cfg.devices.filter((_, i) => i !== idx) })
  }

  function agregarDev(e) {
    e.preventDefault()
    const model = nuevoDev.model.trim()
    const caps = nuevoDev.capacities
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    if (!model || !caps.length) return
    const prices = {}
    caps.forEach((c) => (prices[c] = 0))
    guardar({ devices: [{ model, capacities: caps, prices }, ...cfg.devices] })
    setNuevoDev(DEV_VACIO())
  }

  function restaurar() {
    if (!confirm('¿Restaurar toda la configuración de Trade-In a los valores por defecto? Se perderán tus cambios.')) return
    resetTradein()
  }

  return (
    <div className="space-y-4">
      {/* Tipo de cambio */}
      <Card>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold">💱 Tipo de cambio (USD → ₲)</h3>
          <Button
            variant="outline"
            className="h-9 px-3 text-xs shrink-0"
            onClick={actualizarAhora}
            disabled={actualizando}
          >
            {actualizando ? '⏳ Actualizando…' : '🔄 Actualizar ahora'}
          </Button>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          Se actualiza solo cada 4 horas desde {cfg.exchangeSource?.replace(' (auto)', '') || 'la casa de cambio'}.
          Podés sumarle un ajuste propio o editar el valor a mano cuando quieras.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          {cfg.exchangeUpdatedAt ? (
            <Badge color="green">🟢 Auto · {haceCuanto(cfg.exchangeUpdatedAt)}</Badge>
          ) : (
            <Badge color="slate">Sin actualización automática todavía</Badge>
          )}
          {cfg.exchangeMarket > 0 && (
            <span className="text-slate-500">Mercado: {gs(cfg.exchangeMarket)}</span>
          )}
        </div>

        {aviso && (
          <div
            className={
              'mb-3 rounded-lg border px-3 py-2 text-sm ' +
              (aviso.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700')
            }
          >
            {aviso.texto}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label>1 USD = ₲</Label>
            <Input
              key={cfg.exchangeRate}
              inputMode="numeric"
              defaultValue={cfg.exchangeRate}
              onBlur={(e) => guardar({ exchangeRate: num(e.target.value) })}
            />
          </div>
          <div>
            <Label>Ajuste (₲ a sumar)</Label>
            <Input
              inputMode="numeric"
              defaultValue={cfg.exchangeAdjust}
              onBlur={(e) => guardar({ exchangeAdjust: num(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Fuente</Label>
            <Input
              key={cfg.exchangeSource}
              defaultValue={cfg.exchangeSource}
              onBlur={(e) => guardar({ exchangeSource: e.target.value })}
              placeholder="Cambios Chaco"
            />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input
              key={cfg.exchangeDate}
              type="date"
              defaultValue={cfg.exchangeDate}
              onBlur={(e) => guardar({ exchangeDate: e.target.value })}
            />
          </div>
        </div>
      </Card>

      {/* Multiplicadores */}
      <GrupoMultiplicadores
        titulo="✨ Estado físico"
        ayuda="Porcentaje del precio base que se paga según el estado del equipo (solo aplica a seminuevos)."
        grupo={cfg.conditionMultipliers}
        onChange={(k, v) => setMult('conditionMultipliers', k, v)}
      />
      <GrupoMultiplicadores
        titulo="🔋 Salud de batería"
        ayuda="Ajuste según el porcentaje de batería del equipo."
        grupo={cfg.batteryMultipliers}
        onChange={(k, v) => setMult('batteryMultipliers', k, v)}
      />
      <GrupoMultiplicadores
        titulo="🔧 Reparaciones por terceros"
        ayuda="Penalización si el equipo tuvo piezas cambiadas fuera del servicio oficial. Se multiplican entre sí."
        grupo={cfg.repairMultipliers}
        onChange={(k, v) => setMult('repairMultipliers', k, v)}
      />

      {/* Precios base USD por modelo */}
      <Card>
        <h3 className="font-bold mb-1">📱 Precios base en USD</h3>
        <p className="text-sm text-slate-500 mb-4">
          Valor en dólares de un equipo <b>nuevo / como nuevo</b> por capacidad. A partir de acá se aplican los multiplicadores de arriba.
        </p>

        <form onSubmit={agregarDev} className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-2 items-end mb-4 bg-slate-50 rounded-xl p-3">
          <div>
            <Label>Modelo</Label>
            <Input
              value={nuevoDev.model}
              onChange={(e) => setNuevoDev((s) => ({ ...s, model: e.target.value }))}
              placeholder="iPhone 17 Pro Max"
              autoCapitalize="words"
            />
          </div>
          <div>
            <Label>Capacidades (separadas por coma)</Label>
            <Input
              value={nuevoDev.capacities}
              onChange={(e) => setNuevoDev((s) => ({ ...s, capacities: e.target.value }))}
              placeholder="256GB, 512GB, 1TB"
            />
          </div>
          <Button type="submit">➕ Agregar</Button>
        </form>

        <div className="space-y-3">
          {cfg.devices.map((d, idx) => (
            <div key={d.model} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-sm">{d.model}</div>
                <button
                  onClick={() => borrarDev(idx)}
                  className="text-slate-400 hover:text-bad p-1.5"
                  title="Eliminar modelo"
                >
                  🗑️
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.capacities.map((cap) => (
                  <label key={cap} className="flex items-center gap-1.5">
                    <Badge color="slate">{cap}</Badge>
                    <span className="text-xs font-bold text-slate-400">$</span>
                    <Input
                      inputMode="numeric"
                      defaultValue={d.prices[cap] || ''}
                      onBlur={(e) => setPrecioDev(idx, cap, e.target.value)}
                      placeholder="0"
                      className="h-9 w-24"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="ghost" className="text-bad" onClick={restaurar}>
          ↺ Restaurar valores por defecto
        </Button>
      </div>
    </div>
  )
}
