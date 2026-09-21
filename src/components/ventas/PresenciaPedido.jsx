import { usePresentes } from '@/hooks/usePresence'
import { etiquetaPresencia } from '@/lib/presence'
import { useSesion } from '@/lib/sesion'
import PersonaChip from '@/components/shared/PersonaChip'

// Quién más está viendo este pedido (mismo alcance de presencia). Usa el
// objeto único de identidad (#211): foto local → Google → iniciales y solo el
// primer nombre en el texto compacto. Si nadie más está en la página, no
// ocupa espacio.
export default function PresenciaPedido({ pedidoId, className = '' }) {
  const personas = usePresentes()
  const { sesion } = useSesion()
  const alcance = `pedidos/${pedidoId}`
  // Quien mira no se cuenta a sí mismo: la línea habla de las OTRAS personas.
  const miId = sesion?.vendedorId || ''
  const otros = personas.filter((persona) => persona.scope === alcance && persona.id !== miId)
  if (!otros.length) return null
  const etiqueta = etiquetaPresencia(otros)
  return (
    <span className={`flex items-center gap-2 ${className}`} title={etiqueta} aria-label={etiqueta}>
      {otros.length === 1 ? (
        <PersonaChip user={otros[0]} size="sm" nombreCorto estado="en-linea" textoClassName="text-ok">está viendo este pedido</PersonaChip>
      ) : (
        <>
          <span className="flex -space-x-2">
            {otros.slice(0, 3).map((persona) => (
              <PersonaChip key={persona.id} user={persona} size="sm" nombre={false} estado="en-linea" avatarClassName="border-paper" />
            ))}
          </span>
          <span className="text-xs font-semibold text-ok">{otros.length} personas están viendo este pedido</span>
        </>
      )}
    </span>
  )
}
