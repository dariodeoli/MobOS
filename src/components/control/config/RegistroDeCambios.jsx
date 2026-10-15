import { useEffect, useState } from 'react'
import { ultimasNovedades } from './novedades'

// #422 · Registro de cambios: las últimas versiones de docs/NOVEDADES.md. El
// documento pesa ~90 KB, así que se carga solo al abrir la ventana (chunk
// aparte) y no entra en el bundle de Configuración.
export function RegistroDeCambios() {
  const [versiones, setVersiones] = useState(null)
  const [fallo, setFallo] = useState(false)
  useEffect(() => {
    let vivo = true
    import('../../../../docs/NOVEDADES.md?raw')
      .then((modulo) => { if (vivo) setVersiones(ultimasNovedades(modulo.default, 3)) })
      .catch((cause) => { console.error('[config] no se pudo cargar el registro de cambios', cause); if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [])
  if (fallo) return <p role="alert" className="text-sm text-bad">No se pudo cargar el registro de cambios.</p>
  if (!versiones) return <p className="text-sm text-mute">Cargando…</p>
  if (!versiones.length) return <p className="text-sm text-mute">Todavía no hay novedades registradas.</p>
  return (
    <div className="space-y-5" data-testid="registro-cambios">
      {versiones.map((version) => (
        <section key={version.version} aria-label={version.version} className="space-y-2">
          <h3 className="text-sm font-semibold">{version.version} <span className="font-normal text-mute">· {version.fecha}</span></h3>
          {version.intro && <p className="text-sm text-mute">{version.intro}</p>}
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {version.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}
