# #516 — Progreso del método de ingreso activo

Seguimiento separado de `b21440fe`, misma rama `codex/paridad-auth516` y base de producto `6f30c8b7`. No publicación.

## RED causal

Las capturas anteriores de QA516 mostraban Apple y Google «Conectando…» al enviar correo. Seis casos reproducen el error en `b21440fe`: correo pendiente en web/iOS, Apple y Google nativos simulados, y Google web entrar/crear. El progreso se deriva del `cargando` global pasado a cada proveedor y al submit, por lo que todos aparentaban haber sido invocados. Log local: `/tmp/mobos-auth516-metodo-red.log`.

## Corrección acotada

- AppleButton/GoogleButton aceptan `disabled` adicional; `busy` sigue deshabilitando por sí solo para los consumidores existentes.
- Login registra únicamente qué método inicia la espera (`correo`, `google`, `apple`). Conserva el bloqueo global; solo el método activo cambia su etiqueta/progreso.
- El correo pendiente mantiene «Un momento…»; proveedores no invocados conservan sus etiquetas normales y quedan deshabilitados. Un proveedor pendiente mantiene «Conectando…» solo en ese proveedor; el submit queda deshabilitado con su etiqueta normal.
- Todas las llamadas API, credenciales, nonces, cancelación, registro y control de acceso permanecen iguales. El estado nuevo es exclusivamente visual.

## Pruebas y límites

El fixture usa Login/SesionProvider/cliente API de producto, respuestas sintéticas, plataforma Capacitor simulada y almacenamiento en memoria. Los adaptadores Apple/Google se sustituyen solo en el navegador de prueba; no se invocan plugins ni proveedores reales. Se comprueban `isNativeIOS()` y la clase `html.app-ios` al cargar y tras las transiciones al PIN.

El error del adaptador nativo y el rechazo posterior del API recuperan los botones. En el tramo adaptador→API se preserva el progreso del método seleccionado; el test verifica el nonce ficticio recibido por el cliente API sin alterar su lógica. Google web conserva los modos entrar y crear. Matriz 360/390/1440 claro/oscuro, PIN y reducción por teclado se mantienen en la misma suite.

El recorrido de regreso OAuth NO se declara aprobado. Una prueba adicional con `/auth/me` 401 legítimo y `/auth/google/complete` deliberadamente demorado reproduce `CONTEXT_CHANGED`: Login y SesionProvider consultan me al montar, y la denegación invalida la solicitud concurrente. El backend real crea solo la cookie de identidad antes de completar Google, según revisión del integrador. Un intento de fixture `me200,user:null` tampoco resuelve esa invalidación (SesionProvider limpia la sesión) y NO se acepta como oráculo real ni solución. Fragmento RED preservado por separado en `work/oauth517-callback-red.fragment.js` del coordinador; seguimiento #517 a cargo del integrador. Este commit no cambia guardas502 ni el contrato de me para ocultarlo.

No hay WebKit real, OAuth físico ni nuevo Debug/IPA. Las capturas previas de QA516 acreditan únicamente el progreso de submit visible; todavía muestran el segundo error aquí corregido. La captura adicional iOS simulado muestra el resultado posterior, sin afirmar paridad ya publicada.

## Novedades para el dueño

- El ingreso muestra qué método está trabajando, sin anunciar conexiones con Apple o Google que no se pidieron.
- Los otros accesos quedan bloqueados durante la espera y vuelven a estar disponibles si falla el intento.
- Se detectó y separó un problema del regreso de Google para corregirlo manteniendo las protecciones de sesión.

## Gates finales de esta unidad

- Suite auth516: **20/20 PASS**, 10,9 s (`/tmp/mobos-auth516-metodo-final20.log`). Los seis RED anteriores ahora pasan; no se incluye como aprobado el callback legítimo de #517.
- `npm test`: **1563/1563 PASS**, una ejecución tras el último cambio de fuente.
- `npm run lint`: **0 errores**, advertencia previa DeliveryOperations42.
- `npm run build`: **PASS**, 8,49 s; aviso previo de tamaño de chunks.
- Sin backend/DB, suites globales E2E, proveedores reales ni publicación.
