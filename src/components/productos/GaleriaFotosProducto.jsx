import { useCallback, useEffect, useRef, useState } from 'react'
import { Aviso, Button } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import FotoProducto from '@/components/shared/FotoProducto'
import { fotosProducto } from '@/lib/api/productImages'
import { ACEPTA_FOTO, MAX_FOTOS_PRODUCTO, moverFoto, prepararFotoProducto, reubicarFoto, validarArchivoFoto } from '@/utils/fotoProducto'
import { cn } from '@/lib/utils'

// #404: fotos de un producto. Con `productId` cada cambio va al servidor al
// instante; sin él (alta de producto) las fotos quedan preparadas en el
// navegador y `onChange` las entrega para subirlas apenas exista el producto
// (`subirFotosPendientes`). Recorte cuadrado y WebP en el cliente; soltar
// archivos, elegir del celular o sacar con la cámara.
export async function subirFotosPendientes(productId, items) {
  const locales = (items || []).filter((item) => item.local)
  const subidas = []
  for (const item of locales) subidas.push(await fotosProducto.upload(productId, item.local))
  // La principal elegida entre las pendientes viaja con un PATCH al final.
  const principal = locales.findIndex((item) => item.isPrimary)
  if (principal > 0 && subidas[principal]) await fotosProducto.setPrimary(productId, subidas[principal].id)
  return subidas
}

export default function GaleriaFotosProducto({ productId = null, puedeEditar = true, onChange, onCambio, className }) {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(Boolean(productId))
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  const [elegida, setElegida] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const [origenArrastre, setOrigenArrastre] = useState('')
  const entrada = useRef(null)
  const camara = useRef(null)
  const itemsRef = useRef(items)
  itemsRef.current = items

  const aplicar = useCallback((lista) => {
    setItems(lista.map((foto) => ({ id: foto.id, src: foto.thumbUrl || foto.url, isPrimary: foto.isPrimary })))
  }, [])

  const cargar = useCallback(async () => {
    if (!productId) return
    setCargando(true); setError('')
    try { aplicar(await fotosProducto.list(productId)) } catch (cause) {
      console.error('[fotos-producto] no se pudieron cargar', cause)
      setError(cause?.message || 'No se pudieron cargar las fotos.')
    } finally { setCargando(false) }
  }, [productId, aplicar])
  useEffect(() => { cargar() }, [cargar])

  // Alta de producto: las fotos preparadas se entregan al padre.
  useEffect(() => { if (!productId) onChange?.(items) }, [items, productId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    if (!productId) itemsRef.current.forEach((item) => item.local && URL.revokeObjectURL(item.src))
  }, [productId])

  async function agregar(archivos) {
    const lista = [...archivos]
    if (!lista.length || ocupado) return
    setError('')
    const cupo = MAX_FOTOS_PRODUCTO - itemsRef.current.length
    if (cupo <= 0) { setError(`Un producto admite hasta ${MAX_FOTOS_PRODUCTO} fotos.`); return }
    const aceptadas = lista.slice(0, cupo)
    if (aceptadas.length < lista.length) setError(`Solo entran ${cupo} foto(s) más: el máximo es ${MAX_FOTOS_PRODUCTO}.`)
    for (const [indice, archivo] of aceptadas.entries()) {
      const motivo = validarArchivoFoto(archivo)
      if (motivo) { setError(`${archivo.name || 'La foto'}: ${motivo}`); continue }
      setOcupado(`Subiendo ${indice + 1} de ${aceptadas.length}…`)
      try {
        const preparada = await prepararFotoProducto(archivo)
        if (productId) {
          const creada = await fotosProducto.upload(productId, preparada)
          URL.revokeObjectURL(preparada.previa)
          setItems((actuales) => [...actuales, { id: creada.id, src: creada.thumbUrl || creada.url, isPrimary: creada.isPrimary }])
          onCambio?.()
        } else {
          setItems((actuales) => [...actuales, { id: `local-${Date.now()}-${indice}`, src: preparada.previa, local: preparada, isPrimary: actuales.length === 0 }])
        }
      } catch (cause) {
        console.error('[fotos-producto] no se pudo agregar la foto', cause)
        setError(cause?.message || 'No se pudo subir la foto.')
      }
    }
    setOcupado('')
  }

  async function guardarOrden(nueva) {
    const anterior = items
    setItems(nueva)
    if (!productId) return
    setOcupado('Guardando orden…'); setError('')
    try { aplicar(await fotosProducto.reorder(productId, nueva.map((item) => item.id))); onCambio?.() } catch (cause) {
      console.error('[fotos-producto] no se pudo reordenar', cause)
      setItems(anterior); setError(cause?.message || 'No se pudo guardar el orden.')
    } finally { setOcupado('') }
  }

  async function hacerPrincipal(id) {
    if (!productId) {
      setItems((actuales) => {
        const foto = actuales.find((item) => item.id === id)
        return foto ? [{ ...foto, isPrimary: true }, ...actuales.filter((item) => item.id !== id).map((item) => ({ ...item, isPrimary: false }))] : actuales
      })
      return
    }
    setOcupado('Guardando…'); setError('')
    try { aplicar(await fotosProducto.setPrimary(productId, id)); onCambio?.() } catch (cause) {
      console.error('[fotos-producto] no se pudo marcar la principal', cause)
      setError(cause?.message || 'No se pudo cambiar la foto principal.')
    } finally { setOcupado('') }
  }

  async function quitar(id) {
    const foto = items.find((item) => item.id === id)
    if (!foto) return
    if (!productId) {
      if (foto.local) URL.revokeObjectURL(foto.src)
      setItems((actuales) => {
        const resto = actuales.filter((item) => item.id !== id)
        return resto.length && !resto.some((item) => item.isPrimary) ? resto.map((item, indice) => ({ ...item, isPrimary: indice === 0 })) : resto
      })
      setElegida('')
      return
    }
    setOcupado('Quitando…'); setError('')
    try { await fotosProducto.remove(productId, id); setElegida(''); await cargar(); onCambio?.() } catch (cause) {
      console.error('[fotos-producto] no se pudo quitar', cause)
      setError(cause?.message || 'No se pudo quitar la foto.')
    } finally { setOcupado('') }
  }

  const seleccion = items.find((item) => item.id === elegida)
  const indice = items.findIndex((item) => item.id === elegida)
  const bloqueado = Boolean(ocupado) || !puedeEditar
  const boton = 'min-h-11 md:min-h-0'

  return (
    <div
      data-testid="galeria-fotos"
      className={cn('space-y-2 rounded-xl border border-dashed p-3 transition', arrastrando ? 'border-fono bg-fono/10' : 'border-ink-600', className)}
      onDragOver={(event) => { if (puedeEditar && event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); setArrastrando(true) } }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(event) => {
        if (!puedeEditar || !event.dataTransfer?.files?.length) return
        event.preventDefault(); setArrastrando(false)
        agregar(event.dataTransfer.files)
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-mute">Fotos ({items.length}/{MAX_FOTOS_PRODUCTO}){puedeEditar ? ' · soltá archivos acá' : ''}</span>
        {puedeEditar && (
          <span className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className={boton} disabled={bloqueado || items.length >= MAX_FOTOS_PRODUCTO} onClick={() => entrada.current?.click()}><Icon name="upload" className="h-3.5 w-3.5" />Elegir fotos</Button>
            <Button type="button" variant="outline" className={boton} disabled={bloqueado || items.length >= MAX_FOTOS_PRODUCTO} onClick={() => camara.current?.click()} data-testid="galeria-camara"><Icon name="image" className="h-3.5 w-3.5" />Cámara</Button>
          </span>
        )}
      </div>
      <input ref={entrada} type="file" accept={ACEPTA_FOTO} multiple hidden data-testid="galeria-archivo" onChange={(event) => { agregar(event.target.files); event.target.value = '' }} />
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { agregar(event.target.files); event.target.value = '' }} />

      {cargando && <p className="text-xs text-mute" role="status">Cargando fotos…</p>}
      {!cargando && items.length === 0 && <p className="text-xs text-mute">{puedeEditar ? 'Sin fotos todavía. La primera queda como principal.' : 'Sin fotos.'}</p>}
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Fotos del producto">
          {items.map((item, posicion) => (
            <li
              key={item.id}
              draggable={puedeEditar && !ocupado}
              onDragStart={(event) => { event.dataTransfer.setData('text/plain', item.id); setOrigenArrastre(item.id) }}
              onDragEnd={() => setOrigenArrastre('')}
              onDragOver={(event) => { if (origenArrastre) event.preventDefault() }}
              onDrop={(event) => { if (!origenArrastre) return; event.preventDefault(); event.stopPropagation(); guardarOrden(reubicarFoto(items, origenArrastre, item.id)); setOrigenArrastre('') }}
              className={cn('relative', origenArrastre === item.id && 'opacity-50')}
            >
              <button
                type="button"
                onClick={() => setElegida((actual) => (actual === item.id ? '' : item.id))}
                aria-pressed={elegida === item.id}
                aria-label={`Foto ${posicion + 1}${item.isPrimary ? ' (principal)' : ''}`}
                className={cn('block rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-fono', elegida === item.id && 'ring-2 ring-fono')}
              >
                <FotoProducto src={item.src} size={64} alt="" />
              </button>
              {item.isPrimary && <span className="pointer-events-none absolute left-1 top-1 rounded bg-fono px-1 text-[9px] font-bold text-white">Principal</span>}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && seleccion && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="galeria-acciones">
          <Button type="button" variant="outline" className={boton} aria-label="Mover antes" disabled={bloqueado || indice <= 0} onClick={() => guardarOrden(moverFoto(items, seleccion.id, -1))}><Icon name="arrowLeft" className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="outline" className={boton} aria-label="Mover después" disabled={bloqueado || indice >= items.length - 1} onClick={() => guardarOrden(moverFoto(items, seleccion.id, 1))}><Icon name="arrowRight" className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="outline" className={boton} disabled={bloqueado || seleccion.isPrimary} onClick={() => hacerPrincipal(seleccion.id)}>Hacer principal</Button>
          <Button type="button" variant="outline" className={cn(boton, 'text-bad')} disabled={bloqueado} onClick={() => quitar(seleccion.id)}><Icon name="trash" className="h-3.5 w-3.5" />Quitar</Button>
        </div>
      )}
      {ocupado && <p className="text-xs text-mute" role="status">{ocupado}</p>}
      {error && <Aviso tono="error" role="alert">{error}</Aviso>}
    </div>
  )
}
