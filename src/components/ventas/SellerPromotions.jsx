import { useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { readDemoPromotions, saveDemoPromotion, toggleDemoPromotion } from '@/lib/demoPromotions'
import { gs } from '@/utils/calculos'
import { getProductos } from '@/lib/storage'
import { Badge, Button, EmptyState, FormField, Input, MoneyInput, Select, Stat } from '@/components/ui'
import ProductCombobox from '@/components/shared/ProductCombobox'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import useValidacionFormulario from '@/hooks/useValidacionFormulario'
import { ETIQUETAS_PROMOCION, reglasPromocion, valoresPromocion } from '@/lib/validacionGlobal'
import { cn } from '@/lib/utils'
import { SellerSection, SellerFeedback, useSellerData } from './SellerData'
import BarraGestion from '@/components/shared/BarraGestion'
import Popup from '@/components/shared/Popup'
import { SaveActions } from '@/components/shared/popupKit'
import StatGrid from '@/components/shared/StatGrid'
import '@/components/shared/gestionProfundo.css'
const fechaCorta = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}

const project = ({ id, code, name, kind, value, productId, startsAt, endsAt, maxUnits, usedUnits, isActive }) => ({ id, code, name, kind, value, productId, startsAt, endsAt, maxUnits, usedUnits, isActive })
const empty = { code: '', name: '', kind: 'PERCENT', value: '10', productId: '', startsAt: '', endsAt: '', maxUnits: '' }
export default function SellerPromotions() {
  const { esDemo, usuario } = useSesion()
  const admin = usuario?.role === 'ADMIN'
  const products = getProductos().filter(p => p.activo)
  const data = useSellerData('/api/promotions', project, readDemoPromotions, esDemo)
  const [form, setForm] = useState(empty)
  const [alta, setAlta] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [tab, setTab] = useState('todas')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // #297: sin datos válidos no se crea el cupón; el mensaje por campo aparece
  // al salir de él y el botón queda deshabilitado con el motivo.
  const control = useValidacionFormulario(valoresPromocion(form), reglasPromocion(form), ETIQUETAS_PROMOCION)
  async function mutate(action) {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action(); data.refresh(); setMessage('Guardado.') } catch (e) { setMessage(e.message || 'No se pudo guardar.') } finally { setBusy(false) }
  }
  function create(event) {
    event.preventDefault()
    const resultado = control.intentar()
    if (!resultado.valido) return
    mutate(async () => {
      const percentValue = form.kind === 'PERCENT' ? parsePercent(form.value) : null
      const payload = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim(), value: form.kind === 'PERCENT' ? percentValue : Number(form.value), productId: form.productId.trim() || null, maxUnits: form.maxUnits ? Number(form.maxUnits) : null, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() }
      if (esDemo) saveDemoPromotion(payload); else await api.post('/api/promotions', payload)
      setForm(empty)
      control.limpiar()
      setAlta(false)
    })
  }
  const estadoDe = (p) => !p.isActive ? 'Inactiva' : Date.now() >= +new Date(p.endsAt) ? 'Vencida' : Date.now() < +new Date(p.startsAt) ? 'Programada' : 'Activa'
  const conEstado = data.rows.map(p => ({ ...p, estado: estadoDe(p) }))
  const cuenta = (e) => conEstado.filter(p => p.estado === e).length
  const TABS = [['todas', 'Todas'], ['Activa', 'Activas'], ['Programada', 'Programadas'], ['Vencida', 'Vencidas'], ['Inactiva', 'Inactivas']]
  const q = busqueda.trim().toLowerCase()
  const visibles = conEstado.filter(p => (tab === 'todas' || p.estado === tab) && (!q || `${p.code} ${p.name}`.toLowerCase().includes(q)))
  const usosTotales = conEstado.reduce((suma, p) => suma + Number(p.usedUnits || 0), 0)
  return <SellerSection title="Promociones">
    <div className="gp space-y-3">
      <div className="gp-cabecera">
        <div className="min-w-0">
          <p>{esDemo ? 'Demo ficticia local. Usá DEMO10 al elegir un producto.' : 'Aplicá el código en el precio del producto. Se verifica nuevamente al registrar la venta.'}</p>
        </div>
      </div>
      <BarraGestion
        etiqueta="Acciones de Promociones"
        testId="barra-promociones"
        buscar={busqueda}
        onBuscar={setBusqueda}
        placeholder="Código o nombre"
        ariaBuscar="Buscar cupones"
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        etiquetaTabs="Estado del cupón"
        primary={admin ? <Button type="button" onClick={() => { setMessage(''); setAlta(true) }}>Nuevo cupón</Button> : undefined}
      />
      {data.rows.length > 0 && <StatGrid testId="promociones-resumen" etiqueta="Resumen de promociones">
        <Stat compact label="Activas" valor={cuenta('Activa')} valorClassName={cuenta('Activa') > 0 ? 'text-ok' : 'text-mute'} />
        <Stat compact label="Programadas" valor={cuenta('Programada')} />
        <Stat compact label="Vencidas o inactivas" valor={cuenta('Vencida') + cuenta('Inactiva')} />
        <Stat compact label="Unidades con cupón" valor={usosTotales} />
      </StatGrid>}
      <SellerFeedback {...data} empty={false} />
      {!data.loading && !data.error && data.rows.length === 0 && <EmptyState compact icon="tag" title="Todavía no hay cupones" description="Un cupón da un descuento por código sobre un producto o toda la tienda." />}
      {data.rows.length > 0 && visibles.length === 0 && <EmptyState compact icon="box" title="Ningún cupón coincide" description="Probá con otro estado o borrá la búsqueda." action={<Button type="button" variant="outline" onClick={() => { setBusqueda(''); setTab('todas') }}>Ver todos</Button>} />}
      {visibles.length > 0 && <div className="gp-lista" data-testid="promociones-tabla">
        {visibles.map((p, i) => {
          const tono = p.estado === 'Activa' ? 'green' : p.estado === 'Programada' ? 'orange' : 'slate'
          const alcance = p.productId ? (products.find(product => product.id === p.productId)?.nombre || 'Producto específico') : 'Todos los productos'
          return <div key={p.id} data-testid="promocion-fila" className="gp-fila" style={{ '--i': i }}>
            <div className="gp-fila-main">
              <span className="gp-fila-titulo"><span className="mr-2 font-mono text-[11px] font-bold text-fono-light" title={p.code}>{p.code}</span>{p.name}</span>
              <span className="gp-fila-sub">{alcance} · {fechaCorta(p.startsAt)} al {fechaCorta(p.endsAt)}</span>
            </div>
            <span className="gp-fila-monto" title={p.maxUnits === null ? 'Sin límite de unidades' : `${Math.max(0, p.maxUnits - p.usedUnits)} disponibles de ${p.maxUnits}`}>{p.kind === 'PERCENT' ? `${formatPercent(p.value)}%` : gs(p.value)}</span>
            <div className="gp-fila-lado">
              <Badge color={tono} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">{p.estado}</Badge>
              {admin && <Button type="button" variant="outline" className="min-h-11 whitespace-nowrap px-3 text-xs lg:min-h-8 lg:px-2" disabled={busy} onClick={() => mutate(() => esDemo ? toggleDemoPromotion(p.id, !p.isActive) : api.patch('/api/promotions', { id: p.id, isActive: !p.isActive }))}>{p.isActive ? 'Desactivar' : 'Activar'}</Button>}
            </div>
          </div>
        })}
      </div>}
      {message && !alta && <p role="status" className="text-sm text-mute">{message}</p>}
    </div>
    {admin && <Popup open={alta} onClose={() => !busy && setAlta(false)} title="Crear cupón" tamano="lg" busy={busy}>
        <form onSubmit={create} className="grid gap-3">
      {/* Grilla responsive (#238): 1 campo por fila en móvil, 2 en tablet y hasta
          4 en desktop; los campos cortos no se estiran (ancho máximo propio). */}
      <div className={cn('lg:grid-cols-3', GRILLA_DOS_COLUMNAS)}>
        {['code', 'name'].map(key => (
          <FormField className="block" key={key} label={{ code: 'Código', name: 'Nombre' }[key]} htmlFor={`cupon-${key}`} error={control.errorDe(key)}>
            <Input id={`cupon-${key}`} maxLength={key === 'code' ? 40 : 120} className={key === 'code' ? 'max-w-[11rem]' : ''} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} onBlur={control.alSalir(key)} />
          </FormField>
        ))}
        <FormField className="block" label="Tipo" htmlFor="cupon-tipo">
          <Select id="cupon-tipo" className="max-w-[11rem]" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="PERCENT">Porcentaje</option><option value="FIXED">Monto Gs. por unidad</option></Select>
        </FormField>
        <FormField className="block" label="Descuento" htmlFor="cupon-valor" error={control.errorDe('value')}>
          {form.kind === 'FIXED'
            ? <MoneyInput id="cupon-valor" className="max-w-[9rem]" value={form.value} onValueChange={v => setForm({ ...form, value: v })} onBlur={control.alSalir('value')} />
            : <PercentField id="cupon-valor" className="max-w-[9rem]" value={form.value} onChange={value => setForm({ ...form, value })} onBlur={control.alSalir('value')} />}
        </FormField>
        <FormField className="block" label="Límite de unidades (opcional)" htmlFor="cupon-limite" error={control.errorDe('maxUnits')}>
          <Input id="cupon-limite" inputMode="numeric" type="number" step="1" min="1" max={2147483647} className="max-w-[9rem]" value={form.maxUnits} onChange={e => setForm({ ...form, maxUnits: e.target.value.replace(/\D/g, '') })} onBlur={control.alSalir('maxUnits')} />
        </FormField>
        {['startsAt','endsAt'].map(key => (
          <FormField className="block" key={key} label={key === 'startsAt' ? 'Inicio (hora local)' : 'Fin (hora local)'} htmlFor={`cupon-${key}`} error={control.errorDe(key)}>
            <Input id={`cupon-${key}`} type="datetime-local" className="max-w-[13rem]" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} onBlur={control.alSalir(key)} />
          </FormField>
        ))}
        <label className="block sm:col-span-2">
          Productos incluidos
          <span className="flex items-center gap-2">
            <ProductCombobox key={form.productId || 'todos'} className="flex-1" products={products} selectedId={form.productId} onSelect={product => setForm(current => ({ ...current, productId: product.id }))} placeholder="Todos los productos" />
            {form.productId && <button type="button" className="h-9 shrink-0 rounded-lg border border-ink-500 px-2 text-xs font-semibold text-mute transition hover:border-bad hover:text-bad" onClick={() => setForm(current => ({ ...current, productId: '' }))}>Quitar producto</button>}
          </span>
        </label>
      </div>
      <p className="text-sm text-mute">No acumulable con descuento global. Para cambiar condiciones, desactivá el cupón y creá otro código.</p>
      {control.mostrarResumen && !control.valido && <p role="alert" data-testid="promocion-motivos" className="text-xs font-semibold text-bad">{control.motivo}</p>}
      <SaveActions pendiente={busy}>
        <Button type="submit" disabled={busy || !control.valido} title={control.motivo || undefined}>Crear cupón</Button>
      </SaveActions>
    </form>
      {message && <p role="status" className="mt-2 text-sm text-bad">{message}</p>}
    </Popup>}
  </SellerSection>
}
