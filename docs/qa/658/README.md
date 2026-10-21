# #658 · Filtro del historial IMEI

Base de trabajo: main239556c03a. Esta corrección no identifica la causa del400
original de #550 ni cierra sus criterios sobre políticas OWNER o proveedor.
No modifica configuración, créditos, consultas pagas ni impresión física.

## Reproducción y contrato

El GET anterior validaba el parámetro pero, si no era válido, retiraba el filtro
del where y respondía200 con historial general del tenant. El buscador en la
ficha sólo verificaba longitud15 y podía enviar un dígito de control inválido.

- Sin parámetro imei: conserva el listado general autorizado y el saldo visible.
- Parámetro presente vacío, whitespace, corto o con Luhn inválido:400 controlado
  antes de consultar historial/saldo/proveedor. Autenticación, módulo y permisos
  se verifican primero; sus consultas necesarias no se omiten.
- Filtro válido normalizado: conserva tenant de sesión y paginación existentes.
- El buscador muestra el mensaje y no hace GET filtrado cuando el valor falla.
- Frontend y adaptador comparten backend/lib/imei-input.mjs y su declaración
  TypeScript: una sola normalización/Luhn, sin nuevas restricciones de proveedor.
  El backend conserva la autoridad y exporta validarImei como antes.

## Evidencia local

- Roja:7 pruebas focales,4 fallos200vs400 para filtros inválidos,3 pasan.
- Verde:7/7 focales (vacío, whitespace, corto,15conDV inválido, válido normalizado,
  ausente, tenant/paginación y auth/módulo/permisos antes de validar).
- UI real UnidadDetalle con API interceptada:2PASS en1440 y390; inválidos muestran
  mensaje y cero solicitudes filtradas; válido solicita únicamente su filtro.
  No acredita dispositivo físico ni proveedor real.
- HTTP/PG incorpora7checks GET-only en el arnés completo: dos historiales
  sintéticos de tenants distintos para el mismo identificador repetitivo;
  filtro normalizado devuelve sólo el actual aun si query pide otro tenant.
  Número de consultas/reservas no aumenta. Fixtures se limpian por sus IDs.
- Frontend1611PASS, backend357PASS+1skip; lint0errores/1warning preexistente;
  builds FE/BE, next typegen && tsc --noEmit y Prisma validate PASS.

Identificadores nuevos de prueba: dígitos repetitivos sintéticos, nunca un IMEI
real. Tests no llaman a un proveedor ni leen claves. El helper HTTP sólo acepta
el PostgreSQL loopback mobos_it creado por el arnés descartable.

## Repetir

- npm test
- npm --prefix backend run test:unit
- npx playwright test --config=e2e/imei-history.config.js
- MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh

El paso UI focal se ejecuta también en CI E2Eshard1, sin alterar el sharding ni
sus tiempos históricos. El config usa un puerto libre estable para todos los
workers y no comparte base de datos. Publicación/merge dependen de revisión y
CI; esta unidad no ejecuta deploy ni cambia #651/#655.
