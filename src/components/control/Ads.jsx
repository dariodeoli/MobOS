import { useEffect, useState } from 'react'
import { listAds, addAds, deleteAds } from '@/lib/storage'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { fechaClave, num, gs } from '@/utils/calculos'
import { Card, Button, Input, Label, Select, Badge, MoneyInput, EmptyState } from '@/components/ui'
import Icon from '@/components/shared/Icon'

const PLATAFORMAS = ['Meta Ads', 'Instagram', 'Facebook', 'Google Ads', 'TikTok', 'Otro']

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
// 'YYYY-MM' 'Julio 2026'
function mesLabel(clave) {
  const [y, m] = (clave || '').split('-')
  return `${MESES[Number(m) - 1] || m} ${y}`
}

const VACIO = () => ({ monto: '', fecha: fechaClave(), plataforma: 'Meta Ads', nota: '' })

const PREFIJO = 'Publicidad:'

export default function Ads() {
  const demo = isDemoRuntime
  const { sucursal } = useSesion()
  const [ads, setAds] = useState(demo ? listAds() : [])
  const [cargando, setCargando] = useState(!demo)
  const [error, setError] = useState('')
  const [f, setF] = useState(VACIO)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function cargar() {
    if (demo) { setAds(listAds()); return }
    setCargando(true); setError('')
    try {
      const branch = sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''
      const payload = await api.get(`/api/finance${branch}`)
      setAds((payload?.movements || []).filter((row) => row.kind === 'EXPENSE' && row.status !== 'VOID' && String(row.description || '').startsWith(PREFIJO)).map((row) => ({
        id: row.id, monto: Number(row.amountPyg || 0), fecha: (row.createdAt || '').slice(0, 10),
        plataforma: String(row.description || '').slice(PREFIJO.length).split(' · ')[0] || 'Otro',
        nota: String(row.description || '').split(' · ').slice(1).join(' · '),
      })))
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar las inversiones.') } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [sucursal?.id])

  async function guardar(e) {
    e.preventDefault()
    if (num(f.monto) <= 0) return
    if (demo) { addAds({ ...f, monto: num(f.monto) }); setAds(listAds()); setF(VACIO()); return }
    setError('')
    try {
      const branch = sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''
      await api.post(`/api/finance${branch}`, { action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', originalAmount: String(num(f.monto)), exchangeRatePyg: 1, accountId: null, description: `${PREFIJO}${f.plataforma}${f.nota.trim() ? ` · ${f.nota.trim()}` : ''}` })
      setF(VACIO()); await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo registrar la inversión.') }
  }

  function borrar(id) { deleteAds(id); setAds(listAds()) }
  const total = ads.reduce((a, x) => a + num(x.monto), 0)

  // Resumen por mes (YYYY-MM total y cantidad), del más nuevo al más viejo.
  const porMes = {}
  ads.forEach((a) => {
    const clave = (a.fecha || '').slice(0, 7)
    if (!clave) return
    if (!porMes[clave]) porMes[clave] = { total: 0, cant: 0 }
    porMes[clave].total += num(a.monto)
    porMes[clave].cant += 1
  })
  const meses = Object.entries(porMes).sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-1">Gasto en publicidad (Meta Ads)</h2>
        <p className="text-sm text-mute mb-3">
          Cargá manualmente cuánto invertís en ads. Se descuenta en el tablero de ganancias para
          saber tu resultado real.
        </p>
        {error && <p role="alert" className="mb-3 rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
        {!demo && cargando && <p className="mb-3 text-sm text-mute">Cargando inversiones…</p>}
        {!demo && <p className="mb-3 text-xs text-mute">Las inversiones se registran como gastos en Finanzas y se descuentan de la ganancia.</p>}
        <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Monto</Label>
            <MoneyInput
              value={f.monto}
              onValueChange={(monto) => setF((s) => ({ ...s, monto }))}
              placeholder="Ej: 150000"
            />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={f.fecha} onChange={set('fecha')} />
          </div>
          <div>
            <Label>Plataforma</Label>
            <Select value={f.plataforma} onChange={set('plataforma')}>
              {PLATAFORMAS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Guardar inversión
            </Button>
          </div>
        </form>
      </Card>

      {/* Reporte mensual */}
      {meses.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-ink-600">
            <h3 className="font-bold">Reporte mensual</h3>
            <Badge color="orange">Total general: {gs(total)}</Badge>
          </div>
          <div className="divide-y divide-ink-600">
            {meses.map(([clave, { total: t, cant }]) => (
              <div key={clave} className="flex items-center justify-between gap-2 p-3.5">
                <div>
                  <div className="font-semibold text-sm capitalize">{mesLabel(clave)}</div>
                  <div className="text-xs text-mute">
                    {cant} {cant === 1 ? 'inversión' : 'inversiones'}
                  </div>
                </div>
                <span className="font-extrabold text-warn">{gs(t)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-ink-600">
          <h3 className="font-bold">Historial de inversión</h3>
          <Badge color="orange">Total: {gs(total)}</Badge>
        </div>
        {ads.length === 0 ? (
          <EmptyState compact icon="box" title="Sin inversiones registradas." />
        ) : (
          <div className="divide-y divide-ink-600">
            {ads.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 p-3.5">
                <div>
                  <div className="font-semibold text-sm">{a.plataforma}</div>
                  <div className="text-xs text-mute">{a.fecha}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-warn">{gs(a.monto)}</span>
                  {demo && <button
                    onClick={() => borrar(a.id)}
                    className="text-mute hover:text-bad p-1"
                    title="Eliminar"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
