# #404 — integración real encuadre y miniaturas

Base6295bbbb (231 aún sin publicar), rama codex/photos-integration404. SOLO pruebas/configuración/docs; ningún cambio de producto, credenciales reales o backend en esta unidad.

## Inventario y oráculos

No existía specE2Eservidor de galería esperando auto-upload. Se buscó setInputFiles/galeria-archivo/Elegir fotos en e2e: las cargas antiguas restantes son avatar/logo/adjuntos/CSV; no se cambió su contrato. `backend/tests/product-images.mjs` sí cubría HTTP404; se conservó entero. Los19frontendcrop cubrían el nuevo contrato con mocks; no bastaban para afirmar composición con el procesador real.

Se agrega `e2e/fotos-producto.spec.js` al proyectoAdmin existente, reutilizando global-setup, storageState y Playwright/bootstrap estándar. Next arrancó con `MOBOS_E2E_BACKEND=prod` después de su build propio (BUILD_ID existente), sin build concurrente con servidor. PG5589/base mobos_e2e_photos404/API3207/WEB5398. Storage propio `/tmp/mobos-photos404-storage`; seis archivos sintéticos generados en el recorrido final. El teardown detuvo el cluster y servidores propios.

## Criterios reales

- Ficha390x844: crea producto ficticio por API autenticada del harness, lo abre porSKU único en Productos y usa su galería real. Cancelar recorte=0POST y lista vacía.
- PNGsintética800x400, mitad verde/mitad roja. Arrastrar al extremo izquierdo y confirmar: POSTreal→Prisma/PG→archivo grandeWebP800x800 y thumbWebP160x160. Se descargan ambos con sesión y se decodifican medianteSharp independiente del helper servidor. Centro y dos puntos interiores conservan verde>235/rojo<20. No se copia el algoritmo de recorte como oráculo.
- Segunda foto elige mitad roja. Dos confirmaciones=2POSTexactos/2IDdistintos; píxeles grande/miniatura rojos, sin duplicados.
- Primera principal inicialmente; cambiar principal porUI conservaIDs. Ordenar declara posiciones0/1 exactas y no cambia principal. Cerrar/reabrir conserva principal; Quitar porUI deja anteriorprincipal y los bytes de la ocultada responden404.
- SVG y5MiB+1 desde fileinput: error antes de recortar/subir; POSTs siguen2 y una foto activa al terminar.
- Otra empresa QA registrada+onboarding+PINporAPI oficial del harness: lista, grande y thumb del producto ajeno responden404. Tokens permanecen solo en memoria del test, sin logs ni storagepersistente del usuario.
- AltaPOSdesktop: navegación por helperPOS (no /ops), nombre/precio válidos; encuadre queda local con0POST. Al Crear producto sube una única foto después del201 y grande/mini conservan encuadre verde, principalúnica.
- Productoalta/ficha se desactiva porAPI en finally. Datos, cuentas y PIN son exclusivamente ficticios de esa base aislada; no empresas/pagos reales.

## Evidencia y límites

Primera corrida falló antes de tests porqueSharp0.35 no tiene lib/index.js; el spec usa ahora createRequire desde packagebackend. Los intentos de alta posteriores detectaron selectores nuevos del harness: /ops es tablero de operaciones y MoneyInput agrega Gs. al nombre accesible; corregidos navegando con helperPOS y nombre de textbox. Ningún fallo confirmó bug de producto y no se alteró runtime.

Logs finales: `/tmp/mobos-photos404-e2e-final.log`; regresión de perfil separado `/tmp/mobos-photos404-profile.log`. Artefactos están en /tmp con outputúnico, sin colisión con otros agentes. No suite completa, OwnData, Apple, impresión ni producción.

El alta móvil como recorrido completo no se acredita: alta integrada fue1440, ficha fue390; encuadre360/390 y composiciónModales se acreditan por19frontendprevios. Cámara física y persistencia de un dispositivo real permanecen fuera. No se atribuye cierre total404 (cotización/variantes/otros consumidores pendientes).

## Novedades para el dueño

- La prueba conjunta confirma que el encuadre elegido llega igual a la foto y su miniatura guardadas.
- Cancelar no sube archivos; la principal, el orden y el ocultamiento siguen funcionando.
- Otra tienda no puede leer esas fotos, ni siquiera con su enlace directo.

## Resultado final

-2/2E2Eproducto PASS en Nextproduction+PG, con oráculos finales de posiciones0/1 explícitos;13.2s. Cero flaky/reintentos.
-1/1regresión real `recorte-perfil.spec.js` PASS: foto entera120x240/zoom de usuario preservados;8.5s.
-Buildbackendexit0 y BUILD_ID permanece después de Nextstart. Nodecheck del spec y diffcheckPASS. No fullsuite ni fullunit por tratarse únicamente de pruebas/config/docs, sin nuevos cambios de aplicación.
-Playwrightconfig agrega únicamente fotos-producto.spec.js al proyectoAdmin; todos los matches antiguos quedan intactos.
