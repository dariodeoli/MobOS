import AutorizacionBloque from './AutorizacionBloque'

// Descuento global fuera de política: el vendedor pide autorización desde el
// carrito y gerencia la resuelve en su panel. Si hay una aprobada vigente (sin
// usar y que alcanza para el monto actual) se entrega al POS para que la venta
// viaje con discountAuthorizationId.
export default function AutorizacionDescuento({ monto, customerId, onSelect, bloqueado }) {
  return (
    <AutorizacionBloque
      kind="DISCOUNT"
      titulo="Descuento fuera de política"
      descripcion="Solicitá autorización con el monto actual y actualizá el estado cuando gerencia responda."
      requestedValue={{ discountPyg: monto }}
      customerId={customerId}
      monto={monto}
      onSelect={onSelect}
      bloqueado={bloqueado}
    />
  )
}
