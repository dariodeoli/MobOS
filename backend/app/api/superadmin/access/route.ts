import { NextResponse } from 'next/server'
import { conAdministradorPlataforma } from '../../../../lib/superadmin/acceso'
import { largoPinDueno, pinVigente } from '../../../../lib/superadmin/pin'

// El panel confirma acceso acá antes de dibujarse. Sin ser el dueño: 404
// genérico. Siendo el dueño pero sin PIN vigente: { pinRequerido: true } (esto
// jamás se le revela a quien no pasó la verificación de Google).
export const dynamic = 'force-dynamic'

export const GET = conAdministradorPlataforma(async (_request, dueno) => {
  if (await pinVigente(dueno.sessionId)) return NextResponse.json({ ok: true, pinRequerido: false })
  return NextResponse.json({ ok: true, pinRequerido: true, pinLargo: await largoPinDueno(dueno.userId) })
}, { sinPin: true })
