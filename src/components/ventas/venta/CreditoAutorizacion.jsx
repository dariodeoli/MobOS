import { Aviso, Label, PinInput } from '@/components/ui'
import { gs } from '@/utils/calculos'

// Aviso del cobro cuando la venta a crédito supera el crédito disponible del
// cliente (o el cliente no tiene crédito). El servidor decide siempre; acá se
// explica qué va a pasar y se ofrece autorizar en el momento:
//   · el dueño/administrador que vende confirma con un check («Autorizo yo»);
//   · cualquier vendedor puede pegar el PIN de un gerente o administrador;
//   · sin nada de eso la venta se crea «Pendiente de autorización de crédito»,
//     con las unidades reservadas, y no se entrega hasta que se apruebe.
export default function CreditoAutorizacion({ evaluacion, pin, setPin, autorizoYo, setAutorizoYo, puedeAutorizar, deshabilitado = false }) {
  if (!evaluacion?.requiereAutorizacion) return null
  return (
    <Aviso tono="warn" como="div" role="alert" data-testid="pos-credito-aviso" className="mt-2 space-y-2 rounded-xl p-3 text-xs">
      <p className="text-sm font-bold">
        {evaluacion.sinLimite
          ? 'El cliente no tiene crédito habilitado'
          : <>Supera el crédito disponible en <span data-testid="pos-credito-exceso" className="tabular-nums">{gs(evaluacion.exceso)}</span></>}
      </p>
      <p>
        {evaluacion.sinLimite
          ? 'Una venta a crédito necesita la autorización de un administrador o gerente.'
          : `Disponible ${gs(evaluacion.disponible)} de ${gs(evaluacion.limite)} (deuda actual ${gs(evaluacion.deuda)}); esta venta deja ${gs(evaluacion.saldo)} sin cobrar.`}
        {' '}Sin autorización queda <b>Pendiente de autorización de crédito</b> y no se entrega.
      </p>
      {puedeAutorizar && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold md:min-h-0">
          <input
            type="checkbox"
            data-testid="pos-credito-yo"
            className="h-4 w-4 shrink-0 accent-fono"
            checked={autorizoYo}
            disabled={deshabilitado}
            onChange={event => { setAutorizoYo(event.target.checked); if (event.target.checked) setPin('') }}
          />
          Autorizo este crédito yo (queda registrado a mi nombre)
        </label>
      )}
      {!autorizoYo && (
        <div className="space-y-1" data-testid="pos-credito-pin">
          <Label htmlFor="pin-credito" className="mb-0">PIN de gerente o administrador (autoriza ahora, opcional)</Label>
          <PinInput id="pin-credito" ariaLabel="PIN de gerente o administrador" length={6} value={pin} onChange={setPin} disabled={deshabilitado} />
        </div>
      )}
    </Aviso>
  )
}
