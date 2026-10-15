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
      ['Servicios de terceros', 'Para funcionar usamos: un servicio de envío de correo (Resend) para los mensajes de acceso, invitaciones y avisos; Google, solo si elegís entrar con tu cuenta de Google (recibimos tu nombre, correo y foto); un proveedor de consulta de IMEI, al que se envía únicamente el IMEI que consultás; Cambios Chaco, de donde leemos la cotización del dólar (no se le envían datos tuyos); y nuestra medición anónima de visitas al sitio, sin datos personales ni seguimiento publicitario.'],
      ['Cuánto tiempo los guardamos', 'Mientras tu tienda esté activa. Si la archivás, se conserva por un plazo de recuperación y después podés pedir su eliminación definitiva. Los respaldos se renuevan y los registros técnicos se purgan periódicamente.'],
      ['Tus controles', 'Desde Configuración podés exportar tus datos y archivar o eliminar la empresa; la eliminación borra el historial y se explica antes de confirmar.'],
      ['Borrar tu cuenta', 'Cada integrante puede pedir que se borre su cuenta: se cierran sus sesiones y se anonimiza su nombre y correo. Las ventas y registros del negocio se conservan con el nombre anonimizado. Si sos dueño de la tienda, primero tenés que transferirla o eliminarla.'],
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
  '/soporte': {
    titulo: 'Soporte',
    intro: 'Cómo conseguir ayuda con MobOS.',
    bloques: [
      ['Escribinos', 'Mandanos un correo a soporte@moboss.online contando qué pasó, desde qué pantalla y en qué dispositivo. Respondemos en días hábiles.'],
      ['Para acelerar la respuesta', 'Indicá el nombre de tu tienda, tu usuario (no tu PIN ni tu contraseña, nunca los pidas ni los compartas) y, si podés, una captura de pantalla.'],
      ['Estado del servicio', 'Si algo no carga, mirá primero moboss.online/status: ahí se publica el estado de los servicios.'],
      ['Tu cuenta y tus datos', 'Podés pedir el borrado de tu cuenta (se anonimizan tu nombre y tu correo). Si sos dueño de una tienda, primero tenés que transferirla o eliminarla desde Configuración. Para exportar o eliminar los datos de la tienda, escribinos.'],
      ['Privacidad y términos', 'Leé cómo tratamos los datos en moboss.online/privacidad y las condiciones del servicio en moboss.online/terminos.'],
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
