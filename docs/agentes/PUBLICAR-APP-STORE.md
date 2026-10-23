# Publicar una app en el App Store — paso a paso

Guía para un agente o persona que tiene que publicar **otra app** (web convertida en app de iPhone, como MobOS con Capacitor, o una app nativa).

Está basada en lo que hicimos con MobOS (bundle `online.moboss.app`, equipo `F65VS7VHB9`). Apple cambia tamaños y reglas: antes de cada envío, confirmá los requisitos vigentes en la ayuda de App Store Connect.

---

## 0. Reglas para el agente

- **Nunca escribir contraseñas, claves privadas (.p8), tokens ni datos de tarjeta.**
  - Cuando haga falta iniciar sesión, la persona dueña lo hace.
  - Las claves `.p8` las pega el dueño.
- **Pedir OK antes de hacer algo que no se puede deshacer o que se ve en público:**
  - enviar a revisión;
  - publicar;
  - cancelar una publicación;
  - aceptar contratos;
  - cambiar precios.
- **Trabajar en una rama propia** y no publicar la web sin las pruebas en verde.
- **Probar todo en TestFlight antes** de mandar a revisión.

---

## 1. Lo que hay que tener antes de empezar

| Qué | Dónde / cómo |
|---|---|
| Cuenta de Apple Developer pagada (USD 99/año) | developer.apple.com. El titular acepta los contratos en App Store Connect › Acuerdos. |
| Contrato de «Apps gratuitas» aceptado (y «Apps de pago» si se cobra dentro de la app) | App Store Connect › Negocios. |
| Mac con Xcode actualizado y sesión iniciada con la Apple ID del equipo | Xcode › Settings › Accounts. |
| Bundle ID único (ej. `com.empresa.app`) | developer.apple.com › Identifiers. Se crea solo con firma automática. |
| App creada en App Store Connect | Apps › «+» › Nueva app: plataforma iOS, nombre, idioma, bundle ID, SKU. |
| Dominio con política de privacidad y página de soporte | URLs públicas, obligatorias. |
| Si hay inicio con Google u otro proveedor | Hay que ofrecer también «Iniciar sesión con Apple» (regla 4.8). |
| Si se usan notificaciones push | **Reutilizar la clave APNs (.p8) que ya existe.** El equipo tiene el máximo de 2 claves y crear otra falla. Una sola clave sirve para todas las apps del equipo. El dueño la pega en el servidor. |
| Sesión de Xcode con la cuenta correcta | Iniciar sesión con **`owncodingdev@gmail.com`** (equipo **F65VS7VHB9**). La cuenta `dariodeoli` pertenece a otro equipo (38ZPZZXNK6) y con ella **la firma falla**. |
| Verificación en dos pasos de Apple | El código lo escribe **el dueño** en su terminal o en Xcode. El agente no puede quedarse esperando compilaciones largas, porque sus comandos se cortan: hay que correrlas en segundo plano. |

---

## 2. Preparar la app

### Si es una web con Capacitor (como MobOS)
1. `npm i @capacitor/core @capacitor/ios` y `npx cap add ios` (una sola vez).
2. Armar la web para iOS y sincronizar: `vite build && npx cap sync ios` (en MobOS: `npm run build:ios`).
3. En `ios/App/App/Info.plist` completar:
   - el nombre visible (`CFBundleDisplayName`);
   - los **textos de permisos**, uno por cada permiso que se use, en el idioma de la app: cámara (`NSCameraUsageDescription`), fotos (`NSPhotoLibraryUsageDescription`), ubicación, Face ID (`NSFaceIDUsageDescription`), micrófono. **Sin estos textos, Apple rechaza la app.**
   - `ITSAppUsesNonExemptEncryption = NO` si solo se usa HTTPS normal. Así no pregunta por cifrado en cada compilación.
4. Ícono de **1024×1024 PNG, sin transparencia y sin esquinas redondeadas** (Apple las redondea), dentro de `Assets.xcassets/AppIcon`.
5. Pantalla de arranque (`LaunchScreen`) simple, con el logo.
6. **Archivo de privacidad `PrivacyInfo.xcprivacy`** (obligatorio desde 2024):
   - declara el motivo de cada función del sistema que usan la app y sus librerías (UserDefaults, fecha de arranque, espacio en disco, etc.);
   - sin ese archivo, Apple **rechaza la subida**;
   - tiene que coincidir con la «Privacidad de la app» de la sección 5.
7. **UIScene:** desde iOS 27 es obligatorio. Sin UIScene la app no abre. Antes de compilar, confirmar que la versión de Capacitor lo soporte (MobOS ya lo tiene en `Info.plist`).
8. **La web va empaquetada dentro de la app:**
   - **nunca** configurar `server.url` apuntando al sitio, porque Apple lo rechaza como web envuelta (4.2);
   - la app carga sus archivos desde `capacitor://localhost`.
9. **Servidor preparado para la app:**
   - permitir el origen `capacitor://localhost` (CORS);
   - revisar que la sesión funcione ahí: en MobOS la app usa un token en lugar de cookies, con el encabezado `X-MobOS-Client`;
   - si no, el inicio de sesión anda en la web y falla en la app.

### Reglas de contenido que más rechazan
- **3.1.1 Pagos:**
  - lo **digital** que se use dentro de la app (suscripción a la propia app, funciones premium) se cobra **solo** con compras dentro de la app de Apple;
  - si no se quiere usar eso, **no** mostrar precios, planes ni enlaces de pago de la suscripción dentro de la app;
  - tampoco puede haber **ningún enlace ni botón que lleve a pagar en la web**. Esto vale también para apps gratis para empresas, como Agendese o MobOS.
  - vender **bienes físicos o servicios del mundo real** (un POS que cobra productos de una tienda) sí está permitido.
- **4.2 Funcionalidad mínima:** no puede ser solo un sitio web metido en una app. Tiene que sentirse como app: navegación nativa, sin barra del navegador, que funcione bien sin señal o que avise, y con notificaciones, cámara o escáner si aplica.
- **5.1.1 Privacidad:**
  - si la app permite crear cuenta, tiene que permitir **borrar la cuenta desde la app**;
  - **borrarla de verdad**, no solo desactivarla, y la política de privacidad tiene que explicarlo;
  - pedir permisos solo cuando se usan.
- **2.1 Completitud:**
  - nada de «próximamente», botones que no andan ni pantallas vacías;
  - el revisor tiene que poder probar todo.
- **4.8 Inicio de sesión:** si hay Google, Facebook u otro, ofrecer también Apple.

---

## 3. Compilar y subir

> **Apps con Expo/React Native** (como Agendese): seguir la guía de Expo del repositorio de esa app, `docs/app-store/GUIA-PUBLICAR-APP-STORE.md`. Cubre:
> - el inicio de sesión de Expo con `--device`;
> - el `.easignore` para no pasar los 2 GB de subida;
> - **no reutilizar la clave vieja `QBAHR9V274`**.
>
> En MobOS ese mismo archivo es la guía específica de Capacitor.
>
> **Apps con Capacitor o nativas** (como MobOS): se suben con Xcode, como sigue.

**Opción con interfaz:** Xcode › Product › Archive › Organizer › Distribute App › App Store Connect › Upload, con firma automática.

**Opción por terminal** (la que usamos en MobOS):

```
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath /tmp/App.xcarchive \
  CURRENT_PROJECT_VERSION=<número mayor que el anterior> -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath /tmp/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath /tmp/export -allowProvisioningUpdates
```

`ExportOptions.plist` mínimo: `method` = `app-store-connect`, `destination` = `upload`, `teamID` = <equipo>, `signingStyle` = `automatic`.

Reglas de numeración:
- **Versión** (`MARKETING_VERSION`, ej. 1.0, 1.0.1) es la que ve la gente.
- **Compilación** (`CURRENT_PROJECT_VERSION`) tiene que ser **siempre mayor** que la anterior subida para esa versión. Nosotros usamos la fecha, por ejemplo 202610221.

Después de subir, Apple procesa la compilación en unos 10 a 30 minutos y aparece en TestFlight.

---

## 4. TestFlight (probar antes de publicar)

- **Testers internos** (hasta 100, miembros del equipo en App Store Connect › Usuarios y acceso):
  - prueban apenas termina el procesamiento;
  - TestFlight › Internos › agregar el grupo.
- **Testers externos** (hasta 10.000, por correo o enlace público):
  - la **primera** compilación pasa por una revisión corta de Apple, de alrededor de un día;
  - TestFlight › Externos › crear grupo › agregar la compilación › «Qué probar» › enviar.
  - El enlace público se activa en el grupo.
- Probar en un iPhone real:
  - inicio de sesión con cada proveedor;
  - permisos, notificaciones y cámara o escáner;
  - pagos, si los hay;
  - rotación, modo oscuro, teclado y pantallas chicas.

---

## 5. Ficha de la app en App Store Connect

| Campo | Notas |
|---|---|
| Nombre | Hasta 30 caracteres, único en el App Store. |
| Subtítulo | Hasta 30 caracteres. |
| Texto promocional | Hasta 170 caracteres. Se puede cambiar sin nueva revisión. |
| Descripción | Hasta 4.000 caracteres. Qué hace y para quién, sin precios de suscripción si no se usa compra dentro de la app. |
| Palabras clave | Hasta 100 caracteres separados por coma, sin repetir el nombre. |
| URL de soporte y URL de marketing | Públicas. |
| URL de política de privacidad | Obligatoria. |
| Categoría principal y secundaria | Ej. Negocios / Productividad. |
| Clasificación por edad | Cuestionario **nuevo desde 2025**, con categorías 13+, 16+ y 18+: contestar todas las preguntas nuevas. Una app de negocios suele quedar en la más baja. |
| Copyright | «2026 Empresa S.A.». |
| Privacidad de la app («nutrition labels») | Declarar qué datos se recolectan (contacto, identificadores, uso, compras) y para qué. Tiene que coincidir con la política de privacidad. |
| Precio y disponibilidad | Gratis o de pago, y en qué países. |

### Capturas de pantalla
- **iPhone:**
  - son obligatorias las de **6,9″**, en formato vertical de 1320×2868 px (o 1290×2796);
  - las de 6,5″ (1242×2688 o 1284×2778) se usan si no hay de 6,9″;
  - entre 1 y 10 por idioma, en PNG o JPG, sin transparencia.
- **iPad:** solo si la app está habilitada para iPad. Si no, en Xcode marcar solo iPhone para no tener que entregarlas.
- **Vista previa en video** (opcional): de 15 a 30 segundos, grabada de la app real.
- Consejo: capturas reales de la app con un título corto arriba, que muestren la función principal en la primera.
- **Sin iPhone físico:** sacarlas desde el simulador de un iPhone de 6,9″ (Pro Max).
  - Primero limpiar la barra de estado: `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`.
  - Después sacar la captura: `xcrun simctl io booted screenshot captura.png`.
  - Sale en el tamaño exacto que pide Apple.

---

## 6. Información para la revisión (lo que más demora si falta)

- **Inicio de sesión:**
  - si la app tiene una **demo sin cuenta**, marcar «No se requiere iniciar sesión» y explicarlo en Notas;
  - si no, crear una **cuenta de prueba** con datos reales de ejemplo. La crea y la carga el dueño, no el agente.
- **Cuenta del revisor:**
  - el revisor suele estar en EE. UU. y **no puede recibir un código por SMS o WhatsApp a un número de Paraguay**. Tiene que entrar con usuario y contraseña;
  - conviene que la cuenta se recree sola cada día, por si el revisor la borra;
  - si la app bloquea las cuentas demo (como hoy la API móvil de Agendese), la cuenta del revisor tiene que quedar **fuera de ese bloqueo**.
- **Notas para el revisor, en inglés:** cómo entrar, un recorrido sugerido de 3 a 5 pasos y aclaraciones sobre pagos (3.1.1).
  - Usar como modelo las notas que ya aprobó Acti.
  - Ejemplo de MobOS: en `docs/appstore-notas-revision.md`.
- **Datos de contacto:** nombre, teléfono y correo de quien responde.
- **Archivo adjunto:** un video corto del recorrido. Conviene que **se vea cómo borrar la cuenta**, como en el video de Acti.

---

## 7. Enviar a revisión y publicar

1. En la versión (ej. 1.0), en la sección «Compilación», elegir la compilación probada en TestFlight.
2. Completar «Cumplimiento de exportación»: si se usó `ITSAppUsesNonExemptEncryption = NO`, no se pregunta.
3. Elegir la publicación:
   - **automática** al aprobarse;
   - **manual** (queda «Pendiente de publicación por el desarrollador» hasta tocar «Publicar esta versión»);
   - **programada**.
4. «Agregar para revisión» › «Enviar a revisión». **Pedir OK al dueño antes de este paso.**
5. La revisión suele tardar de 1 a 3 días. Si rechazan:
   - leer el motivo en «Centro de resolución»;
   - corregir y responder ahí, o subir una compilación nueva.
6. Para una **actualización**: «+ Versión» (ej. 1.0.1), subir una compilación nueva y repetir los pasos 1 a 4.
   - **Atención:** si una versión aprobada quedó «Pendiente de publicación», no se le puede cambiar la compilación. Hay que publicarla o cancelarla antes de mandar otra.

---

## 8. Después de publicar

- Revisar valoraciones y reseñas, y los fallos en Xcode › Organizer › Crashes.
- Mantener iguales la web y la app:
  - **Con Capacitor:** cada vez que se publica la web, subir también la compilación a TestFlight, porque la web va dentro de la app.
  - **Con Expo:** solo hace falta una compilación nueva cuando cambia la app. Conviene juntar los cambios en una sola.
- Tener a mano el registro de versiones, por ejemplo `docs/NOVEDADES.md`.

---

## Checklist rápido

- [ ] Contratos aceptados en App Store Connect.
- [ ] Xcode con sesión iniciada en `owncodingdev@gmail.com` (equipo F65VS7VHB9).
- [ ] App creada (bundle ID, SKU).
- [ ] Ícono de 1024 sin transparencia.
- [ ] Textos de permisos en `Info.plist` y `ITSAppUsesNonExemptEncryption`.
- [ ] `PrivacyInfo.xcprivacy`, coincidiendo con la privacidad declarada.
- [ ] UIScene (obligatorio desde iOS 27).
- [ ] Web empaquetada, sin `server.url`.
- [ ] Servidor que acepta `capacitor://localhost` y sesión que funciona en la app.
- [ ] Clave APNs existente reutilizada.
- [ ] Cuenta del revisor con usuario y contraseña, sin SMS, fuera del bloqueo de demos.
- [ ] Inicio con Apple si hay otros inicios de sesión.
- [ ] Borrar la cuenta desde la app (si hay cuentas).
- [ ] Sin pagos digitales fuera de Apple dentro de la app.
- [ ] Sin «próximamente» ni botones muertos.
- [ ] Compilación subida y probada en TestFlight.
- [ ] Ficha completa: nombre, subtítulo, descripción, palabras clave y URLs.
- [ ] Privacidad de la app declarada.
- [ ] Clasificación por edad.
- [ ] Capturas de 6,9″ (y de iPad si corresponde).
- [ ] Información de revisión: demo o cuenta de prueba, notas y contacto.
- [ ] OK del dueño, y recién ahí «Enviar a revisión».
