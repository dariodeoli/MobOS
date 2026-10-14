// Decisión pura de acceso al panel de plataforma. Sin base de datos: el lector
// (acceso.ts) trae los datos frescos y esta función decide.
//
// La ÚNICA prueba de identidad aceptada es el correo verificado por Google
// (GoogleIdentity.email, escrito solo por el login de Google) de la cuenta de
// la sesión. Los correos de la empresa (Tenant.email) y del perfil (User.email)
// los edita cada empresa y NO sirven como prueba.
export type UsuarioAcceso = { status: string } | null | undefined
export type CuentaAcceso = { googleSubject: string | null } | null | undefined
export type IdentidadGoogleAcceso = { subject: string; email: string | null } | null | undefined

export function normalizarCorreo(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : ''
}

/** Correo del dueño de la plataforma, solo desde el entorno (nunca fijo en el código). */
export function correoDuenoPlataforma(env: Record<string, string | undefined> = process.env): string {
  const correo = normalizarCorreo(env.MOBOS_PLATFORM_OWNER_EMAIL)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : ''
}

export type MotivoDenegado = 'sin_configuracion' | 'usuario_inactivo' | 'sin_cuenta_google' | 'identidad_no_coincide' | 'correo_distinto'

/** Motivo de la denegación (código sin datos personales) o null si el acceso es válido. */
export function motivoDenegacion(entrada: { correoDueno: string; usuario: UsuarioAcceso; cuenta: CuentaAcceso; identidad: IdentidadGoogleAcceso }): MotivoDenegado | null {
  const dueno = normalizarCorreo(entrada.correoDueno)
  if (!dueno) return 'sin_configuracion'
  const { usuario, cuenta, identidad } = entrada
  if (!usuario || usuario.status !== 'ACTIVE') return 'usuario_inactivo'
  if (!cuenta?.googleSubject) return 'sin_cuenta_google'
  if (!identidad || identidad.subject !== cuenta.googleSubject) return 'identidad_no_coincide'
  if (normalizarCorreo(identidad.email) !== dueno) return 'correo_distinto'
  return null
}

export function decidirAcceso(entrada: Parameters<typeof motivoDenegacion>[0]): boolean {
  return motivoDenegacion(entrada) === null
}
