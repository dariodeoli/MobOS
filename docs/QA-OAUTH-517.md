# #517 — Arranque y regreso de Google sin carrera de sesión

Base: `cbbb4d97`, sobre auth516 `b21440fe`. Unidad separada, sin push, DB, proveedores reales ni publicación.

## Causa y RED

Login consultaba `/auth/me` al montar y al cambiar de modo; SesionProvider lanzaba otro sondeo. El callback Google crea una cookie de identidad, no una sesión de vendedor: un 401 de me antes del PIN es legítimo. Si completeGoogle queda pendiente y llega ese 401, la protección502 invalida la respuesta. Además el Provider puede limpiar la empresa recién guardada. No corresponde convertir me en200null ni exceptuar401.

Reproducción aislada inicial: Login con `google=ready`, me401 y completeGoogle demorado; tras liberar la respuesta aparece «El contexto de acceso cambió.» y no se abre el selector. Logs `/tmp/mobos-auth516-metodo-final.log` y fragmento del coordinador `work/oauth517-callback-red.fragment.js`. El integrador verificó el contrato real del backend. Un ensayo me200null también fue descartado: no representa el contrato y el Provider igualmente limpia el estado.

## Cambio

- SesionProvider es el único dueño del sondeo inicial. Login redirige usando usuario/estado ya validados, sin otro me.
- El retorno se captura síncronamente antes de los efectos y de limpiar el query. Un ready sólo suspende el sondeo previo al PIN; no autoriza una sesión ni omite el API/PIN.
- Antes de un nuevo ingreso, se cancela y espera la validación anterior (incluida su activación), se retiran reintentos y se invalida la revisión de activación anterior. Sus catches tardíos no limpian el acceso nuevo.
- La continuación de Google es single-flight. Suscripciones independientes sobreviven al replay de StrictMode sin duplicar POST; el desmontaje definitivo cancela también la posterior selección de tienda.
- El intento verifica la generación502 antes de persistir. La limpieza propietaria y el guardado de la respuesta validada son síncronos; esa purga propia se reconoce sin aceptar otro contexto. Selección de tienda y creación desde identidad Google conservan la misma guarda.
- storeRequired guarda sólo las tiendas de la respuesta, sin mezclar tenant, vendedores ni perfil anteriores. Mientras el retorno está pendiente, Login no restaura la empresa vieja.
- Cliente fail-closed, backend, cookies, nonce, TTL, roles y revocación permanecen intactos.

## Matriz y pruebas

- **8/8 unitarios**: detector sólo/login, single-flight/StrictMode, A→B→A, sucursal, rol/permisos, logout, desmontaje inicial y de continuación. `node --test src/lib/inicioSesion.test.js`.
- **32/32 browser**:20auth516 +12OAuth517 en `/tmp/mobos-oauth517-final-browser.log` (13,2s). Incluyen callback normal/Strict sin sondeo de vendedor antes del PIN, selección y dos POST exactos; correo con401 previo o credencial previa/aborto; plugins Apple/Google sustituidos; A→B→A/rol; logout real del cliente con red retenida; desmontaje inicial y tras selección;401 del propio callback conserva purga y error.
- **1/1 browser adicional**: registro desde identidad Google→PIN, cero sondeos me y cuerpos exactos login/create (`/tmp/mobos-oauth517-registro.log`,3s). Son **13 casos OAuth517** en total, además de20auth516.
- **1571/1571 unitarios frontend**, una ejecución final (`/tmp/mobos-oauth517-unit.log`).
- Lint **0errores**, warning preexistente DeliveryOperations42; build frontend **PASS**,7,14s.

Comando dirigido: `MOBOS_QA_PORT=5399 npx playwright test -c e2e/auth516.frontend.config.js --grep '#517'`. El spec nuevo queda también registrado en nav-v2. Vite/fixtures propios, sin API real. La ruta/login sirve el fixture mediante override de solicitud, conservando pathname real para el detector. Los primeros intentos del harness fallaron por script relativo y por interceptar accidentalmente módulos/src/lib/api como si fueran endpoints; se corrigió sólo el fixture (URL absoluta y condición pathname/api), sin atribuirlo al producto.

## Límites

No prueba OAuth físico, cuentas Google/Apple reales, dispositivo iPhone, proveedor externo ni backend HTTP/PG. Los módulos nativos se sustituyen explícitamente y nunca abren plugins. No se extiende este cambio a una revisión general de todos los flujos OAuth ni se modifica el build3 enviado a Apple. Integración/CI final corresponden al integrador.

## Novedades para el dueño

- El regreso de Google abre la tienda y pide el PIN sin competir con una comprobación de sesión prematura.
- Un acceso viejo no puede completar su respuesta después de salir o cambiar de contexto.
- Se mantienen el PIN y las denegaciones de acceso del servidor.

## Refuerzo de observabilidad del desmontaje

Followup sólo de prueba: con `observarOAuth`, el fixture decora completeGoogle y devuelve EXACTAMENTE su promesa original, sin modificar argumentos/resultados/rechazos. Al asentarse registra contador y código de resultado en html. Los dos casos de desmontaje esperan esa señal después de liberar la respuesta (`1` inicial o `2` tras selección), y exigen `CONTEXT_CHANGED` antes de comprobar que el contexto sigue vacío o conserva sólo stores. Así se acredita que el cliente procesó la respuesta tardía; no basta el fulfill de red o un heading que ya había desaparecido.

Dirigidos `--grep '#517.*(unmount|desmontaje)'`: **2/2PASS**,6,3s; unitarios inicioSesion **8/8PASS**; lint **0errores** y advertencia previa DeliveryOperations42. Sin fuente de producto modificada ni repetición de suite global.
