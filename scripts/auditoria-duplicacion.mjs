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
      contar('CELDA_DATO/CELDA_NUMERO', /CELDA_(DATO|NUMERO)/g, { excluir: ['components/shared/tabla.js'] }),
      contar('CELDA_IDENTIDAD', /CELDA_IDENTIDAD(_GRANDE)?\b/g, { excluir: ['components/shared/tabla.js'] }),
      contar('<Textarea>', /<Textarea\b/g, { excluir: ['components/ui/index.jsx'] }),
      contar('GRILLA_DOS_COLUMNAS/PIE_ACCIONES', /(GRILLA_DOS_COLUMNAS|PIE_ACCIONES)/g, { excluir: ['components/shared/formulario.js'] }),
      contar('CeldaMoneda/CeldaMoneda', /CeldaMoneda/g, { excluir: ['components/ui/index.jsx'] }),
      contar('BarraProgreso', /<BarraProgreso\b/g, { excluir: ['components/ui/index.jsx'] }),
      contar('<Nota>', /<Nota\b/g, { excluir: ['components/ui/index.jsx'] }),
      contar('EstadoBadge', /EstadoBadge/g, { excluir: ['components/shared/EstadoBadge.jsx'] }),
      contar('whatsappUrl', /whatsappUrl\(/g, { excluir: ['utils/telefono.js'] }),
      contar('estados de pedido del cliente', /(ESTADO_PEDIDO|ESTADO_ENTREGA|ESTADO_GARANTIA|tonoPedido|tonoGarantia)/g, { excluir: ['lib/estadosPedido.js'] }),
      contar('<Skeleton>', /<Skeleton\b/g, { excluir: ['components/ui/index.jsx'] }),
    ],
  },
  // Duplicación pendiente (cuanto más bajo, mejor).
  {
    grupo: 'duplicación pendiente',
    filas: [
      contar('avisos inline a mano', /(?:<p|<div)[^>]*rounded-(?:lg|xl)[^>]*border-(?:bad|ok|warn)\/30 bg-(?:bad|ok|warn)\/10[^"]*text-(?:bad|ok|warn)/g, { excluir: ['components/ui/index.jsx'] }),
      contar('skeletons a mano', /animate-pulse[^"]*rounded-(?:lg|xl|2xl)/g, { excluir: ['components/ui/index.jsx'] }),
      contar('clases de tabla copiadas', /className="[^"]*text-\[10px\] font-bold uppercase tracking-wider text-mute/g, { excluir: ['components/shared/tabla.js'] }),
      contar('rótulos de sección copiados', /className="[^"]*text-xs font-bold uppercase tracking-wider text-mute/g, { excluir: ['components/shared/tabla.js'] }),
      contar('formato de fecha duplicado', /dateStyle: 'short', timeStyle: 'short'/g, { excluir: ['utils/fecha.js', 'lib/printing/', 'lib/imeiComprobante.js', 'lib/customerReport.js'] }),
      contar('portapapeles sin objeto', /navigator\.clipboard/g, { excluir: ['utils/portapapeles.js'] }),
      contar('descarga con Blob + <a>', /createObjectURL\(new Blob/g, { excluir: ['utils/descargarArchivo.js'] }),
      contar('escapeHtml propio', /(function|const) escapeHtml/g, { excluir: ['utils/printHtml.js'] }),
      contar('vacíos con caja propia', /text-center text-sm text-mute">(?:No hay|Sin )/g),
      contar('celdas de dato sin objeto', /className="[^"]*truncate text-xs text-mute/g, { excluir: ['components/shared/tabla.js'] }),
      contar('mapas de estado copiados', /const (ORDER_STATUS|FULFILLMENT|WARRANTY_STATUS|ESTADO_PEDIDO|ESTADO_ENTREGA|ESTADO_GARANTIA) = \{ (?:PENDING|PROCESSING|RECEIVED): '(?:Pendiente de pago|En preparación|Recibido)'/g, { excluir: ['lib/estadosPedido.js', 'lib/printing/'] }),
      contar('montos con US$ y toLocaleString', /US\$ \$\{[^}]*toLocaleString\('en-US'/g, { excluir: ['utils/moneda.js', 'components/ui/index.jsx'] }),
      contar('wa.me a mano', /wa\.me\//g, { excluir: ['utils/telefono.js'] }),
      contar('device-id repetido', /mobos:device-id/g, { excluir: ['lib/deviceId.js'] }),
      contar('vista list/grid sin hook', /localStorage\.(getItem|setItem)\('mobos:[a-z-]*vista/g, { excluir: ['hooks/useVistaListaGrid.js'] }),
      contar('monto en Gs a mano', /Gs\.?[^`"']{0,40}toLocaleString\('es-PY'\)/g, { excluir: ['utils/moneda.js'] }),
      contar('textarea crudo', /<textarea/g, { excluir: ['components/ui/index.jsx'] }),
      contar('grillas de campo copiadas', /className="[^"]*grid gap-3 sm:grid-cols-2/g, { excluir: ['components/shared/formulario.js'] }),
      contar('pies de acción copiados', /className="[^"]*flex flex-wrap justify-end gap-2/g, { excluir: ['components/shared/formulario.js'] }),
      contar('pies de acción (reverso) copiados', /className="[^"]*flex flex-col-reverse gap-2 sm:flex-row sm:justify-end/g, { excluir: ['components/shared/formulario.js'] }),
    ],
  },
  // Patrones a revisar: no siempre son duplicación (pueden ser otra pieza
  // visual), pero conviene que alguien los mire y decida si se unifican.
  {
    grupo: 'patrones a revisar',
    filas: [
      contar('tarjetas de ajuste con encabezado a mano', /<Card className="space-y-3"><div><h2/g, { excluir: ['components/ui/index.jsx'] }),
      contar('solapas internas a mano (role="tab")', /role="tab"(?![a-z])/g, { excluir: ['components/ui/index.jsx'] }),
      contar('notas con borde warn y texto neutro', /(?:<p|<div)[^>]*border-warn\/(?:25|30)[^"]*text-mute/g),
      contar('superficies warn suaves (bg-warn/5)', /bg-warn\/5/g),
      contar('nombre de persona en celda (13px o sm)', /truncate text-(?:\[13px\]|sm) font-semibold/g, { excluir: ['components/shared/tabla.js'] }),
      contar('mapas de estado con etiquetas propias', /const (ORDER_STATUS|FULFILLMENT|WARRANTY_STATUS|ESTADO_PEDIDO|ESTADO_ENTREGA|ESTADO_GARANTIA) = \{/g, { excluir: ['lib/estadosPedido.js', 'lib/printing/'] }),
      contar('barras de avance a mano', /style=\{\{ width: `\$\{[^}]*\}%` \}\}/g, { excluir: ['components/ui/index.jsx'] }),
      // El botón de Google usa la paleta de la marca (no se tokeniza).
      contar('colores de paleta default en clases', /(text|bg|border|border-l|from|to)-(sky|amber|slate|red|blue|green|emerald|violet|purple|orange|yellow|pink|indigo)-[0-9]{2,3}/g, { excluir: ['components/auth/GoogleButton.jsx'] }),
      contar('hex viejos de marca', /#8b5cf6|#0c8876/g, { excluir: ['lib/', 'utils/colores.js', 'components/shared/OrderReceipt.jsx', 'components/shared/reporteEjecutivo.js', 'components/control/Comisiones.jsx', 'components/control/Inventario.jsx'] }),
      contar('textarea crudo', /<textarea/g, { excluir: ['components/ui/index.jsx'] }),
    ],
  },
]

// Duplicados con la biblioteca (owncoding-ui, #253): un componente local con
// el mismo nombre que uno publicado es deuda de migración declarada en el lote
// 34 (docs/AUDITORIA-DUPLICACION.md) y solo puede bajar. Los puentes
// (`export { X as default } from 'owncoding-ui'`) no cuentan: ya delegan.
const LIB_COMPONENTES = 'node_modules/owncoding-ui/src/components'
function nombresJsx(dir) {
  try {
    return readdirSync(dir).filter((nombre) => nombre.endsWith('.jsx')).map((nombre) => nombre.replace(/\.jsx$/, ''))
  } catch {
    return []
  }
}
const esPuente = (ruta) => /export\s*\{\s*\w+\s+as\s+default\s*\}\s*from\s*'owncoding-ui'/.test(readFileSync(ruta, 'utf8'))
const publicadosComponentes = new Set(nombresJsx(LIB_COMPONENTES))
const copiasComponentes = nombresJsx('src/components/shared')
  .filter((nombre) => publicadosComponentes.has(nombre) && !esPuente(`src/components/shared/${nombre}.jsx`))
const kitLocal = [...readFileSync('src/components/ui/index.jsx', 'utf8').matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1])
const kitPublicado = new Set(
  [...readFileSync(`${LIB_COMPONENTES}/ui.jsx`, 'utf8').matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]),
)
const kitCopias = kitLocal.filter((nombre) => kitPublicado.has(nombre))
MEDICIONES.push({
  grupo: 'duplicados con la biblioteca (migrar)',
  filas: [
    { etiqueta: 'componentes de shared/ ya publicados', usos: copiasComponentes.length, archivos: copiasComponentes.length },
    { etiqueta: 'objetos del kit (ui/index.jsx) ya publicados', usos: kitCopias.length, archivos: 1 },
  ],
})

let totalPendiente = 0
for (const { grupo, filas } of MEDICIONES) {
  console.log(`\n${grupo}`)
  for (const { etiqueta, usos, archivos: n } of filas) {
    if (grupo === 'duplicación pendiente') totalPendiente += usos
    console.log(`${String(usos).padStart(4)} usos · ${String(n).padStart(3)} archivos · ${etiqueta}`)
  }
}
console.log(`\nduplicación pendiente total: ${totalPendiente} usos`)
