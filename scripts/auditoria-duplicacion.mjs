// Contador de duplicación del front (MOS-CMP, docs/AUDITORIA-DUPLICACION.md).
// Recorre src/ (sin tests) y cuenta, por un lado, la adopción de los objetos
// compartidos y, por el otro, los patrones que todavía se repiten. No falla:
// es una foto para priorizar; las reglas duras viven en los tests de aserción
// de fuente (src/lib/objetosReglas.test.js, src/lib/disenoReglas.test.js).

import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const RAIZ = 'src'

function archivos(dir, acc = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) archivos(ruta, acc)
    else if (/\.(jsx|js)$/.test(entrada.name) && !/\.test\./.test(entrada.name)) acc.push(ruta.split(sep).join('/'))
  }
  return acc
}

const fuentes = archivos(RAIZ).map((ruta) => ({ ruta, contenido: readFileSync(ruta, 'utf8') }))

function contar(etiqueta, patron, { excluir = [] } = {}) {
  const caben = fuentes.filter(({ ruta }) => !excluir.some((excluida) => ruta.includes(excluida)))
  const usos = caben.reduce((total, { contenido }) => total + (contenido.match(patron) || []).length, 0)
  const archivosConUso = caben.filter(({ contenido }) => patron.test(contenido)).length
  return { etiqueta, usos, archivos: archivosConUso }
}

const MEDICIONES = [
  // Objetos compartidos (adopción).
  {
    grupo: 'objetos compartidos',
    filas: [
      contar('<Aviso>', /<Aviso\b/g),
      contar('CELDA_ENCABEZADO', /CELDA_ENCABEZADO/g, { excluir: ['components/shared/tabla.js'] }),
      contar('ROTULO_DATO', /ROTULO_DATO/g, { excluir: ['components/shared/tabla.js'] }),
      contar('ROTULO_SECCION', /ROTULO_SECCION/g, { excluir: ['components/shared/tabla.js'] }),
      contar("imports de @/utils/fecha", /from '@\/utils\/fecha'/g),
      contar('copiarAlPortapapeles', /copiarAlPortapapeles/g, { excluir: ['utils/portapapeles.js'] }),
      contar('descargarArchivo/CsvCliente', /descargar(Archivo|CsvCliente)/g, { excluir: ['utils/descargarArchivo.js'] }),
      contar('useVistaListaGrid', /useVistaListaGrid/g, { excluir: ['hooks/useVistaListaGrid.js'] }),
      contar('deviceId()', /\bdeviceId\(/g, { excluir: ['lib/deviceId.js'] }),
      contar('montoTexto/montoGs/montoUsd', /monto(Texto|Gs|Usd)\(/g, { excluir: ['utils/moneda.js'] }),
      contar('escapeHtml compartido', /\bescapeHtml\(/g, { excluir: ['utils/printHtml.js'] }),
      contar('CELDA_DATO/CELDA_MONTO', /CELDA_(DATO|MONTO)/g, { excluir: ['components/shared/tabla.js'] }),
      contar('whatsappUrl', /whatsappUrl\(/g, { excluir: ['utils/telefono.js'] }),
      contar('estados de pedido del cliente', /(ESTADO_PEDIDO|ESTADO_ENTREGA|ESTADO_GARANTIA|tonoPedido|tonoGarantia)/g, { excluir: ['lib/estadosPedido.js'] }),
    ],
  },
  // Duplicación pendiente (cuanto más bajo, mejor).
  {
    grupo: 'duplicación pendiente',
    filas: [
      contar('avisos inline a mano', /<p[^>]*rounded-lg border border-(bad|ok)\/30 bg-(bad|ok)\/10/g),
      contar('clases de tabla copiadas', /className="[^"]*text-\[10px\] font-bold uppercase tracking-wider text-mute/g, { excluir: ['components/shared/tabla.js'] }),
      contar('rótulos de sección copiados', /className="[^"]*text-xs font-bold uppercase tracking-wider text-mute/g, { excluir: ['components/shared/tabla.js'] }),
      contar('formato de fecha duplicado', /dateStyle: 'short', timeStyle: 'short'/g, { excluir: ['utils/fecha.js', 'lib/printing/', 'lib/imeiComprobante.js', 'lib/customerReport.js'] }),
      contar('portapapeles sin objeto', /navigator\.clipboard/g, { excluir: ['utils/portapapeles.js'] }),
      contar('descarga con Blob + <a>', /createObjectURL\(new Blob/g, { excluir: ['utils/descargarArchivo.js'] }),
      contar('escapeHtml propio', /(function|const) escapeHtml/g, { excluir: ['utils/printHtml.js'] }),
      contar('vacíos con caja propia', /text-center text-sm text-mute">(?:No hay|Sin )/g),
      contar('celdas de dato sin objeto', /className="[^"]*truncate text-xs text-mute/g, { excluir: ['components/shared/tabla.js'] }),
      contar('mapas de estado copiados', /const (ORDER_STATUS|FULFILLMENT|WARRANTY_STATUS|ESTADO_PEDIDO|ESTADO_ENTREGA|ESTADO_GARANTIA) = \{ (?:PENDING|PROCESSING|RECEIVED)/g, { excluir: ['lib/estadosPedido.js', 'lib/printing/'] }),
      contar('montos con US$ y toLocaleString', /US\$ \$\{[^}]*toLocaleString\('en-US'/g, { excluir: ['utils/moneda.js', 'components/ui/index.jsx'] }),
      contar('wa.me a mano', /wa\.me\//g, { excluir: ['utils/telefono.js'] }),
      contar('device-id repetido', /mobos:device-id/g, { excluir: ['lib/deviceId.js'] }),
      contar('vista list/grid sin hook', /localStorage\.(getItem|setItem)\('mobos:[a-z-]*vista/g, { excluir: ['hooks/useVistaListaGrid.js'] }),
      contar('monto en Gs a mano', /Gs\.?[^`"']{0,40}toLocaleString\('es-PY'\)/g, { excluir: ['utils/moneda.js'] }),
      contar('textarea crudo', /<textarea/g, { excluir: ['components/ui/index.jsx'] }),
    ],
  },
]

let totalPendiente = 0
for (const { grupo, filas } of MEDICIONES) {
  console.log(`\n${grupo}`)
  for (const { etiqueta, usos, archivos: n } of filas) {
    if (grupo === 'duplicación pendiente') totalPendiente += usos
    console.log(`${String(usos).padStart(4)} usos · ${String(n).padStart(3)} archivos · ${etiqueta}`)
  }
}
console.log(`\nduplicación pendiente total: ${totalPendiente} usos`)
