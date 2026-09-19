# remote-print-jobs Specification

## Purpose

Cola remota por empresa: cualquier dispositivo encola y el puente reclama, imprime y reporta sin romper el camino local (`src/lib/printing/agent.js:16`).

## Requirements

### Requirement: Ciclo de vida de puentes

Solo ADMIN MUST crear puentes. El token MUST devolverse una vez, guardarse hasheado (`backend/lib/auth.ts:201`) y compararse con `timingSafeEqual` (`backend/app/api/internal/email-outbox/route.ts:5-12`); MUST NOT exponerse en listados, el total MUST estar acotado y cada poll (2 s, backoff) MUST actualizar `lastSeenAt` (online/offline). ADMIN MUST rotar y revocar (`revokedAt`); un revocado MUST dar 401.

#### Scenario: Alta, tope y rol sin permiso (unit backend)

- GIVEN un ADMIN y un VENDEDOR
- WHEN intentan crear puentes
- THEN ADMIN recibe el token una vez, VENDEDOR 403 y sobre el tope no se crea

#### Scenario: Rotación y revocación (unit backend)

- GIVEN un puente con token activo
- WHEN ADMIN rota y luego revoca
- THEN el viejo da 401, el nuevo autentica y tras revocar ambos dan 401

#### Scenario: Presencia por lastSeenAt (unit backend)

- GIVEN un puente que hizo poll recién
- WHEN se lista la empresa
- THEN figura `online`; tras la ventana sin polls, `offline`

### Requirement: Encolado desde cualquier dispositivo

Toda sesión MUST poder encolar destino, ancho, copias, referencia, usuario y tipo. El payload MUST tener tope; si lo supera MUST NOT crearse y repetir la clave de idempotencia MUST devolver el mismo.

#### Scenario: Encolar y repetir (unit backend)

- GIVEN un dispositivo con puente online
- WHEN encola, repite la clave y encola sobre el tope
- THEN queda un solo `pendiente` con metadatos y el excedido se rechaza

### Requirement: Lease, requeue y estados

El claim MUST ser atómico y mover el trabajo a `reclamado` con `leaseUntil`; solo el dueño vigente MUST reportar. Éxito MUST dejar `impreso`; `confirmado` MUST venir solo del papel. Lease vencido MUST reencolar mientras queden intentos y luego dejar `fallido` sin auto-requeue; lo incierto MUST NOT auto-reintentarse (`print-agent/cola.mjs:6-14`) y los reportes repetidos MUST ser idempotentes. Al llegar a `impreso` MUST borrarse el payload.

#### Scenario: Claim concurrente, vencimiento y requeue (unit backend)

- GIVEN un trabajo `pendiente`
- WHEN dos puentes reclaman a la vez
- THEN solo uno lo obtiene, el reporte ajeno o vencido se rechaza, el vencido reencola y al agotar el tope queda `fallido`

#### Scenario: Sin bytes tras imprimir (unit backend)

- GIVEN un trabajo `impreso`
- WHEN se consulta por API y base
- THEN el payload está vacío o ausente y los metadatos siguen

### Requirement: Confirmación en papel con secreto

El cliente genera el secreto (`src/lib/printing/tickets.js:198-201,234-236`); el servidor MUST validarlo solo por `POST /jobs/{id}/confirm`, MUST rechazar el sufijo incorrecto y MUST NOT devolverlo en listados ni detalle.

#### Scenario: Validación del sufijo (unit backend)

- GIVEN un trabajo `impreso` con secreto
- WHEN confirma con el sufijo correcto y con uno incorrecto
- THEN el correcto pasa a `confirmado`, el incorrecto sigue `impreso` con 4xx y ningún listado expone el sufijo

### Requirement: Local primero y respaldo manual

En la Mac del puente el agente local MUST ganar: imprimir por `127.0.0.1` y no encolar remoto el mismo ticket; cada trabajo MUST registrar `path` (`local`/`remoto`). El respaldo `printHtml` (`src/lib/printing/agent.js:293-316`) MUST ser manual y MUST NOT abrirse solo tras un envío remoto. Una bandera MUST permitir apagar el modo remoto y preservar el camino local.

#### Scenario: Local sin round-trip remoto (e2e)

- GIVEN la Mac del puente con agente local
- WHEN imprime una prueba
- THEN sale por 127.0.0.1 con `path=local` y sin trabajo remoto

#### Scenario: Envío remoto sin diálogo automático (e2e)

- GIVEN un dispositivo sin agente local
- WHEN encola una prueba
- THEN queda para el puente con `path=remoto` y la app no abre el diálogo

#### Scenario: Bandera apagada (unit backend)

- GIVEN la bandera apagada
- WHEN se intenta encolar remoto
- THEN se omite y la Mac conserva su camino local
