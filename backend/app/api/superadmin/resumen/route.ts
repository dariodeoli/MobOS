import { NextResponse } from 'next/server'
import { conAdministradorPlataforma } from '../../../../lib/superadmin/acceso'
import { resumenPlataforma } from '../../../../lib/superadmin/consultas'
import { normalizarPeriodo } from '../../../../lib/superadmin/rangos'

export const dynamic = 'force-dynamic'

export const GET = conAdministradorPlataforma(async request => {
  const periodo = normalizarPeriodo(new URL(request.url).searchParams.get('periodo'))
  return NextResponse.json(await resumenPlataforma(periodo))
})
