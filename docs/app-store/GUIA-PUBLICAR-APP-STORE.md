# Publicar MobOS en App Store

Guía operativa adaptada el 15/10/2026 de la experiencia de Agendese. MobOS usa
Vite/React + Capacitor, CocoaPods y Xcode; el flujo de Expo/EAS no corresponde.
Contrato de API: [IOS.md](../IOS.md). Producto y capacidades: [IOS-APP.md](../IOS-APP.md).
Release del backend: [RELEASE.md](../RELEASE.md).

## Identidad existente

- App: MobOS; App Store Connect `6822949535`; bundle `online.moboss.app`.
- Apple ID: `owncodingdev@gmail.com`; equipo `F65VS7VHB9`, Dario De Oliveira.
- Proveedor: `129494413`; UUID `cc2ee609-347d-4164-9d65-081e1bee07b8`.
- No usar el equipo `38ZPZZXNK6` de la otra cuenta.
- Versión nativa `1.0`, compilación `1` inicialmente. La versión web tiene su propio ciclo.
- Copyright: `2026 DADOO CAPITAL LLC`.

No guardar contraseñas, claves privadas, tokens ni `.p8` en el repositorio o en logs.
El dueño realiza autenticación/2FA y carga secretos. Reutilizar APNs existente;
el equipo ya alcanzó el máximo de claves. Este flujo de Xcode no requiere API key nueva.

## Gates antes de enviar

1. Integrador: código final integrado, CI y suite completa verdes, backend desplegado
   por el flujo protegido y smoke de producción. No subir un binario de un SHA anterior.
2. Validar en producción `/api/config`, CORS nativo, nonce de login/reauth de un solo
   uso, vinculación con PIN/contraseña y eliminación con revocación Apple.
3. Confirmar cifrado de secretos en checks del servidor. No publicar sin él.
4. Probar en iPhone real Apple/Google/email, PIN al volver del segundo plano,
   escáner, compartir, push y la pantalla de eliminación (sin borrar cuentas reales).
5. Face ID es opcional y adicional: nunca sustituye el PIN privado.

## Preparar y construir

```sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
npm ci
npm run build:ios
npm run ios:open
```

Abrir `ios/App/App.xcworkspace`. El target usa firma automática y equipo `F65VS7VHB9`.
Archive para dispositivo real, no simulador. Conservar `SceneDelegate` y
`UIApplicationSceneManifest`: para iOS 27 la clase es `SceneDelegate` sin prefijo.
Solo iPhone (`UIDeviceFamily=[1]`); `ITSAppUsesNonExemptEncryption=false`.

### Firma verificada en esta Mac

El 15/10 se confirmó Apple Distribution válido para `F65VS7VHB9`. Faltaba el
intermedio WWDR G3: se descargó de Apple PKI, se verificó su cadena y se importó
sin sobrescribir confianza. Documentación oficial:
https://developer.apple.com/help/account/certificates/wwdr-intermediate-certificates/

La combinación archive automático + identidad Distribution forzada da conflicto.
Funcionó generar archive sin firma y exportarlo con Xcode, que firma para tienda:

```sh
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" -derivedDataPath "$DERIVED_PATH" \
  archive CODE_SIGNING_ALLOWED=NO
xcodebuild -exportArchive -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" -exportPath "$EXPORT_PATH" \
  -allowProvisioningUpdates
```

El plist de exportación usa `method=app-store-connect`, `destination=export`,
`teamID=F65VS7VHB9`, `signingStyle=automatic`, `signingCertificate=Apple Distribution`,
`manageAppVersionAndBuildNumber=false`. El diagnóstico exportó un IPA con firma y
perfil embebido. No equivale a subida ni aceptación de Apple. Para enviar el SHA
final, reconstruir sus assets y archive y subirlo desde Organizer/Distribute App.

## Ficha y privacidad

- Nombre MobOS; categorías Economía y empresa / Productividad; cuestionario de edad
  fiel al contenido actual (4+ si todas las respuestas siguen No/Ninguno).
- App gratuita, sin IAP ni planes/precios de suscripción en iPhone. El POS sí muestra
  precios de productos físicos, cobros, crédito y deuda: no declarar que no hay precios.
- Soporte `https://moboss.online/soporte`; privacidad `https://moboss.online/privacidad`;
  marketing `https://moboss.online/`; publicación manual.
- Declarar los mismos 11 tipos de `ios/App/App/PrivacyInfo.xcprivacy`: Nombre,
  Correo, Teléfono, Dirección física, Información de pago (forma de pago), Otra
  información financiera (deudas/crédito), Fotos/vídeos (avatar), Otro contenido
  (notas), ID de usuario, ID del dispositivo y Compras (ventas/pedidos).
- Cada tipo: funcionalidad de la app, vinculado a identidad, sin seguimiento.
  Las razones describen este alcance; reauditar al incorporar SDK o analítica.
- El dueño confirma la declaración final de privacidad y cualquier acuerdo legal.

## Capturas, vídeo y acceso del revisor

Usar el build final en simulador. ML Kit no incluye arm64 de simulador; para
capturas se puede excluir temporalmente su pod en un checkout de captura y
restaurarlo antes de distribuir. No quitar el escáner del binario de tienda.

Capturas reales en `1206×2622`: login, POS, pedidos, clientes y cuenta. No usar datos
reales de tiendas. `iPhone 18 Pro` está disponible; limpiar la barra con `simctl
status_bar <UUID> override --time 9:41 --batteryState charged --batteryLevel 100`.
Si se parte del Pro Max (`1320×2868`), usar `sips -z 2622 1206`.

Vídeo de menos de dos minutos: arranque, demo/login, PIN, venta, compartir, escáner
(en dispositivo compatible) y Mi cuenta > Eliminar mi cuenta sin confirmar.
Comprimir a menos de 10 MB con `avconvert --preset Preset960x540`; adjuntarlo a
Información para revisión. No decir que está adjunto antes de verificar la subida.

La demo local se abre con «Probar la demo», sin cuenta; PIN dueño `3001`, vendedor
`2001`. Las notas de revisión deben aclarar este acceso y sus datos ficticios.
No copiar el seed `demo:revisor-apple` ni `MOBILE_API_ENABLED` de Agendese: MobOS
usa otro contrato y demo local. Google iOS ya está configurado en la app; verificar
la audiencia del backend contra `docs/IOS.md`, sin crear otro cliente OAuth.

## TestFlight y revisión

Subir el IPA final, esperar procesamiento de Apple y verificar versión/build.
Probar TestFlight en iPhone real y asociar esa compilación a la versión `1.0`.
Completar capturas, privacidad, edad, precio y contacto; guardar. Preparar «Añadir
a revisión». El dueño confirma las declaraciones/condiciones requeridas y el envío
final cuando corresponda. Verificar estado visible «Esperando revisión»; no llamar
publicada a una versión que solo está preparada o en TestFlight. Publicación manual
permite decidir la salida a tienda después de la aprobación.
