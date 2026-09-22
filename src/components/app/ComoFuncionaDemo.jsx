import Icon from '@/components/shared/Icon'
import { Modal } from '@/components/ui'

// Reglas visibles de la demo pública (#201): qué es ficticio, qué se guarda y
// qué se simula. Se muestra en la entrada y desde el banner del panel.
export const PUNTOS_DEMO = [
  {
    icono: 'user',
    titulo: 'Perfiles listos',
    texto: 'Entrá como Vendedor (2001) o Dueño (3001): no hace falta crear cuenta ni configurar nada.',
  },
  {
    icono: 'box',
    titulo: 'Datos ficticios',
    texto: 'La tienda, los clientes, los productos y las unidades son de mentira; los IMEI son DEMO.',
  },
  {
    icono: 'lock',
    titulo: 'Nada se guarda',
    texto: 'Lo que cargues vive solo en esta pestaña: se descarta al recargar, cerrar o cambiar de perfil. No toca ninguna tienda real.',
  },
  {
    icono: 'grid',
    titulo: 'Todos los módulos',
    texto: 'Ventas, pedidos, clientes, inventario, finanzas, servicio y configuración funcionan con datos demo. Lo que depende de hardware real (impresión, estado del sistema) se muestra como no disponible.',
  },
  {
    icono: 'search',
    titulo: 'IMEI simulado',
    texto: 'La verificación de IMEI se simula con un resultado de ejemplo marcado como simulado: no se consulta ni se cobra nada.',
  },
  {
    icono: 'search',
    titulo: 'RUC simulado',
    texto: 'El extractor de RUC devuelve una razón social de ejemplo marcada como simulada: no consulta el registro real y los datos se aplican solo si los confirmás.',
  },
]

export function PuntosDemo({ className = '' }) {
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {PUNTOS_DEMO.map((punto) => (
        <li key={punto.titulo} className="flex items-start gap-3 rounded-xl border border-ink-600 p-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fono/10 text-fono-light">
            <Icon name={punto.icono} className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{punto.titulo}</span>
            <span className="mt-0.5 block text-xs leading-5 text-mute">{punto.texto}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function ComoFuncionaDemo({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Cómo funciona la demo" size="formulario">
      <PuntosDemo />
      <p className="mt-4 text-xs text-mute">
        ¿Algo no cuadra? Recargá la página: la demo vuelve a su estado inicial.
      </p>
    </Modal>
  )
}
