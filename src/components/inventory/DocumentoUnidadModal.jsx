import { useEffect, useState } from 'react'
import { Button, Modal, Select } from '@/components/ui'
import { buildCertificadoHtml, buildInformeDispositivoHtml, printCertificado, printInformeDispositivo } from '@/components/shared/OrderReceipt'
import CompartirImagen from '@/components/shared/CompartirImagen'
import VistaPreviaPapel from '@/components/shared/VistaPreviaPapel'
import { datosInformeDispositivo } from '@/lib/printing/informeDispositivo'
import { datosCertificado, datosConstancia } from '@/lib/printing/certificado'
import { ticketCertificado, ticketInformeDispositivo } from '@/lib/printing/tickets'
import { imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { demoConsultaImei } from '@/lib/imeiComprobante'
import { isDemoRuntime } from '@/lib/demoMode'
import { api } from '@/lib/api/client'

// Informe de dispositivo y certificado de inspección (#240): vista previa
// imprimible en 80 mm y A4, con el QR al informe público. Toma los datos de la
// unidad (INV: equipo, checklist PhoneCheck, grado) y la última consulta de
// IMEI; la impresión directa usa el ESC/POS y el diálogo queda de respaldo.
const FORMATOS = [['thermal-80', '80 mm'], ['a4', 'A4'], ['thermal-58', '58 mm']]
const anchoDeFormato = (formato) => {
  if (formato === 'a4') return 80
  return Number(String(formato).replace('thermal-', '')) || 80
}

const TIPOS = {
  informe: {
    titulo: 'Informe del dispositivo',
    tipo: 'informe-dispositivo',
    ayuda: 'El QR abre el informe público de la unidad. La impresión directa sale por la impresora configurada (80 mm por defecto); «Descargar PDF» guarda la versión A4 o del rollo.',
    datos: (unit, consulta) => datosInformeDispositivo(unit, { consulta }),
    html: buildInformeDispositivoHtml,
    ticket: ticketInformeDispositivo,
    respaldo: printInformeDispositivo,
  },
  constancia: {
    titulo: 'Constancia de preparación',
    tipo: 'constancia-preparacion',
    ayuda: 'La declaración de formateo/desvinculación (iCloud, MDM, reportes y SIM) firmada para adjuntar al informe; el QR abre el informe público.',
    datos: (unit, consulta) => datosConstancia(unit, { verificacion: consulta }),
    html: buildCertificadoHtml,
    ticket: ticketCertificado,
    respaldo: printCertificado,
  },
  certificado: {
    titulo: 'Certificado de inspección',
    tipo: 'certificado-phonecheck',
    ayuda: 'La constancia de la inspección (grado, puntaje, controles y checklist) para el comprador; el QR abre el informe público. El código interno va en barras.',
    datos: (unit, consulta) => datosCertificado(unit, { verificacion: consulta }),
    html: buildCertificadoHtml,
    ticket: ticketCertificado,
    respaldo: printCertificado,
  },
}

export default function DocumentoUnidadModal({ unit, tipo = 'informe', open, onClose, onResult }) {
  const config = TIPOS[tipo] || TIPOS.informe
  const [formato, setFormato] = useState('thermal-80')
  const [datos, setDatos] = useState(null)
  const [html, setHtml] = useState('')
  const [cargando, setCargando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open || !unit) return undefined
    let activo = true
    setCargando(true)
    ;(async () => {
      // Última consulta de IMEI de la unidad (INV): en demo se simula. El
      // informe la muestra y el certificado toma de ahí los controles/fuente.
      let consulta = null
      try {
        if (isDemoRuntime) consulta = demoConsultaImei(unit.serial)
        else consulta = (await api.get(`/api/imei?imei=${encodeURIComponent(unit.serial)}&limit=1`))?.consultas?.[0] || null
      } catch { consulta = null }
      if (!activo) return
      const normalizado = config.datos(unit, consulta)
      setDatos(normalizado)
      setHtml(await config.html(normalizado, { format: formato }))
      if (activo) setCargando(false)
    })()
    return () => { activo = false }
    // `config` sale de `tipo`, que ya está en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit, formato, tipo])

  async function imprimirDirecto() {
    if (!datos || enviando) return
    setEnviando(true)
    try {
      const resultado = await imprimirDocumento(config.ticket(datos, { ancho: anchoDeFormato(formato) }), { tipo: config.tipo, ref: datos.serial })
      if (!resultado?.ok && puedeCaerAlDialogo(resultado)) {
        await config.respaldo(datos, { format: formato })
        return
      }
      onResult?.(resultado, config.titulo)
    } finally {
      setEnviando(false)
    }
  }

  function descargarPdf() {
    if (!html) return
    return config.respaldo(datos, { format: formato })
  }

  return (
    <Modal open={open} onClose={onClose} title={config.titulo} size="amplio">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block space-y-1 text-xs text-mute">
            <span>Formato</span>
            <Select aria-label="Formato del documento" className="w-32" value={formato} onChange={(event) => setFormato(event.target.value)}>
              {FORMATOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </label>
          <span className="flex flex-wrap items-center justify-end gap-2">
            <CompartirImagen
              construirHtml={() => html}
              nombre={`${config.tipo}-${datos?.identificador || ''}`}
              titulo={config.titulo}
              texto={datos?.modelo ? `${config.titulo} · ${datos.modelo}` : config.titulo}
              formato={formato}
              disabled={!html || cargando}
            />
            <Button type="button" variant="outline" onClick={descargarPdf} disabled={!html || cargando}>Descargar PDF</Button>
            <Button type="button" onClick={imprimirDirecto} disabled={!datos || cargando || enviando}>{enviando ? 'Enviando…' : 'Impresión directa'}</Button>
          </span>
        </div>
        <p className="text-[11px] text-mute">{config.ayuda}</p>
        <VistaPreviaPapel formato={formato} contenido={html} titulo="Vista previa del documento" />
      </div>
    </Modal>
  )
}
