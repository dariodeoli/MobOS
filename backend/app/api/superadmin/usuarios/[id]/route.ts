import { NextResponse } from 'next/server'
import { conAdministradorPlataforma, noEncontrado } from '../../../../../lib/superadmin/acceso'
import { detalleUsuario } from '../../../../../lib/superadmin/consultas'

export const dynamic = 'force-dynamic'

export const GET = conAdministradorPlataforma(async (_request, _dueno, { params }) => {
  const detalle = await detalleUsuario(String(params.id).slice(0, 64))
  return detalle ? NextResponse.json(detalle) : noEncontrado()
})
