import { useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, Button, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { copiarValor } from '@/utils/portapapeles'
import { GrupoConfig, FilaConfig } from './FilasConfig'

// Dirección pública del portal (la misma que sirve App.jsx para clientes).
export const DIRECCION_PORTAL = 'clientes.moboss.online'

// #422 · Portal de clientes. Solo se ofrece lo que el backend sabe hacer hoy:
// ocultar el saldo a favor en el portal y copiar la dirección. Los enlaces de
// acceso, devoluciones y cancelaciones de autoservicio no existen todavía y por
// eso no aparecen como interruptores que no hacen nada.
export default function PortalClientes() {
  const { esDemo } = useSesion()
  const toast = useToast()
  const [preferencias, setPreferencias] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (esDemo) return undefined
    let vivo = true
    api.get('/api/tenant/preferences')
      .then((datos) => { if (vivo) setPreferencias(datos) })
      .catch((cause) => { if (vivo) setError(cause?.message || 'No se pudieron cargar los ajustes del portal.') })
    return () => { vivo = false }
  }, [esDemo])

  async function cambiarSaldo(valor) {
    if (guardando || !preferencias) return
    setGuardando(true); setError('')
    const anterior = preferencias
    setPreferencias({ ...preferencias, portal: { ...preferencias.portal, showStoreCredit: valor } })
    try {
      const guardado = await api.put('/api/tenant/preferences', { portal: { showStoreCredit: valor } })
      setPreferencias({ orders: guardado.orders, portal: guardado.portal })
      toast.success(valor ? 'El portal muestra el saldo a favor.' : 'El portal oculta el saldo a favor.')
    } catch (cause) {
      setPreferencias(anterior)
      setError(cause?.message || 'No se pudo guardar el ajuste.')
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-4" data-testid="portal-pantalla">
      {error && <Aviso tono="error">{error}</Aviso>}
      <GrupoConfig titulo="Cuentas de cliente" descripcion="Lo que tus clientes ven al entrar a su portal." anchor="portal-clientes">
        <FilaConfig
          icono="wallet"
          titulo="Mostrar el saldo a favor en el portal"
          descripcion={esDemo ? 'Disponible con una cuenta real.' : 'El cliente ve cuánto crédito de tienda tiene disponible. Si lo apagás, el portal no lo muestra.'}
          checked={preferencias ? preferencias.portal.showStoreCredit : true}
          onCambio={cambiarSaldo}
          disabled={esDemo || !preferencias || guardando}
          anchor="portal-saldo"
          testId="fila-portal-saldo"
        />
        <FilaConfig
          icono="globe"
          titulo="Dirección del portal"
          descripcion="Cada cliente entra con su enlace personal, que sacás desde su ficha en Clientes."
          anchor="portal-url"
          testId="fila-portal-url"
          accion={(
            <span className="flex shrink-0 items-center gap-2">
              <span className="hidden text-sm text-mute sm:inline">{DIRECCION_PORTAL}</span>
              <Button type="button" variant="outline" aria-label="Copiar la dirección del portal" onClick={() => copiarValor(toast, `https://${DIRECCION_PORTAL}`, 'Dirección del portal')}>
                <Icon name="copy" className="h-4 w-4" aria-hidden="true" />
                <span className="sm:hidden">Copiar</span>
              </Button>
            </span>
          )}
        />
      </GrupoConfig>
    </div>
  )
}
