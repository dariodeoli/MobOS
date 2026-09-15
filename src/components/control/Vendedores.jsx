import { useCallback, useEffect, useState } from 'react'
import {
  getVendedores,
  addVendedor,
  updateVendedor,
  deleteVendedor,
  listVentas,
  productosById,
} from '@/lib/storage'
import {
  totalesVendedor,
  ventasDelDia,
  comisionDeVentas,
  fechaClave,
  num,
  gs,
} from '@/utils/calculos'
import { Card, Button, ConfirmDialog, Input, Badge, Select, Skeleton, EmptyState, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'

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

export default function Vendedores() {
  const vendedores = getVendedores()
  const ventas = listVentas()
  const prods = productosById()
  const { esDemo, sesion } = useSesion()
  const [nuevo, setNuevo] = useState('')
  const [confirmarEliminar, setConfirmarEliminar] = useState(null)

  // Nombres por id (incluye vendedores ya eliminados que tienen ventas viejas).
  const nombreById = Object.fromEntries(vendedores.map((v) => [v.id, v.nombre]))

  // Agrupa ventas por mes y vendedor: { 'YYYY-MM': { vendedorId: [ventas] } }.
  const porMes = {}
  ventas.forEach((v) => {
    const mes = (v.fecha || '').slice(0, 7)
    if (!mes) return
    const vid = v.vendedorId || 'sin'
    if (!porMes[mes]) porMes[mes] = {}
    if (!porMes[mes][vid]) porMes[mes][vid] = []
    porMes[mes][vid].push(v)
  })
  const meses = Object.keys(porMes).sort().reverse()

  // Meses desplegados (abierto el más reciente por defecto).
  const [abiertos, setAbiertos] = useState(() => new Set(meses.slice(0, 1)))
  function toggleMes(mes) {
    setAbiertos((prev) => {
      const s = new Set(prev)
      s.has(mes) ? s.delete(mes) : s.add(mes)
      return s
    })
  }

  function crear(e) {
    e.preventDefault()
    const nombre = nuevo.trim()
    if (!nombre) return
    addVendedor(nombre)
    setNuevo('')
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-1">‍ Funcionarios y metas</h2>
        <p className="text-sm text-mute mb-4">
          Fijá la <strong>meta diaria</strong> de cada vendedor y agregá nuevos cuando contrates. La
          meta se guarda al salir del campo.
        </p>
        <form onSubmit={crear} className="flex gap-2 mb-4">
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nombre del nuevo vendedor"
            autoCapitalize="words"
          />
          <Button type="submit">Agregar</Button>
        </form>

        <div className="space-y-2.5">
          {vendedores.map((v) => {
            const t = totalesVendedor(ventas, v.id)
            const com = comisionDeVentas(ventasDelDia(ventas, fechaClave(), v.id), prods)
            return (
              <div key={v.id} className="rounded-xl border border-ink-600 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-ink-500 bg-ink-700" title="Agregar foto">
                      {v.foto ? <img src={v.foto} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-mute"><Icon name="user" className="h-4 w-4" /></span>}
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => updateVendedor(v.id, { foto: reader.result }); reader.readAsDataURL(file) }} />
                    </label>
                    <input
                      defaultValue={v.nombre}
                      onBlur={(e) => updateVendedor(v.id, { nombre: e.target.value.trim() || v.nombre })}
                      className="min-w-0 max-w-[12rem] font-bold text-sm bg-transparent outline-none border-b border-transparent focus:border-fono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateVendedor(v.id, { activo: !v.activo })}
                      className="text-xs"
                      title={v.activo ? 'Desactivar' : 'Activar'}
                    >
                      {v.activo ? (
                        <Badge color="green">Activo</Badge>
                      ) : (
                        <Badge color="slate">Inactivo</Badge>
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmarEliminar(v)}
                      className="text-ink-500 hover:text-bad text-sm transition"
                      title="Eliminar vendedor"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                  <label className="block col-span-2 md:col-span-1">
                    <span className="text-[10px] font-bold uppercase text-mute">Meta diaria ₲</span>
                    <Input
                      inputMode="numeric"
                      defaultValue={v.metaDiaria || ''}
                      onBlur={(e) => updateVendedor(v.id, { metaDiaria: num(e.target.value) })}
                      placeholder="0"
                    />
                  </label>
                  <Mini label="Hoy" valor={t.hoy} />
                  <Mini label="Comisión hoy" valor={com} />
                  <Mini label="Mes" valor={t.mes} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Historial mensual por vendedor */}
      {meses.length > 0 && (
        <Card>
          <h2 className="font-bold mb-1">Historial mensual por vendedor</h2>
          <p className="text-sm text-mute mb-4">
            Cuánto vendió cada uno y su <strong>comisión total</strong> en cada mes.
          </p>
          <div className="space-y-4">
            {meses.map((mes) => {
              const filas = Object.entries(porMes[mes])
                .map(([vid, lista]) => ({
                  vid,
                  nombre: nombreById[vid] || 'Sin vendedor',
                  total: lista.reduce((a, x) => a + num(x.precio), 0),
                  com: comisionDeVentas(lista, prods),
                  cant: lista.length,
                }))
                .sort((a, b) => b.total - a.total)
              const totalMes = filas.reduce((a, f) => a + f.total, 0)
              const comMes = filas.reduce((a, f) => a + f.com, 0)

              const abierto = abiertos.has(mes)
              return (
                <div key={mes} className="rounded-xl border border-ink-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleMes(mes)}
                    className="w-full flex items-center justify-between gap-2 bg-ink-700 px-4 py-2.5 hover:bg-ink-700 transition text-left"
                  >
                    <span className="flex items-center gap-2 font-bold text-sm capitalize">
                      <span className="text-mute text-xs">{abierto ? '▼' : '▶'}</span>
                      {mesLabel(mes)}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge color="blue">Vendido {gs(totalMes)}</Badge>
                      <Badge color="green">Comisión {gs(comMes)}</Badge>
                    </div>
                  </button>
                  {abierto && (
                    <div className="divide-y divide-ink-600 border-t border-ink-600">
                      {filas.map((f) => (
                        <div
                          key={f.vid}
                          className="flex items-center justify-between gap-2 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{f.nombre}</div>
                            <div className="text-xs text-mute">
                              {f.cant} {f.cant === 1 ? 'venta' : 'ventas'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-sm">
                            <span className="font-bold text-fono">{gs(f.total)}</span>
                            <Badge color="green">Comisión {gs(f.com)}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
      {!esDemo && sesion?.esPropietario && <SeccionComisiones />}
      <ConfirmDialog
        open={Boolean(confirmarEliminar)}
        onCancel={() => setConfirmarEliminar(null)}
        onConfirm={() => { deleteVendedor(confirmarEliminar.id); setConfirmarEliminar(null) }}
        title="¿Eliminar vendedor?"
        description={`Se eliminará a ${confirmarEliminar?.nombre || 'este vendedor'}. Las ventas ya registradas se conservan en el historial.`}
        confirmLabel="Eliminar vendedor"
        variant="danger"
      />
    </div>
  )
}

function Mini({ label, valor }) {
  return (
    <div className="text-center rounded-lg bg-ink-700 py-2">
      <div className="text-[10px] font-bold uppercase text-mute">{label}</div>
      <div className="text-sm font-bold text-fono">{gs(valor)}</div>
    </div>
  )
}

function SeccionComisiones() {
  const toast = useToast()
  const [reglas, setReglas] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [nueva, setNueva] = useState({ userId: '', percentPyg: '' })
  const [editandoId, setEditandoId] = useState(null)
  const [borrador, setBorrador] = useState('')
  const [eliminando, setEliminando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [nextReglas, nextUsuarios] = await Promise.all([api.get('/api/commission-rules'), api.get('/api/users')])
      setReglas(nextReglas || [])
      setUsuarios(nextUsuarios || [])
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar las reglas de comisión.') }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function crear(event) {
    event.preventDefault()
    if (!nueva.userId || ocupado) return
    setOcupado(true); setError('')
    try {
      await api.post('/api/commission-rules', { userId: nueva.userId, percentPyg: Number(nueva.percentPyg) })
      setNueva({ userId: '', percentPyg: '' })
      toast.success('Regla de comisión creada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo crear la regla.') } finally { setOcupado(false) }
  }

  async function guardar(regla) {
    const percent = Number(borrador)
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) { setError('El porcentaje debe ser un entero entre 0 y 100.'); return }
    setOcupado(true); setError('')
    try {
      await api.patch('/api/commission-rules', { id: regla.id, percentPyg: percent })
      setEditandoId(null)
      toast.success('Regla de comisión actualizada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar la regla.') } finally { setOcupado(false) }
  }

  async function confirmarEliminar() {
    setOcupado(true); setError('')
    try {
      await api.delete('/api/commission-rules', { body: { id: eliminando.id } })
      setEliminando(null)
      toast.success('Regla de comisión eliminada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo eliminar la regla.') } finally { setOcupado(false) }
  }

  const nombreUsuario = id => usuarios.find(usuario => usuario.id === id)?.name || 'Usuario eliminado'

  return (
    <Card>
      <h2 className="font-bold mb-1">Comisiones</h2>
      <p className="text-sm text-mute mb-4">
        Reglas de comisión sobre el <strong>margen</strong> de cada venta. La regla por usuario prevalece sobre la de rol.
      </p>
      <form onSubmit={crear} className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <span className="block text-[10px] font-bold uppercase text-mute mb-1">Vendedor</span>
          <Select value={nueva.userId} onChange={event => setNueva({ ...nueva, userId: event.target.value })} required>
            <option value="">Elegí el vendedor</option>
            {usuarios.map(usuario => <option key={usuario.id} value={usuario.id}>{usuario.name} · {usuario.role}</option>)}
          </Select>
        </div>
        <div className="sm:w-36">
          <span className="block text-[10px] font-bold uppercase text-mute mb-1">% comisión</span>
          <Input inputMode="numeric" min={0} max={100} value={nueva.percentPyg} onChange={event => setNueva({ ...nueva, percentPyg: event.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="0" required />
        </div>
        <Button type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Agregar regla'}</Button>
      </form>
      {error && <p role="alert" className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {reglas === null ? (
        <div className="space-y-2" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : reglas.length === 0 ? (
        <EmptyState compact icon="tag" title="Sin reglas de comisión." description="Agregá una regla para empezar a calcular comisiones por margen." />
      ) : (
        <div className="space-y-2">
          {reglas.map(regla => (
            <div key={regla.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{regla.userId ? (regla.user?.name || nombreUsuario(regla.userId)) : `Rol ${regla.role}`}</div>
                <div className="mt-0.5 text-xs text-mute">{regla.userId ? 'Regla por usuario' : 'Regla por rol'}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editandoId === regla.id ? (
                  <>
                    <Input inputMode="numeric" value={borrador} onChange={event => setBorrador(event.target.value.replace(/\D/g, '').slice(0, 3))} className="h-8 w-20 px-2 text-right text-sm" aria-label="Porcentaje de comisión" />
                    <Button type="button" variant="success" disabled={ocupado} className="h-8 px-2 text-xs" onClick={() => guardar(regla)}>Guardar</Button>
                    <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setEditandoId(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <Badge color="green">{regla.percentPyg}%</Badge>
                    <button type="button" onClick={() => { setEditandoId(regla.id); setBorrador(String(regla.percentPyg)) }} className="text-mute hover:text-white transition" title="Editar porcentaje"><Icon name="edit" className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEliminando(regla)} className="text-ink-500 hover:text-bad transition" title="Eliminar regla"><Icon name="trash" className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(eliminando)}
        onCancel={() => setEliminando(null)}
        onConfirm={confirmarEliminar}
        busy={ocupado}
        title="¿Eliminar regla?"
        description="La regla dejará de aplicarse al calcular comisiones. Las ventas ya calculadas no cambian."
        confirmLabel="Eliminar regla"
        variant="danger"
      />
    </Card>
  )
}
