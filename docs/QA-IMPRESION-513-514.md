# #513 / #514 — mismo diseño al enviar y QR raster verificable

Entrega aislada sobre PR512 `e22e4f4f`; diagnóstico también contrastado con main `2def`.
Sin impresión física, instalación, conexión LAN ni consulta de pedidos reales.

## Causa y solución

- El HTML premium de la vista previa y los formatters monoespaciados usados por el puente eran fuentes diferentes. Stock, Taller y ComprobantePreview enviaban el formatter antiguo.
- Esos caminos habituales ahora rasterizan el mismo HTML autónomo confirmado, a8dots/mm, usando el renderer de imágenes existente. No reconstruyen importes, identidad, QR ni políticas con otro formatter.
- Perfil físico acreditado: ZKTeco ZKP8008 declarada, papel80mm, área útil72mm/576dots, márgenes4mm. Solo se recortan márgenes comprobados blancos; desbordes o tinta fuera del área imprimible se rechazan.
- Cada etiqueta conserva su corte y orden, pero el lote completo viaja en UN trabajo, con sus copias. Se prepara y valida todo antes del primer envío. Un lote de distintos tipos conserva trabajos separados por tipo; no se afirma atomicidad global de lote mixto.
- Modelo desconocido, BrotherQL-800, StarTSP143IIIW, LTT214/TSPL, papel distinto, documento demasiado largo o lote sobre el límite: error explícito, PDF/diálogo con el mismo diseño. Nunca retorno silencioso al formato antiguo. #506 sigue pendiente para otros transportes.
- Papel58mm/A4 siguen disponibles en PDF/diálogo; esta entrega no acredita envío raster físico a esos medios. El recibo rápido de Vendidos, ubicación, remisión y recibo de regalo conservan sus caminos existentes.

Fuente primaria de geometría/capacidad: [ZKTeco ZKP8008](https://www.zkteco.com/en/comparison?pid=283), [ficha oficial](https://www.zkteco.me/download-file/2465). El modelo de la impresora concreta del reporte del dueño no está confirmado.

## QR y contexto

- El QR de pedido usa el token público opaco32base64url existente; no se cambia a64 ni se recorta un token recibido. Fixtures independientes32/64/conU+00FF y longitudes límiteGS(k demuestran que el encoder existente conserva la entrada exacta y no agrega0xFF. El origen del sufijo reportado sigue sin acreditarse.
- La salida nueva codifica los píxeles del QR del HTML, sin comandos QR nativos del firmware. jsQR decodifica desde el payload recibido: URL canónica `/pedidos/<fixture32>` y `/u/<serial>`; nunca se usa el token privado reportado.
- AppleVision también decodificó los dos artefactos ficticios independientes. Eso acredita generación digital, no lectura de papel/firmware real.
- Generación tenant+sucursal se captura antes del primer await, incluida construcción de HTML. A→B y A→B→A invalidan documentos anteriores; también se revisa tras rechazo local antes de encolar remotamente. Repetir el mismo tenant/sucursal en render no invalida una operación vigente.
- Referencias estables, copias y guarda de duplicados existentes se conservan. No se reenvía automáticamente tras resultado incierto.

## Límites de API y seguridad

- Máximo512KiB base64 canónico por trabajo =393216bytes decodificados; bodyJSON limitado durante lectura a ese máximo+8192bytes, también sin Content-Length.
- Cuota agregada20MiB y200trabajos abiertos por empresa, serializada con advisory lock transaccional. Se revisa idempotencia dentro del mismo lock antes de descontar cupo.
- rasterVersion1 valida framing, tiras, dimensiones, inicializaciones por etiqueta, avances/cortes y ausencia de datos sobrantes. No modifica el transporte ni el artefacto del agente instalado (bodymáximo5MiB existente).
- Sesión, tenant, sucursal, impresora, permisos y DTO sin payload permanecen protegidos; sin migración de esquema.

## Evidencia

- `work/513-browser-final.log`:8/8 Chromium PASS; comprobante y unidad HTML→raster→jsQR, lote3/1job/cortes/copias, rechazos sin fallback, PDF, carreras durante raster, QR de consumidor Stock y rechazo local tardío.
- PG aislado5582/API3199/WEB5383: Taller3unidades/1job+QR3+orden+hojaA4+verificar PASS (`513-pg-e2e2-final.log`); Stock2unidades/1job+QR2+orden+cortes PASS (`513-pg-stock-final.log`, repetición del fixture reutilizable también PASS en `513-pg-stock-idempotent-fixture.log`). Fixtures declaran impresora mediante API ADMIN real y esperan sesión cargada. No se bajan cantidades ni seriales; el test usa el selector507 actual.
- `513-http-pg-final.log`:26/26 HTTP+PostgreSQL PASS, payload real del browser, canonicalidad/base64/límites exactos+1, raster malformado,401/tenant/sucursal, idempotencia, DTO, cuotas y dos altas concurrentes contra límite agregado.
- Ese test queda registrado en `backend/tests/integration-http.sh`. También se puede ejecutar con `DATABASE_URL=postgresql://dario@127.0.0.1:5581/mobos513 node backend/tests/print513-pg.cjs`; solo admite base QA loopback `mobos513` o `mobos_it` con opt-in. Servidor HTTP en puerto efímero. En Integration usa fixture de protocolo determinista salvo que se provea explícitamente `MOBOS_PRINT_RASTER_FIXTURE=/tmp/print513-receipt.bin` para validar el artefacto browser.
- Unit completa previa a los ajustes finales de lote/contexto: FE1552/1552 PASS (`513-final-fe-unit.log`); BE332PASS/1skip existente (`513-final-be-unit.log`). Ajustes finales cubiertos por focused6/6, print-bridge unit y HTTP26; no repetir suites globales sin causa.
- Lint0errores,1warning preexistente DeliveryOperations; FEbuildPASS; BEbuildPASS, BUILD_ID `1I8jXI1Pv7Dp7jT9YwY9o`; Prisma válido y db:check coincide con esquema en base aislada5581,233migraciones aplicadas. Logs `513-*-final.log`, `513-prisma-validate.log`, `513-dbcheck.log`, `513-migrate.log`.
- Fallos previos conservados: selectores antiguos y fixture de estación no acotado; refresco de fixture antes de cargar sesión, corregido esperando fila. Una corrida se contaminó al iniciar por error build y Nextdev propios simultáneos: se detuvo solo ese build, se preservó su caché y se repitió el recorrido afectado con procesos separados.

## Novedades para el dueño

- Comprobante y etiquetas habituales pueden enviar a una ZKP8008 de80mm el diseño que se ve en la vista previa, conservando el QR y las copias del lote.
- Si el equipo, papel o tamaño no está acreditado, se avisa antes de enviar y se ofrece el mismo diseño mediante PDF/diálogo. La prueba con su impresora física sigue pendiente.

## Seguimiento de regresiones E2E después de integrar #513

Unidad exclusivamente de tests/documentación sobre `6f1863b7`; sin cambios de runtime, capacidades ni fallback.

- Góndola: elegir la acción manual existente «Más acciones»→«Descargar PDF» (`conDialogo`), conservar SKU completo, Gs45.000 y exactamente2etiquetas; exigir cero POST al agente o a trabajos remotos. No se fuerza retorno automático al formato anterior.
- Fixtures remotos: declarar ZKTeco/ZKP8008/80mm tanto al crear como al reutilizar impresora, conservando puente y sucursal. La captura reclamada por el puente se reconstruye como imagen y se decodifica con jsQR; URL `/pedidos/<token32>` exactamente igual al token emitido por la API del fixture,1documento/1corte/1trabajo/copia1, puente correcto y cero diálogos.
- Duplicado: primer intento crea1pendiente; segundo bloquea sin agregar; «Reimprimir igual» crea exactamente2, conserva puente/copias y no abre diálogo. Limpieza cancela ambos como antes.
- Se revisaron otras aserciones: tickets de prueba, IMEI y etiquetas de traslado conservan su pipeline anterior y sus oráculos de texto. No se tocaron qa250 ni sus caminos.
- Resultado final: **22/22 PASS**,0flaky, en `work/513-regresiones-remota-3203.log`. Incluye21tests de impresión remota y1góndola. PostgreSQL5584, API3203, WEB5386, backend prod con BUILD_ID conservado `gap2rP0SUT8b1IO5giNWb`; cluster y servidores propios detenidos por teardown. Sin suite global adicional ni capturas nuevas.
- Reproducción: `MOBOS_E2E_BACKEND=prod MOBOS_E2E_API_PORT=3203 MOBOS_E2E_WEB_PORT=5386 MOBOS_E2E_PGPORT=5584 MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-print513-regresiones MOBOS_E2E_DB=mobos_print513_regresiones npx playwright test e2e/etiquetas-gondola.spec.js e2e/impresion-remota.spec.js`.
- Corrida previa3202 conservada en `work/513-regresiones-remota.log`: se abortó tras identificar servidor ajeno Agendese en ese puerto/IPv4; el middleware de nuestro servidor llegaba a ese proyecto y devolvía404HTML. No es evidencia de fallo de impresión ni se cuenta como PASS. No se tocó el proceso ajeno; se cambió únicamente nuestro puerto. El selector de menú se corrigió al nombre real visible «Más acciones».

Novedades para el dueño:

- La prueba de comprobante remoto ahora comprueba que el QR del diseño enviado lleva exactamente al enlace emitido para ese pedido ficticio.
- La opción manual de góndola conserva precio, código y cantidad sin enviar nada a una impresora; duplicados, copias y selección de sucursal siguen verificados.
