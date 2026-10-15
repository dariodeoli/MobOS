import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { Aviso } from '@/components/ui'
import { rutaDeVista } from '@/lib/rutas'
import { GrupoConfig, FilaConfig } from './FilasConfig'
import { dominioDeCorreo, esDominioPublico } from './dominioPublico'

// #422 · Notificaciones. Reúne en un lugar los accesos a lo que ya existe:
// mensajes a clientes (plantillas de WhatsApp), avisos al equipo (preferencias
// de la cuenta) y correo saliente / webhooks (estado del sistema). No duplica
// pantallas: cada fila lleva a la suya.
export default function Notificaciones() {
  const { empresa } = useSesion()
  const navigate = useNavigate()
  const correo = empresa?.email || ''
  const publico = esDominioPublico(correo)

  return (
    <div className="space-y-4" data-testid="notificaciones-pantalla">
      <GrupoConfig titulo="Correo del remitente" descripcion="El correo de tu tienda en los mensajes que reciben tus clientes." anchor="notificaciones-remitente">
        <FilaConfig
          icono="mail"
          titulo={correo || 'Tu tienda no tiene un correo cargado'}
          descripcion="Es el correo de contacto de la tienda. Podés cambiarlo en Datos generales."
          valor={correo ? dominioDeCorreo(correo) : ''}
          onClick={() => navigate('/configuracion/organizacion')}
          testId="fila-remitente"
        />
        {publico && (
          <div className="px-4 py-3" data-testid="aviso-dominio-publico">
            <Aviso tono="warn" como="div">
              Tu correo es de un dominio público ({dominioDeCorreo(correo)}), así que no se puede usar como remitente de las notificaciones: los correos a tus clientes salen desde MobOS.            </Aviso>
          </div>
        )}
      </GrupoConfig>

      <GrupoConfig titulo="Notificaciones" anchor="notificaciones-lista">
        <FilaConfig
          icono="send"
          titulo="Notificaciones a clientes"
          descripcion="Plantillas de WhatsApp: recordatorio de cobro, pedido listo y más."
          onClick={() => navigate(rutaDeVista('plantillas') || '/plantillas')}
          anchor="notificaciones-clientes"
          testId="fila-notif-clientes"
        />
        <FilaConfig
          icono="bell"
          titulo="Notificaciones al equipo"
          descripcion="Avisos de pedidos, aprobaciones y menciones en cada dispositivo."
          onClick={() => navigate('/mi-cuenta')}
          anchor="notificaciones-equipo"
          testId="fila-notif-equipo"
        />
        <FilaConfig
          icono="code"
          titulo="Correo saliente y webhooks"
          descripcion="Estado del envío de correos, la cola y las integraciones conectadas."
          onClick={() => navigate('/configuracion/sistema')}
          anchor="notificaciones-webhooks"
          testId="fila-notif-webhooks"
        />
      </GrupoConfig>
    </div>
  )
}
