# Validación de integración 1.0.230 — 16/10/2026

Base main: `2def99308454fbd92b67033e2fad5a2eb26e70da`. Integración funcional congelada en `e53aaf99b3bda5df84393a14b65f84d663a10131`; este documento no cambia runtime. PR512 reúne507/513/514,484/504,350,508 y403. No contiene la unidad de logos públicos403 posterior.

## Gates locales

- Frontend completo:1562/1562 PASS, lint0errores/1advertencia previa, build exit0. La primera composición antes de350-A tenía1556PASS; la suite se repitió por ese cambio real.
- Backend completo:332PASS/1skip SQL previo, Prisma validatePASS, build exit0 con BUILD_ID `NpmsJI1c2lwXxp5XEA-jG`.
- HTTP/PostgreSQL completo:PASS con cluster temporal propio,233migraciones y conciliación de esquema. Nuevo raster:26/26 checks, incluidos cuerpo/base64, aislamiento, idempotencia y cuota concurrente. Primer intento falló una aserción obsoleta de128KB; se cambió a512KiB+1 y se repitió todo el harness, sin omitir pruebas.
- Browser integración: PIN5, demo perfiles4, plataforma4, documentos públicos51, plantillas14, impresión/QR8, contexto demo1. PIN/demo/plataforma se repitieron después de350-A; públicas no depende del nuevo store.
- Autor impresión:2E2E PostgreSQL Stock/Taller conservan cantidades, seriales, orden y un solo trabajo. Regresión adicional22/22PASS,0flaky:21remota+1góndola, QR exacto emitido, copias, puente, duplicados1→1→2 y0diálogos inesperados. Primera corrida afectada por servidor ajeno en3202 queda registrada; repetición aisladaAPI3203 aprobó sin tocar aquel proceso.
- Revisión independiente:APPROVE fuentes6f1863b7(impresión),497d737e(demo-contexto),ca764404(PIN),ab0200e9(demo-perfiles),c8c44d4e(plataforma),d87a4768(documentos). Se corrigieron dos carreras de contexto detectadas antes del dictamen final.

Logs locales: `work/release230-final-*.log` del workspace coordinador. Cada unidad conserva QA propio en docs/QA-IMPRESION-513-514.md, QA-DEMO-350-A-CONTEXTO.md, QA-PIN-CAMBIO-484.md, QA-DEMO-350-PERFILES.md, QA-SUPERADMIN-508-SHELL.md y QA-PUBLICAS-403-RESTANTES.md.

## Publicación y límites

CI previo38855820393/e22e4f4f FALLÓ y no acredita este candidato. El guard anterior está detenido. Se requieren ocho gates del SHA nuevo, merge protegido exacto y ocho gates main antes de release:build-current y una sola release:publish. Después se verifican ambos deploys/SHA, smoke y esquema. No hubo publicación230 al escribir este informe.

Solo ZKP8008 declarada80mm está acreditada digitalmente; no hay prueba física ni nueva compatibilidad Brother/Star/3nStar. Otros medios ofrecen PDF/diálogo. QuickReceipt, ubicación, remisión y regalo mantienen sus rutas existentes. El origen del sufijoÿ reportado no fue reproducido; no se recortan tokens ni se abre acceso a enlaces inválidos.

SoloAurora operable, sin selector de segundaempresa; futuros consumidores asíncronos deben usar los tokens de contexto. #350/#403/#508/#507 permanecen parciales. No se afirma VoiceOver, OAuth real ni prueba de impresora. OwnData2/2 ya consumido, sin más llamadas.

iOS1.0(3) es la versión229 ya distribuida y enviada a revisión manual. Esta versión230 requerirá nuevo paquete nativo después de producción verificada; no repetir upload3 ni retirar su revisión prematuramente.

## Novedades para el dueño
- La impresión habitual conserva el diseño confirmado y el QR, con protección al cambiar de empresa.
- Cambiar de vendedor usa el teclado táctil, y la demo conserva las ediciones durante la sesión.
- Documentos públicos y plataforma mejoran legibilidad y navegación sin ampliar permisos.
