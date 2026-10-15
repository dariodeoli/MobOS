// Feedback al escanear (#450): vibración y pitido corto para que quien escanea
// con la cámara sepa que el código entró sin mirar la pantalla. Todo es
// opcional y nunca lanza: sin `navigator.vibrate` (iOS) o sin audio, queda la
// confirmación visual.
const CLAVE_SONIDO = 'mobos:escaneo-sonido'

export function sonidoActivo() {
  try { return window.localStorage.getItem(CLAVE_SONIDO) !== '0' } catch { return true }
}

export function guardarSonido(activo) {
  try { window.localStorage.setItem(CLAVE_SONIDO, activo ? '1' : '0') } catch { /* sin almacenamiento */ }
}

const PATRONES = { ok: [60], aviso: [40, 60, 40], error: [120, 60, 120] }
const FRECUENCIAS = { ok: [880], aviso: [520, 520], error: [220, 180] }

export function vibrar(tipo = 'ok') {
  try { return Boolean(navigator.vibrate?.(PATRONES[tipo] || PATRONES.ok)) } catch { return false }
}

export function pitar(tipo = 'ok') {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext
    if (!Contexto) return false
    const contexto = new Contexto()
    let inicio = contexto.currentTime
    for (const frecuencia of FRECUENCIAS[tipo] || FRECUENCIAS.ok) {
      const oscilador = contexto.createOscillator()
      const ganancia = contexto.createGain()
      oscilador.frequency.value = frecuencia
      oscilador.type = 'sine'
      ganancia.gain.value = 0.08
      oscilador.connect(ganancia)
      ganancia.connect(contexto.destination)
      oscilador.start(inicio)
      oscilador.stop(inicio + 0.09)
      inicio += 0.12
    }
    window.setTimeout(() => { contexto.close?.().catch(() => {}) }, 600)
    return true
  } catch { return false }
}

/** Vibra y, si el sonido está activo, pita. `tipo`: ok | aviso | error. */
export function avisarEscaneo(tipo = 'ok') {
  vibrar(tipo)
  if (sonidoActivo()) pitar(tipo)
}
