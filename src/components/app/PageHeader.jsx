import Icon from '@/components/shared/Icon'

// One page header for the whole app: H1 (the active destination) with its
// primary action on the same row, then at most one row of section tabs
// (`children`). No kicker and no visible breadcrumb: the breadcrumb stays in
// the DOM as screen-reader text so assistive tech and specs still read the
// current section. `utilities` (desktop only) sits at the end of the title row:
// bell and profile avatar. Mirrors the owncoding-ui PageHeader props (title,
// subtitle, actions, backTo) so it can be swapped for the package one.
export default function PageHeader({ title, subtitle, actions, aviso, backTo, breadcrumb = '', utilities, children, record = false, recordRef }) {
  // #356: en celular, con pestañas debajo, el H1 y el subtítulo son redundantes
  // (la pestaña activa ya nombra la pantalla): el H1 queda como sr-only para
  // lectores de pantalla y se recupera ~32px. Las acciones siguen visibles.
  const conPestanas = Boolean(children)
  const filaMovilVacia = conPestanas && !backTo && !actions && !aviso
  return (
    <div className="px-4 pt-1 md:px-6 lg:pt-3">
      <nav data-testid="shell-breadcrumb" aria-label="Sección actual" className="sr-only">
        {breadcrumb}
      </nav>
      {/* Detail pages: the record renders its own single row here (RecordHeader). */}
      <div className={record ? 'flex items-start gap-2' : 'hidden'}>
        <div ref={recordRef} className="min-w-0 flex-1" />
        {record && utilities && <div className="hidden min-h-11 items-center gap-1 lg:flex">{utilities}</div>}
      </div>
      {!record && (
      <div data-testid="shell-page-header-row" className={`shell-page-header-row flex flex-wrap items-center justify-between gap-x-3 gap-y-1 ${filaMovilVacia ? 'max-lg:min-h-0 lg:min-h-7' : 'min-h-7'}`}>
        <div className="flex min-w-0 items-center gap-2">
          {backTo && (
            <button
              type="button"
              aria-label="Volver"
              onClick={backTo}
              className="-ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-mute hover:bg-ink-700 hover:text-fore focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
            >
              <Icon name="back" className="h-4 w-4" />
            </button>
          )}
          <h1 data-testid="shell-page-title" className={`min-w-0 text-[22px] font-semibold leading-7 tracking-tight ${conPestanas ? 'max-lg:sr-only' : ''}`}>{title}</h1>
        </div>
        {(actions || utilities || aviso) && (
          <div data-testid="shell-page-header-actions" className="shell-page-header-actions flex min-w-0 items-center gap-2">
            {aviso}
            {actions}
            {utilities && <div className="-my-2 hidden items-center gap-1 lg:flex">{utilities}</div>}
          </div>
        )}
      </div>
      )}
      {!record && subtitle && <p className={`text-sm text-mute ${conPestanas ? 'max-lg:hidden' : ''}`}>{subtitle}</p>}
      {!record && children && <div className="mt-0 lg:mt-1">{children}</div>}
    </div>
  )
}
