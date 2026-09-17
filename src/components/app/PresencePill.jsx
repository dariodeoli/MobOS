import { useEffect, useState } from 'react'
import { usePresentes } from '@/hooks/usePresence'
import { etiquetaPresencia, inicialesDe } from '@/lib/presence'
import { getAvatarDataUrl } from '@/lib/userAvatar'

// Píldora del topbar: hasta 4 personas en línea con foto o iniciales y punto
// verde sobre quien tuvo actividad. Sin nadie en línea no ocupa espacio.
export default function PresencePill() {
  const personas = usePresentes()
  const [fotos, setFotos] = useState({})
  const visibles = personas.slice(0, 4)
  const clave = visibles.map((persona) => persona.id).join(',')
  useEffect(() => {
    let vivo = true
    const ids = clave ? clave.split(',') : []
    ids.forEach(async (id) => {
      const url = await getAvatarDataUrl(id)
      if (vivo && url) setFotos((previos) => (previos[id] ? previos : { ...previos, [id]: url }))
    })
    return () => { vivo = false }
  }, [clave])
  if (!personas.length) return null
  const etiqueta = etiquetaPresencia(personas)
  return (
    <div className="hidden items-center sm:flex" role="group" aria-label="Personas en línea">
      <div className="flex items-center gap-2 rounded-full border border-fore/10 bg-ink-700/60 px-2.5 py-1" title={etiqueta} aria-label={etiqueta}>
        <span className="flex -space-x-2">
          {visibles.map((persona) => (
            <span
              key={persona.id}
              className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-paper bg-ink-600 text-[10px] font-semibold text-fore"
              title={`${persona.name}${persona.scope ? ` · ${persona.scope}` : ''}`}
            >
              {fotos[persona.id]
                ? <img src={fotos[persona.id]} alt="" className="h-full w-full object-cover" />
                : inicialesDe(persona.name)}
              {persona.active && <i className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-ok ring-1 ring-paper" aria-hidden="true" />}
            </span>
          ))}
        </span>
        <span className="text-xs font-semibold text-mute">{personas.length} en línea</span>
      </div>
    </div>
  )
}
