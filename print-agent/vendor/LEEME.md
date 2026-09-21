# Módulos vendorizados del agente

Acá viven las dependencias nativas que el tarball del agente lleva adentro para
que el USB directo (#96) funcione en la Mac **sin `npm install`**.

| Paquete | Versión | Licencia | Para qué |
| --- | --- | --- | --- |
| `usb` (node-usb) | 2.15.0 | MIT | Acceso USB: `getDeviceList()` + la API clásica (`device.interface(0)`, `endpoint.transfer`) que usa `usb.mjs`. |
| `node-gyp-build` | 4.8.4 | MIT | Lo requiere `usb` para cargar su binding N-API. |

Del paquete `usb` se incluye solo lo que la Mac necesita:

- `dist/**` (JS, sin sourcemaps),
- `prebuilds/darwin-x64+arm64/node.napi.node` — **un solo binario N-API universal**
  para Mac Intel y Apple Silicon,
- `package.json` y `LICENSE`.

No se incluyen los prebuilds de Windows/Linux: el agente instalado por
`install.sh` es para macOS (`launchd`). Si algún día se distribuye en otra
plataforma, hay que agregar su prebuild y su allow-list en `install.sh`.

`pack-agent.mjs` los mete en el tarball como `node_modules/<paquete>/**`, así
`import('usb')` desde `usb.mjs` resuelve sin tocar código. El instalador acepta
esas rutas en su allow-list y sigue rechazando cualquier otra.

## Cómo actualizar

1. `npm pack usb@<versión>` y `npm pack node-gyp-build@<versión>` en un directorio
   temporal.
2. Reemplazar acá `dist/`, el prebuild darwin, `package.json` y `LICENSE` (y los
   JS de `node-gyp-build`).
3. `npm run pack:agent` y commitear también `backend/public/print-agent/`
   (el gate es `npm run pack:agent:check`).
4. Probar el USB físico con la ZKP8008 (ver `USB-DIRECTO.md`).
