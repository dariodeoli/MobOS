# print-config-authority Specification

## Purpose

Impresoras y puentes por empresa viven en el backend; `localStorage` baja a caché offline con import único. El agente aprende su configuración sin navegador abierto. Hoy la config es por dispositivo (`src/lib/printing/agent.js:26-31`) y solo se sincroniza al guardar desde la SPA (`src/components/control/Impresoras.jsx:107-110`).

## Requirements

### Requirement: Autoridad del backend

Impresoras y puentes MUST persistirse por empresa en el backend y leerse igual desde cualquier dispositivo autenticado. La escritura MUST autorizarse del lado del servidor (ADMIN como base; `backend/lib/auth.ts:49-76`) y MUST rechazar con 403 a roles sin permiso.

#### Scenario: Dos dispositivos ven lo mismo (e2e)

- GIVEN la empresa con impresoras cargadas en el backend
- WHEN dos dispositivos abren la app
- THEN ambos listan las mismas impresoras y puentes

#### Scenario: Rol sin permiso no edita (unit backend)

- GIVEN una sesión VENDEDOR
- WHEN intenta crear o editar una impresora
- THEN responde 403 y no hay cambios

### Requirement: Caché offline

El SPA MUST usar `localStorage` solo como caché de lectura para mostrarse sin backend y MUST dejar ganar al backend cuando responde. Las escrituras MUST ir primero al backend y refrescar la caché.

#### Scenario: El backend pisa la caché (e2e)

- GIVEN caché vieja y backend con otra config
- WHEN el dispositivo abre Impresoras
- THEN muestra la del backend y actualiza la caché

#### Scenario: Sin backend se ve la última caché (e2e)

- GIVEN el backend caído
- WHEN el dispositivo abre
- THEN muestra la última config cacheada sin escribir

### Requirement: Import único desde localStorage

La configuración legacy por dispositivo MUST importarse una sola vez al backend por empresa, de forma idempotente, conservando un único puente predeterminado (`src/lib/printing/puentes.js:37-44`). Reejecutar el import MUST NOT duplicar filas.

#### Scenario: Import repetido no duplica (unit backend)

- GIVEN config legacy en localStorage
- WHEN el import corre dos veces
- THEN las tablas quedan iguales que tras la primera

#### Scenario: La caché pasa a solo lectura (e2e)

- GIVEN el import ya hecho
- WHEN se edita una impresora
- THEN el cambio va al backend y la caché se actualiza

### Requirement: Sincronización del agente sin navegador

El agente MUST obtener impresora, ancho, copias y allow-list LAN desde el backend autenticado aunque no haya navegador abierto, replicando el payload de `sincronizarAgente` (`src/lib/printing/agent.js:237-248`). La respuesta MUST acotarse al tenant del puente y el agente MUST conservar su última configuración si el backend no responde.

#### Scenario: Allow-list sin SPA (unit agente)

- GIVEN el puente con su token y sin navegador
- WHEN corre su poll de configuración
- THEN aplica impresora, ancho, copias y destinos LAN

#### Scenario: Backend caído no rompe lo local (unit agente)

- GIVEN el backend sin responder
- WHEN el puente imprime local
- THEN usa su última configuración y la impresión local sigue

### Requirement: Multi-puente acotado

Cada impresora MUST pertenecer a lo sumo a un puente; un puente MUST recibir solo la configuración y los trabajos de sus impresoras; cada empresa MUST tener a lo sumo un puente predeterminado.

#### Scenario: Puentes no se pisan (unit backend)

- GIVEN impresoras repartidas en dos puentes
- WHEN cada puente consulta
- THEN solo recibe las suyas y el encolado por impresora elige el puente correcto
