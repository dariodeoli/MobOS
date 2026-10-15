import { NextResponse } from 'next/server'
import { conAdministradorPlataforma } from '../../../../lib/superadmin/acceso'
import { ORDENES_CREDITOS, leerParamsLista } from '../../../../lib/superadmin/consultas'
import { listarCreditosEmpresas } from '../../../../lib/superadmin/creditos-imei'

export const dynamic = 'force-dynamic'

export const GET = conAdministradorPlataforma(async request => {
  const params = leerParamsLista(new URL(request.url), ORDENES_CREDITOS, 'consumo')
  return NextResponse.json(await listarCreditosEmpresas(params))
})
