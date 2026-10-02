import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { isDemoRuntime } from '@/lib/demoMode'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { listGastos, addGasto } from '@/lib/storage'
import { fechaClave, gs } from '@/utils/calculos'
import { parseGsInput } from '@/utils/moneda'
import { Aviso, Badge, Button, Card, Drawer, EmptyState, FormField, IconAction, Input, Label, MoneyInput, Select } from '@/components/ui'
import CurrencySelect from '@/components/shared/CurrencySelect'
import ComboBuscador from '@/components/shared/ComboBuscador'
import AutorizacionBloque from '@/components/ventas/venta/AutorizacionBloque'
import useValidacionFormulario from '@/hooks/useValidacionFormulario'
import { ETIQUETAS_GASTO, reglasGasto, valoresGasto } from '@/lib/validacionGlobal'
import { temaV2Activo } from '@/lib/temaV2'
import { cn } from '@/lib/utils'
import { KIND_LABELS } from '@/lib/paymentAccounts'
import { leerUltimo, recordarUltimo } from '@/lib/ultimoUsado'
import { CLAVES_FIN, MONEDAS_DE_GASTO, cuentaDeGastoValida } from '@/lib/finUltimoUsado'

const EMPTY = () => ({ originalAmount: '', description: '', date: fechaClave(), currency: 'PYG', exchangeRatePyg: '1', accountId: '', kind: 'EXPENSE', counterparty: '', reference: '', dueAt: '' })
const KINDS = { EXPENSE: 'Gasto', CHEQUE: 'Cheque emitido/cobrado', SUPPLIER_ADVANCE: 'Adelanto a proveedor', TRANSFER: 'Transferencia', OWNER_WITHDRAWAL: 'Retiro del dueño', ADJUSTMENT: 'Ajuste' }
const DEFAULT_EXPENSE_LIMIT_PYG = 1000000
// #209: el alta arranca con el tipo y la moneda del último movimiento, siempre
// cambiables. La cuenta recordada se aplica cuando llegan las cuentas y sigue
// siendo válida (activa y de la moneda elegida).
const inicial = () => {
  const tipo = leerUltimo(CLAVES_FIN.gastoTipo)
  const moneda = leerUltimo(CLAVES_FIN.gastoMoneda)
  return {
    ...EMPTY(),
    kind: Object.hasOwn(KINDS, tipo) ? tipo : 'EXPENSE',
    currency: MONEDAS_DE_GASTO.includes(moneda) ? moneda : 'PYG',
  }
}
// Estado del movimiento sin códigos crudos: para un cheque, cobrado/anulado.
const ESTADO_MOVIMIENTO = { CLEARED: 'Pagado', PENDING: 'Pendiente', VOID: 'Anulado' }
const estadoVisible = (row) => (row.status === 'CLEARED' && row.kind === 'CHEQUE' ? 'Cobrado' : ESTADO_MOVIMIENTO[row.status] || 'Registrado')
const montoVisible = (row) => {
  if (!row.currency || row.currency === 'PYG') return gs(row.originalAmount || row.monto)
  const numero = Number(row.originalAmount)
  // Sin monto en la moneda original (0/null) vale el equivalente en Gs: nunca
  // se muestra «USD 0,00» al lado de un importe real (#311).
  if (!Number.isFinite(numero) || numero <= 0) return gs(row.amountPyg || row.monto)
  return `${row.currency} ${numero.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function Gastos() {
  const { esDemo, sucursal, empresa, sesion } = useSesion()
  const v2 = temaV2Activo()
  const [form, setForm] = useState(inicial)
  // #311: el alta vive en un cajón; el libro queda como protagonista y el
  // formulario no compite abierto dentro de la página.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(!esDemo)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [authGasto, setAuthGasto] = useState(null)
  const branch = sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''
  const puedeSinAutorizacion = sesion?.rol === 'dueno' || sesion?.rol === 'GERENTE'
  const limiteGastos = Number(empresa?.expenseLimitPyg ?? DEFAULT_EXPENSE_LIMIT_PYG)
  // El límite se compara en guaraníes: en otra moneda se congela la cotización.
  const montoPyg = form.currency === 'PYG'
    ? Number(parseGsInput(form.originalAmount)) || 0
    : Math.round((Number(form.originalAmount) || 0) * (Number(form.exchangeRatePyg) || 0))
  const requiereAutorizacion = form.kind === 'EXPENSE' && !puedeSinAutorizacion && montoPyg > limiteGastos
  // #297: el botón queda deshabilitado con el motivo concreto y el submit
  // vuelve a validar antes de tocar la base.
  const validacion = useValidacionFormulario(valoresGasto(form), reglasGasto(form), ETIQUETAS_GASTO)
  const faltaAutorizacion = requiereAutorizacion && !authGasto
  const motivoBloqueo = validacion.motivo || (faltaAutorizacion ? 'Falta: la autorización de gerencia para este gasto.' : '')
  useEffect(() => { if (!requiereAutorizacion) setAuthGasto(null) }, [requiereAutorizacion])

  const load = useCallback(async () => {
    if (isDemoRuntime) { setRows(listGastos()); setLoading(false); return }
    setLoading(true)
    try {
      const [finance, paymentAccounts] = await Promise.all([api.get(`/api/finance${branch}`), getPaymentAccounts()])
      setRows(finance.movements || []); setAccounts(paymentAccounts || [])
    } catch (error) { setMessage(error.message || 'No se pudieron cargar los movimientos.') } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [esDemo, load])
  // #209: se aplica la cuenta recordada cuando llegan las cuentas y sigue
  // valiendo (activa y de la moneda actual); si no, queda el default vacío.
  const [cuentaRecordada] = useState(() => leerUltimo(CLAVES_FIN.gastoCuenta))
  useEffect(() => {
    if (!cuentaRecordada) return
    setForm((actual) => (actual.accountId || !cuentaDeGastoValida(cuentaRecordada, accounts, actual.currency) ? actual : { ...actual, accountId: cuentaRecordada }))
  }, [accounts, cuentaRecordada])
  const set = (key, value) => {
    setForm(current => ({ ...current, [key]: value }))
    if (key === 'kind') recordarUltimo(CLAVES_FIN.gastoTipo, value)
    else if (key === 'currency') recordarUltimo(CLAVES_FIN.gastoMoneda, value)
    else if (key === 'accountId') recordarUltimo(CLAVES_FIN.gastoCuenta, value)
  }
  const hayRecordado = Boolean(leerUltimo(CLAVES_FIN.gastoTipo) || leerUltimo(CLAVES_FIN.gastoMoneda) || leerUltimo(CLAVES_FIN.gastoCuenta))
  const activeAccounts = accounts.filter(account => account.isActive && account.currency === form.currency)
  // Buscador de cuentas (#141): por nombre, banco, procesadora, titular,
  // empresa o número; el detalle muestra con qué se identifica cada una.
  const opcionesCuentas = activeAccounts.map(account => ({
    value: account.id,
    label: account.name,
    detail: [account.bank || account.processor, account.holder, account.accountNumber].filter(Boolean).join(' · '),
    badge: KIND_LABELS[account.kind] || account.kind,
  }))

  async function save(event) {
    event.preventDefault(); setMessage('')
    // #297: submit inválido bloqueado; las mismas reglas del botón deshabilitado.
    const resultado = validacion.intentar()
    if (!resultado.valido) return
    const originalAmount = form.currency === 'PYG' ? parseGsInput(form.originalAmount) : form.originalAmount
    if (requiereAutorizacion && !authGasto) { setMessage('El gasto supera el límite sin autorización. Solicitá autorización a gerencia y esperá la aprobación.'); return }
    setBusy(true)
    try {
      if (isDemoRuntime) {
        addGasto({ monto: Number(originalAmount), motivo: form.description, fecha: form.date, categoria: 'Otros' })
        setRows(listGastos()); setForm(inicial()); setDrawerOpen(false); return
      }
      await api.post(`/api/finance${branch}`, { action: 'movement', kind: form.kind, direction: 'OUT', currency: form.currency, originalAmount, exchangeRatePyg: form.currency === 'PYG' ? 1 : form.exchangeRatePyg, accountId: form.accountId || null, description: form.description, counterparty: form.counterparty || null, reference: form.reference || null, dueAt: form.kind === 'CHEQUE' && form.dueAt ? form.dueAt : null, ...(requiereAutorizacion && authGasto ? { expenseAuthorizationId: authGasto.id } : {}) })
      setForm(inicial()); setAuthGasto(null); setDrawerOpen(false); await load()
    } catch (error) { setMessage(error.message || 'No se pudo guardar el movimiento.') } finally { setBusy(false) }
  }
  async function updateStatus(id, action) {
    setBusy(true); setMessage('')
    try { await api.post(`/api/finance${branch}`, { action, id }); await load() } catch (error) { setMessage(error.message || 'No se pudo actualizar el movimiento.') } finally { setBusy(false) }
  }
  const total = rows.filter(row => row.kind === 'EXPENSE' && row.status !== 'VOID').reduce((sum, row) => sum + Number(row.amountPyg || row.monto || 0), 0)
  const chequesPendientes = rows.filter(row => row.kind === 'CHEQUE' && row.status === 'PENDING').reduce((sum, row) => sum + Number(row.amountPyg || row.monto || 0), 0)

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3" data-testid="gastos-resumen">
      <div className={cn('rounded-xl border border-bad/25 bg-bad/5 p-3', v2 && 'v2-tile')} data-testid="gastos-total"><p className="text-xs text-mute">Gastos (sin anular)</p><strong className={cn('mt-1 block tabular-nums text-bad', v2 ? 'v2-numero text-2xl' : 'text-lg')}>{gs(total)}</strong></div>
      <div className={cn('rounded-xl border border-warn/30 bg-warn/5 p-3', v2 && 'v2-tile')} data-testid="gastos-cheques"><p className="text-xs text-mute">Cheques pendientes</p><strong className={cn('mt-1 block tabular-nums', v2 ? 'v2-numero text-2xl' : 'text-lg', chequesPendientes > 0 ? 'text-warn' : 'text-mute')}>{gs(chequesPendientes)}</strong></div>
      <div className={cn('rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')} data-testid="gastos-movimientos"><p className="text-xs text-mute">Movimientos en el libro</p><strong className={cn('mt-1 block tabular-nums', v2 ? 'v2-numero text-2xl' : 'text-lg')}>{rows.length}</strong></div>
    </div>
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">Gastos, cheques y adelantos</h2>
          <p className="mt-1 text-sm text-mute">Registrá la salida en un cajón y seguí en el libro: la cotización queda congelada al guardar y los cheques quedan pendientes hasta cobrarse o anularse.</p>
          {hayRecordado && <p className="mt-1 text-xs text-mute">Tipo, moneda y cuenta arrancan con tu última elección; podés cambiarlos.</p>}
        </div>
        <Button type="button" onClick={() => { setMessage(''); validacion.limpiar(); setDrawerOpen(true) }}>Registrar movimiento</Button>
      </div>
      {message && <Aviso tono="error" className="p-3">{message}</Aviso>}
    </Card>
    <Drawer open={drawerOpen} onClose={() => !busy && setDrawerOpen(false)} title="Registrar salida, cheque o adelanto">
      <form onSubmit={save} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <FormField label={`Monto ${form.currency === 'PYG' ? '(Gs)' : `(${form.currency})`}`} htmlFor="monto-gasto" error={validacion.errorDe('monto')}>
          <MoneyInput id="monto-gasto" currency={form.currency} value={form.originalAmount} onValueChange={value => set('originalAmount', value)} onBlur={validacion.alSalir('monto')} placeholder={form.currency === 'PYG' ? '250.000' : '0,00'} />
        </FormField>
        <div><Label htmlFor="moneda-gasto">Moneda</Label><CurrencySelect id="moneda-gasto" title="Se recuerda tu última elección" value={form.currency} onChange={event => { const valor = event.target.value; setForm(current => ({ ...current, currency: valor, accountId: '', originalAmount: '', exchangeRatePyg: valor === 'PYG' ? '1' : current.exchangeRatePyg })); recordarUltimo(CLAVES_FIN.gastoMoneda, valor) }} /></div>
        {form.currency !== 'PYG' && (
          <FormField label="Cotización en Gs." htmlFor="cotizacion-congelada-en-gs" error={validacion.errorDe('cotizacion')}>
            <MoneyInput id="cotizacion-congelada-en-gs" currency="USD" symbol="Gs." value={form.exchangeRatePyg} onValueChange={value => set('exchangeRatePyg', value)} onBlur={validacion.alSalir('cotizacion')} placeholder="7.500" />
          </FormField>
        )}
        <div><Label htmlFor="tipo">Tipo</Label><Select id="tipo" title="Se recuerda tu última elección" value={form.kind} onChange={event => set('kind', event.target.value)}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <div className="col-span-2"><Label htmlFor="cuenta-opcional">Cuenta (opcional)</Label><ComboBuscador id="cuenta-opcional" value={activeAccounts.find(account => account.id === form.accountId)?.name || ''} options={opcionesCuentas} onChange={() => set('accountId', '')} onSelect={opcion => set('accountId', opcion.value)} placeholder="Buscá por nombre, banco, titular o empresa" emptyLabel="Sin cuentas para esta moneda." /></div>
        {form.kind === 'CHEQUE' && <div><Label htmlFor="fecha-prevista-de-cobro">Fecha de cobro</Label><Input id="fecha-prevista-de-cobro" type="date" value={form.dueAt} onChange={event => set('dueAt', event.target.value)} /></div>}
        <FormField className="col-span-2" label="Descripción" htmlFor="descripcion" error={validacion.errorDe('descripcion')}>
          <Input id="descripcion" value={form.description} onChange={event => set('description', event.target.value)} onBlur={validacion.alSalir('descripcion')} placeholder="Ej. Seguro de mercadería" />
        </FormField>
        <div><Label htmlFor="contraparte">Contraparte</Label><Input id="contraparte" value={form.counterparty} onChange={event => set('counterparty', event.target.value)} placeholder="Proveedor o beneficiario" /></div>
        <div><Label htmlFor="referencia">Referencia</Label><Input id="referencia" value={form.reference} onChange={event => set('reference', event.target.value)} placeholder="N.º transferencia o cheque" /></div>
        {requiereAutorizacion && !esDemo && (
          <AutorizacionBloque
            kind="EXPENSE_OVER_LIMIT"
            entity="EXPENSE"
            entityId={null}
            titulo="Gasto por encima del límite"
            descripcion={`El monto supera el límite sin autorización (${gs(limiteGastos)}). Pedí autorización a gerencia y ejecutá el gasto con la aprobación.`}
            requestedValue={{ amountPyg: montoPyg, description: form.description.trim() }}
            monto={montoPyg}
            campoMax="maxAmountPyg"
            onSelect={setAuthGasto}
            bloqueado={busy}
          />
        )}
        {validacion.mostrarResumen && !validacion.valido && (
          <p role="alert" data-testid="gastos-motivos" className="col-span-full text-xs font-semibold text-bad">{validacion.motivo}</p>
        )}
        <div className="flex items-end"><Button type="submit" disabled={busy || !validacion.valido || faltaAutorizacion} title={motivoBloqueo || undefined}>{busy ? 'Guardando…' : 'Guardar movimiento'}</Button></div>
      </form>
    </Drawer>
    <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-ink-600 p-4"><h3 className="font-bold">Libro financiero</h3><Badge color="red">Gastos: {gs(total)}</Badge></div>
      {loading ? <p className="p-8 text-center text-sm text-mute">Cargando movimientos…</p> : rows.length === 0 ? <EmptyState compact icon="box" title="Sin movimientos registrados" description="Registrá un gasto, un cheque o un adelanto para verlo acá." /> : <div className="space-y-1.5 p-4">{rows.map(row => <div key={row.id} data-testid="gasto-fila" className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-2.5 py-1.5 transition hover:border-bad/40', v2 && 'v2-tile')}><span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{row.description || row.motivo}</b><span className="mt-0.5 block truncate text-[11px] text-mute">{KINDS[row.kind] || row.category || 'Gasto'} · {row.currency || 'PYG'} · {row.counterparty || 'Sin contraparte'}{row.currency && row.currency !== 'PYG' ? ` · cotización ${gs(row.exchangeRatePyg)} por ${row.currency} = ${gs(row.amountPyg)}` : ''}</span></span><span className="flex shrink-0 items-center gap-2"><Badge color={row.status === 'CLEARED' ? 'green' : row.status === 'VOID' ? 'slate' : 'yellow'}>{estadoVisible(row)}</Badge><b className="text-[13px] font-bold tabular-nums text-bad">{montoVisible(row)}</b>{row.kind === 'CHEQUE' && row.status === 'PENDING' && !isDemoRuntime && <><IconAction icon="check" tone="ok" label="Marcar cobrado" disabled={busy} onClick={() => updateStatus(row.id, 'clear')} /><IconAction icon="trash" tone="bad" label="Anular" disabled={busy} onClick={() => updateStatus(row.id, 'void')} /></>}</span></div>)}</div>}
    </Card>
  </div>
}
