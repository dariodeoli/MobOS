// Decisión pura de acceso al panel de plataforma. Sin base de datos: el lector
// (acceso.ts) trae los datos frescos y esta función decide.
export type UsuarioAcceso = { status: string; email: string | null } | null | undefined
export type CuentaAcceso = { email: string | null; googleSubject: string | null } | null | undefined
export type EmpresaAcceso = { email: string | null; emailVerifiedAt: Date | string | null } | null | undefined

export function normalizarCorreo(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : ''
}

/** Correo del dueño de la plataforma, solo desde el entorno (nunca fijo en el código). */
export function correoDuenoPlataforma(env: Record<string, string | undefined> = process.env): string {
  const correo = normalizarCorreo(env.MOBOS_PLATFORM_OWNER_EMAIL)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : ''
}

export function decidirAcceso(entrada: { correoDueno: string; usuario: UsuarioAcceso; cuenta: CuentaAcceso; empresa: EmpresaAcceso }): boolean {
  const dueno = normalizarCorreo(entrada.correoDueno)
  if (!dueno) return false
  const { usuario, cuenta, empresa } = entrada
  if (!usuario || usuario.status !== 'ACTIVE' || normalizarCorreo(usuario.email) !== dueno) return false
  // Si hay cuenta vinculada, su correo no puede ser otro.
  if (cuenta?.email && normalizarCorreo(cuenta.email) !== dueno) return false
  // Correo verificado: Google ya lo verifica; si no, el correo de la empresa verificado.
  const google = !!cuenta?.googleSubject && normalizarCorreo(cuenta.email) === dueno
  const verificadoEmpresa = !!empresa?.emailVerifiedAt && normalizarCorreo(empresa.email) === dueno
  return google || verificadoEmpresa
}
