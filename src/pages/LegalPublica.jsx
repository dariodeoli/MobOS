import { useLocation } from 'react-router-dom'
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import PreferenciaMedicion from '@/components/app/PreferenciaMedicion'
import { publicUrls } from '@/lib/urls'
import { isNativeIOS } from '@/lib/plataforma'

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
      ['Métricas anónimas del sitio y de la demo', 'Para saber qué mejorar medimos, sin datos personales, cuánta gente visita moboss.online y la demo: páginas vistas, hasta dónde se baja, cuánto tiempo se queda, qué módulos de la demo se abren y si se toca «Crear mi tienda». Guardamos un identificador al azar en tu navegador (localStorage) solo para no contar dos veces a la misma persona.'],
      ['Lo que no medimos', 'No guardamos tu IP, el navegador ni el dispositivo, ni tu nombre, correo, teléfono o ubicación. No hay cookies de publicidad ni se comparte nada con terceros. No se mide lo que cargás dentro de tu tienda con tu cuenta.'],
      ['Cuánto se guarda', 'Los eventos anónimos se conservan 90 días y después se eliminan.'],
      ['Cómo no ser medido', 'Se respeta «No rastrear» (DNT) y Global Privacy Control de tu navegador, sin que hagas nada más. También podés usar el interruptor «No medir» de abajo; vale solo en este navegador.'],
      ['Servicios de terceros', 'Para funcionar usamos: un servicio de envío de correo (Resend) para los mensajes de acceso, invitaciones y avisos; Google, solo si elegís entrar con tu cuenta de Google (recibimos tu nombre, correo y foto); un proveedor de consulta de IMEI, al que se envía únicamente el IMEI que consultás; Cambios Chaco, de donde leemos la cotización del dólar (no se le envían datos tuyos); y nuestra medición anónima de visitas al sitio, sin datos personales ni seguimiento publicitario.'],
      ['Cuánto tiempo los guardamos', 'Mientras tu tienda esté activa. Si la archivás, se conserva por un plazo de recuperación y después podés pedir su eliminación definitiva. Los respaldos se renuevan y los registros técnicos se purgan periódicamente.'],
      ['Tus controles', 'Desde Configuración podés exportar tus datos y archivar o eliminar la empresa; la eliminación borra el historial y se explica antes de confirmar.'],
      ['Borrar tu cuenta', 'Cada integrante puede pedir que se borre su cuenta: se cierran sus sesiones y se anonimiza su nombre y correo. Las ventas y registros del negocio se conservan con el nombre anonimizado. Si sos dueño de la tienda, primero tenés que transferirla o eliminarla.'],
      ['Responsable', 'El responsable de los datos es DADOO CAPITAL LLC (30 N Gould St Ste R, Sheridan, WY 82801, Estados Unidos), representada por Dario De Oliveira. Contacto: mobos@weem.com.py.'],
      ['Consultas', 'Escribinos a mobos@weem.com.py.'],
    ],
  },
  '/terminos': {
    titulo: 'Términos',
    intro: 'Condiciones básicas del servicio.',
    bloques: [
      ['Servicio', 'MobOS es un sistema de gestión para tiendas, de uso gratuito, con actualizaciones y soporte incluidos.'],
      ['Tu responsabilidad', 'Cada tienda responde por los datos que carga y por el uso que hace su equipo; las credenciales y los PIN son personales.'],
      ['Documentos', 'Los comprobantes y reportes de MobOS son documentos no fiscales: no reemplazan la facturación electrónica de tu país.'],
      ['Disponibilidad', 'El estado de los servicios se publica en moboss.online/status. Podés dejar el servicio cuando quieras y exportar tus datos.'],
      ['Consultas', 'Escribinos a mobos@weem.com.py.'],
    ],
  },
  '/soporte': {
    titulo: 'Soporte',
    intro: 'Cómo conseguir ayuda con MobOS.',
    bloques: [
      ['Escribinos', 'Mandanos un correo a mobos@weem.com.py contando qué pasó, desde qué pantalla y en qué dispositivo. Respondemos en días hábiles.'],
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
  // En la app de iPhone no existe la landing: «Volver» regresa al ingreso.
  const volver = isNativeIOS() ? '/login' : import.meta.env.DEV ? '/landing-preview' : publicUrls.landing
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-fore">
      <header className="border-b border-fore/[.07]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
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
        {pathname === '/privacidad' && <PreferenciaMedicion />}
        <p className="mt-10 rounded-xl border border-ink-600 bg-ink-800/40 p-4 text-xs text-mute">
          Este resumen es informativo y puede actualizarse; ante una consulta concreta, escribinos a mobos@weem.com.py.
        </p>
      </main>
      <ProductFooter />
    </div>
  )
}
