// «Escribir por WhatsApp» de las páginas públicas (#412): usa solo el contacto
// de la SUCURSAL que manda el backend (`contacto`), nunca teléfonos del cliente
// ni de empleados. Sin contacto no renderiza nada.
export default function WhatsAppSucursal({ contacto, className = '' }) {
  if (!contacto?.whatsappUrl) return null
  return (
    <div className={`mx-auto mt-4 w-full max-w-xl px-4 text-center ${className}`}>
      <a
        href={contacto.whatsappUrl}
        target="_blank"
        rel="noreferrer"
        data-testid="publico-whatsapp"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ok px-5 py-2 text-sm font-semibold text-on-ok"
      >
        Escribir por WhatsApp{contacto.sucursal ? ` · ${contacto.sucursal}` : ''}
      </a>
    </div>
  )
}
