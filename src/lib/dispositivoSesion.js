// #300 · Descripción legible del dispositivo de una sesión: el usuario tiene
// que reconocer «Chrome en Mac · macOS» sin leer un `deviceId` crudo. Puro y
// testeable; los identificadores técnicos quedan para «Detalles técnicos».

/** Navegador, sistema y tipo de dispositivo detectados del User-Agent. */
export function describirDispositivo(userAgent) {
  const ua = String(userAgent || '')
  if (!ua) return { navegador: '', sistema: '', dispositivo: '', etiqueta: 'Dispositivo sin identificar' }

  // iPadOS moderno se hace pasar por Macintosh + Mobile.
  const esIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))
  const esIPhone = /iPhone|iPod/.test(ua)
  const esAndroid = /Android/.test(ua)
  const esChromeOS = /CrOS/.test(ua)
  const esWindows = /Windows/.test(ua)
  const esMac = /Macintosh|Mac OS X|macOS|Darwin/.test(ua)
  // #340: no todos los agentes dicen «Linux». El cliente HTTP de Playwright en
  // CI manda `(x64; ubuntu 24.04)` y quedaba como «Sistema desconocido». Las
  // distros habituales cuentan como Linux; Android se excluye aparte.
  const esLinux = /Linux|Ubuntu|Debian|Fedora|Red Hat|CentOS|Alpine/i.test(ua) && !esAndroid

  let navegador = 'Navegador'
  if (/Edg\//.test(ua)) navegador = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) navegador = 'Opera'
  else if (/SamsungBrowser/.test(ua)) navegador = 'Samsung Internet'
  else if (/CriOS/.test(ua)) navegador = 'Chrome'
  else if (/FxiOS/.test(ua)) navegador = 'Firefox'
  else if (/Firefox\//.test(ua)) navegador = 'Firefox'
  else if (/Chrome\//.test(ua)) navegador = 'Chrome'
  else if (/Safari\//.test(ua)) navegador = 'Safari'

  let dispositivo = 'Dispositivo'
  let sistema = 'Sistema desconocido'
  if (esIPad) { dispositivo = 'iPad'; sistema = 'iPadOS' }
  else if (esIPhone) { dispositivo = 'iPhone'; sistema = 'iOS' }
  else if (esAndroid) { dispositivo = /Mobile/.test(ua) ? 'celular Android' : 'tablet Android'; sistema = 'Android' }
  else if (esChromeOS) { dispositivo = 'Chromebook'; sistema = 'ChromeOS' }
  else if (esWindows) { dispositivo = 'PC'; sistema = 'Windows' }
  else if (esMac) { dispositivo = 'Mac'; sistema = 'macOS' }
  else if (esLinux) { dispositivo = 'equipo Linux'; sistema = 'Linux' }

  return { navegador, sistema, dispositivo, etiqueta: `${navegador} en ${dispositivo} · ${sistema}` }
}

/** «hace 5 min», «ayer», «hace 3 meses»… vacío si la fecha no es válida. */
export function haceCuanto(fecha, ahora = Date.now()) {
  const tiempo = new Date(fecha).getTime()
  if (!Number.isFinite(tiempo)) return ''
  const segundos = Math.max(0, Math.round((ahora - tiempo) / 1000))
  if (segundos < 60) return 'hace instantes'
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.round(dias / 30)
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`
}
