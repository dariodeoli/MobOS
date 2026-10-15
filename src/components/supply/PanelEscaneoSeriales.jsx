import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Input, Textarea, useToast } from '@/components/ui'
import CameraScan from '@/components/shared/CameraScan'
import Icon from '@/components/shared/Icon'
import { resolverLectura } from '@/lib/clasificarCodigo'
import { textoMotivo, validarLote } from '@/lib/escanerSeriales'
import { avisarEscaneo, guardarSonido, sonidoActivo } from '@/lib/feedbackEscaneo'

// #450 · Panel único de escaneo de IMEI para «Preparar compra» y «Preparar
// lote»: lector Bluetooth/USB, cámara o pegado, con confirmación visible de
// cada lectura (franja de estado, fila resaltada, aviso, vibración y pitido),
// clasificación del código (IMEI, serial, producto, QR de MobOS u otro) y la
// lista de lo ya cargado por línea, con estado y opción de quitar.

const TONOS = {
  ok: 'border-ok/40 bg-ok/10 text-ok',
  aviso: 'border-warn/40 bg-warn/10 text-warn',
  error: 'border-bad/40 bg-bad/10 text-bad',
}
const COLOR_ESTADO = { pendiente: 'orange', recibido: 'blue', verificado: 'green' }
const abreviar = (serial) => String(serial || '')

/**
 * `lineas`: `{ id, productId, nombre, cantidad, seriales: [{ serial, estado? }] }`
 * (cantidad = unidades que la línea debe tener con IMEI).
 * `agregar(serial, { luhnForzado, lineId })` y `quitar(serial, lineId)` devuelven
 * una promesa y lanzan con el mensaje a mostrar; `agregarVarios(seriales, lineId)`
 * recibe el pegado ya validado.
 */
export default function PanelEscaneoSeriales({
  lineas,
  lineaId,
  onLinea,
  productos = [],
  agregar,
  agregarVarios,
  quitar,
  ariaEntrada = 'IMEI a escanear',
  ariaPegado = 'IMEI para pegar',
  idBase = 'escaneo',
}) {
  const toast = useToast()
  const [entrada, setEntrada] = useState('')
  const [camara, setCamara] = useState(false)
  const [verPegado, setVerPegado] = useState(false)
  const [pegado, setPegado] = useState('')
  const [estado, setEstado] = useState(null)
  const [resaltado, setResaltado] = useState('')
  const [busy, setBusy] = useState(false)
  const [sonido, setSonido] = useState(() => sonidoActivo())
  const [recien, setRecien] = useState({})
  const cola = useRef(Promise.resolve())
  const refs = useRef({})
  const temporizador = useRef(0)

  const linea = useMemo(() => lineas.find((fila) => fila.id === lineaId) || lineas.find((fila) => fila.cantidad > (fila.seriales || []).length) || lineas[0] || null, [lineas, lineaId])

  // Lo que ya llegó del servidor deja de ser «reciente»; lo reciente cuenta de inmediato.
  useEffect(() => {
    setRecien((actual) => {
      let cambio = false
      const siguiente = {}
      for (const [id, lista] of Object.entries(actual)) {
        const fila = lineas.find((item) => item.id === id)
        const cargados = new Set((fila?.seriales || []).map((item) => item.serial))
        const resto = lista.filter((serial) => !cargados.has(serial))
        if (resto.length !== lista.length) cambio = true
        if (resto.length) siguiente[id] = resto
      }
      return cambio ? siguiente : actual
    })
  }, [lineas])

  const efectivas = useMemo(() => lineas.map((fila) => {
    const serials = (fila.seriales || []).map((item) => item.serial)
    const extra = (recien[fila.id] || []).filter((serial) => !serials.includes(serial))
    return { ...fila, total: serials.length + extra.length, extra }
  }), [lineas, recien])
  const actual = efectivas.find((fila) => fila.id === linea?.id) || null
  const faltan = actual ? Math.max(0, actual.cantidad - actual.total) : 0
  const todosCargados = useMemo(() => new Set(efectivas.flatMap((fila) => [...(fila.seriales || []).map((item) => item.serial), ...fila.extra])), [efectivas])

  refs.current = { efectivas, actual, todosCargados, productos, lineas }

  const mostrar = useCallback((tipo, texto, extra = {}) => {
    setEstado({ tipo, texto, ...extra, marca: Date.now() })
    avisarEscaneo(tipo)
  }, [])

  const resaltar = useCallback((serial) => {
    setResaltado(serial)
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setResaltado(''), 3500)
  }, [])
  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  async function procesarUna(valor, origen, { forzarLuhn = false } = {}) {
    const { efectivas: filas, actual: activa, todosCargados: cargados, productos: catalogo } = refs.current
    if (!activa) return
    const lectura = resolverLectura(valor, { cargados, productos: catalogo, lineas: filas, forzarLuhn })
    if (lectura.accion === 'linea') {
      onLinea?.(lectura.lineId)
      const destino = filas.find((fila) => fila.id === lectura.lineId)
      mostrar('aviso', `Línea seleccionada: ${destino?.nombre || lectura.nombre}. Ahora escaneá los IMEI.`)
      return
    }
    if (lectura.accion === 'duplicado') {
      resaltar(lectura.serial)
      mostrar('aviso', `IMEI ${abreviar(lectura.serial)} ya cargado.`)
      return
    }
    if (lectura.accion === 'confirmar-luhn') {
      mostrar('aviso', `IMEI ${lectura.serial}: el dígito de control no coincide. Revisalo; si es correcto, cargalo igual.`, { luhn: lectura.serial })
      return
    }
    if (lectura.accion === 'rechazar') {
      const simple = origen === 'manual' && lectura.clasificado.tipo === 'ajeno' && !/[/:?%\s]/.test(String(valor))
      mostrar('error', simple ? `${String(valor).trim().toUpperCase()}: ${textoMotivo('FORMATO')}` : lectura.mensaje)
      return
    }
    // agregar
    let destino = activa
    if (Math.max(0, destino.cantidad - destino.total) <= 0) {
      const otra = filas.find((fila) => fila.cantidad > fila.total)
      if (!otra) {
        mostrar('error', 'Todas las líneas ya tienen sus IMEI cargados.')
        return
      }
      destino = otra
      onLinea?.(otra.id)
    }
    try {
      const respuesta = await agregar(lectura.serial, { luhnForzado: lectura.luhnForzado, lineId: destino.id })
      setRecien((previo) => ({ ...previo, [destino.id]: [...(previo[destino.id] || []), lectura.serial] }))
      const numero = destino.total + 1
      resaltar(lectura.serial)
      setEntrada('')
      mostrar('ok', `IMEI ${lectura.serial} agregado (${numero}/${destino.cantidad})`, { aviso: respuesta?.aviso || '' })
      toast.success('IMEI agregado', `${lectura.serial} · ${destino.nombre} (${numero}/${destino.cantidad})`)
    } catch (causa) {
      mostrar('error', causa?.message || 'El IMEI no se pudo cargar.')
    }
  }

  // Las lecturas se procesan de a una: la cámara puede entregar varias seguidas.
  const leer = useCallback((valor, origen = 'camara', opciones) => {
    cola.current = cola.current.then(async () => {
      setBusy(true)
      try { await procesarUna(valor, origen, opciones) } finally { setBusy(false) }
    })
    return cola.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const alDetectar = useCallback((valor) => { leer(valor, 'camara') }, [leer])
  const cerrarCamara = useCallback(() => setCamara(false), [])

  async function pegarVarios() {
    if (!actual || busy) return
    const { validos, errores } = validarLote({ entradas: pegado, yaCargados: [...todosCargados], limite: faltan })
    if (!validos.length) {
      mostrar('error', errores.map((fila) => `${fila.serial}: ${textoMotivo(fila.motivo)}`).join(' · ') || 'No hay códigos para cargar.')
      return
    }
    setBusy(true)
    try {
      await agregarVarios(validos, actual.id)
      setRecien((previo) => ({ ...previo, [actual.id]: [...(previo[actual.id] || []), ...validos] }))
      setPegado('')
      setVerPegado(false)
      const rechazados = errores.length ? ` · no cargados: ${errores.map((fila) => `${fila.serial} (${textoMotivo(fila.motivo)})`).join(', ')}` : ''
      mostrar(errores.length ? 'aviso' : 'ok', `${validos.length} cargado(s) (${actual.total + validos.length}/${actual.cantidad})${rechazados}`)
      toast.success('IMEI cargados', `${validos.length} serial(es) en la línea.`)
    } catch (causa) {
      mostrar('error', causa?.message || 'No se pudo cargar el lote.')
    } finally {
      setBusy(false)
    }
  }

  async function quitarUno(serial) {
    if (!quitar || !actual || busy) return
    setBusy(true)
    try {
      await quitar(serial, actual.id)
      setRecien((previo) => ({ ...previo, [actual.id]: (previo[actual.id] || []).filter((item) => item !== serial) }))
      mostrar('aviso', `IMEI ${serial} quitado de la compra.`)
    } catch (causa) {
      mostrar('error', causa?.message || 'No se pudo quitar el IMEI.')
    } finally {
      setBusy(false)
    }
  }

  const listaActual = actual ? [
    ...(actual.seriales || []),
    ...actual.extra.map((serial) => ({ serial, estado: 'pendiente' })),
  ] : []

  return (
    <div className="space-y-3" data-testid={`${idBase}-panel`}>
      {lineas.map((fila) => {
        const hecha = efectivas.find((item) => item.id === fila.id)
        const faltanFila = Math.max(0, fila.cantidad - (hecha?.total || 0))
        return (
          <label key={fila.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name={`linea-${idBase}`}
              checked={actual?.id === fila.id}
              onChange={() => { onLinea?.(fila.id); setEstado(null) }}
              aria-label={`Línea ${fila.nombre}`}
              className="h-5 w-5 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate">{fila.nombre}</span>
            <span className="text-xs tabular-nums text-mute">{hecha?.total || 0}/{fila.cantidad}</span>
            {faltanFila > 0 ? <Badge color="orange">{faltanFila} faltan</Badge> : <Badge color="green">Completa</Badge>}
          </label>
        )
      })}

      {actual && (
        <>
          <form onSubmit={(evento) => { evento.preventDefault(); const valor = entrada; setEntrada(''); leer(valor, 'manual') }} className="flex flex-wrap items-center gap-2">
            <Input
              autoFocus
              value={entrada}
              onChange={(evento) => setEntrada(evento.target.value)}
              placeholder="Escaneá o escribí el IMEI…"
              aria-label={ariaEntrada}
              className="min-h-11 min-w-0 flex-1"
            />
            <Button type="submit" className="min-h-11" disabled={busy || !entrada.trim()}>Cargar</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setCamara((valor) => !valor)} data-testid={`${idBase}-camara`}>
              <Icon name="image" className="h-3.5 w-3.5" />Cámara
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setVerPegado((valor) => !valor)}>Pegar varios</Button>
          </form>
          {camara && <CameraScan continuous onDetected={alDetectar} onClose={cerrarCamara} />}
          {verPegado && (
            <div className="space-y-2">
              <Textarea
                value={pegado}
                onChange={(evento) => setPegado(evento.target.value)}
                placeholder="Pegá los IMEI separados por coma, espacio o salto de línea…"
                aria-label={ariaPegado}
                className="min-h-24 w-full"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={() => { setVerPegado(false); setPegado('') }} disabled={busy}>Cerrar</Button>
                <Button type="button" className="min-h-11" onClick={pegarVarios} disabled={busy || !pegado.trim()}>{busy ? 'Cargando…' : 'Cargar lote'}</Button>
              </div>
            </div>
          )}
        </>
      )}

      <div
        role="status"
        aria-live="polite"
        data-testid={`${idBase}-estado`}
        className={`flex min-h-11 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${estado ? TONOS[estado.tipo] : 'border-ink-600 text-mute'}`}
      >
        <Icon name={estado?.tipo === 'ok' ? 'check' : estado ? 'alert' : 'tag'} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 break-words" data-testid={`${idBase}-estado-texto`}>
          {estado ? estado.texto : 'Esperando lectura: cada IMEI que entre se confirma acá.'}
        </span>
        {estado?.luhn && (
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { const serial = estado.luhn; setEstado(null); leer(serial, 'manual', { forzarLuhn: true }) }}>
            Cargar igual
          </Button>
        )}
        {estado?.aviso && <span className="w-full text-xs">{estado.aviso}</span>}
      </div>

      {actual && (
        <div className="space-y-1.5" data-testid={`${idBase}-lista`}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
            <span>{actual.total} de {actual.cantidad} cargado{actual.total === 1 ? '' : 's'} · {actual.nombre}</span>
            <button
              type="button"
              className="min-h-11 px-2 underline"
              aria-pressed={sonido}
              onClick={() => { const nuevo = !sonido; setSonido(nuevo); guardarSonido(nuevo) }}
            >
              Pitido: {sonido ? 'activado' : 'apagado'}
            </button>
          </div>
          {faltan <= 0 && <p className="text-sm text-ok">Línea completa: todos los IMEI cargados.</p>}
          {listaActual.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-600 px-3 py-2 text-sm text-mute">Todavía no hay IMEI cargados en esta línea.</p>
          ) : listaActual.map((fila) => (
            <div
              key={fila.serial}
              data-testid="escaneo-serial"
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${resaltado === fila.serial ? 'border-ok bg-ok/10' : 'border-ink-600'}`}
            >
              <span className="min-w-0 flex-1 truncate font-mono">{fila.serial}</span>
              {fila.estado && <Badge color={COLOR_ESTADO[fila.estado] || 'slate'}>{fila.estado}</Badge>}
              {quitar && (
                <Button type="button" variant="ghost" className="min-h-11 min-w-11 text-bad" aria-label={`Quitar ${fila.serial}`} disabled={busy} onClick={() => quitarUno(fila.serial)}>
                  <Icon name="close" className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
