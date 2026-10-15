// Calendario único de la demo (#461), independiente de la zona del dispositivo.
const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const partes = fecha => Object.fromEntries(formato.formatToParts(fecha)
  .filter(parte => parte.type !== 'literal').map(parte => [parte.type, Number(parte.value)]))
const comoUtc = ({ year, month, day, hour = 0, minute = 0, second = 0 }) => Date.UTC(year, month - 1, day, hour, minute, second)

/** Fecha de calendario de Paraguay; la aritmética UTC evita depender de TZ local. */
export function diaDemo(dias = 0, ahora = new Date()) {
  const fecha = new Date(comoUtc(partes(ahora)))
  fecha.setUTCDate(fecha.getUTCDate() - dias)
  return fecha.toISOString().slice(0, 10)
}

/** Hora de Paraguay de una semilla, acotada por el MISMO reloj de la lectura. */
export function instanteDemo(dias = 0, hora = 10, minuto = 0, ahora = new Date()) {
  const pared = Date.parse(`${diaDemo(dias, ahora)}T00:00:00Z`) + (hora * 60 + minuto) * 60000
  let instante = pared
  // Resolver el offset con la zona IANA también respeta las fechas históricas.
  for (let paso = 0; paso < 3; paso += 1) {
    const offset = comoUtc(partes(new Date(instante))) - instante
    instante = pared - offset
  }
  return new Date(Math.min(instante, ahora.getTime())).toISOString()
}
