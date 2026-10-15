import { NextResponse } from 'next/server'
import { conAdministradorPlataforma } from '../../../../lib/superadmin/acceso'
import { ORDENES_USUARIOS, leerParamsLista, listarUsuarios } from '../../../../lib/superadmin/consultas'

export const dynamic = 'force-dynamic'

export const GET = conAdministradorPlataforma(async request => {
  const params = leerParamsLista(new URL(request.url), ORDENES_USUARIOS, 'alta')
  return NextResponse.json(await listarUsuarios(params))
})
