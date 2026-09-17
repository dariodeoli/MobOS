import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { formatGsInput, parseGsInput } from '@/utils/moneda'
import { getDemoCash, getDemoCashExpected, openDemoCash, closeDemoCash } from '@/lib/demoCash'
import { listVentas } from '@/lib/storage'
import { Button, Card, Eyebrow, Input, Label, Modal, Money, MoneyInput, Skeleton } from '@/components/ui'
import AuditoriaMedios from './AuditoriaMedios'
import AttachmentList from '@/components/shared/AttachmentList'
import Cronologia from '@/components/shared/Cronologia'
import Icon from '@/components/shared/Icon'
import { descargarCsv } from '@/utils/descargarCsv'

export default function Caja() {
  const { esDemo, sucursal } = useSesion()
  const [cash, setCash] = useState(null)
  const [finance, setFinance] = useState(null)
  const [opening, setOpening] = useState('500000')
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [cronologia, setCronologia] = useState(false)
  const [exportando, setExportando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (esDemo) setCash(getDemoCash())
      else {
        const branch = sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''
        const [cashData, financeData] = await Promise.all([api.get(`/api/cash${branch}`), api.get(`/api/finance${branch}`)])
        setCash(cashData); setFinance(financeData)
      }
    } catch (err) { setError(err?.message || 'No se pudo cargar la caja.') } finally { setLoading(false) }
  }, [esDemo, sucursal?.id])
  useEffect(() => { load() }, [load])

  const expected = useMemo(() => {
    if (!esDemo) return Number(cash?.expectedPyg ?? cash?.openingPyg ?? 0)
    // Adaptar al helper histórico sin cambiar los pagos persistidos.
    const sales = listVentas().map(sale => ({
      ...sale,
      pagos: (sale.pagos || []).filter(payment => {
        const method = payment.method ?? (payment.medioPago === 'DINERO' ? 'CASH' : payment.medioPago)
        const currency = payment.currency ?? payment.accountSnapshot?.currency ?? (payment.accountId ? null : 'PYG')
        return method === 'CASH' && currency === 'PYG'
      }).map(payment => ({ ...payment, medioPago: 'DINERO', monto: payment.amountPyg ?? payment.monto })),
    }))
    return getDemoCashExpected(cash || undefined, new Date(), sales)
  }, [cash, esDemo])
  async function abrir() {
    setSaving(true); setError('')
    try { setCash(esDemo ? openDemoCash(parseGsInput(opening), notes) : await api.post(`/api/cash?branchId=${encodeURIComponent(sucursal?.id || '')}`, { action: 'open', openingPyg: parseGsInput(opening), notes })) } catch (err) { setError(err?.message || 'No se pudo abrir la caja.') } finally { setSaving(false) }
  }
  async function cerrar() {
    setSaving(true); setError('')
    try { setCash(esDemo ? closeDemoCash(parseGsInput(counted), expected, notes) : await api.post(`/api/cash?branchId=${encodeURIComponent(sucursal?.id || '')}`, { action: 'close', countedPyg: parseGsInput(counted), notes })) } catch (err) { setError(err?.message || 'No se pudo cerrar la caja.') } finally { setSaving(false) }
  }
  async function exportarMovimientos() {
    if (esDemo || !cash?.openedAt) return
    setExportando(true); setError('')
    try {
      await descargarCsv('cash-movements', { branchId: sucursal?.id, desde: cash.openedAt, hasta: cash.closedAt || undefined }, 'mobos-caja-movimientos.csv')
    } catch (err) { setError(err?.message || 'No se pudo exportar el CSV.') } finally { setExportando(false) }
  }
  if (loading) return <div className="space-y-6"><Skeleton className="h-4 w-40" /><Skeleton className="h-8 w-64" /><div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div></div>
  const abierta = cash?.status === 'OPEN'
  const difference = cash?.differencePyg ?? (parseGsInput(counted) - expected)
  return <div className="space-y-6"><div><Eyebrow>Finanzas</Eyebrow><h2 className="mt-2 text-2xl font-bold tracking-tight">Caja y control financiero</h2><p className="mt-1 text-sm text-mute">Apertura física en Gs., saldos, pendientes, cheques y margen con costos congelados.</p></div>{error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}<div className="grid gap-4 md:grid-cols-3"><Card className={abierta ? 'border-ok/25 bg-gradient-to-br from-ok/10 to-transparent' : ''}><Label>Estado</Label><strong className={`flex items-center gap-2 ${abierta ? 'text-ok' : 'text-mute'}`}><span className={`h-2 w-2 rounded-full ${abierta ? 'bg-ok' : 'bg-mute'}`} />{abierta ? 'Abierta' : 'Cerrada'}</strong><p className="mt-2 text-xs text-mute">{cash?.openedAt ? new Date(cash.openedAt).toLocaleString('es-PY') : 'Sin apertura'}</p></Card><Card><Label>Saldo esperado</Label><strong className="text-xl tabular-nums"><Money value={expected} /></strong><p className="mt-2 text-xs text-mute">Apertura + efectivo confirmado en Gs</p></Card><Card className={difference === 0 ? '' : 'border-warn/25 bg-gradient-to-br from-warn/10 to-transparent'}><Label>Diferencia</Label><strong className={`text-xl tabular-nums ${difference === 0 ? 'text-ok' : 'text-warn'}`}><Money value={difference} /></strong><p className="mt-2 text-xs text-mute">Se calcula al cierre</p></Card></div>{finance && <div className="grid gap-4 md:grid-cols-4"><Card><Label>Por cobrar</Label><strong><Money value={finance.receivables?.totalPyg || 0} /></strong></Card><Card><Label>Por pagar</Label><strong><Money value={finance.payables?.totalPyg || 0} /></strong></Card><Card><Label>Margen real</Label><strong><Money value={finance.margin?.profitPyg || 0} /></strong><p className="mt-1 text-xs text-mute">{finance.margin?.marginPct ?? '—'}% · seguro y extras incluidos</p></Card><Card><Label>Cheques pendientes</Label><strong>{finance.movements?.filter(m => m.kind === 'CHEQUE' && m.status === 'PENDING').length || 0}</strong></Card></div>}{!abierta ? <Card><h3 className="font-bold">Abrir caja</h3><p className="mt-1 text-sm text-mute">Registrá el fondo inicial de esta sucursal.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><div><Label htmlFor="opening">Fondo inicial (Gs)</Label><MoneyInput id="opening" value={opening} onValueChange={setOpening} placeholder="500.000" /></div><div><Label htmlFor="opening-notes">Nota</Label><Input id="opening-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Turno mañana" /></div></div><Button className="mt-5" onClick={abrir} disabled={saving}>Abrir caja</Button></Card> : <Card><h3 className="font-bold">Cerrar caja</h3><p className="mt-1 text-sm text-mute">Contá únicamente el efectivo físico en guaraníes. No incluyas dólares, transferencias ni tarjetas.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><div><Label htmlFor="counted">Efectivo contado (Gs)</Label><Input id="counted" inputMode="numeric" value={formatGsInput(counted)} onChange={(e) => setCounted(formatGsInput(e.target.value))} placeholder="0" /></div><div><Label htmlFor="close-notes">Nota de cierre</Label><Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observación opcional" /></div></div><Button variant="success" className="mt-5" onClick={cerrar} disabled={saving || !counted}>Cerrar caja ·
<Money value={parseGsInput(counted)} /></Button></Card>}{!esDemo && cash?.id && <Card className="space-y-3"><AttachmentList entity="CASH_SESSION" entityId={cash.id} puedeSubir={!abierta} titulo="Foto del arqueo" /><Button type="button" variant="outline" className="h-9 w-full px-3 text-xs" disabled={exportando} onClick={exportarMovimientos}><Icon name="download" className="h-4 w-4" />Exportar CSV</Button><Button type="button" variant="outline" className="w-full" onClick={() => setCronologia(true)}>Cronología de la sesión</Button></Card>}<Modal open={cronologia} onClose={() => setCronologia(false)} title="Cronología de la sesión de caja">{cash?.id && <Cronologia endpoint={`/api/cash/sessions/${cash.id}/history`} active={cronologia} vacio="Sin actividad" descripcionVacio="La apertura, los movimientos, el cierre y el arqueo de esta sesión aparecerán acá." />}</Modal><AuditoriaMedios /></div>
}
