import './inicioRediseno.css'
import { useSesion } from '@/lib/sesion'
import { gs, num } from '@/utils/calculos'
import Icon from '@/components/shared/Icon'

// Rediseño de Inicio (solo presentación): saludo, accesos grandes y actividad
// reciente. Usa datos que la pantalla ya tiene; no calcula ni guarda nada.
const ATAJOS = [
  { clave: 'vender', texto: 'Vender', ayuda: 'Abrir la caja', ruta: '/pos', icono: 'plus', principal: true },
  { clave: 'pedidos', texto: 'Pedidos', ayuda: 'Seguimiento y cobros', ruta: '/pedidos', icono: 'receipt' },
  { clave: 'clientes', texto: 'Clientes', ayuda: 'Fichas y deudas', ruta: '/clientes', icono: 'users' },
  { clave: 'stock', texto: 'Stock', ayuda: 'Unidades por IMEI', ruta: '/stock', icono: 'phone' },
]

function saludoDeHora(hora) {
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function InicioSaludo({ onIr }) {
  const { usuario, empresa } = useSesion()
  const primerNombre = String(usuario?.user_metadata?.nombre || usuario?.nombre || '').trim().split(/\s+/)[0]
  return (
    <section className="inicio-saludo" data-testid="inicio-saludo" aria-label="Inicio">
      <div className="inicio-saludo__texto">
        <h2 className="inicio-saludo__titulo">{saludoDeHora(new Date().getHours())}{primerNombre ? `, ${primerNombre}` : ''}</h2>
        {empresa?.nombre && <p className="inicio-saludo__sub">{empresa.nombre}</p>}
      </div>
      <nav className="inicio-atajos" aria-label="Accesos rápidos" data-testid="inicio-atajos">
        {ATAJOS.map((atajo) => (
          <button
            key={atajo.clave}
            type="button"
            data-testid={`inicio-atajo-${atajo.clave}`}
            data-principal={atajo.principal ? 'true' : undefined}
            className="inicio-atajo"
            onClick={() => onIr(atajo.ruta)}
          >
            <span className="inicio-atajo__icono" aria-hidden="true"><Icon name={atajo.icono} className="h-5 w-5" /></span>
            <span className="inicio-atajo__texto">
              <span className="inicio-atajo__titulo">{atajo.texto}</span>
              <span className="inicio-atajo__ayuda">{atajo.ayuda}</span>
            </span>
          </button>
        ))}
      </nav>
    </section>
  )
}

export function InicioActividad({ ventas, prods, onIr }) {
  const recientes = [...(ventas || [])]
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
    .slice(0, 5)
  if (!recientes.length) return null
  return (
    <section className="inicio-actividad" data-testid="inicio-actividad" aria-label="Actividad reciente">
      <div className="inicio-actividad__cab">
        <h3>Actividad reciente</h3>
        <button type="button" className="inicio-actividad__ver" onClick={() => onIr('/pedidos')}>Ver pedidos</button>
      </div>
      <ul>
        {recientes.map((v, i) => (
          <li key={v.id ?? i} className="inicio-actividad__fila">
            <span className="inicio-actividad__punto" aria-hidden="true" />
            <span className="inicio-actividad__cliente">{v.cliente || 'Consumidor final'}</span>
            <span className="inicio-actividad__detalle">{v.productoNombre || prods?.[v.productoId]?.nombre || '—'}</span>
            <span className="inicio-actividad__monto">{gs(num(v.precio))}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
