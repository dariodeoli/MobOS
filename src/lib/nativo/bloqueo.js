// Bloqueo de la app de iPhone. Los iPhone de una tienda son compartidos: al
// abrir la app (arranque en frío) y al volver del segundo plano se pide SIEMPRE
// el PIN privado del vendedor (el mismo de la web), que además identifica
// quién vende. Sin Face ID: cualquiera puede registrar su cara en un equipo
// compartido, así que no identifica a nadie.
//
// «PIN vigente» vive en sessionStorage: un arranque en frío empieza vacío (se
// pide el PIN) y una recarga dentro de la misma sesión de la app lo conserva
// (por ejemplo, justo después de escribir el PIN en el login).

const CLAVE = 'mobos:pin-vigente'

export function pinVigente(almacen = globalThis.sessionStorage) {
  try { return almacen.getItem(CLAVE) === '1' } catch { return false }
}

export function marcarPinVigente(vigente, almacen = globalThis.sessionStorage) {
  try {
    if (vigente) almacen.setItem(CLAVE, '1')
    else almacen.removeItem(CLAVE)
  } catch { /* sin almacenamiento: se pedirá el PIN de más, nunca de menos */ }
}

/** Avisa cada vez que la app pasa a segundo plano (no cuando solo queda «inactiva»). */
export async function alPasarASegundoPlano(callback) {
  try {
    const { App } = await import('@capacitor/app')
    const handle = await App.addListener('pause', callback)
    return () => { handle.remove() }
  } catch { return () => {} }
}
