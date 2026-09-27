import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { coincideExacto, etiquetaProveedor, filtrarProveedores, sugerenciasDeProveedores } from '@/lib/proveedores'

// #259: proveedor con buscador en flujo: al enfocar vacío muestra los últimos
// usados (predeterminados) y al escribir filtra por abreviatura o nombre,
// parcial y sin acentos. Texto libre permitido: la pantalla decide cómo dar de
// alta el nombre nuevo (`onCreate`, `onLibre`). Reemplaza al datalist plano.
//
// La lógica de filtro y de «últimos usados» vive en `lib/proveedores.js`; este
// objeto solo compone la UI (la biblioteca `owncoding-ui` publica el patrón
// equivalente para bancos y productos: candidato a mudarse cuando CMP lo pida).
export default function SupplierCombobox({
  id,
  ariaLabel = 'Proveedor',
  proveedores = [],
  value = '',
  onSelect,
  onLibre,
  onCreate,
  recientes = [],
  onUsado,
  placeholder = 'Elegí uno o escribí el nombre',
  // Texto de la fila cuando el texto no coincide con ningún proveedor.
  etiquetaNuevo,
  // Campos cuyo valor ES el texto (recepción): se avisa en cada tecla para no
  // perder un nombre tipeado que se guarda directo.
  confirmarAlTipear = false,
  required = false,
  disabled = false,
  className,
  limiteSugerencias = 8,
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const [creando, setCreando] = useState(false)
  const listaId = useId()
  const raiz = useRef(null)
  // El blur confirma 120 ms después (para que gane el clic de la opción). La
  // confirmación lee el texto vigente y se cancela si la pantalla ya cerró el
  // campo (p. ej. guardó la unidad y limpió el formulario): sin esto el
  // proveedor recién guardado volvía a aparecer al reabrir (#259).
  const textoVigente = useRef(texto)
  textoVigente.current = texto
  const timerBlur = useRef(null)

  // El valor puede venir como id (Compras) o como nombre tipeado (recepción de
  // unidades): se muestra la etiqueta del proveedor elegido o el texto tal cual.
  const textoDeValor = (valor) => {
    if (!valor) return ''
    const proveedor = proveedores.find((item) => item.id === valor)
    if (proveedor) return etiquetaProveedor(proveedor)
    const porNombre = proveedores.find((item) => [item.name, item.nombre].includes(valor))
    return porNombre ? etiquetaProveedor(porNombre) : String(valor)
  }

  useEffect(() => {
    setTexto(textoDeValor(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, proveedores])

  useEffect(() => {
    const cerrarFuera = (event) => {
      if (event.target instanceof Node && raiz.current?.contains(event.target)) return
      setAbierto(false)
    }
    document.addEventListener('click', cerrarFuera)
    return () => {
      document.removeEventListener('click', cerrarFuera)
      clearTimeout(timerBlur.current)
    }
  }, [])

  const termino = texto.trim()
  const filtrados = useMemo(
    () => filtrarProveedores(proveedores, termino).slice(0, limiteSugerencias),
    [proveedores, termino, limiteSugerencias],
  )
  const predeterminados = useMemo(
    () => sugerenciasDeProveedores(proveedores, recientes, limiteSugerencias),
    [proveedores, recientes, limiteSugerencias],
  )
  const opciones = termino ? filtrados : predeterminados
  const exacto = coincideExacto(proveedores, termino)
  const puedeNuevo = Boolean(termino && !exacto && (onCreate || onLibre))
  const mostrarEncabezado = !termino && opciones.length > 0 && recientes.length > 0
  const totalFilas = opciones.length + (puedeNuevo ? 1 : 0)

  function cerrar() {
    setAbierto(false)
    setResaltado(0)
  }

  function elegir(proveedor) {
    setTexto(etiquetaProveedor(proveedor))
    cerrar()
    onSelect?.(proveedor)
    onUsado?.(proveedor)
  }

  function usarLibre() {
    if (!termino) return
    cerrar()
    onLibre?.(termino)
  }

  // Texto libre confirmado (blur o Enter sin elegir): si identifica a un
  // proveedor del catálogo se selecciona; si no, la pantalla decide el alta.
  // Sin esto, un nombre tipeado y guardado directo se perdía.
  function confirmarTexto() {
    const valor = textoVigente.current.trim()
    if (!valor) return
    const proveedor = proveedores.find((item) => item.id === valor)
      || coincideExacto(proveedores, valor)
      || proveedores.find((item) => etiquetaProveedor(item) === valor)
    if (proveedor) {
      if (proveedor.id !== value) onSelect?.(proveedor)
      return
    }
    onLibre?.(valor)
  }

  async function crear() {
    if (!onCreate || creando) return
    setCreando(true)
    try {
      const creado = await onCreate(termino)
      if (creado?.id) elegir(creado)
      else cerrar()
    } catch {
      cerrar()
    } finally {
      setCreando(false)
    }
  }

  function alTeclear(event) {
    if (event.key === 'Escape') {
      cerrar()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!abierto) {
        setAbierto(true)
        return
      }
      if (!totalFilas) return
      const paso = event.key === 'ArrowDown' ? 1 : -1
      setResaltado((actual) => (actual + paso + totalFilas) % totalFilas)
      return
    }
    if (event.key === 'Enter') {
      if (!abierto || !totalFilas) {
        confirmarTexto()
        return
      }
      event.preventDefault()
      if (puedeNuevo && resaltado >= opciones.length) {
        if (onCreate) crear()
        else usarLibre()
        return
      }
      const proveedor = opciones[resaltado]
      if (proveedor) elegir(proveedor)
    }
  }

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        autoCapitalize="words"
        required={required}
        disabled={disabled}
        value={texto}
        placeholder={placeholder}
        onChange={(event) => {
          const siguiente = event.target.value
          setTexto(siguiente)
          setAbierto(true)
          setResaltado(0)
          if (confirmarAlTipear) onLibre?.(siguiente)
        }}
        onFocus={() => {
          setAbierto(true)
          setResaltado(0)
        }}
        onBlur={() => {
          clearTimeout(timerBlur.current)
          timerBlur.current = setTimeout(() => { cerrar(); confirmarTexto() }, 120)
        }}
        onKeyDown={alTeclear}
      />
      {abierto && (opciones.length > 0 || puedeNuevo) && (
        <ul id={listaId} role="listbox" aria-label="Proveedores" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-ink-500 bg-ink-800 py-1 shadow-xl">
          {mostrarEncabezado && <li role="presentation" className="px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-mute/70">Últimos usados</li>}
          {opciones.map((proveedor, indice) => (
            <li key={proveedor.id}>
              <button
                type="button"
                role="option"
                aria-selected={indice === resaltado}
                tabIndex={-1}
                className={cn('flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition', indice === resaltado ? 'bg-ink-700' : '')}
                onMouseDown={(event) => {
                  event.preventDefault()
                  elegir(proveedor)
                }}
                onMouseEnter={() => setResaltado(indice)}
              >
                <span className="min-w-0 truncate text-fore">{proveedor.name || proveedor.nombre}</span>
                {proveedor.code ? <span className="shrink-0 font-mono text-[11px] text-fono-light">{proveedor.code}</span> : null}
              </button>
            </li>
          ))}
          {puedeNuevo && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={resaltado >= opciones.length}
                tabIndex={-1}
                disabled={creando}
                className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-fono-light transition disabled:opacity-50', resaltado >= opciones.length ? 'bg-ink-700' : '')}
                onMouseDown={(event) => {
                  event.preventDefault()
                  if (onCreate) crear()
                  else usarLibre()
                }}
                onMouseEnter={() => setResaltado(opciones.length)}
              >
                {creando ? 'Creando…' : `${etiquetaNuevo || (onCreate ? '＋ Crear' : 'Usar')} «${termino}»`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
