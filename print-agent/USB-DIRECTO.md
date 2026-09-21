# USB directo del agente (issue #96)

Camino de impresión **USB directo**: el agente detecta la impresora por VID/PID y
le escribe los bytes ESC/POS crudos al endpoint de salida, sin pasar por CUPS.
Apagado por defecto: se enciende con la bandera `usb` y, si el USB no está
disponible o falla, el trabajo sigue por CUPS/LAN sin intervención.

## Cómo se enciende

| Vía | Ejemplo |
| --- | --- |
| `~/.mobos-print/config.json` | `{ "usb": true, "usbVid": "0x0483", "usbPid": "0x5743" }` |
| Argumento al arrancar | `node server.mjs --usb` |
| Entorno | `MOBOS_PRINT_USB=1` (opcional `MOBOS_PRINT_USB_VID`, `MOBOS_PRINT_USB_PID`) |

`usbVid`/`usbPid` son opcionales: sin ellos se elige el primer dispositivo con
interfaz de clase *printer* (clase 7). Con VID/PID configurados solo se usa esa
impresora; si no aparece, el trabajo cae al respaldo.

La dependencia nativa **viaja dentro del tarball**: `print-agent/vendor/` guarda
`usb` (node-usb 2.15.0, con el prebuild N-API universal `darwin-x64+arm64`) y
`node-gyp-build`, y `pack-agent.mjs` los empaqueta como `node_modules/**`. En la
Mac instalada con `install.sh` **no hay que instalar ni compilar nada**: el
instalador acepta esas rutas en su allow-list y las extrae con el resto. Sin la
bandera `usb` el módulo ni se carga; si faltara, el agente arranca igual,
`/diagnostico` informa el motivo y todo sigue por CUPS/LAN.

Para desarrollo en el repo también sirve `npm install usb` dentro de
`print-agent/`: `usb.mjs` resuelve el módulo instalado igual que el vendorizado.

**Pendiente**: la prueba física con la ZKP8008 (conectar por USB, encender
`"usb": true` y verificar el ticket y `/health.usb` en la Mac). El paso a paso,
qué mirar ante cada error y qué registrar está en
`docs/IMPRESION-PRUEBA-FISICA.md` (§3). También aplica la tabla de resolución
del transporte de acá abajo y `docs/IMPRESION.md`.

## Resolución del transporte

1. **USB directo** — solo para la impresora configurada del agente (`config.impresora`).
   Un trabajo dirigido a otra impresora explícita respeta su transporte.
2. **CUPS** — la cola del destino (`usb:`/`cups:`) o la cola de respaldo
   (`lanCups`, por defecto `MobOS_LAN`).
3. **LAN directa** — socket TCP crudo al `lan:host:puerto`.

Sin la bandera `usb` el camino es el histórico: LAN directa → respaldo CUPS.

`GET /health` reporta:

```json
"usb": { "activo": true, "disponible": true, "vid": "0x0483", "pid": "0x5743", "transporte": "usb" }
```

y `red.ultimoTransporte` conserva el transporte real del último job
(`usb` | `cups` | `directo`). `GET /diagnostico` agrega `usb.motivo` cuando el
camino no está disponible.

## Cómo obtener el VID/PID de la ZKP8008

```sh
# macOS
system_profiler SPUSBDataType | grep -A 6 -i zkp

# o con node-usb instalado, en la carpeta del agente
node -e "import('usb').then(u => console.log(u.getDeviceList().map(d => ({ vid: '0x' + d.deviceDescriptor.idVendor.toString(16), pid: '0x' + d.deviceDescriptor.idProduct.toString(16) }))))"
```

Con los valores a mano, guardarlos en `~/.mobos-print/config.json` y reiniciar el
agente (launchd lo relanza solo). El refresco de disponibilidad corre cada 90 s y
en cada `/health`, así que conectar la impresora no exige reiniciar.

## Estado real de la verificación

- ✅ Implementado: detección por VID/PID, escritura ESC/POS al endpoint de
  salida (API clásica y WebUSB de `node-usb`), bandera `usb: true`/`--usb`,
  fallback automático USB → CUPS → LAN e información en `/health` y `/diagnostico`.
- ✅ Probado **sin hardware** (`print-agent/test/usb.test.mjs`): selección por
  VID/PID, rechazo de dispositivos que no son impresora, escritura de bytes
  contra un endpoint simulado y la cadena de transporte usb → cups → lan.
- ⏳ Pendiente de probar con la **ZKP8008 física**: la escritura real depende del
  firmware y de los permisos del sistema operativo (en Linux, regla udev; en
  macOS puede pedir permiso de dispositivo USB). No había hardware disponible al
  implementar; estos son los pasos de aceptación.

### Prueba con la ZKP8008 (hardware)

1. Conectar la impresora por USB y anotar VID/PID (ver arriba).
2. `cd "$HOME/Library/Application Support/MobOS Print" && npm install usb`
   (en el repo: `cd print-agent && npm install usb`).
3. Poner `"usb": true` (con `usbVid`/`usbPid`) en `~/.mobos-print/config.json` y
   reiniciar el agente.
4. `curl -s http://127.0.0.1:17890/health | grep -A 6 '"usb"'`: debe decir
   `"disponible": true` con el VID/PID de la impresora.
5. Imprimir una prueba desde la app (Configuración → Impresoras). El job debe
   reportar `transporte: "usb"` y salir por el puerto USB.
6. Desenchufar la impresora y reimprimir: el job debe salir por CUPS/LAN
   (`"disponible": false` en `/health`) sin colgarse.

## Rollback

Poner `"usb": false`, quitar `--usb` o borrar `MOBOS_PRINT_USB` y reiniciar el
agente: vuelve al comportamiento CUPS/LAN de siempre. Desinstalar `node-usb` es
opcional (sin la bandera ni se importa).
