# Prueba física de impresión — checklist de la Mac del local

Guía operativa para cerrar **#17** (agente por `launchd`, IP secundaria y cola
CUPS) y **#96** (USB directo con la ZKP8008). Cada paso dice qué correr, qué
tiene que devolver y **qué mirar si falla**. Las reglas del módulo viven en
`docs/IMPRESION.md`; esto es la prueba en el papel.

> Para #17 hay una guía de aplicación dedicada, con el diagnóstico y los pasos
> exactos listos para aplicar (incluido el bloque que junta todo para pegar en
> el issue): **`docs/IMPRESION-17-LAUNCHD.md`**.

> Registrar el resultado en el issue correspondiente con: **versión del agente**,
> `transporte` real, `errno` si hubo error y si el ticket salió por el papel.

## 0. Preparación (2 minutos)

En la Mac del puente (donde está instalado el agente):

```bash
TOKEN=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.env.HOME+'/.mobos-print/config.json','utf8')).token)")
salud() { curl -s http://127.0.0.1:17890/health -H "x-mobos-print-token: $TOKEN" | python3 -m json.tool; }
salud | head -40
```

- Si `curl` no responde: el agente no está corriendo (paso 1.2).
- La **versión** tiene que ser la publicada en `backend/public/print-agent/manifest.json`
  (el instalador la muestra al final y la app la enseña en Configuración → Impresoras).

## 1. launchd + IP secundaria (#17)

1. **IP secundaria presente** (la impresora vive en `192.168.1.x`):
   ```bash
   ifconfig en0 | grep -F 'inet 192.168.1.100'
   ```
   Si no aparece: `bash print-agent/red-mac.sh agregar` (o «Reparar conexión» en
   Configuración → Impresoras). La app la recrea al arrancar, pero se pierde al
   reiniciar la Mac o cambiar de red.
2. **El agente corre por launchd, no por Terminal** (es la única prueba que
   refleja lo que ve el agente automático):
   ```bash
   launchctl list | grep com.mobos.print
   ps -o command= -p "$(pgrep -f 'server.mjs' | head -1)"
   ```
   Reiniciar el servicio después de cualquier cambio de configuración:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.mobos.print.plist
   launchctl load   ~/Library/LaunchAgents/com.mobos.print.plist
   ```
3. **Permiso de Red local** (macOS 15+): Ajustes del Sistema → Privacidad y
   seguridad → **Red local** → activar el binario de Node/agente. Sin esto,
   `launchd` da `EHOSTUNREACH` aunque desde Terminal funcione.
4. **Verificar en `/health`**: `red.alias.presente=true`, `red.tcp=true`,
   `red.transporte` (`directo`/`cups`/`usb`) y, después de imprimir,
   `red.ultimoTransporte`.
5. **Prueba de corte** desde Configuración → Impresoras → «Imprimir prueba».
   Tiene que salir el ticket completo (**4 secciones**) y el rollo tiene que
   **cortarse** (GS V 0). Si no corta, probar las 4 variantes de la prueba de
   corte antes de tocar código.

## 2. Cola CUPS `MOBOS_LAN`

1. ¿Existe la cola?
   ```bash
   lpstat -v | grep MOBOS_LAN
   ```
   Si no existe (el instalador avisa «Sin permiso para crear la cola CUPS»):
   ```bash
   sudo lpadmin -p MOBOS_LAN -E -v socket://192.168.1.23:9100 -m raw
   ```
   El `-m raw` es **obligatorio**: la app manda ESC/POS ya armado.
2. **Verificar en `/health`**: `red.cups=true` y
   `red.cupsUri=socket://192.168.1.23:9100`.
3. **Probar el respaldo**: con la impresora accesible solo por CUPS (por ejemplo,
   bloqueando el TCP directo del proceso), imprimir una prueba y confirmar
   `red.transporte=cups`.

## 3. USB directo con la ZKP8008 (#96)

1. **El módulo nativo viaja en el paquete**: no hay que instalar nada. Verificar
   que esté al lado del agente:
   ```bash
   ls "$HOME/Library/Application Support/MobOS Print/node_modules/usb/prebuilds/darwin-x64+arm64/node.napi.node"
   ```
2. **Encender la bandera** en `~/.mobos-print/config.json`:
   ```json
   { "usb": true, "usbVid": "0x0483", "usbPid": "0x5743" }
   ```
   (`usbVid`/`usbPid` son opcionales: sin ellos se elige el primer dispositivo
   con interfaz de clase *printer*.) También sirve `--usb` al arrancar o
   `MOBOS_PRINT_USB=1`. Reiniciar el agente por launchd (paso 1.2).
3. **Verificar en `/health`**:
   `usb.activo=true`, `usb.disponible=true`, `usb.vid`, `usb.pid`,
   `usb.transporte=usb`. Si `disponible=false`, `/diagnostico` dice el motivo.
4. **Imprimir la prueba de corte** con la impresora conectada por USB y
   verificar el ticket en papel. Si sale por CUPS/LAN en vez de USB, revisar
   `transporte` en el resultado de la impresión.

### Si el USB no está disponible

| Motivo en `/diagnostico` | Qué significa | Qué hacer |
| --- | --- | --- |
| `USB apagado` | La bandera `usb` está en false | Poner `"usb": true` y reiniciar el agente |
| `No se detectó una impresora USB (interfaz de clase printer)` | El sistema no ve la impresora por USB | Revisar cable/puerto; encender la impresora; probar otro cable |
| `No hay una impresora USB conectada con ese VID/PID` | El VID/PID configurado no coincide | Corregir `usbVid`/`usbPid` o quitarlos para autodetectar |
| `node-usb no está instalado` | Falta el módulo en la carpeta del agente | Reinstalar con el instalador publicado (el tarball lo incluye) |
| Otro error del módulo | Permisos de USB o firmware | Reconectar, reiniciar el agente y registrar el texto exacto en #96 |

## 4. Qué mirar ante cada error (tabla rápida)

| Síntoma | Dónde mirar | Acción |
| --- | --- | --- |
| «Sin verificar» en Impresoras | `/health` → `impresoraOk` y `red.*` | Ver pasos 1 y 2; suele ser Red local o la cola CUPS |
| `EHOSTUNREACH` desde launchd (y OK desde Terminal) | `/health` → `red.alias.presente`, `errno` en `/diagnostico` | Falta permiso de Red local (paso 1.3) o la IP secundaria (1.1) |
| `ECONNREFUSED` | `/health` → `red.tcp` | La impresora está apagada o cambió de IP; Configuración → Impresoras muestra el estado vivo |
| El ticket sale cortado o incompleto | Prueba de corte (#17) | Anotar qué sección falta; revisar alimentación y `corte()` |
| El QR no se lee | `docs/IMPRESION.md` §1 | El QA va con corrección H y módulo 7; reimprimir y escanear con el teléfono |
| Salen dos tickets | Configuración → Impresoras → Actividad | Confirmar el papel y no reabrir el diálogo con cola pendiente |
| Un trabajo quedó «pendiente» y no sale | Configuración → Estado del sistema → Cola | Cancelarlo si fue un click repetido; si el puente no reconecta, revisar `launchctl` |
| La prueba «no salió» pero el agente dice OK | Papel y `/health.transporte` | «Aceptado» no es «confirmado»: confirmar el número secreto en Actividad |
| Error al vincular el puente | Configuración → Impresoras → Gestionar puentes | Regenerar el código; el token viejo deja de autenticar |

## 5. Registro del resultado

- **#17**: pegar la salida de `/health` (`red.*`), el transporte real y el
  resultado de la prueba de corte (¿cortó el rollo?).
- **#96**: pegar `usb` de `/health` + `/diagnostico` y el resultado del ticket
  por USB (o el motivo exacto del fallo y el `errno`).
