// Botón «Continuar con Apple» según las pautas de Apple (HIG): fondo negro con
// texto blanco en tema claro y fondo blanco con texto negro en tema oscuro,
// logo de Apple a la izquierda y mismo tamaño que el resto de los accesos.
export function AppleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d="M16.37 12.62c-.02-2.26 1.85-3.35 1.93-3.4-1.05-1.54-2.69-1.75-3.27-1.77-1.39-.14-2.72.82-3.42.82-.71 0-1.8-.8-2.96-.78-1.52.02-2.93.89-3.71 2.25-1.58 2.75-.4 6.82 1.14 9.05.76 1.09 1.65 2.31 2.82 2.27 1.14-.05 1.56-.73 2.93-.73 1.36 0 1.75.73 2.95.71 1.22-.02 1.99-1.1 2.73-2.2.86-1.26 1.22-2.48 1.24-2.54-.03-.01-2.38-.91-2.4-3.6ZM14.13 5.96c.62-.76 1.04-1.8.93-2.84-.9.04-1.99.6-2.64 1.35-.58.67-1.09 1.74-.95 2.76 1 .08 2.03-.51 2.66-1.27Z" />
    </svg>
  )
}

export default function AppleButton({ busy = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      data-testid="login-apple"
      className="flex h-14 w-full items-center justify-center rounded-2xl bg-black px-5 text-base font-semibold text-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15D7B8] disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-black"
    >
      <AppleMark />
      <span className="ml-3">{busy ? 'Conectando con Apple…' : 'Continuar con Apple'}</span>
    </button>
  )
}
