// Regla pura: si el correo de la empresa cambia, deja de estar verificado.
// El nuevo correo no probó nada todavía; conservar `emailVerifiedAt` le
// regalaría a quien lo edita una verificación que no hizo.
export function correoCambioReseteaVerificacion(anterior: string | null | undefined, siguiente: string | null | undefined): boolean {
  const normal = (valor: string | null | undefined) => (valor ?? '').trim().toLowerCase()
  return normal(anterior) !== normal(siguiente)
}
