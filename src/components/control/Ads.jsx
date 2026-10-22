import { useCallback, useEffect, useState } from 'react'
import { listAds, addAds, deleteAds } from '@/lib/storage'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { fechaClave, num, gs } from '@/utils/calculos'
import { Aviso, Button, EmptyState, Input, Stat, Label, MoneyInput, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import Popup from '@/components/shared/Popup'
import StatGrid from '@/components/shared/StatGrid'
import BarraGestion from '@/components/shared/BarraGestion'

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

  const cargar = useCallback(async function cargar() {
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
  }, [demo, sucursal?.id])
  useEffect(() => { cargar() }, [cargar])

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
  const mesActual = fechaClave().slice(0, 7)
  const totalMesActual = porMes[mesActual]?.total || 0
  const promedioMensual = meses.length ? Math.round(total / meses.length) : 0

  const [tab, setTab] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)
  const plataformasUsadas = [...new Set(ads.map((a) => a.plataforma))]
  const visibles = ads.filter((a) => (tab === 'todas' || a.plataforma === tab) && (!busqueda.trim() || `${a.plataforma} ${a.nota || ''} ${a.fecha}`.toLowerCase().includes(busqueda.trim().toLowerCase())))
  const guardarYCerrar = (e) => { guardar(e); if (num(f.monto) > 0) setAbierto(false) }

  return (
    <div className="gp ventas-f3 space-y-3" data-testid="ads-pagina">
      <div className="gp-cabecera">
        <div className="min-w-0">
          <h2>Gasto en publicidad</h2>
          <p>Cargá cuánto invertís en ads: se descuenta en el tablero de ganancias para saber tu resultado real.{!demo && ' Se registra como gasto en Finanzas.'}</p>
        </div>
      </div>
      <BarraGestion
        etiqueta="Acciones de Publicidad"
        testId="barra-ads"
        buscar={busqueda}
        onBuscar={setBusqueda}
        placeholder="Plataforma, fecha o nota"
        ariaBuscar="Buscar inversiones"
        tabs={[['todas', 'Todas'], ...plataformasUsadas.map((p) => [p, p])]}
        tab={tab}
        onTab={setTab}
        etiquetaTabs="Plataforma"
        primary={<Button type="button" onClick={() => setAbierto(true)}>Nueva inversión</Button>}
      />
      <StatGrid testId="ads-resumen" etiqueta="Resumen de publicidad">
        <Stat compact testId="ads-total" label="Total invertido" valor={gs(total)} valorClassName="text-warn" />
        <Stat compact testId="ads-mes" label={mesLabel(mesActual)} valor={gs(totalMesActual)} />
        <Stat compact testId="ads-promedio" label="Promedio por mes" valor={gs(promedioMensual)} />
        <Stat compact testId="ads-inversiones" label="Inversiones cargadas" valor={ads.length} />
      </StatGrid>
      {error && <Aviso tono="error" className="p-3">{error}</Aviso>}
      {!demo && cargando && <p className="text-sm text-mute">Cargando inversiones…</p>}
      <Popup open={abierto} onClose={() => setAbierto(false)} title="Nueva inversión en publicidad" tamano="md">
        <form onSubmit={guardarYCerrar} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="monto">Monto</Label>
            <MoneyInput id="monto" value={f.monto} onValueChange={(monto) => setF((s) => ({ ...s, monto }))} placeholder="Ej: 150000" />
          </div>
          <div>
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" value={f.fecha} onChange={set('fecha')} />
          </div>
          <div>
            <Label htmlFor="plataforma">Plataforma</Label>
            <Select id="plataforma" value={f.plataforma} onChange={set('plataforma')}>
              {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="submit">Guardar inversión</Button>
          </div>
        </form>
      </Popup>
      <div className="gp-dos">
        <section className="gp-principal" aria-label="Historial de inversión">
          {ads.length === 0 ? (
            <EmptyState compact icon="box" title="Sin inversiones registradas." description="Cargá la primera inversión para ver el reporte mensual." />
          ) : visibles.length === 0 ? (
            <EmptyState compact icon="box" title="Ninguna inversión coincide" action={<Button type="button" variant="outline" onClick={() => { setBusqueda(''); setTab('todas') }}>Ver todas</Button>} />
          ) : (
            <div className="gp-lista" data-testid="ads-tabla">
              {visibles.map((a, indice) => (
                <div key={a.id} data-testid="ad-fila" style={{ '--i': Math.min(indice, 12) }} className="gp-fila">
                  <span className="gp-fila-main"><b className="gp-fila-titulo">{a.plataforma}</b><span className="gp-fila-sub">{a.fecha}{a.fecha ? ` · ${mesLabel(String(a.fecha).slice(0, 7))}` : ''}{a.nota ? ` · ${a.nota}` : ''}</span></span>
                  <span className="gp-fila-lado">
                    <b className="gp-fila-monto text-warn">{gs(a.monto)}</b>
                    {demo && <button onClick={() => borrar(a.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-mute transition hover:text-bad" title="Eliminar" aria-label={`Eliminar inversión de ${a.plataforma}`}><Icon name="trash" className="h-4 w-4" /></button>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        {meses.length > 0 && (
          <aside className="gp-lateral" aria-label="Reporte mensual">
            <div className="gp-tarjeta" data-testid="ads-meses-tabla">
              <h3 className="gp-tarjeta-titulo">Reporte mensual</h3>
              <div className="gp-tarjeta-cuerpo">
                <dl className="gp-datos">
                  {meses.map(([clave, { total: t, cant }]) => (
                    <div key={clave} data-testid="ads-mes-fila">
                      <dt className="capitalize">{mesLabel(clave)} · {cant} {cant === 1 ? 'inversión' : 'inversiones'}<span className="block text-xs">Promedio {gs(Math.round(t / Math.max(1, cant)))}</span></dt>
                      <dd className="text-warn">{gs(t)}</dd>
                    </div>
                  ))}
                  <div className="border-t border-ink-600 pt-2"><dt>Total general</dt><dd>{gs(total)}</dd></div>
                </dl>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
