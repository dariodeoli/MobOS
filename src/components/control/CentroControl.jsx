import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ESTADOS_CELULAR, addCelular, cargarLineupIphone, deleteCelular, deleteComparadorImagen, listCelulares, listComparadorImagenes, modoDatosActual, rankCelular, setComparadorImagen, updateCelular } from '@/lib/storage'
import { procesarImagenComparador } from '@/utils/imagen'
import { useLive } from '@/hooks/useLive'
import { Badge, Button, Card, EmptyState, IconAction, Label, MoneyInput, Select, Subtabs, useToast } from '@/components/ui'
import BarraModulo from '@/components/shared/BarraModulo'
import SegmentosToolbar from '@/components/app/SegmentosToolbar'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import AttachmentInput from '@/components/shared/AttachmentInput'
import PopupConfirmar from '@/components/shared/PopupConfirmar'
import ModeloCatalogoField from '@/components/shared/ModeloCatalogoField'
import CampoVarianteCatalogo from '@/components/shared/CampoVarianteCatalogo'
import { capacidadesDeModelo, coloresDeModelo, modeloApple } from '../../../backend/lib/catalogo-apple.mjs'

// #303 · Centro de Control: el lugar donde se cargan los datos que consumen
// Lista por modelo y Comparador —la lista de precios por modelo y las fotos
// reales—. Antes esas pantallas lo mencionaban y no existía forma de llegar:
// ahora tiene entrada en el menú, en la búsqueda global y enlaces contextuales
// desde ambas. La administración vive en la capa local (demo); en una cuenta
// API la pantalla lo explica con honestidad en lugar de fallar.

const TEMA = {
  Nuevo: { titulo: 'Nuevos', badge: 'green' },
  Seminuevo: { titulo: 'Semi-nuevos', badge: 'orange' },
}

const VACIO = () => ({ modelo: '', capacidad: '', color: '', estado: 'Nuevo', precio: '' })
const precioNum = (valor) => Number(String(valor ?? '').replace(/[^\d]/g, '')) || 0
const nuevoKey = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))

function SinApi() {
  const navigate = useNavigate()
  return (
    <div className="space-y-4">
      <BarraModulo titulo="Centro de Control" testId="barra-centro-control" segmentos={<SegmentosToolbar />} />
      <Card className="mx-auto max-w-2xl p-5" data-testid="centro-control-sin-api">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-fono/10 text-fono-light">
          <Icon name="info" className="h-5 w-5" />
        </span>
        <h2 className="mt-3 text-base font-semibold">Centro de Control en cuentas reales</h2>
        <p className="mt-1 text-sm text-mute">
          La lista por modelo y las fotos del comparador se administran en la demo; la versión con API todavía está pendiente.
          Mientras tanto, el catálogo real se carga desde Productos.
        </p>
        <div className="mt-3">
          <Button variant="outline" onClick={() => navigate('/productos')}>Ir a Productos</Button>
        </div>
      </Card>
    </div>
  )
}

function SeccionCelulares() {
  const toast = useToast()
  const celulares = listCelulares()
  const [form, setForm] = useState(VACIO)
  const [draft, setDraft] = useState({})
  const [aBorrar, setABorrar] = useState(null)
  // Capacidad y color salen del modelo elegido (`CampoVarianteCatalogo`); un
  // modelo fuera del catálogo (escrito a mano) vuelve a los campos de texto.
  function cambiarModelo(modelo) {
    setForm(actual => ({
      ...actual,
      modelo,
      capacidad: capacidadesDeModelo(modelo).includes(actual.capacidad) ? actual.capacidad : '',
      color: coloresDeModelo(modelo).includes(actual.color) ? actual.color : '',
    }))
  }

  const cambios = Object.entries(draft).filter(([id, valor]) => {
    const actual = celulares.find(c => c.id === id)
    return actual && precioNum(valor) !== precioNum(actual.precio)
  })

  function agregar(event) {
    event.preventDefault()
    try {
      addCelular({ ...form, precio: precioNum(form.precio) })
      toast.success('Modelo agregado', `${form.modelo} ${form.capacidad} entra a la lista.`)
      setForm(VACIO())
    } catch (causa) {
      toast.error('No se pudo agregar', causa?.message || 'Revisá modelo y capacidad.')
    }
  }

  function guardarPrecios() {
    cambios.forEach(([id, valor]) => updateCelular(id, { precio: precioNum(valor) }))
    toast.success(`${cambios.length} precio(s) guardados`, 'La Lista por modelo ya los muestra.')
    setDraft({})
  }

  function cargarLineup() {
    const agregados = cargarLineupIphone()
    if (agregados) toast.success(`${agregados} modelo(s) iPhone agregados`, 'Completales el precio para que salgan en la lista.')
    else toast.info('Ya estaban todos cargados.')
  }

  function eliminar() {
    if (!aBorrar) return
    deleteCelular(aBorrar.id)
    toast.success('Modelo eliminado', aBorrar.texto)
    setABorrar(null)
  }

  const ordenados = [...celulares].sort(
    (a, b) => rankCelular(a.modelo) - rankCelular(b.modelo) || String(a.capacidad).localeCompare(String(b.capacidad)),
  )

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5" data-testid="centro-celulares">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Lista de precios de celulares</h2>
            <p className="mt-1 text-sm text-mute">
              Cargá el modelo, la capacidad, el color y el precio en ₲; Lista por modelo y Comparador salen de acá.
              Parado en esta pantalla podés pegar varios precios y guardarlos juntos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {celulares.length > 0 && <Badge color="slate">{celulares.length} modelo(s)</Badge>}
            <Button type="button" variant="outline" onClick={cargarLineup} data-testid="cargar-lineup">
              <Icon name="refresh" className="h-3.5 w-3.5" />Cargar modelos iPhone
            </Button>
          </div>
        </div>

        <form onSubmit={agregar} className="mt-4 grid grid-cols-2 items-end gap-2 md:grid-cols-6 xl:grid-cols-12" data-testid="form-celular">
          <div className="col-span-2 md:col-span-6 xl:col-span-4">
            <Label htmlFor="cc-modelo">Modelo</Label>
            <ModeloCatalogoField id="cc-modelo" familia="iPhone" value={form.modelo} onChange={cambiarModelo} placeholder="Buscar modelo (ej. 15 pro max)" testId="cc-modelo" />
          </div>
          <div className="md:col-span-3 xl:col-span-2">
            <Label htmlFor="cc-capacidad">Capacidad</Label>
            <CampoVarianteCatalogo id="cc-capacidad" campo="capacidad" modelo={form.modelo} value={form.capacidad} onChange={capacidad => setForm(actual => ({ ...actual, capacidad }))} disabled={!form.modelo} placeholder={form.modelo ? '256GB' : 'Elegí el modelo'} />
          </div>
          <div className="md:col-span-3 xl:col-span-2">
            <Label htmlFor="cc-color">Color</Label>
            <CampoVarianteCatalogo id="cc-color" campo="color" modelo={form.modelo} value={form.color} onChange={color => setForm(actual => ({ ...actual, color }))} vacio="Sin color" disabled={!form.modelo} placeholder={form.modelo ? 'Color' : 'Elegí el modelo'} />
          </div>
          <div className="md:col-span-3 xl:col-span-2">
            <Label htmlFor="cc-estado">Condición</Label>
            <Select id="cc-estado" value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
              {ESTADOS_CELULAR.map(estado => <option key={estado} value={estado}>{estado}</option>)}
            </Select>
          </div>
          <div className="md:col-span-3 xl:col-span-2">
            <Label htmlFor="cc-precio">Precio ₲</Label>
            <MoneyInput id="cc-precio" value={form.precio} onValueChange={precio => setForm(actual => ({ ...actual, precio }))} placeholder="0" className="w-full" />
          </div>
          <Button type="submit" className="col-span-2 md:col-span-6 xl:col-span-12">Agregar modelo</Button>
        </form>
      </Card>

      {cambios.length > 0 && (
        <div role="status" className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2" data-testid="precios-sin-guardar">
          <span className="text-sm font-medium text-warn">● {cambios.length} precio(s) sin guardar</span>
          <span className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => setDraft({})}>Descartar</Button>
            <Button type="button" onClick={guardarPrecios} data-testid="guardar-precios">Guardar</Button>
          </span>
        </div>
      )}

      {!celulares.length ? (
        <EmptyState
          icon="phone"
          title="Todavía no hay modelos cargados."
          description="Sumá uno con el formulario o cargá los modelos iPhone y completá los precios."
        />
      ) : (
        (['Nuevo', 'Seminuevo']).map(estado => {
          const items = ordenados.filter(c => c.estado === estado)
          if (!items.length) return null
          const tema = TEMA[estado] || TEMA.Nuevo
          const sinPrecio = items.filter(c => !precioNum(c.precio)).length
          return (
            <section key={estado} className="space-y-2" data-testid={`seccion-${estado.toLowerCase()}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{tema.titulo} <span className="font-normal text-mute">({items.length})</span></h3>
                {sinPrecio > 0 && <Badge color="orange">{sinPrecio} sin precio</Badge>}
              </div>
              <ul className="space-y-1.5">
                {items.map(c => (
                  <li key={c.id} data-testid="fila-celular" className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2">
                    {/* En celular el modelo ocupa su renglón y abajo van estado, precio y borrar. */}
                    <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                      <b className="text-sm">{c.modelo}</b>
                      <span className="text-sm text-mute"> · {c.capacidad}{c.color ? ` · ${c.color}` : ''}</span>
                    </div>
                    <Badge color={tema.badge}>{c.estado}</Badge>
                    <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                      <MoneyInput
                        aria-label={`Precio de ${c.modelo} ${c.capacidad}${c.color ? ` ${c.color}` : ''}`}
                        value={draft[c.id] !== undefined ? draft[c.id] : (c.precio || '')}
                        onValueChange={precio => setDraft(actual => ({ ...actual, [c.id]: precio }))}
                        placeholder="precio"
                        className={cn('w-full', c.precio > 0 ? '' : 'border-warn/40')}
                      />
                    </div>
                    <IconAction icon="trash" tone="bad" label={`Eliminar ${c.modelo} ${c.capacidad}`} onClick={() => setABorrar({ id: c.id, texto: `${c.modelo} ${c.capacidad}` })} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}

      <PopupConfirmar
        open={Boolean(aBorrar)}
        title="¿Eliminar el modelo?"
        description={aBorrar ? `${aBorrar.texto} sale de la Lista por modelo y del Comparador.` : ''}
        confirmLabel="Eliminar modelo"
        variant="danger"
        onConfirm={eliminar}
        onCancel={() => setABorrar(null)}
      />
    </div>
  )
}

function SeccionImagenes() {
  const toast = useToast()
  const [pendientes, setPendientes] = useState([])
  const [procesando, setProcesando] = useState(false)
  const [aBorrar, setABorrar] = useState(null)

  const registros = listComparadorImagenes()

  async function agregarArchivo(file) {
    setProcesando(true)
    try {
      const src = await procesarImagenComparador(file)
      setPendientes(acumuladas => [...acumuladas, { key: nuevoKey(), src, modelo: '', color: '' }])
    } catch {
      toast.error('No se pudo procesar la imagen', 'Probá con otra foto (JPG, PNG o WebP).')
    } finally {
      setProcesando(false)
    }
  }

  function guardarImagenes() {
    const completas = pendientes.filter(p => modeloApple(p.modelo) && p.color.trim() && p.src)
    if (!completas.length) {
      toast.error('Faltan datos', 'Elegí el modelo y el color de al menos una foto.')
      return
    }
    completas.forEach(p => setComparadorImagen(p.modelo, p.color, p.src))
    toast.success(`${completas.length} foto(s) guardadas`, 'El Comparador las muestra en lugar de la maqueta.')
    setPendientes(actuales => actuales.filter(p => !(modeloApple(p.modelo) && p.color.trim() && p.src)))
  }

  function eliminar() {
    if (!aBorrar) return
    deleteComparadorImagen(aBorrar.id)
    toast.success('Foto eliminada', `${aBorrar.modelo} · ${aBorrar.color}`)
    setABorrar(null)
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5" data-testid="centro-imagenes">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Fotos reales del Comparador</h2>
            <p className="mt-1 text-sm text-mute">
              Subí una foto por modelo y color; donde no haya foto, el Comparador muestra la maqueta con el color elegido.
            </p>
          </div>
          <AttachmentInput
            onSelect={agregarArchivo}
            onError={(mensaje) => toast.error('No se pudo usar la foto', mensaje)}
            accept="image/jpeg,image/png,image/webp"
            disabled={procesando}
            data-testid="input-fotos"
          >
            <Button type="button" variant="outline" disabled={procesando} data-testid="subir-fotos">
              <Icon name="image" className="h-4 w-4" />{procesando ? 'Procesando…' : 'Subir foto'}
            </Button>
          </AttachmentInput>
        </div>

        {!pendientes.length && !registros.length && (
          <p className="mt-3 text-xs text-mute">Todavía no hay fotos: las que subas quedan listas para el Comparador.</p>
        )}

        {pendientes.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-ink-600 pt-3" data-testid="fotos-pendientes">
            <p className="text-xs font-semibold uppercase tracking-wider text-mute">Sin guardar</p>
            {pendientes.map(p => (
              <div key={p.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2">
                <img src={p.src} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-ink-600 object-contain" />
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`foto-modelo-${p.key}`}>Modelo</Label>
                  <ModeloCatalogoField id={`foto-modelo-${p.key}`} familia="iPhone" value={p.modelo} testId={`foto-modelo-${p.key}`} onChange={modelo => setPendientes(actuales => actuales.map(x => x.key === p.key ? { ...x, modelo, color: coloresDeModelo(modelo).includes(x.color) ? x.color : '' } : x))} />
                </div>
                <div className="w-full sm:w-48">
                  <Label htmlFor={`foto-color-${p.key}`}>Color</Label>
                  <CampoVarianteCatalogo id={`foto-color-${p.key}`} campo="color" modelo={p.modelo} value={p.color} disabled={!modeloApple(p.modelo)} onChange={color => setPendientes(actuales => actuales.map(x => x.key === p.key ? { ...x, color } : x))} placeholder="Elegí el modelo" />
                </div>
                <IconAction icon="trash" tone="bad" label="Quitar la foto" onClick={() => setPendientes(actuales => actuales.filter(x => x.key !== p.key))} />
              </div>
            ))}
            <div className="flex justify-end">
              <Button type="button" onClick={guardarImagenes} data-testid="guardar-fotos">Guardar fotos</Button>
            </div>
          </div>
        )}
      </Card>

      {registros.length > 0 && (
        <section className="space-y-2" data-testid="fotos-guardadas">
          <h3 className="font-semibold">Fotos guardadas <span className="font-normal text-mute">({registros.length})</span></h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {[...registros].sort((a, b) => rankCelular(a.modelo) - rankCelular(b.modelo)).map(foto => (
              <article key={foto.id} className="rounded-xl border border-ink-600 bg-ink-800 p-2" data-testid="foto-guardada">
                <img src={foto.img} alt={`${foto.modelo} ${foto.color}`} className="h-28 w-full rounded-lg object-contain" />
                <p className="mt-2 truncate text-xs font-semibold" title={`${foto.modelo} · ${foto.color}`}>{foto.modelo}</p>
                <p className="flex items-center justify-between gap-1 text-xs text-mute">
                  <span className="truncate" title={foto.color}>{foto.color}</span>
                  <IconAction icon="trash" tone="bad" label={`Eliminar la foto de ${foto.modelo} ${foto.color}`} onClick={() => setABorrar(foto)} />
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <PopupConfirmar
        open={Boolean(aBorrar)}
        title="¿Eliminar la foto?"
        description={aBorrar ? `${aBorrar.modelo} · ${aBorrar.color} vuelve a mostrar la maqueta en el Comparador.` : ''}
        confirmLabel="Eliminar foto"
        variant="danger"
        onConfirm={eliminar}
        onCancel={() => setABorrar(null)}
      />
    </div>
  )
}

export default function CentroControl() {
  useLive()
  const apiMode = modoDatosActual() === 'api'
  const [params, setParams] = useSearchParams()
  const seccion = params.get('seccion') === 'imagenes' ? 'imagenes' : 'celulares'

  if (apiMode) return <SinApi />

  return (
    <div className="space-y-4">
      <BarraModulo titulo="Centro de Control" testId="barra-centro-control" segmentos={<SegmentosToolbar />} />
      <Subtabs
        value={seccion}
        onChange={(id) => setParams(id === 'imagenes' ? { seccion: 'imagenes' } : {}, { replace: true })}
        items={[['celulares', 'Celulares'], ['imagenes', 'Imágenes']]}
        ariaLabel="Secciones del Centro de Control"
      />
      {seccion === 'imagenes' ? <SeccionImagenes /> : <SeccionCelulares />}
    </div>
  )
}
