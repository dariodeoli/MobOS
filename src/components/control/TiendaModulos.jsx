import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { Aviso, Badge, Button, Card, ConfirmDialog, Input, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'

const CATEGORIAS = ['Todas', 'Operación', 'Finanzas', 'Clientes', 'Mensajes', 'IMEI', 'Comercial', 'Automatización', 'Facturación', 'Reportes', 'Salud', 'Configuración']
const RUBRO = { comercio: 'Comercio', servicios: 'Servicios', salud: 'Salud' }
const TIPO = { core: 'Core', configurable: 'Configurable', catalogOnly: 'Solo catálogo', integration: 'Integración', sensitive: 'Sensible', specialized: 'Especializado' }

export default function TiendaModulos() {
  const { esDemo } = useSesion()
  const [data, setData] = useState(null)
  const [categoria, setCategoria] = useState('Todas')
  const [soloActivos, setSoloActivos] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [presetPending, setPresetPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cargar = useCallback(async () => {
    setError('')
    try { setData(await api.get('/api/tenant/modules')) }
    catch (cause) { setError(cause?.message || 'No se pudo cargar la tienda de módulos.') }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const modules = useMemo(() => (data?.catalog || []).filter(module =>
    (categoria === 'Todas' || module.category === categoria)
    && (!soloActivos || data?.state?.modules?.[module.id]?.enabled)
    && `${module.name} ${module.description}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')),
  ), [data, categoria, soloActivos, busqueda])

  async function cambiar(change) {
    if (busy || !data?.canManage || esDemo) return
    setBusy(true); setError('')
    try {
      const result = await api.put('/api/tenant/modules', change)
      setData(current => ({ ...current, state: result.state }))
      window.dispatchEvent(new CustomEvent('mobos:module-store-updated', { detail: result.state }))
    } catch (cause) { setError(cause?.message || 'No se pudo guardar el cambio.') }
    finally { setBusy(false) }
  }

  const aplicarPreset = (preset) => {
    if (!preset || preset === data?.state?.preset) return
    const cambios = (data?.catalog || []).filter(module => !module.core && module.status === 'available')
      .filter(module => Boolean(module.recommendedFor.includes(preset)) !== Boolean(data?.state?.modules?.[module.id]?.enabled))
    if (cambios.some(module => data?.state?.modules?.[module.id]?.enabled)) {
      setPresetPending(preset)
      return
    }
    cambiar({ preset })
  }

  if (!data && !error) return <Card className="p-4 text-sm text-mute">Cargando tienda de módulos…</Card>
  return <div className="space-y-3" data-testid="tienda-modulos">
    {error && <Aviso tono="error" role="alert" className="p-3 rounded-xl">{error}</Aviso>}
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="font-semibold">Tienda de módulos</h2><p className="mt-1 text-sm text-mute">Descubrí capacidades para tu empresa. Al desactivar un módulo se oculta su acceso; sus datos e historial se conservan.</p></div>
        <div className="flex flex-wrap gap-1"><Badge color="blue">Preset: {RUBRO[data?.state?.preset] || 'Comercio'}</Badge><Badge color="slate">Catálogo v{data?.catalogVersion || 1}</Badge></div>
      </div>
      <div className="grid gap-2 rounded-xl border border-ink-600 p-3 text-xs text-mute sm:grid-cols-2">
        <p><b className="text-fore">Packs sugeridos por rubro:</b> Comercio (ventas, inventario, mensajes e impresión), Servicios (clientes, órdenes e impresión; plantillas opcionales) y Salud (clientes y reportes; el módulo Salud sigue en preparación). El preset cambia accesos, nunca borra registros.</p>
        <p><b className="text-fore">Plantillas existentes:</b> WhatsApp organiza pedidos, clientes, servicios y cobranzas. Vista previa y catálogo no envían mensajes. Packs por rubro se presentan como referencia; su instalación versionada y selección predeterminada siguen pendientes.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto] sm:items-end">
        <label className="space-y-1 text-xs text-mute"><span>Buscar</span><Input aria-label="Buscar módulos" value={busqueda} onChange={event => setBusqueda(event.target.value)} placeholder="Nombre o descripción" /></label>
        <label className="space-y-1 text-xs text-mute"><span>Preset recomendado</span><Select aria-label="Preset por rubro" value={data?.state?.preset || 'comercio'} onChange={event => aplicarPreset(event.target.value)} disabled={busy || !data?.canManage || esDemo}>{(data?.presets || []).map(preset => <option key={preset} value={preset}>{RUBRO[preset] || preset}</option>)}</Select></label>
        <Button variant={soloActivos ? 'primary' : 'outline'} onClick={() => setSoloActivos(value => !value)} aria-pressed={soloActivos}> {soloActivos ? 'Ver todos' : 'Solo activos'}</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por categoría">{CATEGORIAS.map(item => <Button key={item} size="sm" variant={categoria === item ? 'primary' : 'outline'} className="shrink-0" onClick={() => setCategoria(item)} aria-pressed={categoria === item}>{item}</Button>)}</div>
    </Card>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map(module => {
        const state = data?.state?.modules?.[module.id]
        const enabled = Boolean(state?.enabled)
        const canToggle = data?.canManage && !esDemo && module.changeable === true && module.status === 'available'
        const missing = module.dependencies.filter(id => !data?.state?.modules?.[id]?.enabled)
        return <Card key={module.id} className="flex min-w-0 flex-col gap-3 p-4" data-testid={`modulo-card-${module.id}`}>
          <div className="flex items-start gap-3"><div className="rounded-lg bg-fono/10 p-2 text-fono-light"><Icon name={module.icon} className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{module.name}</h3>{module.kind && <Badge color={module.kind === 'sensitive' ? 'orange' : module.kind === 'core' ? 'green' : 'slate'}>{TIPO[module.kind] || module.kind}</Badge>}{state?.source === 'manual' && <Badge color="blue">Manual</Badge>}{module.status === 'coming-soon' && <Badge color="slate">Próximamente</Badge>}</div><p className="mt-1 text-xs text-mute">{module.category} · {module.tier === 'pro' ? 'Pro' : 'Incluido'}</p></div></div>
          <p className="text-sm text-mute">{module.description}</p>
          {module.benefits?.length > 0 && <ul className="list-inside list-disc space-y-1 text-xs text-mute">{module.benefits.map(item => <li key={item}>{item}</li>)}</ul>}
          <p className="text-xs text-mute">Recomendado: {module.recommendedFor.map(id => RUBRO[id]).join(', ') || '—'}{module.dependencies.length ? ` · Requiere: ${module.dependencies.map(id => data.catalog.find(item => item.id === id)?.name || id).join(', ')}` : ''}</p>
          {module.capabilities?.length > 0 && <div className="flex flex-wrap gap-1">{module.capabilities.map(item => <Badge key={item} color="slate">{item}</Badge>)}</div>}
          {module.packs?.length > 0 && <div className="rounded-lg border border-ink-600 p-2"><p className="text-xs font-semibold">Packs sugeridos (preview)</p><div className="mt-1 space-y-1">{module.packs.map(pack => <p key={pack.id} className="text-xs text-mute"><b className="text-fore">{pack.name}:</b> {pack.includes.join(' · ')}</p>)}</div></div>}
          <div data-testid={`modulo-preview-${module.id}`} aria-label={`Vista previa de ${module.name}`} className="rounded-xl border border-ink-600 bg-ink-950/30 p-3">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-mute"><span>Vista previa</span><Badge color="slate">Demo</Badge></div>
            <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/50 p-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-fono/10 text-fono-light"><Icon name={module.icon} className="h-4 w-4" /></span><span className="min-w-0"><b className="block truncate text-xs text-fore">{module.preview}</b><span className="mt-0.5 block text-[11px] text-mute">{module.demo}</span></span></div>
            <p className="mt-2 text-[11px] text-mute">No modifica datos ni ejecuta acciones reales.</p>
          </div>
          {!module.core && module.changeable === false && module.status === 'available' && <p className="rounded-lg border border-ink-600 p-2 text-xs text-mute">El editor existente sigue disponible. Su control central se habilitará cuando también estén protegidas todas sus acciones de servidor.</p>}
          {module.id === 'salud' && <Aviso tono="warn" como="div" className="p-2 text-xs">Podría involucrar datos sensibles de salud. La función aún no está disponible.</Aviso>}
          {state?.updatedAt && <p className="text-[11px] text-mute">{state.source === 'manual' ? 'Selección manual' : `Preset ${RUBRO[data.state.preset]}`} · actualizado {new Date(state.updatedAt).toLocaleDateString('es-PY')}</p>}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-ink-600 pt-3"><span className="text-sm">{module.status === 'coming-soon' ? 'Próximamente' : enabled ? 'Activo' : 'Desactivado'}</span><div className="flex flex-wrap gap-2">{module.configureHref && <Link to={module.configureHref} className="inline-flex min-h-9 items-center rounded-lg border border-ink-500 px-3 text-xs font-semibold text-fono-light hover:bg-ink-700">Abrir editor</Link>}<Button className="min-h-9 px-3 text-xs" variant={enabled ? 'outline' : 'primary'} disabled={!canToggle || busy || (!enabled && missing.length > 0)} onClick={() => cambiar({ moduleId: module.id, enabled: !enabled })} title={module.core ? 'Los módulos core siempre están activos' : module.changeable === false ? 'Control central pendiente de guardas de servidor' : missing.length ? `Activá primero: ${missing.join(', ')}` : undefined}>{module.core ? 'Siempre activo' : module.status === 'coming-soon' ? 'Próximamente' : module.changeable === false ? 'Control pendiente' : enabled ? 'Desactivar' : 'Activar'}</Button></div></div>
        </Card>
      })}
      {!modules.length && <Card className="p-5 text-sm text-mute">No hay módulos que coincidan con estos filtros.</Card>}
    </div>

    <ConfirmDialog open={Boolean(presetPending)} onCancel={() => setPresetPending(null)} onConfirm={() => { const preset = presetPending; setPresetPending(null); cambiar({ preset }) }} title={`¿Aplicar el preset ${RUBRO[presetPending] || ''}?`} description="Puede ocultar módulos del menú. Los registros y configuraciones históricas se conservan; podés volver a activar cada módulo o elegir otro preset." confirmLabel="Aplicar preset" />
  </div>
}
