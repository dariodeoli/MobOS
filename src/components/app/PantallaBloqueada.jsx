import { useEffect, useState } from 'react'
import Icon from '@/components/shared/Icon'
import PersonaChip from '@/components/shared/PersonaChip'
import ThemeLogo from '@/components/app/ThemeLogo'
import PinSegmentado from '@/components/shared/PinSegmentado'
import { Button, Eyebrow } from '@/components/ui'
import { identidadDeUsuario } from '@/lib/identidad'
import { vibrar } from '@/lib/nativo/haptics'
import { getLogoDataUrl, varianteDeTema } from '@/lib/tenantLogo'

// Pantalla de bloqueo del POS: identidad de la tienda, la sucursal y la
// persona; PIN que valida solo al completarlo (sin Enter) y aviso con
// sacudida + vibración cuando no coincide. El PIN nunca se muestra.
// Muestra la foto real del usuario y los logos (MobOS + tienda) con la
// variante del fondo, igual que la pantalla de carga (#210).
export default function PantallaBloqueada({
  abierto,
  empresa,
  sucursal,
  usuario,
  picture,
  pinLength = 4,
  pin,
  onPinChange,
  onCambiarUsuario,
  onSalir,
  busy = false,
  error,
  esDemo = false,
  faceId = null,
}) {
  const [logoEmpresa, setLogoEmpresa] = useState('')
  // Identidad unificada (#211): nombre visible, primer nombre y foto con el
  // mismo orden que el resto (foto local → Google → iniciales).
  const identidad = identidadDeUsuario({ ...(usuario || { name: 'Sesión protegida' }), picture })

  // Logo de la tienda con la variante del tema (#163): la tarjeta sigue al
  // fondo claro/oscuro, así que se pide la variante activa al abrir. En la demo
  // el pedido queda bloqueado por la barrera y no rompe (queda vacío).
  useEffect(() => {
    if (!abierto) return undefined
    let vigente = true
    getLogoDataUrl(varianteDeTema()).then((url) => { if (vigente) setLogoEmpresa(url || '') })
    return () => { vigente = false }
  }, [abierto])

  useEffect(() => {
    if (!abierto || !error) return
    vibrar('error')
  }, [abierto, error])

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-paper p-4 [padding-top:max(1rem,env(safe-area-inset-top))]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-title"
        data-testid="pantalla-bloqueada"
        className="mx-auto w-full max-w-sm rounded-3xl border border-ink-600 bg-ink p-5 text-center shadow-float [@media(min-height:760px)]:mt-[6vh] [@media(min-height:760px)]:p-6"
      >
        <ThemeLogo className="lock-logo mx-auto h-7 w-auto" />

        <span className="lock-icono mx-auto mt-4 grid [@media(max-height:760px)]:hidden h-12 w-12 place-items-center rounded-2xl bg-fono/10 text-fono-light">
          <Icon name="lock" className="h-5 w-5" />
        </span>
        <Eyebrow className="lock-eyebrow mt-2">Pantalla bloqueada</Eyebrow>
        <h2 id="lock-title" className="mt-3 flex items-center justify-center gap-2 text-xl font-bold">
          {logoEmpresa && (
            <img
              src={logoEmpresa}
              alt={empresa ? `Logo de ${empresa}` : 'Logo de la tienda'}
              data-testid="lock-logo-empresa"
              className="h-6 w-auto max-w-[7rem] shrink-0 object-contain"
            />
          )}
          <span className="truncate">{empresa || 'MobOS'}</span>
        </h2>
        <p className="lock-sucursal mt-1 text-xs text-mute">{sucursal ? `Sucursal ${sucursal}` : 'Todas las sucursales'}</p>

        <div className="mt-4 flex flex-col items-center gap-2">
          <PersonaChip
            user={{ id: usuario?.id, name: identidad.nombre, hasAvatar: identidad.hasAvatar }}
            picture={identidad.picture}
            size="xl"
            nombreCorto
            title={identidad.nombre}
            className="justify-center"
          />
          <p className="text-[11px] text-mute">Ingresá tu PIN de {pinLength} dígitos</p>
        </div>

        {usuario?.id ? (
          <>
            {faceId ? (
              <div className="mt-4" data-testid="lock-face-id">
                <p className="text-sm text-mute">Primero confirmá con Face ID; después te pedimos tu PIN.</p>
                <Button type="button" className="mt-3 min-h-11 w-full" onClick={faceId.onReintentar} data-testid="lock-face-id-boton">
                  <Icon name="lock" className="h-4 w-4" />Usar Face ID
                </Button>
              </div>
            ) : (
              <>
              <PinSegmentado
                id="lock-pin"
                autoFocus
                disabled={busy}
                length={pinLength}
                value={pin}
                onChange={onPinChange}
                invalido={Boolean(error)}
                className="mt-4"
              />
              <p role={error ? 'alert' : 'status'} className={`lock-ayuda mt-3 min-h-5 text-sm ${error ? 'text-bad' : 'text-mute'}`}>{error || (busy ? 'Verificando…' : 'Se valida solo al completar el PIN.')}</p>
              </>
            )}
            {esDemo && (
              <p className="mt-3 rounded-xl border border-fono-dark/20 bg-fono-dark/5 px-3 py-2 text-[11px] leading-4 text-mute">
                Demo: PIN vendedor <strong className="text-fore">2001</strong> · dueño <strong className="text-fore">3001</strong>
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-mute">
              No hay un vendedor activo que pueda desbloquear esta pantalla.
            </p>
            <Button type="button" className="mt-5 w-full" onClick={() => window.location.reload()}>
              Recargar la app
            </Button>
          </>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {onCambiarUsuario && (
            <Button type="button" variant="outline" onClick={onCambiarUsuario}>
              Cambiar de usuario
            </Button>
          )}
          {onSalir && (
            <Button type="button" variant="ghost" onClick={onSalir}>
              Cerrar sesión
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
