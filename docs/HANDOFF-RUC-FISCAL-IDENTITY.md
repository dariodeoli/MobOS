# Identidad fiscal de clientes — candidato acotado (#344)

Fecha: 2026-10-12. Rama `codex/mobos-nav-v2`; base `c36d4ee0`.
Trabajo sin commit, push, merge, activación ni despliegue. Un solo ejecutor; revisión independiente y builds a cargo del padre.

## Novedades para el dueño

- Al aceptar una consulta de RUC, el nombre fiscal se conserva tal como fue recibido, sin modificar espacios, comas ni razón social.
- El equipo puede confirmar manualmente que se trata de una persona, revisar nombres y apellidos y verlos en ese orden; el nombre fiscal queda separado.
- Una alta con identidad fiscal que coincide con una ficha existente no la sobrescribe: solicita revisar y editar esa ficha.
- El titular de facturación se revisa y guarda por separado; no se copia automáticamente la identidad fiscal del cliente.

## Alcance y contrato

- `Customer`: cuatro columnas opcionales, sin valores por defecto ni modificación de registros históricos: `nameOfficial`, `identityKind`, `givenNames`, `surnames`. `identityKind` acepta `PERSON`, `COMPANY` o `null` en la API.
- `name` conserva su contrato histórico. `displayName` es calculado y de solo lectura: persona confirmada con ambas partes revisadas → nombres y luego apellidos, sin comas; cualquier otro caso → `name` sin reordenamiento.
- La aceptación del proveedor NO confirma una persona. El formulario mantiene las partes vacías hasta la revisión manual; cambiar las partes revoca la confirmación. Cambiar el documento elimina la aceptación anterior del formulario.
- Omisión de campos fiscales en POST/PATCH conserva los existentes. `nameOfficial: null` borra explícitamente el nombre fiscal. Cambiar la clasificación exige la tupla completa para `PERSON`; `COMPANY`/`null` limpia las partes personales. No se admiten partes aisladas ni `displayName` escrito por el cliente.
- Nombre fiscal y titular de facturación: texto no vacío de hasta 2000 caracteres; espacios exteriores preservados, exceso/blanco rechazados sin truncamiento. Partes personales: hasta 200 caracteres cada una, sin comas; revisión manual y composición normalizada solo para presentación.
- La alta con cualquier campo fiscal compara documento, teléfono e identificador externo dentro del tenant y responde 409 sin escribir si encuentra una ficha. Las altas antiguas sin campos fiscales mantienen su comportamiento previo. PATCH por ID sigue requiriendo pertenencia al tenant; los writes de Customer incluyen tenant explícito.
- SellerCustomers conserva el dato aceptado tanto en payload real como en demo; su proyección mantiene `name` y los campos nuevos. ClientesTabla usa `displayName` únicamente para presentación. El nombre del titular se toma de `nameOfficial` al aceptar en el formulario separado de facturación; su guardado y su selección como titular actual mantienen el texto exacto.
- Migración nueva: `20270102000000_customer_official_identity/migration.sql`, posterior a `20270101000000`, cuatro `ADD COLUMN IF NOT EXISTS ... TEXT`. Solo escrita: NO aplicada. No reescritura de migraciones anteriores.

## Verificación local

Todos los comandos se ejecutaron desde este worktree con `env -i`, conservando solo PATH, HOME y TMPDIR; sin archivos de entorno ni credenciales de proveedor.

| Comando | Resultado observado |
|---|---|
| `node --test src/lib/customerIdentity.test.js` | exit 0; 5 pruebas (incluye controles de cableado, no interacción de navegador) |
| `node backend/tests/customer-identity.test.mjs` | exit 0; helpers y handlers reales POST/PATCH/GET con autenticación, Prisma y transacciones simulados; omisión, duplicados sin escritura, tenant, clasificación y titular independiente |
| `node backend/tests/ruc.test.mjs` | exit 0; 188 comprobaciones existentes |
| `npm test` | exit 0; 1025 pruebas en la corrida final |
| `npm --prefix backend run test:unit` | exit 0; 138 pruebas |
| `npm run lint` | exit 0 |
| `git diff --check` | sin errores |

RED: las dos suites nuevas fallaron inicialmente por la ausencia de sus helpers. GREEN: pasaron después de la implementación. Las huellas de `clientesF3.test.js` se actualizaron únicamente para los bloques de alta/formulario/perfil cambiados de forma intencional; importación/exportación y otros motores conservan sus huellas.

## Limitaciones y pendientes del primer candidato

Este bloque conserva el diagnóstico original; la continuación autorizada al final actualiza los caminos corregidos.

- No hay prueba de base real ni de migración aplicada, de proveedor externo, de navegador ni de producción. El padre debe generar el cliente Prisma y verificar builds sobre este candidato; el verificador separado trabaja con el esquema antiguo congelado.
- **NO es una corrección de toda la emisión fiscal.** Se verificó que `backend/lib/sifen/mapping.ts` todavía recorta espacios de `billingName` y usa el `name` histórico como alternativa; `backend/app/api/orders/route.ts` también normaliza el nombre del titular al recibirlo. Estos caminos NO se modificaron por el límite explícito del encargo. No afirmar conservación exacta del nombre en XML/factura final ni cerrar ese requisito sin un trabajo posterior autorizado.
- No se hereda `Customer.nameOfficial` a `billingName`. El titular puede ser otra persona o empresa; esta separación es intencional. No se sustituyó ningún titular por `displayName`.
- El rechazo de duplicados protege las fichas ya existentes; sin índice único nuevo no resuelve la carrera entre dos altas simultáneas ni fusiona duplicados históricos.
- Sin backfill, sin reordenar empresas o nombres ambiguos, sin modificar cuotas, RucField compartido, proveedor, credenciales, proveedores o datos de tienda. Búsqueda/orden históricos siguen usando `name`; no se amplió su alcance.
- La revisión de partes personales está disponible en el alta; la API permite editar por ID, pero no se agregó otro editor completo al perfil.

## Unidad de trabajo y reversión

Una unidad: conservación fiscal del cliente y titular separado, con migración y pruebas. Quitar estos cambios revierte esta conducta sin tocar OwnData ni cuotas. La migración no fue ejecutada; si luego se aplicara, las columnas opcionales pueden permanecer durante una reversión de código, sin borrar información. No ejecutar una migración destructiva de reversión.

Archivos principales: Customer schema/migración; rutas colección/detalle/billing-identities; `backend/lib/customer-identity.ts`; `src/lib/customerIdentity.js`; SellerCustomers, CustomerProfile, ClientesTabla; suites nuevas y huellas de clientesF3. La revisión independiente, el build y cualquier entrega posterior siguen pendientes.

## Continuación autorizada — 2026-10-12

Fuente leída antes de modificar: `/tmp/mobos-fiscal-identity-independent.md`. El informe independiente original se conserva sin cambios; esta continuación NO reemplaza su revisión con una aprobación del ejecutor.

### Novedades para el dueño

- La venta conserva el nombre exacto del titular seleccionado, incluso si tiene espacios exteriores o más de 200 caracteres.
- Si ese RUC ya tiene un titular con otro nombre, la venta solicita revisar la identidad guardada en lugar de reemplazarla silenciosamente.
- El borrador fiscal respeta el titular explícito guardado en la venta antes que un cambio posterior de titular en la ficha.
- La importación rechaza campos de identidad fiscal que todavía no soporta, en lugar de descartarlos sin avisar.

### Correcciones acotadas

- POST general de Customer valida y conserva `billingName` sin recortar espacios ni longitud; hasta 2000 caracteres, blanco/exceso rechazados. Omisión conserva el valor; `null` lo borra explícitamente. Los campos de titular también cuentan como petición de identidad: un alta duplicada responde 409 sin escribir y remite al editor por identidad explícita.
- El importador valida todas las filas admitidas antes de escribir y rechaza `nameOfficial`, clasificación, partes personales, `displayName`, `billingName` o `billingDocument` no soportados. No se agregó clasificación inferida ni soporte parcial de importación.
- Orders recibe `billingTo.name` con la misma validación exacta. Dentro de la transacción busca la identidad por tenant/cliente/documento, reutiliza la existente sin escribir su nombre y rechaza diferencias de texto con 409. Se quitó el upsert que sobrescribía nombres. La omisión no cambia campos de titular; una entrada parcial incompatible con el otro campo del titular actual solicita confirmar el par completo para no reasociarlo silenciosamente.
- Mapping SIFEN usa el `billingName` explícito congelado en Order, cuando existe, antes que el titular actual; conserva el texto exacto. Nunca consume `displayName`. No toma el documento de otro titular para completar un snapshot parcial.
- **No existe una relación guardada que autorice usar `Customer.nameOfficial` como titular distinto.** Por eso NO se agregó una alternativa fiscal implícita a partir de ese campo. Sin titular explícito, el nombre histórico conserva el comportamiento anterior. Para usar el nombre oficial del titular debe seleccionarse/confirmarse en el flujo separado de facturación; no se supone identidad por coincidencia de nombre/documento.
- No se modificaron servicio, activación, certificados, transmisión, lifecycle ni cuotas de SIFEN/OwnData. No se aplicó la migración ni se ejecutaron builds o pruebas contra base/proveedor/producción.

### Evidencia adicional y resultados actuales

RED observado sobre los handlers/mapping anteriores: POST general redujo un titular de más de 200 caracteres y eliminó espacios; mapping devolvió el titular sin espacios exteriores; Orders no reutilizó el titular crudo debido a la normalización y cayó en el conflicto de documento de la fixture. GREEN observado después de las correcciones: los tres caminos cumplen sus regresiones.

El primer runner específico de mapping falló por falta de `esModuleInterop` en la fixture de transpilación, no por código del producto. Se corrigió el runner y se obtuvo RED real por diferencia del texto. El harness de Orders necesitó completar dos mocks de operaciones preexistentes (`demandasDePedido` y `orderAccessToken`); esos fallos de fixture no se presentan como fallos del producto.

| Comando | Resultado observado en la continuación |
|---|---|
| `node --test src/lib/customerIdentity.test.js` | exit 0; 5 pruebas |
| `node backend/tests/customer-identity.test.mjs` | exit 0; incluye pérdida de titular por POST general y rechazo previo de filas fiscales |
| `node backend/tests/order-fiscal-holder.test.mjs` | exit 0; POST real con Prisma/auth/transaction simulados, guardas tenant, conservación exacta, omisión, reutilización sin escribir nombre, conflicto y entradas parciales |
| `node backend/tests/ruc.test.mjs` | exit 0; 188 comprobaciones |
| `npm test` | exit 0; 1025 pruebas |
| `npm --prefix backend run test:unit` | exit 0; 138 pruebas; incluye las regresiones añadidas de mapping |
| `npm run lint` | exit 0 |
| Runner TypeScript aislado de `backend/tests/sifen-mapping.test.ts` | exit 0; mapping original y regresiones de titular exacto/snapshot/identidad diferente |
| `git diff --check` | sin errores |

Todos con `env -i` y solo PATH/HOME/TMPDIR; el runner TS usa las dependencias ya instaladas, `transpileModule` CommonJS ES2022 con `esModuleInterop: true` y carga únicamente esa suite. No valida tipos Prisma ni ejecución real de transacciones/rollback. Se conserva el informe independiente en `/tmp/mobos-fiscal-identity-independent.md`; evidencia del ejecutor en `/tmp/mobos-fiscal-identity-writer-followup.md` y logs `/tmp/mobos-holder-followup-*`.

Pendiente: revisión independiente del candidato ampliado y builds frescos a cargo del padre. No se declara preservación universal de facturas históricas, de XML final ni de otros escritores no revisados. Los pedidos sin snapshot explícito conservan su alternativa histórica; no se reconstruyeron titulares antiguos. Misma unidad de reversión del candidato inicial, ampliada únicamente a Orders, mapping y regresiones del titular. Sin commit/push/merge/deploy.
