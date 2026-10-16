# PIN móvil y login — #484 / #504

## Alcance y criterios
- PASS navegador: bloqueo móvil sin tarjeta; tienda/sucursal arriba, teclado circular en zona inferior, cuatro indicadores discretos, identidad MobOS y ambos temas. Cambiar usuario y Cerrar sesión siguen visibles. Escritorio conserva tarjeta e input físico.
- PASS navegador: 320×568,360×640,375×667,390×844 y430×932, claro/oscuro; login normal y bloqueo sin desplazamiento vertical/horizontal, controles de44px o más. No se ocultan acciones para ajustar altura; se elimina texto repetido y el Continuar deshabilitado del PIN, que valida automáticamente.
- PASS navegador: PIN inicial320/390, selector de usuario abierto, error, busy y FaceID previo; borrar, error recuperable, una validación por4dígitos, reapertura y teclado físico. Mantiene overlays opacos493; no cambia autorización ni callbacks de sesión.
- PASS navegador: PIN móvil readonly/inputMode none, sin autofocus ni foco por tap. Montaje/reanudación retira foco editable; nativo usa Keyboard.hide y listener App con cleanup. Correo/contraseña siguen editables.
- PASS navegador con evento sintético: body reducido por teclado/visualViewport limita la superficie de login, desplaza el campo enfocado y mantiene acciones alcanzables; al ocultar restaura altura. Reutiliza geometriaDialogoTeclado, sin modificar ese helper.
- PASS accesibilidad ampliada: texto200% permite desplazamiento para alcanzar Volver a empresa, sin clip de controles. El alta de tienda sigue siendo un formulario largo con scroll accesible; no se convirtió en wizard ni se ocultaron campos.

## Verificación
- `npx playwright test --config=e2e/pin-login504.frontend.config.js`:42/42 PASS sobre guardas finales de teclado; después se añadió selector abierto a320/390 y se verificaron esos2casos relacionados. Config incluye forbidOnly en CI y no habilita capturas automáticas.
- `npm test`:1522/1522 PASS, una sola vez, antes del ajuste final de geometría de login/selector. `node --test src/lib/objetosReglas.test.js src/lib/nativo/teclado.test.js`:48/48 después de la geometría; el integrador verifica el árbol unido.
- `npm run lint`:0errores; warning previo DeliveryOperations.jsx42. `npm run build`:exit0; aviso habitual por chunks.
- Specs previos conservan validación, máscara, error, pegado, borrar, foco, objetivos y contraste. El fixture de sesión anónima responde401 solo para auth/me (no503/reintentos); otros endpoints503. Capturas antiguas quedan opt-in, no se eliminaron assertions.

## Integración y revisión independiente
- Árbol integrado7d8c2222: `npm test`1522/1522 PASS; lint0errores1warning previo y buildFEexit0.
- QA independiente APPROVE, sin P1/P2 nuevo. Subset12/12PASS: móvil320 claro/oscuro, selector y texto200%, foco al reanudar, teclado físico, FaceID/busy simulado, resize/restauración, error recuperable y logout sin esperar red. Fondo opaco493 intacto. No amplía la evidencia física nativa.

## Nativo: evidencia y límites
- Scaffold propio `work/ios-pin504-simulator`, copiado solo ios desde scaffold conocido sinMLKit, sin copiar .env; node_modules enlazado a este worktree. Vite iOS con API loopback127.0.0.1:1, sin servicio real; xcodebuild Debug simulador exit0 e instalado.
- Dispositivo propio «MobOS PIN QA504», SE3/iOS27, UDID BBABF196-C4C2-4C39-9067-A4A7ADCAA09F. Device Hub muestra login completo, controles y legales visibles en SE; demo abre. Este artefacto precede al ajuste final de geometría/selector, no se presenta como build final distribuido.
- NO OBSERVADOS: PIN, transición correo→PIN con teclado real, reanudación, FaceID físico y logout nativo de este cambio. Device Hub no expuso AX del contenido; se respetó máximo3capturas (1web guardada+2observacionesHub). No se atribuyen medidas DOM al simulador.
- Al terminar se detuvo/eliminó solo ese dispositivo propio y el servidor5319 propio. No se tocaron simuladores ajenos. TestFlight2 no cambia; hace falta nuevo paquete y prueba física autorizada.

## Novedades para el dueño
- El PIN móvil ocupa la pantalla completa, con tienda y sucursal arriba y botones circulares amplios abajo.
- El acceso entra completo en celulares pequeños; el PIN evita abrir el teclado del teléfono y conserva cambiar usuario/salir.
- El texto ampliado y el alta larga siguen permitiendo llegar a todos los controles.
