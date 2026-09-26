import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Escáner por cámara (F3/F5 y reutilizable): usa `BarcodeDetector` del
// navegador y, si no está disponible, explica y deja el camino del lector
// Bluetooth/USB o el pegado múltiple. Copia el comportamiento del escáner del
// inventario (modo continuo con ventana anti-duplicado de 1,5 s) para que CMP
// lo unifique en la biblioteca.
export default function CameraScan({ onDetected, onClose, continuous = false, className, titulo = 'Enfocá el código' }) {
  const video = useRef(null)
  const [message, setMessage] = useState('Preparando cámara…')

  useEffect(() => {
    let stream
    let timer
    let stopped = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
        setMessage('Este navegador no admite escaneo por cámara. Usá un lector Bluetooth/USB o pegá los códigos.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        if (stopped || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        setMessage(continuous ? 'Escaneá cada equipo, uno tras otro. Se registran solos.' : titulo)
        const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'] })
        let ultimo = ''
        let ultimoEn = 0
        const leer = async () => {
          if (stopped || !video.current) return
          try {
            const codigos = await detector.detect(video.current)
            const valor = codigos[0]?.rawValue
            if (valor) {
              const ahora = Date.now()
              if (continuous && valor === ultimo && ahora - ultimoEn < 1500) {
                timer = window.setTimeout(leer, 250)
                return
              }
              ultimo = valor
              ultimoEn = ahora
              onDetected(valor)
              if (!continuous) {
                onClose?.()
                return
              }
            }
          } catch { /* la cámara sigue activa */ }
          timer = window.setTimeout(leer, 250)
        }
        leer()
      } catch {
        setMessage('No se pudo abrir la cámara. Revisá el permiso del navegador.')
      }
    }
    start()
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      stream?.getTracks?.().forEach((pista) => pista.stop())
    }
  }, [continuous, onClose, onDetected, titulo])

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative overflow-hidden rounded-xl border border-ink-600 bg-black">
        <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" />
      </div>
      <p role="status" className="text-sm text-mute">{message}</p>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          <Icon name="close" className="h-3.5 w-3.5" />Cerrar cámara
        </Button>
      </div>
    </div>
  )
}
