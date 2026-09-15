// Logger JSON estructurado, una línea por evento. Compatible con el runtime
// Edge del middleware (solo usa console) y con rutas Node. Los niveles info y
// warn van a stdout; error va a stderr para no mezclar señales con la salida.

type LogLevel = 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

function emit(level: LogLevel, msg: string, extra?: LogFields) {
  const entry: LogFields = { level, ts: new Date().toISOString(), msg, ...(extra ?? {}) }
  let line: string
  try {
    line = JSON.stringify(entry)
  } catch {
    line = JSON.stringify({ level, ts: entry.ts, msg, serialization: 'failed' })
  }
  if (level === 'error') console.error(line)
  else console.log(line)
}

export function logInfo(msg: string, extra?: LogFields) {
  emit('info', msg, extra)
}

export function logWarn(msg: string, extra?: LogFields) {
  emit('warn', msg, extra)
}

export function logError(msg: string, extra?: LogFields) {
  emit('error', msg, extra)
}
