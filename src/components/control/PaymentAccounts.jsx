import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { isDemoRuntime } from '@/lib/demoMode'
import { getPaymentAccounts, createPaymentAccount, updatePaymentAccount, KIND_LABELS } from '@/lib/paymentAccounts'
import { Aviso, Button, Card, EmptyState, Input, Label, Select, Stat } from '@/components/ui'
import StatGrid from '@/components/shared/StatGrid'
import Toolbar from '@/components/shared/Toolbar'
import VentanaDetalle from '@/components/shared/VentanaDetalle'
import CurrencySelect from '@/components/shared/CurrencySelect'
import Switch from '@/components/shared/Switch'
import BancoCombobox from '@/components/shared/BancoCombobox'
import BancoLogo from '@/components/shared/BancoLogo'
import RucField from '@/components/shared/RucField'
import ComboBuscador from '@/components/shared/ComboBuscador'
import { marcaDeMedio } from '@/components/shared/MedioPago'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import { getAccountHolders, getPrivateCompanies } from '@/lib/accountParties'
import { monedasExcluidas } from '@/lib/paymentAccountsReglas'
import { nombreCompleto, nombreSugeridoDeCuenta, opcionesDePartes } from '@/lib/accountNames'
import { cn } from '@/lib/utils'
import './finanzasTactil.css'
import { temaV2Activo } from '@/lib/temaV2'
import { CELDA_IDENTIDAD, ROTULO_DATO } from '@/components/shared/tabla'
import ListaDensa from '@/components/shared/ListaDensa'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import StatusChip from '@/components/shared/StatusChip'
// Listado: una fila por cuenta (tabla desde xl, tarjeta debajo), con comisión,
// acreditación y descuento. El banco o la procesadora se muestra UNA vez: logo
// + nombre en la primera celda (nunca otra vez en «Datos»).

const EMPTY = { name: '', bank: '', holder: '', accountNumber: '', document: '', processor: '', pixKey: '', reference: '', currencyLabel: '', currency: 'PYG', kind: 'CASH', isActive: true, feePercent: 0, discountPct: 0, settlementDays: 0 }

// Cada medio tiene su modelo (#142): qué campos muestra, con qué moneda y qué
// comportamiento aplica. La moneda fija se guarda sola (Pix en reales, Cripto
// en dólares) y el resto elige entre las del sistema o una personalizada.
const MEDIOS = [
  { kind: 'CASH', label: KIND_LABELS.CASH, banco: false, titular: false, documento: false, cuenta: false, procesadora: false, pixKey: false, referencia: false, moneda: true, personalizada: true, comportamiento: ['discount'] },
  { kind: 'TRANSFER', label: KIND_LABELS.TRANSFER, banco: true, titular: true, documento: true, cuenta: true, procesadora: false, pixKey: false, referencia: false, moneda: true, personalizada: false, comportamiento: ['discount', 'fee', 'settlement'] },
  { kind: 'CARD', label: KIND_LABELS.CARD, banco: false, titular: false, documento: false, cuenta: false, procesadora: true, pixKey: false, referencia: false, moneda: true, personalizada: false, comportamiento: ['fee', 'settlement'] },
  { kind: 'PIX', label: KIND_LABELS.PIX, banco: false, titular: true, documento: false, cuenta: false, procesadora: false, pixKey: true, referencia: false, moneda: false, monedaFija: 'BRL', personalizada: false, comportamiento: [] },
  { kind: 'CRYPTO', label: KIND_LABELS.CRYPTO, banco: false, titular: true, documento: false, cuenta: false, procesadora: false, pixKey: false, referencia: true, moneda: false, monedaFija: 'USD', personalizada: false, comportamiento: [] },
  { kind: 'TRADE_IN', label: KIND_LABELS.TRADE_IN, banco: false, titular: true, documento: false, cuenta: false, procesadora: false, pixKey: false, referencia: true, moneda: true, personalizada: false, comportamiento: [] },
]
const medioDe = (kind) => MEDIOS.find((medio) => medio.kind === kind) || MEDIOS[0]

// Procesadoras/adquirentes de tarjeta (#142, decisión de Dario): Bancard,
// Dinelco, UPay y Pix. La lista es configurable: se puede escribir otra.
const PROCESADORAS = ['Bancard', 'Dinelco', 'UPay', 'Pix']

const MONEDAS_FIJAS = { BRL: 'BRL · Reales', USD: 'USD · Dólares' }

const TEMPLATES = [
  { name: 'Efectivo Gs', kind: 'CASH', currency: 'PYG' },
  { name: 'Efectivo USD', kind: 'CASH', currency: 'USD' },
  { name: 'Transferencia', kind: 'TRANSFER', currency: 'PYG' },
  { name: 'Tarjeta', kind: 'CARD', currency: 'PYG' },
  { name: 'Pix', kind: 'PIX', currency: 'BRL' },
  { name: 'USDT - Cripto', kind: 'CRYPTO', currency: 'USD' },
  { name: 'Canje', kind: 'TRADE_IN', currency: 'PYG' },
]

// Comportamiento del medio: el campo solo existe mientras está encendido;
// apagado, el valor se guarda en 0 (sin descuento, sin comisión, acreditación
// inmediata). Un solo arreglo dibuja los bloques.
const COMPORTAMIENTO = [
  { field: 'discountPct', control: 'percent', check: 'Aplica descuento', label: 'Descuento por este medio (%)', hint: 'Sugerido al cobrar con este medio (ej. efectivo 5%).' },
  { field: 'settlementDays', control: 'days', check: 'Se acredita en días', label: 'Días en acreditarse', hint: 'Tarjeta suele tardar 1-3 días hábiles.' },
  { field: 'feePercent', control: 'percent', check: 'Tiene comisión', label: 'Comisión (%)', hint: 'Lo que retiene el medio sobre el total cobrado.' },
]

function flagsFrom(values) {
  return Object.fromEntries(COMPORTAMIENTO.map(({ field }) => [field, Number(values[field]) > 0]))
}

// Logo de la cuenta: el banco guardado, la procesadora o, cuando la cuenta
// nace de una marca de medio de pago (#118), su nombre.
function bancoConLogo(account) {
  if (account.kind === 'CARD' && account.processor) return account.processor
  if (account.bank) return account.bank
  if (account.processor) return account.processor
  return marcaDeMedio(account.name) ? account.name : ''
}

// Banco o procesadora que acompaña al nombre de la cuenta (junto al logo). Si
// el nombre ya lo contiene no se repite.
function entidadDe(account) {
  const entidad = (account.kind === 'CARD' ? account.processor || account.bank : account.bank || account.processor) || ''
  if (!entidad) return ''
  return String(account.name || '').toLowerCase().includes(entidad.toLowerCase()) ? '' : entidad
}

// Datos que se muestran en el listado según el medio (#142). El banco y la
// procesadora salen: ya van en la primera celda.
function datosDe(account) {
  const partes = {
    TRANSFER: [account.holder, account.document, account.accountNumber],
    PIX: [account.holder, account.pixKey],
    CRYPTO: [account.holder, account.reference],
    TRADE_IN: [account.holder, account.reference],
    CASH: [account.holder],
  }[account.kind] || []
  return partes.filter(Boolean).join(' · ')
}

// Porcentaje para la tabla: 0 se lee como "no aplica", no como "0%".
function porcentaje(valor) {
  return Number(valor || 0) > 0 ? `${formatPercent(valor)}%` : '—'
}

export default function PaymentAccounts() {
  const { sesion, empresa } = useSesion()
  // Remount al cambiar de empresa para no mostrar cuentas del contexto anterior.
  if (!sesion?.esPropietario) return null
  return <AccountManager key={empresa?.id || 'default'} />
}

function AccountManager() {
  const [accounts, setAccounts] = useState([])
  // Vista previa v2 (#241 · lote D): resumen en tiles de consola con números
  // grandes. Es solo lectura de lo ya cargado: sin el flag no cambia nada.
  const v2 = temaV2Activo()
  // #234: el documento de la cuenta usa el campo compartido de RUC (Extraer).
  const esDemo = isDemoRuntime
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(null)
  const [flags, setFlags] = useState(flagsFrom(EMPTY))
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [message, setMessage] = useState(null)
  const [holders, setHolders] = useState([])
  const [companies, setCompanies] = useState([])
  const [nombreTocado, setNombreTocado] = useState(false)
  const nombreTocadoRef = useRef(false)
  const lista = usePaginaLista(accounts, { tamano: { compacto: 10, amplio: 25 } })

  useEffect(() => {
    let cancelled = false
    Promise.all([getAccountHolders(), getPrivateCompanies()])
      .then(([nextHolders, nextCompanies]) => { if (!cancelled) { setHolders(nextHolders); setCompanies(nextCompanies) } })
      .catch(() => { /* los buscadores quedan vacíos; el titular se escribe a mano */ })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    getPaymentAccounts().then(items => {
      if (!cancelled) setAccounts(items)
    }).catch(error => {
      if (!cancelled) setLoadError(error.message || 'No se pudieron cargar las cuentas.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  // Resumen del lote D: se deriva de las cuentas ya cargadas (sin pedidos ni
  // lógica nueva); los números van con el tamaño del scope en la vista previa.
  const resumenCuentas = useMemo(() => {
    const activas = accounts.filter(cuenta => cuenta.isActive)
    const monedas = [...new Set(activas.map(cuenta => cuenta.currencyLabel || cuenta.currency).filter(Boolean))]
    const inactivas = accounts.length - activas.length
    return [
      { label: 'Cuentas activas', valor: activas.length, sub: `de ${accounts.length}`, tono: '' },
      { label: 'Inactivas', valor: inactivas, tono: inactivas ? 'text-warn' : '' },
      { label: 'Monedas', valor: monedas.length, sub: monedas.join(' · ') || undefined, tono: '' },
    ]
  }, [accounts])

  function openForm(account = null) {    // Los opcionales vacíos llegan null desde la API: el formulario trabaja
    // siempre con texto (evita inputs sin control y el error de validación).
    const values = { ...EMPTY, ...account }
    for (const key of ['bank', 'holder', 'accountNumber', 'document', 'processor', 'pixKey', 'reference', 'currencyLabel', 'holderId', 'companyId']) {
      if (values[key] == null) values[key] = ''
    }
    setEditingId(account?.id ?? null)
    setForm(values)
    setFlags(flagsFrom(values))
    // Una cuenta existente conserva su nombre; una nueva (o una plantilla) se
    // completa sola mientras el usuario no escriba el nombre a mano (#141).
    nombreTocadoRef.current = Boolean(account?.id)
    setNombreTocado(Boolean(account?.id))
    setMessage(null)
  }

  // #311: el alta/edición vive en un cajón: la página de cuentas queda para
  // leer el listado y el formulario no compite abierto dentro de la grilla.
  function cerrarForm() {
    setForm(null)
    setEditingId(null)
    setMessage(null)
  }

  // Nombre automático: se recalcula con cada dato mientras no lo hayan tocado.
  function conNombre(next) {
    return nombreTocadoRef.current ? next : { ...next, name: nombreSugeridoDeCuenta(next) }
  }

  function change(key, value) {
    if (key === 'name') { nombreTocadoRef.current = true; setNombreTocado(true) }
    setForm(current => conNombre({ ...current, [key]: value }))
  }

  // Elegir un titular o una empresa registrados completa el nombre y guarda el
  // vínculo (#143); si el titular todavía no tiene documento, se hereda.
  function elegirTitular(opcion) {
    if (!opcion) return
    if (opcion.tipo === 'holder') {
      setForm(current => conNombre({ ...current, holder: nombreCompleto(opcion.entidad), holderId: opcion.entidad.id, companyId: '', document: current.document || opcion.entidad.document || '' }))
      return
    }
    setForm(current => conNombre({ ...current, holder: opcion.entidad.legalName, companyId: opcion.entidad.id, holderId: '', document: current.document || opcion.entidad.ruc || '' }))
  }

  // Al cambiar de medio, la moneda fija del medio (Pix/USDT) se aplica sola y
  // los campos que no corresponden quedan vacíos.
  function changeMedio(kind) {
    setForm(current => {
      const medio = medioDe(kind)
      return conNombre({
        ...current,
        kind,
        currency: medio.monedaFija || current.currency,
        currencyLabel: medio.monedaFija ? '' : current.currencyLabel,
        holderId: medio.titular ? current.holderId : '',
        companyId: medio.titular ? current.companyId : '',
        holder: medio.titular ? current.holder : '',
        feePercent: medio.comportamiento.includes('fee') ? current.feePercent : 0,
        settlementDays: medio.comportamiento.includes('settlement') ? current.settlementDays : 0,
        discountPct: medio.comportamiento.includes('discount') ? current.discountPct : 0,
      })
    })
    setFlags(current => ({
      feePercent: medioDe(kind).comportamiento.includes('fee') ? current.feePercent : false,
      settlementDays: medioDe(kind).comportamiento.includes('settlement') ? current.settlementDays : false,
      discountPct: medioDe(kind).comportamiento.includes('discount') ? current.discountPct : false,
    }))
  }

  // Al abrir un campo, un 0 heredado del modelo se limpia para escribir directo.
  function toggleBehavior(field, on) {
    setFlags(current => ({ ...current, [field]: on }))
    setForm(current => (on && !parsePercent(current[field]) ? { ...current, [field]: '' } : current))
  }

  async function mutate(action, success) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage(null)
    try {
      const account = await action()
      setAccounts(current => current.some(item => item.id === account.id)
        ? current.map(item => item.id === account.id ? account : item)
        : [...current, account])
      setForm(null)
      setEditingId(null)
      setMessage({ ok: true, text: success })
    } catch (error) {
      setMessage({ ok: false, text: error.message || 'No se pudo guardar la cuenta.' })
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function save(event) {
    event.preventDefault()
    const medio = medioDe(form.kind)
    const values = { ...form, currency: medio.monedaFija || form.currency }
    for (const { field, control } of COMPORTAMIENTO) {
      values[field] = medio.comportamiento.includes(field === 'feePercent' ? 'fee' : field === 'settlementDays' ? 'settlement' : 'discount')
        ? (flags[field] ? (control === 'percent' ? parsePercent(values[field]) ?? 0 : Number(values[field]) || 0) : 0)
        : 0
    }
    mutate(() => editingId ? updatePaymentAccount(editingId, values) : createPaymentAccount(values), 'Cuenta guardada.')
  }

  const medio = form ? medioDe(form.kind) : MEDIOS[0]
  const monedaFija = medio.monedaFija || ''
  const transferNuevo = form?.kind === 'TRANSFER' && !editingId
  const camposComportamiento = COMPORTAMIENTO.filter(({ field }) => medio.comportamiento.includes(field === 'feePercent' ? 'fee' : field === 'settlementDays' ? 'settlement' : 'discount'))
  const opcionesTitulares = useMemo(() => opcionesDePartes(holders, companies), [holders, companies])

  return (
    <Card className="finanzas-tactil space-y-4">
      {/* #388: una barra (plantillas rápidas · demo · Añadir cuenta) y tira de KPI de una línea. */}
      <Toolbar
        plano
        lista
        label="Acciones de cuentas de cobro"
        testId="barra-cuentas"
        filters={!loading && !loadError && !form ? (
          <div role="group" aria-label="Plantillas rápidas" className="flex items-center gap-2">
            {TEMPLATES.map(template => <Button key={template.name} type="button" variant="outline" disabled={busy} onClick={() => openForm(template)}>+ {template.name}</Button>)}
          </div>
        ) : undefined}
        more={isDemoRuntime ? <span data-testid="cuentas-demo" title="Demo: cuentas ficticias guardadas en este navegador. No ingreses datos bancarios reales." className="inline-flex min-h-7 items-center rounded-full border border-warn/40 bg-warn/5 px-2.5 text-xs text-warn">Demo: sin datos reales</span> : undefined}
        primary={<Button type="button" disabled={busy || loading || !!loadError || !!form} onClick={() => openForm()}>Añadir cuenta</Button>}
      />
      {v2 && accounts.length > 0 && (
        <StatGrid testId="cuentas-resumen">
          {resumenCuentas.map((tarjeta) => (
            <Stat key={tarjeta.label} compact label={tarjeta.label} valor={tarjeta.valor} sub={tarjeta.sub} valorClassName={tarjeta.tono} />
          ))}
        </StatGrid>
      )}
      {loading && <p role="status" className="text-sm text-mute">Cargando cuentas…</p>}
      {loadError && <div role="alert" className="space-y-2 text-sm text-bad"><p>{loadError}</p><Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Reintentar</Button></div>}
      {message && <Aviso tono={message.ok ? 'ok' : 'error'}>{message.text}</Aviso>}
      {!loading && !loadError && accounts.length === 0 && <EmptyState icon="wallet" title="Todavía no hay cuentas de cobro" description="Añadí una cuenta o elegí una plantilla para empezar a registrar cobros." action={<Button type="button" onClick={() => openForm()}>Añadir cuenta</Button>} />}
      {form && (
        <VentanaDetalle
          open
          onClose={() => !busy && cerrarForm()}
          title={editingId ? 'Editar cuenta' : 'Nueva cuenta'}
        >
        <form onSubmit={save} data-testid="cuenta-form" className="space-y-4">
        <fieldset disabled={busy} className="grid gap-x-3 gap-y-2.5 sm:grid-cols-6">
          <div className="sm:col-span-2"><Label htmlFor="pa-kind">Medio de pago</Label><Select id="pa-kind" value={form.kind} onChange={event => changeMedio(event.target.value)}>{MEDIOS.map(item => <option key={item.kind} value={item.kind}>{item.label}</option>)}</Select></div>
          <div className="sm:col-span-4"><Label htmlFor="pa-name">Nombre</Label><Input id="pa-name" autoFocus required maxLength={200} value={form.name} onChange={event => change('name', event.target.value)} placeholder="Se completa solo" />{!nombreTocado && <p className="mt-1 text-[11px] text-mute">El nombre se completa solo al cargar el medio, el titular y la cuenta. Escribí para cambiarlo.</p>}</div>
          {medio.banco && <div className="sm:col-span-3"><Label htmlFor="pa-bank">Banco {form.kind !== 'TRANSFER' && '(opcional)'}</Label><BancoCombobox id="pa-bank" value={form.bank} onChange={value => change('bank', value)} required={form.kind === 'TRANSFER'} placeholder="Buscá entre los bancos de Paraguay o escribí otro" /></div>}
          {medio.procesadora && <div className="sm:col-span-3"><Label htmlFor="pa-processor">Procesadora</Label><Select id="pa-processor" value={PROCESADORAS.includes(form.processor) ? form.processor : form.processor ? '__otra' : ''} onChange={event => change('processor', event.target.value === '__otra' ? '' : event.target.value)}><option value="">Elegí la procesadora</option>{PROCESADORAS.map(procesadora => <option key={procesadora} value={procesadora}>{procesadora}</option>)}<option value="__otra">Otra…</option></Select>{!PROCESADORAS.includes(form.processor) && <Input className="mt-2" maxLength={200} value={form.processor} onChange={event => change('processor', event.target.value)} placeholder="Nombre de la procesadora" />}</div>}
          {monedaFija
            ? <div className="sm:col-span-2"><Label>Moneda</Label><p className="flex h-11 items-center rounded-lg border border-ink-500 bg-ink-800 px-3 text-sm text-mute md:h-9">{MONEDAS_FIJAS[monedaFija] || monedaFija}</p></div>
            : <div className="sm:col-span-2"><Label htmlFor="pa-currency">Moneda</Label><CurrencySelect id="pa-currency" value={form.currency} excluir={monedasExcluidas(form.kind)} onChange={event => change('currency', event.target.value)} /></div>}
          {medio.personalizada && <div className="sm:col-span-2"><Label htmlFor="pa-currency-label">Moneda personalizada</Label><Input id="pa-currency-label" maxLength={12} value={form.currencyLabel} onChange={event => change('currencyLabel', event.target.value.toUpperCase())} placeholder="ARS, PEN…" /></div>}
          {medio.titular && <div className="sm:col-span-3"><Label htmlFor="pa-holder">Titular {!transferNuevo && '(opcional)'}</Label><ComboBuscador id="pa-holder" value={form.holder} required={transferNuevo} options={opcionesTitulares} onChange={(texto) => setForm(current => conNombre({ ...current, holder: texto, holderId: '', companyId: '' }))} onSelect={elegirTitular} placeholder="Buscá titular, socio o empresa" />{(form.holderId || form.companyId) && <p className="mt-1 text-[11px] text-ok">{form.companyId ? 'Empresa registrada' : 'Titular registrado'} · se completa solo</p>}</div>}
          {medio.documento && <div className="sm:col-span-3"><Label htmlFor="pa-document">Documento (cédula/RUC)</Label>
            <RucField
              id="pa-document"
              value={form.document}
              onChange={(valor) => change('document', valor)}
              esDemo={esDemo}
              onAplicar={(datos) => {
                if (datos.fullRuc) change('document', datos.fullRuc)
                if (datos.name) change('holder', datos.name)
              }}
            />
          </div>}
          {medio.cuenta && <div className="sm:col-span-2"><Label htmlFor="pa-number">Número de cuenta {!transferNuevo && '(opcional)'}</Label><Input id="pa-number" type="text" required={transferNuevo} maxLength={200} value={form.accountNumber} onChange={event => change('accountNumber', event.target.value)} /></div>}
          {medio.pixKey && <div className="sm:col-span-3"><Label htmlFor="pa-pix-key">Llave Pix</Label><Input id="pa-pix-key" maxLength={200} value={form.pixKey} onChange={event => change('pixKey', event.target.value)} placeholder="CPF/CNPJ, correo, teléfono o aleatoria" /></div>}
          {medio.referencia && <div className="sm:col-span-3"><Label htmlFor="pa-reference">{form.kind === 'CRYPTO' ? 'Referencia de la billetera' : form.kind === 'TRADE_IN' ? 'Valor de canje' : 'Referencia'}</Label><Input id="pa-reference" maxLength={200} value={form.reference} onChange={event => change('reference', event.target.value)} placeholder={form.kind === 'CRYPTO' ? 'Ej. TRC20 · TQn9…' : form.kind === 'TRADE_IN' ? 'Ej. equipo recibido, valor acordado' : 'Referencia'} /></div>}
        </fieldset>
        <fieldset disabled={busy} className="space-y-2 rounded-lg border border-ink-600/70 bg-ink-800/30 p-3">
          <legend className={cn('px-1', ROTULO_DATO)}>Comportamiento del medio</legend>
          <div className="grid gap-x-3 gap-y-2.5 sm:grid-cols-3">
            {camposComportamiento.map(({ field, control, check, label, hint }) => <div key={field}>
              <span className="flex items-center gap-2 text-sm"><Switch id={`pa-${field}-toggle`} checked={Boolean(flags[field])} onChange={event => toggleBehavior(field, event.target.checked)} ariaLabel={check} /><span>{check}</span></span>
              {flags[field] && <div className="mt-1.5 max-w-[8rem]">
                <Label htmlFor={`pa-${field}`}>{label}</Label>
                {control === 'percent'
                  ? <PercentField id={`pa-${field}`} required value={form[field]} onChange={value => change(field, value)} />
                  : <Input id={`pa-${field}`} inputMode="numeric" maxLength={2} required value={form[field]} onChange={event => change(field, event.target.value.replace(/\D/g, ''))} placeholder="Ej. 2" />}
                <p className="mt-1 text-[11px] text-mute">{hint}</p>
              </div>}
            </div>)}
          </div>
          <div className="space-y-1">
            <span className="flex items-center gap-2 text-sm">
              <Switch id="pa-active" checked={form.isActive} aria-describedby="pa-active-desc" onChange={event => change('isActive', event.target.checked)} />
              <label htmlFor="pa-active" className="cursor-pointer">Cuenta activa</label>
            </span>
            <p id="pa-active-desc" className="text-[11px] text-mute">Desactivada deja de ofrecerse al cobrar; la cuenta, su historial y sus marcas se conservan.</p>
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cuenta'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={cerrarForm}>Cancelar</Button></div>
        </form>
        </VentanaDetalle>
      )}
      {!loading && !loadError && accounts.length > 0 && (() => {
        const identidad = (account) => {
          const banco = bancoConLogo(account)
          const entidad = entidadDe(account)
          return (
            <span className="block min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                {banco && <BancoLogo banco={banco} alto="h-4" soloCatalogo />}
                <b className={CELDA_IDENTIDAD} title={account.name}>{account.name}</b>
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <StatusChip dominio="cuenta" estado={account.isActive ? 'ACTIVA' : 'INACTIVA'} className="px-1.5 py-0 text-[10px]" />
                {entidad && <span className="truncate text-[11px] text-mute" title={entidad}>{entidad}</span>}
              </span>
            </span>
          )
        }
        const acciones = (account) => (
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            <Button type="button" variant="outline" className="min-h-11 px-3 text-xs lg:min-h-0 lg:h-8 lg:px-2" disabled={busy || !!form} aria-label={`Editar ${account.name}`} onClick={() => openForm(account)}>Editar</Button>
            <Button type="button" variant="ghost" className="min-h-11 px-3 text-xs lg:min-h-0 lg:h-8 lg:px-2" disabled={busy || !!form} aria-label={`${account.isActive ? 'Desactivar' : 'Activar'} ${account.name}`} onClick={() => mutate(() => updatePaymentAccount(account.id, { isActive: !account.isActive }), account.isActive ? 'Cuenta desactivada. El historial se conserva.' : 'Cuenta activada.')}>{account.isActive ? 'Desactivar' : 'Activar'}</Button>
          </span>
        )
        const monedaDe = (account) => account.currencyLabel || (account.currency === 'PYG' ? 'Gs' : account.currency)
        const acreditaDe = (account) => (account.settlementDays > 0 ? `${account.settlementDays} día${account.settlementDays === 1 ? '' : 's'}` : 'Inmediata')
        return (
          <ListaDensa
            lista={lista}
            testId="cuentas-tabla"
            etiquetaTabla="Cuentas de cobro"
            etiquetaPie="Páginas de cuentas"
            unidad="cuentas"
            desde="xl"
            obtenerClave={(account) => account.id}
            atributosFila={(account) => ({ 'data-testid': 'cuenta-fila', 'data-banco': bancoConLogo(account) })}
            columns={[
              { key: 'cuenta', header: 'Cuenta', ancho: 'minmax(0,2.3fr)', cell: identidad },
              { key: 'tipo', header: 'Tipo', ancho: '6rem', className: 'text-xs text-mute', cell: (account) => medioDe(account.kind).label },
              { key: 'moneda', header: 'Moneda', ancho: '4rem', className: 'text-xs text-mute', cell: monedaDe },
              { key: 'comision', header: 'Comisión', ancho: '5rem', className: 'text-xs text-mute tabular-nums', cell: (account) => porcentaje(account.feePercent) },
              { key: 'acredita', header: 'Acredita', ancho: '5.5rem', className: 'text-xs text-mute', cell: acreditaDe },
              { key: 'descuento', header: 'Descuento', ancho: '5.5rem', className: 'text-xs text-mute tabular-nums', cell: (account) => porcentaje(account.discountPct) },
              { key: 'datos', header: 'Datos', ancho: 'minmax(0,1.4fr)', className: 'text-xs text-mute', cell: (account) => <span data-celda="datos" className="block whitespace-normal break-words leading-4" title={datosDe(account) || undefined}>{datosDe(account) || '—'}</span> },
              { key: 'acciones', header: 'Acciones', ancho: '10.5rem', align: 'right', className: 'overflow-visible', cell: acciones },
            ]}
            renderCard={(account) => (
              <div className="rounded-xl border border-ink-600 bg-ink-800/40 p-3">
                {identidad(account)}
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                  {[
                    ['Tipo', medioDe(account.kind).label],
                    ['Moneda', monedaDe(account)],
                    ['Comisión', porcentaje(account.feePercent)],
                    ['Descuento', porcentaje(account.discountPct)],
                    ['Acredita', acreditaDe(account)],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo} className="min-w-0">
                      <dt className="text-[11px] text-mute">{rotulo}</dt>
                      <dd className="break-words tabular-nums">{valor}</dd>
                    </div>
                  ))}
                  <div className="col-span-2 min-w-0">
                    <dt className="text-[11px] text-mute">Datos</dt>
                    <dd className="break-words"><span data-celda="datos">{datosDe(account) || '—'}</span></dd>
                  </div>
                </dl>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{acciones(account)}</div>
              </div>
            )}
          />
        )
      })()}
    </Card>
  )
}
