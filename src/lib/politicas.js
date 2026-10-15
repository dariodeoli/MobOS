// Políticas públicas de la empresa (#433): garantía, cambios, envíos,
// privacidad, términos y contacto. Texto plano con formato mínimo:
//   # Título      → subtítulo
//   - ítem        → lista
//   **negrita**   → énfasis
// Nunca se renderiza como HTML: `parsearPolitica` devuelve bloques que React
// pinta como texto, así que no hay inyección posible aunque el backend deje
// pasar algo. El servidor además limpia lo que guarda (backend/lib/policies.ts).

export const POLITICA_MAX_CHARS = 8000

export const POLITICAS = [
  { tipo: 'garantia', etiqueta: 'Garantía', ayuda: 'Qué cubre, por cuánto tiempo y qué la anula.' },
  { tipo: 'cambios', etiqueta: 'Cambios y devoluciones', ayuda: 'Plazos y condiciones para cambiar o devolver.' },
  { tipo: 'envios', etiqueta: 'Envíos y entregas', ayuda: 'Zonas, costos y tiempos de entrega.' },
  { tipo: 'privacidad', etiqueta: 'Privacidad de la tienda', ayuda: 'Cómo se usan los datos de tus clientes.' },
  { tipo: 'terminos', etiqueta: 'Términos de venta', ayuda: 'Precios, pagos, reservas y condiciones generales.' },
  { tipo: 'contacto', etiqueta: 'Contacto', ayuda: 'Cómo y cuándo te pueden escribir o visitar.' },
]

export function etiquetaPolitica(tipo) {
  return POLITICAS.find(politica => politica.tipo === tipo)?.etiqueta || 'Política'
}

export function esTipoPolitica(tipo) {
  return POLITICAS.some(politica => politica.tipo === tipo)
}

// Plantillas iniciales pensadas para una tienda de celulares en Paraguay.
// Son un punto de partida: la tienda las edita antes de publicar.
export const PLANTILLAS_POLITICA = {
  garantia: `# Garantía de los equipos
- Equipos **nuevos**: 12 meses de garantía por defectos de fábrica, con la tienda como primer punto de atención.
- Equipos **semi-nuevos**: 3 meses de garantía sobre el funcionamiento (batería, pantalla, cámaras, señal y carga).
- Accesorios: 30 días por defectos de fabricación.

# Cómo hacer valer la garantía
- Traé el equipo con el comprobante de compra o el enlace del pedido.
- El IMEI o número de serie del equipo tiene que coincidir con el de la venta.
- Evaluamos el equipo en la tienda y te avisamos el resultado por WhatsApp.

# Qué no cubre
- Golpes, caídas, pantalla rota o humedad.
- Equipos abiertos o reparados por terceros.
- Desgaste normal de la batería y daños por cargadores no originales.
- Bloqueos de cuenta (Apple ID, Google) o software instalado por el usuario.`,
  cambios: `# Cambios
- Tenés **7 días corridos** desde la compra para pedir un cambio.
- El equipo tiene que estar en perfecto estado, sin marcas de uso, con su caja, accesorios y comprobante.
- El cambio se hace por otro equipo o accesorio; si hay diferencia de precio, se abona o se acredita.

# Devoluciones
- Si el equipo llega con una falla de fábrica dentro de los primeros 7 días, lo cambiamos por uno igual o te devolvemos el dinero.
- Las devoluciones de dinero se hacen por el mismo medio de pago, hasta 5 días hábiles después de la aprobación.
- No hay devolución de equipos con IMEI alterado, bloqueados por el usuario o con daños físicos.`,
  envios: `# Entregas
- Retiro en la tienda sin costo, en el horario de atención.
- Delivery en Asunción y Gran Asunción: el costo y el horario se confirman al cerrar el pedido.
- Envíos al interior del país por encomienda: el costo depende del destino y lo abona el cliente.

# Tiempos
- Equipos en stock: entrega el mismo día o al día hábil siguiente.
- Equipos a pedido: te avisamos el plazo antes de confirmar la compra.

# Al recibir
- Revisá el equipo y verificá el IMEI en presencia del repartidor.
- Ante cualquier problema con la entrega, escribinos por WhatsApp el mismo día.`,
  privacidad: `# Qué datos pedimos
- Nombre, teléfono y, si hace falta, CI/RUC y correo para emitir tu comprobante y avisarte del estado de tu pedido.

# Para qué los usamos
- Procesar tu compra, tu garantía y tu servicio técnico.
- Contactarte por WhatsApp o correo sobre tus pedidos.

# Cómo los cuidamos
- No vendemos ni compartimos tus datos con terceros, salvo lo necesario para entregar tu pedido o cumplir con la ley.
- Podés pedirnos ver, corregir o eliminar tus datos escribiéndonos por los medios de contacto de la tienda.`,
  terminos: `# Precios y pagos
- Los precios están en guaraníes (Gs.) e incluyen IVA salvo que se indique lo contrario.
- Aceptamos efectivo, transferencia, tarjeta y las demás formas de pago que muestre la tienda.
- Los precios pueden cambiar sin previo aviso; vale el precio confirmado en tu comprobante.

# Reservas y señas
- Una reserva con seña mantiene el equipo por el plazo acordado; pasado ese plazo, la seña queda a favor del cliente como crédito.

# Comprobantes
- Todo comprobante emitido por la tienda es un documento no fiscal salvo que se entregue la factura legal correspondiente.
- Conservá tu comprobante: lo necesitás para garantía, cambios y devoluciones.`,
  contacto: `# Escribinos
- Por WhatsApp al número de la tienda: respondemos en horario de atención.

# Horario de atención
- Lunes a viernes: 08:00 a 18:00.
- Sábados: 08:00 a 13:00.
- Domingos y feriados: cerrado.

# Visitanos
- La dirección y el teléfono de la tienda figuran en esta página.`,
}

export function plantillaPolitica(tipo) {
  return PLANTILLAS_POLITICA[tipo] || ''
}

// Espejo liviano del sanitizado del servidor: sin HTML ni caracteres de control.
export function limpiarTextoPolitica(texto) {
  return String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/<[^>]*>?/g, '')
    .replace(/[<>]/g, '')
}

// «**negrita**» → [{ texto, negrita }]
function partesEnLinea(linea) {
  const partes = []
  const patron = /\*\*([^*]+)\*\*/g
  let desde = 0
  let coincidencia
  while ((coincidencia = patron.exec(linea)) !== null) {
    if (coincidencia.index > desde) partes.push({ texto: linea.slice(desde, coincidencia.index), negrita: false })
    partes.push({ texto: coincidencia[1], negrita: true })
    desde = coincidencia.index + coincidencia[0].length
  }
  if (desde < linea.length) partes.push({ texto: linea.slice(desde), negrita: false })
  return partes.length ? partes : [{ texto: '', negrita: false }]
}

// Texto → bloques [{ tipo: 'titulo'|'parrafo'|'lista', ... }] para pintar sin HTML.
export function parsearPolitica(texto) {
  const bloques = []
  let lista = null
  let parrafo = []
  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push({ tipo: 'parrafo', partes: partesEnLinea(parrafo.join(' ')) })
    parrafo = []
  }
  const cerrarLista = () => { if (lista) bloques.push(lista); lista = null }
  for (const cruda of limpiarTextoPolitica(texto).split('\n')) {
    const linea = cruda.trim()
    if (!linea) { cerrarParrafo(); cerrarLista(); continue }
    const titulo = linea.match(/^#{1,3}\s+(.+)$/)
    const item = linea.match(/^[-*•]\s+(.+)$/)
    if (titulo) { cerrarParrafo(); cerrarLista(); bloques.push({ tipo: 'titulo', texto: titulo[1].replace(/\*\*/g, '') }) }
    else if (item) { cerrarParrafo(); if (!lista) lista = { tipo: 'lista', items: [] }; lista.items.push(partesEnLinea(item[1])) }
    else { cerrarLista(); parrafo.push(linea) }
  }
  cerrarParrafo(); cerrarLista()
  return bloques
}

// Enlace público de las políticas de la empresa. Mismo patrón que el pedido:
// la base propia del entorno manda; si no, el portal de clientes.
export function urlPoliticas(base, slug, tipo = '') {
  const raiz = String(base || '').replace(/\/$/, '')
  const clave = String(slug || '').trim()
  if (!raiz || !clave) return ''
  return `${raiz}/${encodeURIComponent(clave)}/politicas${tipo && esTipoPolitica(tipo) ? `/${tipo}` : ''}`
}

// Garantía para el comprobante: el texto de la tienda (primeras líneas) y, si
// no hay política publicada, la leyenda general de siempre (#407).
export function garantiaConPolitica(generica, politica) {
  const texto = String(politica?.garantia || '').trim()
  return texto || generica
}
