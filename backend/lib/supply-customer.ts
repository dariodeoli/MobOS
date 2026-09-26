// Abastecimiento F1 (#254, dominio clientes): quién puede ver los datos del
// cliente en la tarjeta de necesidad. El vínculo (id) siempre viaja; el nombre
// solo para quien puede gestionar clientes (`customers:manage`), así la tarjeta
// puede marcar `clienteOculto` sin filtrar datos.
export function puedeVerCliente(permisos: readonly string[] = []): boolean {
  return permisos.includes('*') || permisos.includes('customers:manage')
}
