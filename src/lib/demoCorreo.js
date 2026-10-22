import { API_URL } from '@/lib/api/client'
import { avisoCorreoDemo, enviarCorreoDemo } from '@/lib/demoCorreoRequest'

/**
 * Pide el correo real de la demo y devuelve `{ resultado, aviso }`. Nunca lanza:
 * si el envío está apagado o no hay red, `aviso` es null y la pantalla sigue como siempre.
 */
export async function solicitarCorreoDemo(payload) {
  const resultado = await enviarCorreoDemo(payload, { apiUrl: API_URL })
  return { resultado, aviso: avisoCorreoDemo(resultado, payload.email) }
}

/** Atajo para pantallas con `toast`: avisa solo si hay algo que decir (enviado o rechazado). */
export async function enviarYAvisarCorreoDemo(toast, payload) {
  const { resultado, aviso } = await solicitarCorreoDemo(payload)
  if (aviso) (aviso.tipo === 'success' ? toast.success : toast.error)(aviso.titulo, aviso.detalle)
  return resultado
}
