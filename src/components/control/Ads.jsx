import { useState } from 'react'
import { listAds, addAds, deleteAds } from '@/lib/storage'
import { fechaClave, num, gs } from '@/utils/calculos'
import { Card, Button, Input, Label, Select, Badge } from '@/components/ui'

const PLATAFORMAS = ['Meta Ads', 'Instagram', 'Facebook', 'Google Ads', 'TikTok', 'Otro']

const VACIO = () => ({ monto: '', fecha: fechaClave(), plataforma: 'Meta Ads', nota: '' })

export default function Ads() {
  const ads = listAds()
  const [f, setF] = useState(VACIO)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  function guardar(e) {
    e.preventDefault()
    if (num(f.monto) <= 0) return
    addAds({ ...f, monto: num(f.monto) })
    setF(VACIO())
  }

  const total = ads.reduce((a, x) => a + num(x.monto), 0)

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-1">📣 Gasto en publicidad (Meta Ads)</h2>
        <p className="text-sm text-slate-500 mb-3">
          Cargá manualmente cuánto invertís en ads. Se descuenta en el tablero de
          ganancias para saber tu resultado real.
        </p>
        <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Monto ₲</Label>
            <Input inputMode="numeric" value={f.monto} onChange={set('monto')} placeholder="Ej: 150000" />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={f.fecha} onChange={set('fecha')} />
          </div>
          <div>
            <Label>Plataforma</Label>
            <Select value={f.plataforma} onChange={set('plataforma')}>
              {PLATAFORMAS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">💾 Guardar inversión</Button>
          </div>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="font-bold">Historial de inversión</h3>
          <Badge color="orange">Total: {gs(total)}</Badge>
        </div>
        {ads.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Sin inversiones registradas.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ads.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 p-3.5">
                <div>
                  <div className="font-semibold text-sm">{a.plataforma}</div>
                  <div className="text-xs text-slate-500">{a.fecha}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-warn">{gs(a.monto)}</span>
                  <button onClick={() => deleteAds(a.id)} className="text-slate-400 hover:text-bad p-1" title="Eliminar">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
