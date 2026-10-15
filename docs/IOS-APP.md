# App de iPhone (Capacitor): cómo se construye y se publica

La app empaqueta la misma interfaz de la web (Vite, `src/`) dentro de un contenedor
Capacitor y habla con `https://api.moboss.online`. Solo iPhone, bundle
`online.moboss.app`, equipo `F65VS7VHB9`. Contrato con el backend: `docs/IOS.md`.

## Qué incluye la v1

- **Módulos:** Vender (POS), Pedidos (lista y página del pedido), Clientes y
  Configuración (Mi cuenta, Eliminar mi cuenta, soporte, privacidad). Stock, Compras,
  Taller, Finanzas, Análisis e Inicio quedan ocultos detrás de la bandera
  `MODULOS_IOS` (`src/lib/plataforma.js`). Para habilitarlos todos en un build:
  `VITE_IOS_TODOS_LOS_MODULOS=1`. Un enlace a un módulo oculto muestra «Disponible
  pronto en la app» (con enlace a la web solo si no es de precios/pagos).
- **Solo tiendas existentes:** sin landing, sin «Crear mi tienda», sin alta, sin
  planes ni precios. «Continuar con Apple», «Continuar con Google» (nativo), correo y
  contraseña, y «Probar la demo» (datos ficticios, para el revisor).
- **Seguridad de equipo compartido:** la sesión de la tienda queda en el Keychain.
  Cada vez que se abre la app o vuelve del segundo plano se pide el **PIN privado del
  vendedor** (el mismo de la web; identifica quién vende). Sin Face ID por defecto.
  Opcional: Configuración › Mi cuenta › «Pedir Face ID al abrir» (solo dueño/admin,
  apagado, ajuste del equipo): Face ID primero y después el PIN, nunca en su lugar.
- **Nativo:** escáner de IMEI/código de barras (ML Kit) en el POS, compartir
  comprobantes y cotizaciones, hápticos, barra de estado, splash, pantalla sin
  conexión, «Actualizá MobOS» bloqueante (`GET /api/config` → `minVersion.ios`), push
  con aviso previo en contexto y enlaces profundos a pedidos.
- **iOS 27:** `SceneDelegate` + `UIApplicationSceneManifest` (sin ellos la app no
  abre; `UISceneDelegateClassName` = `SceneDelegate` a secas).

## Preparar la Mac (una vez)

```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods falla con error Unicode si falta
npm install
```

## Construir y abrir en Xcode

```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
npm run build:ios      # vite build (VITE_PLATFORM=ios) + cap sync ios (pod install)
npm run ios:open       # abre ios/App/App.xcworkspace
```

Siempre abrí el `.xcworkspace`, no el `.xcodeproj`. La carpeta `ios/` está en el repo
(sin `Pods/` ni `public/`, que genera `cap sync`).

Versión: `MARKETING_VERSION` y `CURRENT_PROJECT_VERSION` (target App › General).
La versión de la ficha de App Store Connect tiene que ser **exactamente** la misma;
en cada subida, subí el número de compilación.

## Firma

1. Xcode › target **App** › Signing & Capabilities.
2. **Automatically manage signing**, Team **Dario De Oliveira (F65VS7VHB9)**. El Apple
   ID es `owncodingdev@gmail.com` (no `dariodeoli@gmail.com`: esa cuenta tiene otro
   equipo, `38ZPZZXNK6`).
3. Capacidades ya declaradas en `App.entitlements`: Sign in with Apple y Push
   Notifications. Si Xcode pide registrarlas, aceptá.

## Simulador

- Xcode 27 no trae «iPhone 17 Pro»: usá `iPhone 18 Pro`.
- Compilación: `xcodebuild -workspace ios/App/App.xcworkspace -scheme App
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build`.
- **Limitación conocida:** ML Kit (el escáner) no trae el binario arm64 del simulador,
  así que en un simulador de Apple Silicon la app con escáner no arranca. Para probar
  en simulador, quitá la línea `CapacitorMlkitBarcodeScanning` del `Podfile`, corré
  `pod install` y restaurala antes de commitear (en un iPhone real y en el Archive no
  pasa). En el navegador de la app el escáner cae a la cámara web como siempre.

## Archive y TestFlight

1. Destino **Any iOS Device (arm64)**.
2. Product › **Archive**.
3. Organizer › **Distribute App** › App Store Connect › Upload (firma automática).
4. Esperá el mail de Apple (5-10 min) y probá la compilación en TestFlight en un
   iPhone real: login, PIN al volver del segundo plano, escáner, compartir, push.
5. En App Store Connect: versión › **Compilación** › elegir el build.

Si falta el `ITSAppUsesNonExemptEncryption`, ya está en `Info.plist` (`false`).

## Servidor (Coolify)

Variables que debe tener el backend (ya detalladas en `docs/IOS.md`):
`MOBOS_APPLE_CLIENT_IDS`, `MOBOS_APPLE_TEAM_ID`, `MOBOS_APPLE_KEY_ID`,
`MOBOS_APPLE_PRIVATE_KEY`, `MOBOS_APNS_KEY_ID`, `MOBOS_APNS_TEAM_ID`,
`MOBOS_APNS_PRIVATE_KEY`, `MOBOS_APNS_TOPIC=online.moboss.app`,
`MOBOS_IOS_MIN_VERSION`, y el ID de cliente de Google iOS en la lista de audiencias
de `POST /api/auth/google/native`. El CORS del API debe permitir
`capacitor://localhost` y el encabezado `X-MobOS-Client`. **Sin eso la app queda
cargando y no puede entrar.** La key APNs del equipo se reutiliza (el equipo ya tiene
el máximo de 2): las builds de tienda registran el token como `production`; los builds
de desarrollo (`npm run build:ios:dev`), como `sandbox`.

ID de cliente de Google iOS (no es secreto):
`500595134387-36gmh5fu4tucjt0u2c9c380i4662pvdh.apps.googleusercontent.com`; el esquema
`com.googleusercontent.apps.500595134387-36gmh5fu4tucjt0u2c9c380i4662pvdh` ya está en
`Info.plist`.

## App Store Connect (datos de la ficha)

Basado en `agendese/docs/app-store/GUIA-PUBLICAR-APP-STORE.md`.

- **Información de la app:** nombre MobOS; categoría principal **Economía y empresa**,
  secundaria **Productividad**; derechos de contenido: «No, no contiene, muestra ni
  accede a contenido de terceros»; clasificación por edades: **No / Ninguno** en todo
  (queda **4+**).
- **Precio:** gratis (EE. UU. $0.00). Sin compras dentro de la app: es una herramienta
  B2B gratuita (guía 3.1.3). La app no muestra planes ni precios de suscripción. El POS sí muestra precios de los productos físicos de la tienda.
- **Privacidad:** URL `https://moboss.online/privacidad`. «Sí, recopilamos datos»:
  Nombre, Correo, Teléfono, Dirección física (clientes), Fotos o vídeos
  (foto del perfil), Otro contenido del usuario (notas de clientes y pedidos),
  Historial de compras (ventas/pedidos), Información de pago (forma de pago),
  Otra información financiera (deudas y crédito), ID de usuario e ID del dispositivo (token push). En cada uno: Funcionalidad de la app, vinculado a la
  identidad, **sin seguimiento**. Tiene que coincidir con `PrivacyInfo.xcprivacy`.
  Publicar la declaración la confirma el dueño.
- **Versión:** URL de soporte `https://moboss.online/soporte`; URL de marketing
  `https://moboss.online/`; copyright `2026 DADOO CAPITAL LLC`; publicación
  **manual**.
- **Capturas:** solo iPhone, tamaño **1206×2622** (pantalla mediana con Dynamic
  Island), 5 como máximo recomendado: login, POS, escáner, pedidos, clientes.
  Con el simulador `iPhone 18 Pro`:
  ```bash
  xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
  xcrun simctl io booted screenshot 01-login.png
  ```
  Las capturas del Pro Max (1320×2868) se achican con `sips -z 2622 1206 in.png --out out.png`.
- **Información para la revisión:**
  - Inicio de sesión: la cuenta demo del revisor (ver abajo); la contraseña la carga el dueño.
  - Contacto: nombre, teléfono y correo del dueño.
  - Video de menos de 2 minutos (`xcrun simctl io booted recordVideo`): arranque, login,
    PIN, una venta, escáner, Mi cuenta › **Eliminar mi cuenta** (sin confirmar).
  - Notas en inglés:

```
1. SCREEN RECORDING: attached. It shows launching the app, signing in, the personal PIN prompt, a sale, the barcode/IMEI scanner and Account > Delete my account (confirmation screen).
2. PURPOSE AND AUDIENCE: MobOS (https://moboss.online) is a free B2B point-of-sale and operations tool for phone shops in Paraguay. The app is for store owners and their staff, not for end customers, and manages sales of physical products in those shops. There are no in-app purchases, subscription prices or subscription plans in the app. Product prices shown in the POS refer to physical goods.
3. ACCESS: use the demo account in Sign-In Information, or tap "Probar la demo" on the sign-in screen (fictitious data, no account needed). Sign in with Apple and Google only open stores that already exist. Every time the app opens or returns from the background it asks the seller's private PIN (shared company iPhones); Face ID is an optional extra. Account deletion: Configuración > Mi cuenta > Eliminar mi cuenta.
4. EXTERNAL SERVICES: our own backend (https://api.moboss.online), Sign in with Apple, Google Sign-In, and Apple Push Notification service. No third-party analytics, advertising or tracking.
5. NATIVE FEATURES: barcode/IMEI scanner (camera), share sheet for receipts and quotes, haptics, push notifications, deep links to orders.
6. REGIONAL DIFFERENCES: none. The interface is in Spanish because our customers are in Paraguay.
```

## Cuenta demo para el revisor

«Probar la demo» (pantalla de ingreso) abre una tienda ficticia local, sin red ni
cuenta; sirve como respaldo si el revisor no consigue entrar. Para una cuenta real de
revisión, creá en el backend un usuario con tienda de prueba y pasá correo y
contraseña (12+ caracteres) en el campo de Información para la revisión.

## Riesgos a tener presentes

- **4.2 (funcionalidad mínima):** Apple rechaza webs envueltas. La app se defiende con
  funciones nativas reales (escáner, Sign in with Apple y Google, push, compartir,
  hápticos, PIN en Keychain) y un alcance acotado a las tareas de mostrador. Si la
  revisión objeta, reforzá las notas de la sección 5.
- **5.1.1(v):** «Eliminar mi cuenta» existe en Mi cuenta (`DELETE /api/me`).
- **4.8:** hay Google, por eso está Sign in with Apple, con el mismo tamaño y orden.

## Archivos clave

- `capacitor.config.json`, `ios/App/App/Info.plist`, `PrivacyInfo.xcprivacy`,
  `AppDelegate.swift`, `SceneDelegate.swift`, `ios/App/Podfile`.
- `src/lib/plataforma.js` (plataforma, módulos), `src/lib/api/nativo.js` (Bearer y
  Keychain), `src/lib/nativo/*` (Apple, Google, escáner, push, PIN/Face ID, compartir),
  `src/components/nativo/*` (actualización, sin conexión, «Disponible pronto»).
