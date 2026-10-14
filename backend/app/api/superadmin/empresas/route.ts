import { NextResponse } from 'next/server'
import { conAdministradorPlataforma } from '../../../../lib/superadmin/acceso'
import { ORDENES_EMPRESAS, leerParamsLista, listarEmpresas } from '../../../../lib/superadmin/consultas'

export const dynamic = 'force-dynamic'

export const GET = conAdministradorPlataforma(async request => {
  const params = leerParamsLista(new URL(request.url), ORDENES_EMPRESAS, 'alta')
  return NextResponse.json(await listarEmpresas(params))
})
