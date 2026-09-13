import { useEffect, useRef, useState } from 'react'
import {
  listCelulares,
  rankCelular,
  getComparadorImagenes,
  setComparadorImagen,
  deleteComparadorImagen,
} from '@/lib/storage'
import { colorHex } from '@/utils/colores'
import { procesarImagenCelular } from '@/utils/imagen'
import { Card, Button, Input, Label, Select, Modal } from '@/components/ui'
import Icon from '@/components/shared/Icon'

// Sugerencias de color para autocompletar (datalist).
const SUGERENCIAS_COLOR = [
  'Naranja cósmico',
  'Azul profundo',
  'Plata',
  'Negro',
  'Blanco',
  'Titanio natural',
  'Titanio desierto',
  'Titanio negro',
  'Titanio blanco',
  'Azul',
  'Celeste',
  'Verde',
  'Rosa',
  'Lavanda',
  'Amarillo',
  'Ultramarino',
]

const nuevaKey = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
  String(Math.random()).slice(2)

export default function ImagenesComparador() {
  const imagenes = getComparadorImagenes()
  const fileRef = useRef(null)
  const [defaultModelo, setDefaultModelo] = useState('')
  const [pendientes, setPendientes] = useState([]) // { key, src, modelo, color }
  const [procesando, setProcesando] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [eliminando, setEliminando] = useState(null)

  // Modelos disponibles (de la lista de celulares), más nuevo arriba.
  const modelos = [...new Set(listCelulares().map((c) => c.modelo))].sort(
    (a, b) => rankCelular(a) - rankCelular(b),
  )

  // Procesa una lista de archivos/imágenes y los agrega a la cola.
  async function agregarArchivos(fileList) {
    const files = [...(fileList || [])].filter((f) => f.type?.startsWith('image/') && f.size <= 10 * 1024 * 1024)
    if (!files.length) return
    setError('')
    setAviso('')
    setProcesando((p) => p + files.length)
    for (const file of files) {
      try {
        const src = await procesarImagenCelular(file)
        setPendientes((ps) => [...ps, { key: nuevaKey(), src, modelo: defaultModelo, color: '' }])
      } catch {
        setError('Una imagen no se pudo procesar. Probá con otra (JPG o PNG).')
      } finally {
        setProcesando((p) => p - 1)
      }
    }
  }

  // Pegar (Ctrl+V) imágenes del portapapeles, estando en esta pestaña.
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      const files = []
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length) {
        e.preventDefault()
        agregarArchivos(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // defaultModelo se usa dentro de agregarArchivos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultModelo])

  function setPend(key, campo, val) {
    setPendientes((ps) => ps.map((p) => (p.key === key ? { ...p, [campo]: val } : p)))
  }
  function quitarPend(key) {
    setPendientes((ps) => ps.filter((p) => p.key !== key))
  }

  function guardarTodas() {
    const listas = pendientes.filter((p) => p.modelo && p.color.trim())
    if (!listas.length) {
      setError('Completá el modelo y el color en al menos una imagen.')
      return
    }
    listas.forEach((p) => setComparadorImagen(p.modelo, p.color.trim(), p.src))
    setPendientes((ps) => ps.filter((p) => !(p.modelo && p.color.trim())))
    setError('')
    setAviso(`Se guardaron ${listas.length} imagen(es). `)
  }

  const modelosConImagenes = Object.keys(imagenes).sort((a, b) => rankCelular(a) - rankCelular(b))
  const listasParaGuardar = pendientes.filter((p) => p.modelo && p.color.trim()).length

  return (
    <div className="space-y-4">
      <datalist id="sugerencias-color">
        {SUGERENCIAS_COLOR.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <Card>
        <h2 className="font-bold mb-1">Imágenes del comparador</h2>
        <p className="text-sm text-mute mb-4">
          <strong>Pegá (Ctrl+V)</strong> o <strong>arrastrá</strong> varias fotos de una. La app les
          saca el fondo blanco sola y las deja en PNG. Después le ponés modelo y color a cada una y
          tocás <strong>Guardar todas</strong>.
        </p>

        <div className="mb-3 max-w-xs">
          <Label>Modelo por defecto (para las que pegues)</Label>
          <Select value={defaultModelo} onChange={(e) => setDefaultModelo(e.target.value)}>
            <option value="">Sin asignar…</option>
            {modelos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>

        {/* Zona de pegar / arrastrar */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            agregarArchivos(e.dataTransfer.files)
          }}
          onClick={() => fileRef.current?.click()}
          className={
            'cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ' +
            (dragOver ? 'border-fono bg-fono/10' : 'border-ink-500 hover:border-fono')
          }
        >
          <Icon name="image" className="mx-auto mb-2 h-8 w-8 text-fono" />
          <div className="font-semibold text-sm text-white">
            Pegá con Ctrl+V, arrastrá las fotos acá, o tocá para elegir
          </div>
          <div className="text-xs text-mute mt-1">
            {procesando > 0 ? `⏳ Procesando ${procesando}…` : 'Podés cargar varias a la vez'}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              agregarArchivos(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        {aviso && <p className="mt-2 text-sm text-ok">{aviso}</p>}
      </Card>

      {/* Cola de imágenes pendientes de asignar */}
      {pendientes.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-bold">En cola ({pendientes.length})</h3>
            <Button variant="success" className="h-9 px-4 text-sm" onClick={guardarTodas}>
              Guardar todas{listasParaGuardar > 0 ? ` (${listasParaGuardar})` : ''}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendientes.map((p) => (
              <div key={p.key} className="rounded-xl border border-ink-600 p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="h-20 w-20 shrink-0 rounded-lg bg-ink-700 flex items-center justify-center overflow-hidden">
                      <img src={p.src} alt={`Vista previa de ${p.modelo || 'imagen'}`} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Select
                      value={p.modelo}
                      onChange={(e) => setPend(p.key, 'modelo', e.target.value)}
                      className="h-9 text-sm"
                    >
                      <option value="">Elegí modelo…</option>
                      {modelos.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-4 w-4 rounded-full border border-ink-500 shrink-0"
                        style={{ background: colorHex(p.color) }}
                      />
                      <Input
                        list="sugerencias-color"
                        value={p.color}
                        onChange={(e) => setPend(p.key, 'color', e.target.value)}
                        placeholder="Color"
                        className="h-9 text-sm"
                        autoCapitalize="words"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => quitarPend(p.key)}
                  className="text-xs text-mute hover:text-bad"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Imágenes ya guardadas */}
      {modelosConImagenes.length === 0 ? (
        <Card className="text-center text-mute text-sm py-8">
          Todavía no guardaste ninguna imagen.
        </Card>
      ) : (
        modelosConImagenes.map((m) => (
          <Card key={m}>
            <h3 className="font-bold mb-3">{m}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(imagenes[m]).map(([colorNombre, src]) => (
                <div key={colorNombre} className="rounded-xl border border-ink-600 p-2">
                  <div className="aspect-square rounded-lg bg-ink-700 flex items-center justify-center overflow-hidden">
                    <img
                      src={src}
                      alt={colorNombre}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-4 w-4 rounded-full border border-ink-500 shrink-0"
                        style={{ background: colorHex(colorNombre) }}
                      />
                      <span className="text-xs font-medium truncate">{colorNombre}</span>
                    </div>
                    <button
                      onClick={() => setEliminando({ modelo: m, color: colorNombre })}
                      className="min-h-11 min-w-11 text-mute hover:text-bad p-1 shrink-0"
                      title="Eliminar imagen"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
      <Modal open={Boolean(eliminando)} onClose={() => setEliminando(null)} title="Eliminar imagen">
        <p className="text-sm text-mute">¿Querés eliminar la imagen de {eliminando?.modelo} · {eliminando?.color}? Esta acción no se puede deshacer.</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEliminando(null)}>Cancelar</Button><Button variant="danger" onClick={() => { deleteComparadorImagen(eliminando.modelo, eliminando.color); setEliminando(null) }}>Eliminar</Button></div>
      </Modal>
    </div>
  )
}
