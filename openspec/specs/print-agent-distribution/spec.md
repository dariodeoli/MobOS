# print-agent-distribution Specification

## Purpose

Distribuir y vincular el agente de impresión sin clonar el repo: instalador versionado servido por el backend (tarball más one-liner con checksum). Hoy `install-macos.sh:27` copia archivos del clon.

## Requirements

### Requirement: Instalador servido por el backend

El backend MUST servir un instalador y un tarball versionado del agente (incluye `server.mjs`, `transportes.mjs`, `cola.mjs`, `config.mjs`, `remoto.mjs`) atado a su propia versión, con checksum publicado. MUST funcionar desde una Mac sin repo y MUST NOT depender de GitHub.

#### Scenario: Descarga versionada (unit backend)

- GIVEN el backend en una versión
- WHEN se pide el instalador
- THEN devuelve el one-liner y el tarball de esa versión con su checksum

### Requirement: Instalación con checksum verificado

El one-liner MUST verificar el checksum antes de instalar y MUST abortar sin instalar si no coincide.

#### Scenario: Checksum inválido aborta (unit backend)

- GIVEN un tarball alterado
- WHEN corre el instalador
- THEN falla y no deja archivos instalados

#### Scenario: Mac limpia sin repo (e2e)

- GIVEN una Mac sin el repo
- WHEN corre el one-liner
- THEN el agente queda instalado y arranca con su configuración

### Requirement: Vinculación sin clonar el repo

ADMIN MUST generar desde la app un código de vinculación de un solo uso y vencimiento corto; el agente MUST canjearlo por su token, persistirlo y autenticar su poll (`print-agent/server.mjs:82`). El alta MUST NOT requerir repo ni copiar archivos a mano.

#### Scenario: Código de un solo uso (unit backend)

- GIVEN un código vigente
- WHEN se canjea una vez y se reintenta
- THEN devuelve token la primera vez y la segunda falla; un código vencido también falla

#### Scenario: El puente aparece online (e2e)

- GIVEN el agente instalado y vinculado
- WHEN la app lista puentes
- THEN aparece `online` con su versión

### Requirement: Versión reportada

El agente MUST reportar su versión en el poll y el backend MUST exponerla para detectar instalaciones viejas.

#### Scenario: Versión visible (unit agente)

- GIVEN un agente vinculado
- WHEN reporta en su poll
- THEN el backend guarda la versión y la lista la muestra
