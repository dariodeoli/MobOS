import { NextResponse } from 'next/server'
import { conAdministradorPlataforma } from '../../../../lib/superadmin/acceso'

// El panel confirma acceso acá antes de dibujarse. Sin acceso: 404 genérico.
export const GET = conAdministradorPlataforma(async () => NextResponse.json({ ok: true }))
