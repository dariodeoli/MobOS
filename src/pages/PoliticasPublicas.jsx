import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { varianteDeTema } from '@/lib/tenantLogo'
import { Aviso } from '@/components/ui'
import { BOTON_PUBLICO, BotonWhatsApp, CabeceraTienda } from '@/components/publico/KitPublico'
import ProductFooter from '@/components/app/ProductFooter'
import { cn } from '@/lib/utils'
import { etiquetaPolitica, esTipoPolitica, parsearPolitica } from '@/lib/politicas'
import { fechaHora } from '@/utils/fecha'

// Políticas públicas de la empresa (#433): /<empresa>/politicas (índice) y
// /<empresa>/politicas/<tipo>. Sin sesión; solo se ve lo publicado y los datos
// de contacto del negocio. El texto se pinta como bloques de React (nunca HTML).

function Texto({ partes }) {
  return partes.map((parte, i) => (parte.negrita ? <strong key={i} className="font-bold text-fore">{parte.texto}</strong> : <span key={i}>{parte.texto}</span>))
}

function Cuerpo({ texto }) {
  const bloques = parsearPolitica(texto)
  return (
    <div className="space-y-3 text-sm leading-6 text-mute [overflow-wrap:anywhere]" data-testid="politica-texto">
      {bloques.map((bloque, i) => {
        if (bloque.tipo === 'titulo') return <h2 key={i} className="pt-2 text-base font-bold text-fore">{bloque.texto}</h2>
        if (bloque.tipo === 'lista') return <ul key={i} className="list-disc space-y-1.5 pl-5">{bloque.items.map((partes, j) => <li key={j}><Texto partes={partes} /></li>)}</ul>
        return <p key={i}><Texto partes={bloque.partes} /></p>
      })}
    </div>
  )
}

export default function PoliticasPublicas() {
  const { slug, tipo } = useParams()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    setDatos(null); setError('')
    const ruta = `${API_URL}/api/public/policies/${encodeURIComponent(slug || '')}${tipo ? `/${encodeURIComponent(tipo)}` : ''}`
    fetch(ruta)
      .then(async respuesta => {
        const cuerpo = await respuesta.json().catch(() => null)
        if (!respuesta.ok) throw new Error(cuerpo?.message || 'No encontramos esa política.')
        if (activo) setDatos(cuerpo)
      })
      .catch(causa => { if (activo) setError(causa?.message || 'No se pudo cargar la página.') })
    return () => { activo = false }
  }, [slug, tipo])

  const empresa = datos?.company
  const logoBase = `${API_URL}/api/public/policies/${encodeURIComponent(slug || '')}/logo`
  const detalle = empresa ? [empresa.address, empresa.city, empresa.phone].filter(Boolean).join(' · ') : ''
  const lista = datos?.policies || datos?.others || []
  const volver = tipo ? `/${encodeURIComponent(slug)}/politicas` : ''

  return (
    <main className="min-h-screen bg-ink-950 px-3 py-6 text-fore sm:px-4 sm:py-10">
      <div className="mx-auto max-w-xl space-y-3">
        {error && <div data-testid="politicas-error"><Aviso tono="error" className="rounded-xl px-4 py-3 text-center text-sm">{error}</Aviso></div>}
        {empresa && (
          <>
            <CabeceraTienda
              logo={empresa.logo ? `${logoBase}?variant=${varianteDeTema()}` : ''}
              logoClaro={empresa.logo ? `${logoBase}?variant=light` : ''}
              empresa={empresa.name}
              detalle={detalle}
            >
              <div className="mt-3 border-t border-ink-600/70 pt-3">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-fono-light">Políticas de la tienda</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight" data-testid="politicas-titulo">{datos.policy ? datos.policy.label : 'Nuestras políticas'}</h1>
                {datos.policy?.updatedAt && <p className="mt-1 text-xs text-mute">Última actualización: {fechaHora(datos.policy.updatedAt)}</p>}
              </div>
            </CabeceraTienda>

            {datos.policy && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-4">
                <Cuerpo texto={datos.policy.content} />
              </section>
            )}

            {(!datos.policy || lista.length > 0) && (
              <nav aria-label="Políticas de la tienda" className="rounded-2xl border border-ink-600 bg-ink-900 p-2" data-testid="politicas-indice">
                {!datos.policy && lista.length === 0 && <p className="p-3 text-sm text-mute">Esta tienda todavía no publicó sus políticas.</p>}
                <ul>
                  {lista.filter(item => esTipoPolitica(item.type)).map(item => (
                    <li key={item.type}>
                      <Link to={`/${encodeURIComponent(slug)}/politicas/${item.type}`} data-politica-enlace={item.type} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-ink-800">
                        <span>{item.label || etiquetaPolitica(item.type)}</span>
                        <span aria-hidden="true" className="text-xl leading-none text-mute">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <div className="flex flex-wrap gap-2">
              {volver && <Link to={volver} className={cn(BOTON_PUBLICO, 'border-ink-500 bg-ink-800 text-fore hover:border-fono')}>← Todas las políticas</Link>}
              <BotonWhatsApp telefono={empresa.phone} mensaje={`Hola ${empresa.name}, tengo una consulta sobre ${datos.policy ? `la política de ${datos.policy.label.toLowerCase()}` : 'sus políticas'}.`} />
            </div>
            <p className="pt-1 text-center text-xs text-mute">{empresa.email ? `${empresa.email} · ` : ''}Generado por MobOS para {empresa.name}</p>
          </>
        )}
      </div>
      <ProductFooter />
    </main>
  )
}
