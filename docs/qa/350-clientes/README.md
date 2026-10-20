# #350 — guardar fichas de cliente en la demo

## Contrato

Confirmar un cliente nuevo en el POS crea un id `demo-cliente-*` y lo selecciona; editar una ficha conserva su id. Modelo y límites de nombre son los canónicos del checkout: visible hasta200 caracteres, fiscal exacto hasta2000 y PERSON sólo con datos confirmados. Un fiscal largo sin nombre visible mantiene los datos/error para corregir, sin simular guardado exitoso.

Confirmar, aplicar un RUC admitido y guardar direcciones escriben sólo en el almacenamiento contextual de la demo, mediante `guardarFichaClienteDemo` / `actualizarClienteDemo`. La confirmación dice «guardado en esta demo» y advierte que se descarta al recargar. El registro nuevo comienza sin pedidos ni eventos históricos inventados. No hay API de clientes ni persistencia entre recargas.

## Fuente canónica y reset

La cartera combina los seeds con cambios por id (override antes que seed, sin duplicados). El updater preserva datos previos/perfil y nunca modifica el seed. Cartera, selector del taller y lectores de garantía/informe usan `listarClientesDemo`; los tokens demo resuelven la misma ficha.

Los writers de ventas, pagos e interacciones clonan la ficha y guardan el resultado también para ids seed. Los informes compartidos/vistos dejaron de vivir en un Map global: usan DemoStorage contextual. Los vistos de avisos del portal también guardan el clone. De ese modo editar un seed no oculta cambios posteriores y reset/recarga restituye los ejemplos originales.

`leerDemo`/`guardarDemo` se invocan explícitamente con `{ demo: true }` para esta cartera y sus informes; no pueden caer en localStorage fuera del runtime demo. No se cambian las reglas de contexto de DemoStore ni se agregan claves reales.

## Validación

- Node:24PASS (clientes/store/admisión de ficha). Cubren upsert seed/nuevo por id, duplicados, direcciones, token demo, preservación de perfil/eventos anteriores, venta/pago/interacción, informes/vistos, límites200/2000, ids inexistentes, PERSON sin confirmar, seed intacto y reset. Los escritores se verifican con localStorage que falla si se toca:0 accesos.
- UI nueva:5PASS,9,5s. Nuevo/seleccionado, dirección/reapertura/cartera, edición de seed con mismo id, reload, salida/reset, RUC fixture5215244 y fiscal largo1924 con error recuperable. Vite aislado5391, sin backend.
- Regresión conjunta demo+POS:23PASS,27,6s (5 nuevos+18 POS). La aserción previa de cliente nuevo se adapta al resultado correcto: ahora muestra resumen seleccionado, en lugar de seguir como cliente sin id.
- Todas las rutas `/api/` de UI se interceptan localmente;0 escrituras de negocio solicitadas. Los intentos esperados de telemetría `/api/public/track` también se responden503 localmente, sin alcanzar un servidor. HTTPS externo se aborta. El RUC5215244 no emite lookup; el fiscal largo usa una respuesta HTTP local simulada, nunca OwnData real ni claves.
- Frontend1602PASS, lint0errores/1warning previo DeliveryOperations, buildfrontendPASS. Backend347PASS+1skip, buildPASS con BUILD_ID `TyV0GeBAC_5xs0Ifwof1l`, Prisma validatePASS; todas las migraciones y db:checkPASS en PG sintético propio, limpiado al terminar. Sin cambios backend/schema.

## Integración y límites

Unidad store inicial sobre main235, commit804f6dd6 preservado en `codex/demo-350-clientes-guardados`. La rama de integración se rebasó con `--onto origin/main 880ebc11` sobre main236 `43204589a410c959cc6033c7503716a714e042bd`, sin conflictos y con diff exclusivo demo. Reutiliza el Modal y los validadores fiscales canónicos; no arrastra la implementación POS ya integrada.

No cierra #350 ni sustituye el resto de la demo completa. No cambia layout del POS, infraestructura, configuración, versiones ni producción. El guardado es contextual y se pierde al recargar/resetear, como indica la aplicación.

## Novedades para el dueño

- Confirmar un cliente demo lo crea y deja seleccionado con un aviso claro.
- Editar una ficha o dirección se refleja en la cartera sin duplicar clientes.
- Los cambios de los ejemplos se conservan durante la demo y se descartan al recargar o salir.
- La simulación no escribe clientes ni consulta datos en una tienda real.

## Revalidación sobre main236

- Demo + POS/checkout compacto: 26 casos PASS (34.6s), incluidos cinco demo; fiscal POS con HTTP simulado: cinco casos PASS (25.3s), primer intento, harness PG propio, detenido al terminar.
- FE 1602 PASS; BE 347 PASS + 1 skip; lint sin errores; builds FE/BE, Prisma validate y dbcheck con migraciones en PG fresco PASS. BUILD_ID backend: `Bl-stSFmz5behFy29WlMF`.
- Capturas finales en `outputs/mobos-350-final-236/` de coordinación: selección guardada, dirección reabierta y cartera. Sin OwnData ni writes API reales.
