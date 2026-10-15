import { isNativeIOS } from '../plataforma.js'

// Respuesta háptica: en la app de iPhone usa el motor háptico (Taptic Engine);
// en el navegador conserva `navigator.vibrate` como antes. Nunca lanza.
// tipo: 'exito' | 'error' | 'toque'
export function vibrar(tipo = 'toque') {
  if (isNativeIOS()) {
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (tipo === 'exito') return Haptics.notification({ type: NotificationType.Success })
      if (tipo === 'error') return Haptics.notification({ type: NotificationType.Error })
      return Haptics.impact({ style: ImpactStyle.Light })
    }).catch(() => { /* sin háptica disponible */ })
    return
  }
  try { navigator.vibrate?.(tipo === 'error' ? 120 : 40) } catch { /* sin soporte de vibración */ }
}
