# #508 — primera unidad del shell de plataforma

Base main2def. Alcance local de SuperadminLayout; no se modifica la librería compartida ni las rutas, fuentes, autorización de servidor o alcance global. El guard de acceso previo a dibujar el panel permanece intacto.

Implementado:

- Título Centro de control más compacto, con marca existente por tema; destinos y títulos conservados.
- Lateral de escritorio plegable con etiquetas accesibles y preferencia exclusiva `mobos:plataforma-nav-compacto`. No modifica la preferencia operativa `mobos:shell:menu-plegado`; los shells siguen en rutas separadas.
- Identidad de la sesión al pie del lateral usando Avatar compartido. Sin usuario disponible muestra un estado neutro; no inventa identidad ni usa la foto de otra cuenta.
- Salida efectiva a la derecha mediante `useSesion().salir`, conservando revocación/limpieza/navegación existentes. El botón indica ocupado y mantiene44px. Fallo inesperado usa Aviso semántico compartido.
- La selección del período se conserva al navegar entre apartados del panel. Se siguen mostrando únicamente destinos con módulos existentes, sin pestañas decorativas ni métricas inventadas.

Verificación:

- Cuatro Chromium PASS: plegado/recarga/preservación preferencia operativa/período; salida con POSTlogout exactamente una vez y llegada a login en320/390; denegación404 no monta panel ni consulta resumen. Son fixtures HTTP locales en tema claro y usuario nulo, no pruebas de permisos en producción ni OAuth, avatar autenticado, oscuro completo o VoiceOver. El POSTlogout único corresponde a esa fixture; la sesión real puede revocar dos permisos según su contrato existente.
- ESLint: cero errores, un warning previo en DeliveryOperations sin modificar. Build frontend exit0.
- FullFE inicial1521/1522 detectó color de error fuera de tokens. Se reemplazó por Aviso compartido;45reglas de objetos PASS. Revisión independiente APPROVE del commitc8c44d4e, sin ampliar evidencia de fixtures. Gate final completo posterior:1522/1522PASS y buildFE exit0; el full inicial fallido se conserva como historial.
- Imagen opcional de fixture sin datos reales: `outputs/QA-SUPERADMIN-508/plataforma-plegada.png` en coordinación.

Pendiente de #508: shell compartido opt-in completo, menú contextual por módulo/subpestañas y lateral complementario, identidad fija en el menú móvil, directorios con propietarios/fotos, contratos de métricas/presencia/reportes/comunicaciones/mantenimiento y pruebas de servidor correspondientes. No cerrar #508 por esta unidad. No se desplegó ni se alteró la compilación iOS3.

Novedades para el dueño

- El panel global permite plegar su navegación sin cambiar la preferencia de la app operativa.
- Conserva el período elegido y ofrece salida real de la sesión, con la identidad al pie del lateral.
