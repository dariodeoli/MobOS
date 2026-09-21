import Icon from '@/components/shared/Icon'

// Módulos que dependen de hardware o del sistema real no se pueden simular con
// datos ficticios: en la demo se muestran con una explicación honesta en lugar
// de un error de red (#201).
export default function DemoNoDisponible({ modulo = 'Este módulo', motivo }) {
  return (
    <div data-testid="demo-no-disponible" className="rounded-2xl border border-ink-600 bg-ink-800/40 p-5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-fono/10 text-fono-light">
        <Icon name="info" className="h-5 w-5" />
      </span>
      <h2 className="mt-3 text-base font-semibold">{modulo} no está disponible en la demo</h2>
      <p className="mt-1 text-sm text-mute">
        {motivo || 'Depende de datos reales de tu tienda y la demo no consulta ningún servicio.'}
      </p>
      <p className="mt-2 text-xs text-mute">
        El resto de los módulos funciona con datos ficticios; nada se guarda ni se envía.
      </p>
    </div>
  )
}
