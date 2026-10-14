import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, useToast } from '@/components/ui'
import VentanaDetalle from '@/components/shared/VentanaDetalle'
import CheatSheetAtajos from '@/components/app/CheatSheetAtajos'
import { GrupoConfig, FilaConfig } from './FilasConfig'
import IdentidadCuenta from './IdentidadCuenta'
import { RegistroDeCambios } from './RegistroDeCambios'
import { prefijoEfectivo, vistaPreviaNumeros } from './formatoPedido'

// #422 · Organización › Datos generales, en filas como el admin de Shopify:
// información comercial, contacto y dirección (cada una abre el formulario
// existente de la tienda en una ventana), valores predeterminados, formato del
// ID de pedido, procesamiento de pedidos y recursos. Los datos salen de los
// mismos endpoints de siempre (`/api/account`, `/api/tenant/preferences`).
export default function General({ tenant, onTenantChange, onReauthValid, onIrANumeracion }) {
  const { empresa, esDemo } = useSesion()
  const toast = useToast()
  const navigate = useNavigate()
  const [ventana, setVentana] = useState(null) // 'comercial' | 'contacto' | 'direccion' | 'atajos' | 'cambios'
  const [preferencias, setPreferencias] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (esDemo) return undefined
    let vivo = true
    api.get('/api/tenant/preferences')
      .then((datos) => { if (vivo) setPreferencias(datos) })
      .catch((cause) => { if (vivo) setError(cause?.message || 'No se pudieron cargar los ajustes de pedidos.') })
    return () => { vivo = false }
  }, [esDemo])

  async function cambiarArchivado(valor) {
    if (guardando || !preferencias) return
    setGuardando(true); setError('')
    const anterior = preferencias
    setPreferencias({ ...preferencias, orders: { ...preferencias.orders, autoArchivePrepared: valor } })
    try {
      const guardado = await api.put('/api/tenant/preferences', { orders: { autoArchivePrepared: valor } })
      setPreferencias({ orders: guardado.orders, portal: guardado.portal })
      toast.success(valor ? 'Los pedidos preparados y pagados se archivan solos.' : 'Los pedidos preparados y pagados quedan en Activos.')
    } catch (cause) {
      setPreferencias(anterior)
      setError(cause?.message || 'No se pudo guardar el ajuste.')
    } finally { setGuardando(false) }
  }

  const prefijo = prefijoEfectivo(tenant?.orderPrefix)
  const siguiente = Number(tenant?.orderNextNumber) > 0 ? Number(tenant.orderNextNumber) : 1
  const direccion = [tenant?.address, tenant?.city, tenant?.department].filter(Boolean).join(', ')
  const contacto = [empresa?.email, tenant?.phone].filter(Boolean).join(' · ')
  const cerrar = () => setVentana(null)
  const props = { tenant, onReauthValid, onGuardado: onTenantChange, modo: 'ventana', onCerrar: cerrar }

  return (
    <div className="space-y-4" data-testid="general-pantalla">
      {error && <Aviso tono="error">{error}</Aviso>}

      <GrupoConfig titulo="Datos de la tienda" descripcion="Se usan en comprobantes, portal y reportes." anchor="datos" testId="datos-tienda-grupo">
        <FilaConfig
          icono="store"
          titulo="Información comercial"
          descripcion={[empresa?.nombre, tenant?.ruc ? `RUC ${tenant.ruc}` : null, '🇵🇾 Paraguay'].filter(Boolean).join(' · ')}
          onClick={() => setVentana('comercial')}
          testId="fila-comercial"
        />
        <FilaConfig
          icono="mail"
          titulo="Contacto de la tienda"
          descripcion={contacto || 'Correo y teléfono que ven tus clientes'}
          onClick={() => setVentana('contacto')}
          testId="fila-contacto"
        />
        <FilaConfig
          icono="pin"
          titulo="Dirección"
          descripcion={direccion || 'Aparece en comprobantes y en el portal'}
          onClick={() => setVentana('direccion')}
          testId="fila-direccion"
        />
      </GrupoConfig>

      <GrupoConfig titulo="Valores predeterminados" anchor="predeterminados">
        <FilaConfig icono="money" titulo="Moneda" descripcion="Todos los importes se registran en guaraníes." valor="PYG ₲" />
        <FilaConfig icono="clock" titulo="Zona horaria" descripcion="Fechas y horas de ventas, caja y reportes." valor="America/Asuncion" />
        <FilaConfig icono="sliders" titulo="Sistema de unidades" descripcion="Pesos y medidas de envíos y etiquetas." valor="Métrico (kg, cm)" />
      </GrupoConfig>

      <GrupoConfig titulo="Formato del ID de pedido" anchor="formato-pedido">
        <FilaConfig
          icono="receipt"
          titulo="Prefijo y número"
          descripcion={`Así se verán tus pedidos: ${vistaPreviaNumeros(prefijo, siguiente)}`}
          onClick={onIrANumeracion}
          testId="fila-formato-pedido"
        />
      </GrupoConfig>

      <GrupoConfig titulo="Procesamiento de pedidos" anchor="procesamiento">
        <FilaConfig
          icono="archive"
          titulo="Archivar automáticamente los pedidos preparados y pagados"
          descripcion={esDemo
            ? 'Disponible con una cuenta real.'
            : 'Salen de la lista activa apenas el pedido está pagado y listo para entregar; los encontrás en Archivados.'}
          checked={Boolean(preferencias?.orders?.autoArchivePrepared)}
          onCambio={cambiarArchivado}
          disabled={esDemo || !preferencias || guardando}
          testId="fila-archivar-preparados"
        />
      </GrupoConfig>

      <GrupoConfig titulo="Recursos" anchor="recursos">
        <FilaConfig icono="list" titulo="Registro de cambios" descripcion="Qué novedades salieron en las últimas versiones." onClick={() => setVentana('cambios')} testId="fila-novedades" />
        <FilaConfig icono="terminal" titulo="Atajos de teclado" descripcion="Moverte más rápido en el sistema." onClick={() => setVentana('atajos')} testId="fila-atajos" />
        <FilaConfig icono="audit" titulo="Registro de actividad" descripcion="Quién hizo qué y cuándo en tu tienda." onClick={() => navigate('/configuracion/seguridad')} testId="fila-actividad" />
      </GrupoConfig>

      <VentanaDetalle open={['comercial', 'contacto', 'direccion'].includes(ventana)} onClose={cerrar} title={{ comercial: 'Información comercial', contacto: 'Contacto de la tienda', direccion: 'Dirección' }[ventana] || ''} size="md">
        {['comercial', 'contacto', 'direccion'].includes(ventana) && <IdentidadCuenta {...props} campos={ventana} />}
      </VentanaDetalle>
      <VentanaDetalle open={ventana === 'atajos'} onClose={cerrar} title="Atajos de teclado" size="md">
        <CheatSheetAtajos />
      </VentanaDetalle>
      <VentanaDetalle open={ventana === 'cambios'} onClose={cerrar} title="Registro de cambios" size="md">
        {ventana === 'cambios' && <RegistroDeCambios />}
      </VentanaDetalle>
    </div>
  )
}
