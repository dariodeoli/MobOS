import { usePresentes } from '@/hooks/usePresence'
import { etiquetaPresencia } from '@/lib/presence'
import Avatar from '@/components/shared/Avatar'

// Quién más está viendo este pedido (mismo alcance de presencia). Si nadie
// más está en la página, no ocupa espacio.
export default function PresenciaPedido({ pedidoId, className = '' }) {
  const personas = usePresentes()
  const alcance = `pedidos/${pedidoId}`
  const otros = personas.filter((persona) => persona.scope === alcance)
  if (!otros.length) return null
  return (
    <span className={`flex items-center gap-2 ${className}`} title={etiquetaPresencia(otros)} aria-label={etiquetaPresencia(otros)}>
      <span className="flex -space-x-2">
        {otros.slice(0, 3).map((persona) => <Avatar key={persona.id} user={persona} size="sm" className="border-paper" />)}
      </span>
      <span className="text-xs font-semibold text-ok">
        {otros.length === 1 ? `${otros[0].name} está viendo este pedido` : `${otros.length} personas están viendo este pedido`}
      </span>
    </span>
  )
}
