import { NextResponse } from 'next/server'
import { conAdministradorPlataforma, noEncontrado } from '../../../../../lib/superadmin/acceso'
import { detalleCreditos } from '../../../../../lib/imei-credits'
import { aplicarAccionCreditos, empresaExiste } from '../../../../../lib/superadmin/creditos-imei'

export const dynamic = 'force-dynamic'

// Solo el dueño de la plataforma (el envoltorio responde 404 a cualquier otra
// persona, sin revelar que el panel existe).
export const GET = conAdministradorPlataforma(async (_request, _dueno, { params }) => {
  const id = String(params.id).slice(0, 64)
  if (!(await empresaExiste(id))) return noEncontrado()
  return NextResponse.json(await detalleCreditos(id))
})

export const POST = conAdministradorPlataforma(async (request, dueno, { params }) => {
  const id = String(params.id).slice(0, 64)
  if (!(await empresaExiste(id))) return noEncontrado()
  let cuerpo: any
  try { cuerpo = await request.json() } catch { return NextResponse.json({ message: 'Cuerpo inválido.' }, { status: 400 }) }
  const resultado = await aplicarAccionCreditos(id, dueno, cuerpo)
  return NextResponse.json(resultado.cuerpo, { status: resultado.status })
})
