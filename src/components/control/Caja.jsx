import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { formatGs, formatGsInput, parseGsInput } from '@/utils/moneda'
import { getDemoCash, getDemoCashExpected, openDemoCash, closeDemoCash } from '@/lib/demoCash'
import { listVentas } from '@/lib/storage'
import { Button, Card, Input, Label } from '@/components/ui'

export default function Caja() {
  const { esDemo, sucursal } = useSesion()
  const [cash, setCash] = useState(null)
  const [opening, setOpening] = useState('500000')
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try { setCash(esDemo ? getDemoCash() : await api.get('/api/cash')) } catch (err) { setError(err?.message || 'No se pudo cargar la caja.') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [esDemo])

  const expected = useMemo(() => esDemo ? getDemoCashExpected(cash || undefined, new Date(), listVentas()) : Number(cash?.expectedPyg ?? cash?.openingPyg ?? 0), [cash, esDemo])
  async function abrir() {
    setSaving(true); setError('')
    try { setCash(esDemo ? openDemoCash(parseGsInput(opening), notes) : await api.post(`/api/cash?branchId=${encodeURIComponent(sucursal?.id || '')}`, { action: 'open', openingPyg: parseGsInput(opening), notes })) } catch (err) { setError(err?.message || 'No se pudo abrir la caja.') } finally { setSaving(false) }
  }
  async function cerrar() {
    setSaving(true); setError('')
    try { setCash(esDemo ? closeDemoCash(parseGsInput(counted), expected, notes) : await api.post(`/api/cash?branchId=${encodeURIComponent(sucursal?.id || '')}`, { action: 'close', countedPyg: parseGsInput(counted), notes })) } catch (err) { setError(err?.message || 'No se pudo cerrar la caja.') } finally { setSaving(false) }
  }
  if (loading) return <p className="py-10 text-center text-mute">Cargando caja…</p>
  const abierta = cash?.status === 'OPEN'
  const difference = cash?.differencePyg ?? (parseGsInput(counted) - expected)
  return <div className="mx-auto max-w-5xl space-y-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-fono-light">Finanzas</p><h2 className="mt-2 text-2xl font-bold tracking-tight">Caja</h2><p className="mt-1 text-sm text-mute">Apertura, cobros en efectivo y cierre por sucursal.</p></div>{error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}<div className="grid gap-4 md:grid-cols-3"><Card><Label>Estado</Label><strong className={abierta ? 'text-ok' : 'text-mute'}>{abierta ? 'Abierta' : 'Cerrada'}</strong><p className="mt-2 text-xs text-mute">{cash?.openedAt ? new Date(cash.openedAt).toLocaleString('es-PY') : 'Sin apertura'}</p></Card><Card><Label>Saldo esperado</Label><strong className="text-xl">{formatGs(expected)}</strong><p className="mt-2 text-xs text-mute">Apertura + efectivo confirmado</p></Card><Card><Label>Diferencia</Label><strong className={`text-xl ${difference === 0 ? 'text-ok' : 'text-warn'}`}>{formatGs(difference)}</strong><p className="mt-2 text-xs text-mute">Se calcula al cierre</p></Card></div>{!abierta ? <Card><h3 className="font-bold">Abrir caja</h3><p className="mt-1 text-sm text-mute">Registrá el fondo inicial de esta sucursal.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><div><Label htmlFor="opening">Fondo inicial (Gs)</Label><Input id="opening" inputMode="numeric" value={formatGsInput(opening)} onChange={(e) => setOpening(formatGsInput(e.target.value))} placeholder="500.000" /></div><div><Label htmlFor="opening-notes">Nota</Label><Input id="opening-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Turno mañana" /></div></div><Button className="mt-5" onClick={abrir} disabled={saving}>Abrir caja</Button></Card> : <Card><h3 className="font-bold">Cerrar caja</h3><p className="mt-1 text-sm text-mute">Contá el efectivo físico. No se agregan gastos ficticios.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><div><Label htmlFor="counted">Efectivo contado (Gs)</Label><Input id="counted" inputMode="numeric" value={formatGsInput(counted)} onChange={(e) => setCounted(formatGsInput(e.target.value))} placeholder="0" /></div><div><Label htmlFor="close-notes">Nota de cierre</Label><Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observación opcional" /></div></div><Button variant="success" className="mt-5" onClick={cerrar} disabled={saving || !counted}>Cerrar caja · {formatGs(parseGsInput(counted))}</Button></Card>}</div>
}
