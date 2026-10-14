import { NextResponse } from 'next/server'
import { conAdministradorPlataforma } from '../../../../lib/superadmin/acceso'
import { verificarPinDueno } from '../../../../lib/superadmin/pin'

// Segundo factor: el dueño (ya verificado por Google) ingresa su PIN personal.
// Los intentos se limitan por usuario (5 cada 15 min, luego 15 min de bloqueo).
export const dynamic = 'force-dynamic'

export const POST = conAdministradorPlataforma(async (request, dueno) => {
  const cuerpo = await request.json().catch(() => null)
  const resultado = await verificarPinDueno(dueno.userId, dueno.sessionId, cuerpo?.pin)
  if (resultado.estado === 'ok') return NextResponse.json({ ok: true })
  if (resultado.estado === 'bloqueado') {
    return NextResponse.json({ message: 'Demasiados intentos. Esperá unos minutos para volver a probar.', code: 'PIN_BLOQUEADO', segundos: resultado.segundos }, { status: 429, headers: { 'Retry-After': String(resultado.segundos) } })
  }
  return NextResponse.json({ message: 'PIN incorrecto.', code: 'PIN_INCORRECTO', restantes: resultado.restantes }, { status: 422 })
}, { sinPin: true })
