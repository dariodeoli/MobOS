# #516 — Paridad de acceso web móvil e iOS

## Fuente y alcance

Base `6f30c8b7`, rama `codex/paridad-auth516`. Se comparan Login y sus etapas de correo/contraseña y PIN, reutilizando Login, AuthLayout, PinSegmentado y los campos existentes. No se cambian políticas, autenticación, permisos, navegación privada ni plugins.

La app publicada 1.0(3) corresponde a `2def9930` (web 1.0.229); esta unidad parte del candidato posterior 1.0.231. Una diferencia observada frente al bundle antiguo no acredita una divergencia del mismo código. Esta unidad no publica ni reemplaza ese build.

## Diferencia reproducida y corrección

RED: `#516 ios conserva botón y progreso mientras autentica` falla en la fuente inicial: al enviar credenciales, el botón «Un momento…» sigue en el DOM pero `display:none` lo retira de la pantalla. El mismo caso web pasa. Causa: la regla global dentro de auth iOS ocultaba cualquier submit deshabilitado, sin distinguir login de la validación automática del PIN.

La regla queda limitada al submit directo de la etapa `data-etapa="vendedor"`, cuya validación automática conserva el teclado propio. El login muestra el progreso deshabilitado y vuelve a «Continuar» ante un error. No se añade un segundo control de envío al PIN.

## Matriz y oráculos

| Criterio | Evidencia |
|---|---|
| 360×640 / 390×844, claro/oscuro | Correo y contraseña idénticos entre web y plataforma iOS simulada: 44 px de alto, 16 px de fuente, radio 12 px y mismos colores. Sin desborde horizontal ni scroll inicial. |
| 1440×900, claro/oscuro | Mismos colores y radios de campos, formulario completo visible y sin desborde horizontal. La web conserva su columna de marca y pie, con desplazamiento vertical de página; no se exige eliminar información para igualarla a un iPhone ficticio de 1440 px. |
| Solicitud pendiente / error | Botón visible, deshabilitado y con «Un momento…» en ambas plataformas; error explícito y «Continuar» recuperado. |
| PIN 360/390, ambas plataformas | Input readonly/inputmode none, indicadores sin foco editable, teclado propio con teclas ≥44 px dentro de la pantalla, sin scroll; PIN incorrecto muestra error y limpia los cuatro dígitos. |
| Reducción de cuerpo por teclado | En ambas plataformas: foco preservado, contraseña y Continuar alcanzables; restauración al ocultar teclado. Es un evento sintético de navegador, no un teclado físico de iPhone. |

El fixture usa los componentes de producto y el mismo objeto Capacitor con plataforma controlada; almacenamiento seguro en memoria y respuestas ficticias. No importa el arranque nativo ni autentica cuentas reales. Los tests no consultan OwnData ni producción.

## Diferencias intencionales

- iOS conserva Apple/Google nativos, enlaces legales y encabezado compacto sin enlace a landing. Web conserva Google web, regreso al sitio y accesos de recuperación/creación permitidos.
- No se habilitan creación de empresa, planes, precios ni módulos restringidos en iOS para aparentar paridad.
- Safe areas y el soporte de teclado de AuthLayout se conservan. El CSS móvil ya aplica 16 px a ambos campos en ambas plataformas; no fue necesario cambiar tipografía global.

## Límites

La comprobación visual de esta unidad usa Chromium con plataforma iOS simulada; no acredita WebKit real, safe areas físicas, Face ID, OAuth con Apple/Google, VoiceOver ni teléfono físico. No se generó otro scaffold nativo ni se modificó el SOURCE/IPA de publicación. La paridad publicada requiere futuro main verificado y nuevo build procesado del mismo SHA.

## Novedades para el dueño

- El ingreso del iPhone mantiene visible «Un momento…» mientras comprueba el acceso, igual que la web.
- El PIN sigue usando sus teclas grandes y limpia el código al equivocarse.
- Se conservan las funciones propias de cada plataforma y se evita un rediseño innecesario del acceso.

## Verificaciones finales

- `MOBOS_QA_VISUAL=1 MOBOS_QA_PORT=5399 npx playwright test -c e2e/auth516.frontend.config.js`: **14/14 PASS**, 43,2 s. Dos capturas de progreso, una por plataforma, revisadas visualmente.
- `MOBOS_QA_PORT=5399 npx playwright test -c e2e/pin-login504.frontend.config.js e2e/frontend/pin-login504.frontend.spec.js --grep 'login completo|correo/contraseña con body resize' --output=/tmp/mobos-auth516-related-results`: **11/11 PASS**, 6,3 s; incluye320/360/375/390/430 y teclado.
- `npm test`: **1563/1563 PASS**, una ejecución final.
- `npm run lint`: **0 errores**, una advertencia preexistente en DeliveryOperations.jsx42.
- `npm run build`: **PASS** (32,87 s); aviso existente de tamaño de chunks.
- Backend/DB, suites E2E completas, OAuth y publicación no ejecutados: fuente cambiada exclusivamente CSS de auth.

La comparación exploratoria inicial exigió también ausencia absoluta de scroll en escritorio1440; se descartó ese oráculo porque el pie y la columna de marca existentes producen scroll vertical de página. La regresión final exige formulario visible y cero desborde horizontal en escritorio, y además cero scroll inicial en móvil. No se recortó contenido para satisfacer esa comparación artificial.
