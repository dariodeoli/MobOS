import { useLocation } from 'react-router-dom'
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import { publicUrls } from '@/lib/urls'

// Páginas públicas de Privacidad y Términos (#322): información breve y
// factual del servicio, enlazada desde el pie de la landing. No son páginas
// fiscales ni reemplazan la revisión legal del dueño.
const CONTENIDO = {
  '/privacidad': {
    titulo: 'Privacidad',
    intro: 'Cómo trata MobOS los datos de tu tienda.',
    bloques: [
      ['Qué datos guardamos', 'Los datos necesarios para operar la tienda: ventas, pedidos, clientes, stock, pagos, equipo y la configuración de la empresa.'],
      ['Quién los ve', 'Cada tienda ve solo sus datos. Los permisos del equipo limitan qué puede ver y hacer cada persona, y el servidor aplica ese recorte en cada acción.'],
      ['Para qué se usan', 'Para operar el servicio, hacer respaldos y mejorar el producto. No se venden a terceros.'],
      ['Tus controles', 'Desde Configuración podés exportar tus datos y archivar o eliminar la empresa; la eliminación borra el historial y se explica antes de confirmar.'],
      ['Consultas', 'Escribinos a soporte@moboss.online.'],
    ],
  },
  '/terminos': {
    titulo: 'Términos',
    intro: 'Condiciones básicas del servicio.',
    bloques: [
      ['Servicio', 'MobOS es un sistema de gestión para tiendas, ofrecido por suscripción (USD 10 por mes, sin permanencia) con actualizaciones y soporte incluidos.'],
      ['Tu responsabilidad', 'Cada tienda responde por los datos que carga y por el uso que hace su equipo; las credenciales y los PIN son personales.'],
      ['Documentos', 'Los comprobantes y reportes de MobOS son documentos no fiscales: no reemplazan la facturación electrónica de tu país.'],
      ['Disponibilidad', 'El estado de los servicios se publica en moboss.online/status. Podés dejar el servicio cuando quieras y exportar tus datos.'],
      ['Consultas', 'Escribinos a soporte@moboss.online.'],
    ],
  },
}

export default function LegalPublica() {
  const { pathname } = useLocation()
  const pagina = CONTENIDO[pathname] || CONTENIDO['/privacidad']
  const volver = import.meta.env.DEV ? '/landing-preview' : publicUrls.landing
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-fore">
      <header className="border-b border-fore/[.07]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3.5">
          <a href={volver} aria-label="MobOS · volver a la landing" className="toque-44 inline-flex items-center">
            <ThemeLogo className="h-8" />
          </a>
          <a href={volver} className="inline-flex min-h-11 items-center text-sm font-semibold text-mute transition hover:text-fore">
            ← Volver
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">MobOS</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-.04em]">{pagina.titulo}</h1>
        <p className="mt-4 text-lg text-mute">{pagina.intro}</p>
        <div className="mt-10 space-y-6">
          {pagina.bloques.map(([titulo, texto]) => (
            <section key={titulo}>
              <h2 className="text-base font-bold">{titulo}</h2>
              <p className="mt-1.5 text-sm leading-6 text-mute">{texto}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 rounded-xl border border-ink-600 bg-ink-800/40 p-4 text-xs text-mute">
          Este resumen es informativo y puede actualizarse; ante una consulta concreta, escribinos a soporte@moboss.online.
        </p>
      </main>
      <ProductFooter />
    </div>
  )
}
