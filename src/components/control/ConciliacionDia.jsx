import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Aviso, Badge, Button, Card, FormField, Input, Modal, MoneyInput, Select, Textarea, useToast } from '@/components/ui'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { listVentas } from '@/lib/storage'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { construirDemoConciliacionDia, declararDemoConciliacionDia } from '@/lib/demoConciliacionDia'
import { claveGrupoDia, diaParaguay, MEDIOS_DIA } from '@/lib/conciliacionDia'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { gs } from '@/utils/calculos'

const STATUS = { PENDING: ['Pendiente', 'orange'], DIFFERENCE: ['Con diferencia', 'red'], VERIFIED: ['Verificado', 'green'] }
export default function ConciliacionDia() {
  const session = useSesion()
  const [open, setOpen] = useState(false)
  const scope = JSON.stringify([session.empresa?.id, session.usuario?.id, session.usuario?.role, session.sucursal?.id, session.esDemo])
  return <><Button type="button" onClick={() => setOpen(true)}>Verificar día por sucursal</Button>{open ? <Modal open onClose={() => setOpen(false)} title="Conciliar día por sucursal" size="formulario"><Dia key={scope} session={session} /></Modal> : null}</>
}
function Dia({ session }) {
  const { esDemo, sucursal, sucursales = [] } = session
  const toast = useToast()
  const canAllBranches = session.usuario?.role === 'ADMIN' || session.sesion?.esPropietario
  const [day, setDay] = useState(diaParaguay)
  const [branchId, setBranchId] = useState(sucursal?.id || '')
  const [data, setData] = useState(null)
  const [values, setValues] = useState({})
  const [extra, setExtra] = useState([])
  const [accounts, setAccounts] = useState([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const epoch = useRef(0), request = useRef(0), attempt = useRef(null), locked = useRef(false)
  const url = `/api/finance/reconciliation?view=day&day=${encodeURIComponent(day)}&branchId=${encodeURIComponent(branchId)}`
  const apply = useCallback(result => {
    setData(result); setValues(Object.fromEntries(result.groups.map(row => [row.key, row.receivedPyg === null ? '' : String(row.receivedPyg)]))); setNote(result.note || ''); setExtra([])
  }, [])
  const load = useCallback(async () => {
    if (!branchId) return
    const scope = epoch.current, id = ++request.current
    setLoading(true); setError('')
    try {
      const cuentas = await getPaymentAccounts()
      const result = esDemo ? construirDemoConciliacionDia({ ventas: listVentas(), cuentas, day, branchId }) : await api.get(url)
      if (epoch.current !== scope || request.current !== id) return
      setAccounts(cuentas); apply(result)
    } catch (cause) { if (epoch.current === scope && request.current === id) { setData(null); setError(cause?.message || 'No se pudo cargar el día.') } }
    finally { if (epoch.current === scope && request.current === id) setLoading(false) }
  }, [apply, branchId, day, esDemo, url])
  useLayoutEffect(() => {
    const scope = ++epoch.current
    locked.current = false; attempt.current = null
    setData(null); setValues({}); setExtra([]); setNote(''); setSaving(false); setError('')
    load()
    return () => { epoch.current = scope + 1 }
  }, [load])
  const rows = [...(data?.groups || []), ...extra]
  const missing = rows.some(row => values[row.key] === '' || values[row.key] === undefined)
  const differences = rows.some(row => values[row.key] !== '' && values[row.key] !== undefined && Number(values[row.key]) !== row.expectedPyg)
  const meta = STATUS[data?.state] || STATUS.PENDING
  async function save(event) {
    event.preventDefault()
    if (!data || missing || locked.current) return
    const declarations = rows.map(row => ({ method: row.method, accountId: row.accountId, currency: row.currency, receivedPyg: Number(values[row.key]) })).sort((a, b) => claveGrupoDia(a).localeCompare(claveGrupoDia(b)))
    if (declarations.some(row => !Number.isSafeInteger(row.receivedPyg) || row.receivedPyg < 0 || row.receivedPyg > 10000000000)) { setError('Indicá importes enteros en Gs válidos.'); return }
    if (differences && !note.trim()) { setError('Indicá el motivo de las diferencias.'); return }
    const payload = { action: 'day', day, branchId, expectedVersion: data.version, declarations, note: note.trim() || null }
    const hash = JSON.stringify(payload)
    if (attempt.current?.hash !== hash) attempt.current = { hash, id: crypto.randomUUID() }
    const scope = epoch.current
    locked.current = true; setSaving(true); setError(''); request.current++
    try {
      const result = esDemo ? declararDemoConciliacionDia({ ...payload, note: note.trim(), requestId: attempt.current.id, ventas: listVentas(), cuentas: accounts }) : await api.post(url, { ...payload, requestId: attempt.current.id })
      if (epoch.current !== scope) return
      apply(result); attempt.current = null
      toast.success(result.state === 'VERIFIED' ? 'Día verificado: la declaración coincide con los cobros.' : 'Diferencias del día registradas con su motivo.')
    } catch (cause) { if (epoch.current === scope) setError(cause?.message || 'No se pudo verificar el día.') }
    finally { if (epoch.current === scope) { locked.current = false; setSaving(false) } }
  }
  function addAccount(id) {
    const account = accounts.find(row => row.id === id)
    if (!account || !MEDIOS_DIA.includes(account.kind)) return
    const row = { method: account.kind, accountId: id, currency: account.currency || 'PYG', label: account.name, expectedPyg: 0, count: 0 }
    row.key = claveGrupoDia(row)
    if (!rows.some(item => item.key === row.key)) setExtra(current => [...current, row])
  }
  return <Card className="conciliacion-f5-panel space-y-3" data-testid="conciliacion-dia">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Verificar día por sucursal</h3><Badge color={meta[1]} data-testid="conciliacion-dia-estado">{meta[0]}</Badge></div>
    <p className="text-xs text-mute">Ingresá lo recibido según tu conteo de caja o comprobantes de la cuenta, expresado en Gs. Es una declaración independiente; no consulta saldos bancarios ni registra cobros.</p>
    <div className={GRILLA_DOS_COLUMNAS}>
      <FormField label="Día de Paraguay" htmlFor="conciliar-dia"><Input id="conciliar-dia" type="date" required value={day} disabled={saving} onChange={event => setDay(event.target.value)} /></FormField>
      <FormField label="Sucursal del día" htmlFor="conciliar-sucursal"><Select id="conciliar-sucursal" value={branchId} disabled={saving || !canAllBranches} onChange={event => setBranchId(event.target.value)}><option value="">Elegí una sucursal</option>{sucursales.map(row => <option key={row.id} value={row.id}>{row.nombre || row.name}</option>)}</Select></FormField>
    </div>
    {error ? <Aviso tono="error">{error}</Aviso> : null}
    {loading ? <p role="status" className="text-xs text-mute">Cargando cobros del día…</p> : null}
    {data ? <form onSubmit={save} className="space-y-3">
      {data.changedSinceDeclaration ? <Aviso tono="warn">Los cobros cambiaron desde la última declaración. El estado y las diferencias muestran los importes actuales; el historial conserva la foto anterior.</Aviso> : null}
      <p className="text-xs text-mute">Cobros confirmados del sistema: <b className="text-fore">{gs(data.expectedPyg)}</b>. Se excluyen pagos pendientes, originales corregidos y sus reversiones.</p>
      {rows.map(row => <div key={row.key} data-testid="conciliacion-dia-grupo" className="space-y-2 rounded-lg border border-ink-600 p-3">
        <div className="flex flex-wrap justify-between gap-2 text-xs"><b>{row.label || PAYMENT_METHOD_LABELS[row.method] || row.method} · {row.currency}</b><span>{PAYMENT_METHOD_LABELS[row.method] || row.method} · Sistema: {gs(row.expectedPyg)}</span></div>
        <FormField label={`Recibido en Gs: ${row.label || row.method} (${row.currency})`} htmlFor={`recibido-dia-${rows.indexOf(row)}`}><MoneyInput id={`recibido-dia-${rows.indexOf(row)}`} aria-label={`Recibido en Gs: ${row.label || row.method} (${row.currency})`} value={values[row.key] ?? ''} onValueChange={value => setValues(current => ({ ...current, [row.key]: value }))} disabled={saving} placeholder="Ingresá el importe recibido, incluido cero" required /></FormField>
        {values[row.key] !== '' && values[row.key] !== undefined ? <p className={`text-xs ${Number(values[row.key]) === row.expectedPyg ? 'text-ok' : 'text-bad'}`}>Diferencia: {gs(Number(values[row.key]) - row.expectedPyg)}</p> : <p className="text-xs text-warn">Pendiente de declaración</p>}
      </div>)}
      <Select aria-label="Agregar cuenta a la declaración" value="" disabled={saving} onChange={event => addAccount(event.target.value)}><option value="">Agregar cuenta sin cobros en el sistema…</option>{accounts.filter(row => MEDIOS_DIA.includes(row.kind)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
      <FormField label="Motivo / nota del día" htmlFor="conciliar-dia-nota" hint={differences ? 'Obligatorio cuando alguna cuenta tiene diferencia, aunque las diferencias se compensen.' : 'Opcional si todos los importes coinciden.'}><Textarea id="conciliar-dia-nota" value={note} onChange={event => setNote(event.target.value)} required={differences} maxLength={2000} disabled={saving} /></FormField>
      <div className="flex flex-wrap items-center gap-2"><Button type="submit" disabled={saving || loading || missing || (differences && !note.trim())}>{saving ? 'Verificando…' : 'Verificar día'}</Button><Button type="button" variant="outline" disabled={saving || loading} onClick={load}>Actualizar día</Button></div>
      {data.declaredAt ? <p className="text-xs text-mute">Última declaración: {data.declaredBy} · {new Date(data.declaredAt).toLocaleString('es-PY')} · revisión {data.version}.</p> : null}
      {data.history?.length ? <details className="text-xs"><summary className="flex min-h-11 cursor-pointer items-center">Historial de declaraciones ({data.history.length})</summary><ul className="space-y-2">{data.history.map(row => <li key={row.version} className="rounded border border-ink-600 p-2">Revisión {row.version} · {row.createdBy} · {new Date(row.createdAt).toLocaleString('es-PY')} · {STATUS[row.snapshot.state]?.[0]} · diferencia {gs(row.snapshot.differencePyg)}{row.note ? ` · ${row.note}` : ''}</li>)}</ul></details> : null}
    </form> : null}
  </Card>
}
