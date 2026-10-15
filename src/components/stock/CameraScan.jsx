import { useEffect, useRef, useState } from 'react'
import { isNativeIOS } from '@/lib/plataforma'
import { iniciarEscaneoNativo } from '@/lib/nativo/escaner'

export function CameraScan({ onDetected, onClose, continuous = false }) {
  const video = useRef(null)
  const [message, setMessage] = useState('Preparando cámara…')
  // Los callbacks viajan por ref: si el padre los recrea en cada render, el
  // escáner nativo no se reabre.
  const callbacks = useRef({ onDetected, onClose })
  callbacks.current = { onDetected, onClose }
  useEffect(() => {
    if (!isNativeIOS()) return undefined
    setMessage('Abriendo la cámara…')
    return iniciarEscaneoNativo({
      continuous,
      onDetected: (valor) => callbacks.current.onDetected(valor),
      onClose: () => callbacks.current.onClose?.(),
      setMessage,
    })
  }, [continuous])

  useEffect(() => {
    let stream; let timer; let stopped = false
    // App de iPhone: lo resuelve el efecto del escáner nativo (ML Kit).
    if (isNativeIOS()) return undefined
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) { setMessage('Este navegador no admite escaneo por cámara. Usá un lector Bluetooth/USB o ingresá el código.'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        if (stopped || !video.current) return
        video.current.srcObject = stream; await video.current.play(); setMessage(continuous ? 'Escaneá cada equipo, uno tras otro. Se registran solos.' : 'Enfocá el QR o código de barras.')
        const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'] })
        // En modo continuo se ignora el mismo código durante 1,5 s para no
        // duplicar lecturas del mismo cuadro de video.
        let lastRaw = ''; let lastAt = 0
        const read = async () => {
          if (stopped || !video.current) return
          try {
            const codes = await detector.detect(video.current)
            const raw = codes[0]?.rawValue
            if (raw) {
              const now = Date.now()
              if (continuous && raw === lastRaw && now - lastAt < 1500) { timer = window.setTimeout(read, 250); return }
              lastRaw = raw; lastAt = now
              onDetected(raw)
              if (!continuous) { onClose(); return }
            }
          } catch { /* la cámara sigue activa */ }
          timer = window.setTimeout(read, 250)
        }
        read()
      } catch { setMessage('No se pudo abrir la cámara. Revisá el permiso del navegador.') }
    }
    start()
    return () => { stopped = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()) }
  }, [onDetected, onClose, continuous])
  return <div className="space-y-3"><video ref={video} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline /><p className="text-sm text-mute">{message}</p></div>
}
