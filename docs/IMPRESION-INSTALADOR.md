# Instalador del agente de impresión — versiones, allow-list y rollback

El agente local (`print-agent/`) se distribuye como **artefacto versionado** que
sirve el backend: `backend/public/print-agent/` (`mobos-print-agent-<versión>.tgz`
+ `manifest.json` + `install.sh`). En producción se sirve en
`https://api.moboss.online/print-agent/` (las mismas rutas valen para
`/api/print-agent/manifest`, que agrega `installUrl`). La instalación es un
one-liner sin clonar el repo; esta guía explica qué tiene que coincidir, cómo se
verifica y cómo se vuelve atrás.

## 1. Versiones (qué tiene que coincidir)

| Pieza | Dónde | Regla |
| --- | --- | --- |
| Versión del agente | `print-agent/package.json` **y** `print-agent/server.mjs` (`const VERSION`) | Tienen que ser **idénticas**: `pack:agent` falla si difieren. |
| Artefacto | `backend/public/print-agent/mobos-print-agent-<versión>.tgz` | Una versión = un tarball: publicar otra **borra** las anteriores. |
| Manifest | `backend/public/print-agent/manifest.json` (y `GET /api/print-agent/manifest`) | `version`, `file`, `sha256`, `size`; el API agrega `installUrl` (apunta al origen que sirve el instalador, no a la app). |
| Version en la app | Configuración → Dispositivos | Muestra la que reporta `/health` del agente. |

**Publicar una versión nueva**:

```bash
# 1) subir la versión en print-agent/package.json y print-agent/server.mjs
# 2) regenerar el artefacto
npm run pack:agent
# 3) commitear backend/public/print-agent/ (el gate es el paso 4)
npm run pack:agent:check     # falla si el artefacto no coincide con las fuentes
```

`pack:agent` es determinista (mtime/uid fijos): el mismo contenido produce el
mismo `sha256` en cualquier máquina.

## 2. Instalación (one-liner)

```bash
brew install node            # Node 20 o superior, una sola vez
curl -fsSL https://api.moboss.online/print-agent/install.sh | bash -s -- --code ABCDE-FGHIJ
```

- El **código** sale de la app: *Configuración → Dispositivos · Puentes*.
  Vence en 15 minutos, se usa una sola vez y no se vuelve a mostrar.
- Flags: `--code ABCDE-FGHIJ`, `--api-url URL`, `--dir RUTA`, `--no-service`,
  `--from-repo` (desarrollo: usa `install-macos.sh` del clon).
- Sin código instala igual y deja el comando para vincular después.
- **Qué hace, en orden**: (1) exige Node ≥20; (2) valida el formato del código
  **antes de descargar nada**; (3) baja el manifest; (4) baja el tarball y
  **verifica el SHA-256 antes de extraer** (si no coincide, no extrae nada);
  (5) valida la **allow-list** de entradas; (6) extrae con
  `--strip-components=1`; (7) si hay código, vincula con `pair.mjs`; (8) en macOS
  carga el servicio `com.mobos.print` de `launchd`.
- **Dónde queda**: código en `~/Library/Application Support/MobOS Print`,
  configuración/cola/historial en `~/.mobos-print` (`config.json` 0600 con el
  token del puente), servicio en
  `~/Library/LaunchAgents/com.mobos.print.plist`.

## 3. Allow-list del tarball (regla dura)

El instalador **rechaza** cualquier entrada que no sea exactamente:

- los siete módulos del agente: `server.mjs`, `transportes.mjs`, `cola.mjs`,
  `config.mjs`, `remoto.mjs`, `usb.mjs`, `pair.mjs`, y `package.json`;
- los módulos vendorizados (#96): `node_modules/usb/**` (con el prebuild N-API
  universal `darwin-x64+arm64`) y `node_modules/node-gyp-build/**`.

Cualquier otra ruta —incluidas rutas absolutas o con `..`— **aborta antes de
extraer**. Los vendorizados viajan en el paquete para que el USB directo funcione
sin `npm install`; el detalle y cómo actualizarlos está en
`print-agent/vendor/LEEME.md`. El camino de desarrollo (`--from-repo`) copia solo
los `.mjs` del clon: para USB ahí hace falta `npm install usb` en la carpeta.

## 4. Verificación (checksum y anti-drift)

| Qué | Cómo |
| --- | --- |
| Artefacto vs fuentes | `npm run pack:agent:check` (gate del repo; CI y entrega). |
| Manifest vs tarball servido | Arnés HTTP (`backend/tests/integration-http.sh`): exige que `installUrl` apunte al instalador (no a la SPA), que esa URL devuelva `#!/usr/bin/env bash` con la allow-list y que el `sha256`/`size` del tarball servido coincidan con el manifest. |
| A mano (sin clonar) | `curl -fsSL https://api.moboss.online/print-agent/manifest.json`; descargar el `file` y comparar `shasum -a 256` con `sha256`; `curl -fsSI <installUrl>` = 200 y `curl -fsSL <installUrl> \| head -1` = `#!/usr/bin/env bash`. |
| En la Mac instalada | `/health` (versión, `transporte`, `usb`, `red`) y Configuración → Dispositivos. |

## 5. Rollback

El agente **no se auto-actualiza**: actualizar es volver a correr el one-liner
(el manifest publica la versión vigente). Para volver atrás:

1. **Cortar el modo remoto sin reinstalar** (lo más rápido): en la app,
   *Configuración → Dispositivos · Puentes* → **revocar** el puente (su
   token deja de autenticar), o en la Mac poner `"apiUrl": ""` en
   `~/.mobos-print/config.json` y reiniciar el servicio (`launchctl unload`/
   `load` del plist). El agente queda en modo **local** (sin reclamar trabajos
   del backend).
2. **Volver a una versión anterior publicada**: el manifest solo publica la
   versión vigente, así que hay que republicarla desde el repo:
   ```bash
   git checkout <tag-o-commit> -- print-agent backend/public/print-agent
   npm run pack:agent            # regenera el tarball/manifest de esa versión
   git add backend/public/print-agent && git commit -m 'revert(impresion): agente vX.Y.Z'
   ```
   y en cada Mac reinstalar con el one-liner (baja la versión del manifest).
   No existe `--version` en el instalador: siempre instala la del manifest.
3. **Desinstalar del todo**: `bash print-agent/uninstall-macos.sh` (baja el
   servicio, quita la cola CUPS/IP secundaria que agregó el instalador y borra el
   directorio del agente; **conserva** `~/.mobos-print` para reinstalar).

## 6. Problemas típicos

| Síntoma | Qué mirar |
| --- | --- |
| `bash: syntax error near unexpected token '<'` al instalar | El `installUrl`/URL usada no es el instalador (devolvió la SPA). Usar `https://api.moboss.online/print-agent/install.sh`. |
| «El paquete contiene un archivo no permitido» | El tarball tiene entradas fuera de la allow-list (§3): regenerar con `npm run pack:agent` y verificar con `pack:agent:check`. |
| «El checksum no coincide» | El manifest y el tarball no son de la misma publicación: regenerar el artefacto y limpiar cachés de CDN. |
| El código de vinculación no sirve | Vencido (15 min) o ya usado: generar uno nuevo en Gestionar puentes. |
| La impresora no responde / USB / CUPS | Checklist físico: `docs/IMPRESION-PRUEBA-FISICA.md` §1–§3. |
| Un QR impreso dice "Seguimiento no encontrado" | No es del instalador: ver `docs/IMPRESION.md` §2 (el QR impreso no vence). |

## 7. Referencias

- `print-agent/README.md` (uso diario del agente) · `print-agent/vendor/LEEME.md`
  (módulos vendorizados) · `docs/IMPRESION.md` (reglas de impresión) ·
  `docs/IMPRESION-PRUEBA-FISICA.md` (prueba en la Mac) · `AGENTS.md`
  (distribución y anti-drift).
