# Prueba física de impresión — checklist de la Mac del local

Guía operativa para cerrar **#17** (agente por `launchd`, IP secundaria y cola
CUPS) y **#96** (USB directo con la ZKP8008). Cada paso dice qué correr, qué
tiene que devolver y **qué mirar si falla**. Las reglas del módulo viven en
`docs/IMPRESION.md`; esto es la prueba en el papel.

> Para #17 hay una guía de aplicación dedicada, con el diagnóstico y los pasos
> exactos listos para aplicar (incluido el bloque que junta todo para pegar en
> el issue): **`docs/IMPRESION-17-LAUNCHD.md`**.

## Orden de la prueba (seguir de arriba a abajo)

1. **§0** — pegar el bloque: guarda `~/mobos-prueba-fisica.txt` con todo el estado.
2. **§1** — #17: agente actualizado, permiso de Red local, IP secundaria y prueba
   **desde launchd**.
3. **§2** — #17: cola CUPS de respaldo (si `-m raw` falla, alta manual por IP).
4. **§3** — #96: bandera `usb`, módulo, dispositivo y prueba de corte por USB.
5. **§5** — pegar el archivo + la plantilla del issue que corresponda.

Todo lo que se toca es reversible (`print-agent/uninstall-macos.sh`).

> Registrar el resultado en el issue correspondiente con: **versión del agente**,
> `transporte` real, `errno` si hubo error y si el ticket salió por el papel.

## 0. Preparación (2 minutos)

En la Mac del puente (donde está instalado el agente). **Un solo bloque** junta
todo lo que hay que reportar de #17 y #96 sin cambiar nada (sólo lee y guarda
`~/mobos-prueba-fisica.txt`):

```bash
CONFIG="$HOME/.mobos-print/config.json"
TOKEN=""; [ -f "$CONFIG" ] && TOKEN=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).token||'')" "$CONFIG" 2>/dev/null)
salud() { curl -s --max-time 3 http://127.0.0.1:17890/health -H "x-mobos-print-token: $TOKEN"; }
{
  echo "## Prueba física de impresión · $(date)"
  echo; echo "### agente"
  salud | python3 -c 'import json,sys; d=json.load(sys.stdin); print("version:", d.get("version"), "· impresora:", d.get("impresora"), "· ancho:", d.get("ancho"), "· copias:", d.get("copias"))' 2>/dev/null || echo "  (el agente no responde en 127.0.0.1:17890)"
  echo; echo "### launchd"
  PID=$(launchctl list 2>/dev/null | awk '/com.mobos.print/{print $1}')
  echo "  pid: ${PID:-(no aparece com.mobos.print)}"
  [ -n "$PID" ] && ps -o command= -p "$PID" 2>/dev/null || echo "  (sin proceso del agente)"
  echo; echo "### red"
  ifconfig en0 2>/dev/null | grep -F 'inet 192.168.1.100' || echo "  (alias 192.168.1.100 ausente)"
  route -n get 192.168.1.23 2>&1 | grep -E 'gateway|interface' || true
  echo -n "  nc con bind (Terminal): "; nc -vz -s 192.168.1.100 192.168.1.23 9100 2>&1 | tail -1
  echo; echo "### /health · red"
  salud | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k: d.get("red",{}).get(k) for k in ("tcp","cups","cupsUri","colaTipo","transporte","ultimoTransporte","autotest","alias")}, indent=2, ensure_ascii=False))' 2>/dev/null || echo "  (sin /health)"
  echo; echo "### /health · usb"
  salud | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get("usb",{}), indent=2, ensure_ascii=False))' 2>/dev/null || echo "  (sin /health)"
  echo; echo "### /diagnostico"
  curl -s --max-time 5 "http://127.0.0.1:17890/diagnostico" -H "x-mobos-print-token: $TOKEN" | python3 -m json.tool 2>/dev/null || echo "  (sin /diagnostico)"
  echo; echo "### colas CUPS"
  lpstat -v 2>/dev/null | grep -i -E 'mobos|zkp|192\.168\.1\.23' || echo "  (sin cola CUPS para la impresora)"
  echo; echo "### config (sin secretos)"
  [ -f "$CONFIG" ] && python3 -c 'import json,sys; c=json.load(open(sys.argv[1])); print(json.dumps({k: c.get(k) for k in ("impresora","lan","ancho","copias","usb","usbVid","usbPid","alias","puerto")}, indent=2, ensure_ascii=False))' "$CONFIG" || echo "  (sin config)"
  echo; echo "### módulo USB del agente"
  ls "$HOME/Library/Application Support/MobOS Print/node_modules/usb/prebuilds/" 2>/dev/null || echo "  (sin prebuild de node-usb)"
  echo; echo "### dispositivos USB vistos por macOS"
  system_profiler SPUSBDataType 2>/dev/null | grep -E -i -B 1 -A 4 'zkp|printer|impresora|0483|5743' | head -30 || echo "  (sin coincidencias)"
} | tee "$HOME/mobos-prueba-fisica.txt"
```

- Si `curl` no responde: el agente no está corriendo (paso 1.2).
- La **versión** tiene que ser la publicada en `backend/public/print-agent/manifest.json`
  (el instalador la muestra al final y la app la enseña en Configuración → Impresoras).
- El archivo `~/mobos-prueba-fisica.txt` es lo que se pega en el issue al terminar
  (§5): no incluye tokens ni contraseñas.

## 1. launchd + IP secundaria (#17)

1. **IP secundaria presente** (la impresora vive en `192.168.1.x`):
   ```bash
   ifconfig en0 | grep -F 'inet 192.168.1.100'
   ```
   Si no aparece: `bash print-agent/red-mac.sh agregar` (o «Reparar conexión» en
   Configuración → Impresoras). La app la recrea al arrancar, pero se pierde al
   reiniciar la Mac o cambiar de red.
2. **El agente corre por launchd, no por Terminal** (es la única prueba que
   refleja lo que ve el agente automático). El pid sale de `launchctl`, así no se
   confunde con otros proyectos:
   ```bash
   PID=$(launchctl list | awk '/com.mobos.print/{print $1}'); echo "pid: $PID"; ps -o command= -p "$PID"
   ```
   Reiniciar el servicio después de cualquier cambio de configuración:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.mobos.print.plist
   launchctl load   ~/Library/LaunchAgents/com.mobos.print.plist
   ```
3. **Permiso de Red local** (macOS 15+): Ajustes del Sistema → Privacidad y
   seguridad → **Red local** → activar **node** (el binario que muestra el paso
   2). El instalador abre el panel exacto al terminar. Sin esto, `launchd` da
   `EHOSTUNREACH` aunque desde Terminal funcione.
4. **Verificar en `/health`**: `red.alias.presente=true`, `red.tcp=true`,
   `red.transporte` (`directo`/`cups`/`usb`) y, después de imprimir,
   `red.ultimoTransporte`.
5. **Prueba de corte** desde Configuración → Impresoras → «Imprimir prueba».
   Tiene que salir el ticket completo (**4 secciones**) y el rollo tiene que
   **cortarse** (GS V 0). Si no corta, probar las 4 variantes de la prueba de
   corte antes de tocar código.

## 2. Cola CUPS `MobOS_LAN`

1. ¿Existe la cola?
   ```bash
   lpstat -v | grep -i -E 'mobos|192\.168\.1\.23'
   ```
   Si no existe (el instalador avisa «Sin permiso para crear la cola CUPS»):
   ```bash
   sudo lpadmin -p MobOS_LAN -E -v socket://192.168.1.23:9100 -m raw
   ```
   Si `lpadmin -m raw` da error en esta Mac (es el caso reportado), crear la cola
   a mano: **Ajustes → Impresoras y escáneres → Agregar impresora → IP** →
   Dirección `192.168.1.23`, Protocolo **HP Jetdirect – Socket**, Nombre
   `MobOS_LAN`, Usar **Generic PostScript Printer** (el agente manda el ticket
   con `lp -o raw`, así que el driver no filtra los bytes). El nombre es libre:
   el agente usa `MobOS_LAN` si existe y, si no, cualquier cola `socket://` que
   apunte a esa impresora.
2. **Verificar en `/health`**: `red.cups="MobOS_LAN"`,
   `red.cupsUri="socket://192.168.1.23:9100"` y `red.colaTipo="red"`.
3. **Probar el respaldo**: con la impresora accesible solo por CUPS (por ejemplo,
   bloqueando el TCP directo del proceso), imprimir una prueba y confirmar
   `red.transporte="cups"`.

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

## 5. Cómo reportar (plantilla lista para pegar)

Al terminar, pegar `~/mobos-prueba-fisica.txt` junto con la plantilla del issue
que corresponda. No hace falta explicar nada más si están completos los campos;
si algo falló, el `errno`/`motivo` exacto es lo que permite ajustar el código
sin adivinar.

**En #17 (launchd + IP secundaria + cola CUPS):**

```
### Reporte de prueba física · #17
- Versión del agente:
- launchd: pid y comando (del bloque §0)
- IP secundaria 192.168.1.100 presente: sí/no
- `nc -vz -s 192.168.1.100 192.168.1.23 9100`: resultado
- /health.red: tcp=… · cups=… · colaTipo=… · transporte=… · ultimoTransporte=… · autotest.ok=… (errno=…, origen=…)
- Cola CUPS (`lpstat -v`): …
- Prueba desde launchd: ¿salió el ticket? ¿completo (4 secciones)? ¿cortó el rollo?
- Adjunto: ~/mobos-prueba-fisica.txt
```

**En #96 (USB directo con la ZKP8008):**

```
### Reporte de prueba física · #96
- Bandera usb en config: true/false · usbVid/usbPid: …
- /health.usb: activo=… · disponible=… · motivo=… · transporte=…
- /diagnostico.usb: motivo (texto exacto)
- macOS ve el dispositivo USB: sí/no (§0 «dispositivos USB»)
- Prueba por USB: ¿salió el ticket? ¿cortó el rollo? ¿transporte=usb?
- Si no salió: motivo exacto + errno
- Adjunto: ~/mobos-prueba-fisica.txt
```

Criterio de cierre en ambos: **la prueba figura exitosa solo con entrega real y
el ticket verificado en papel**. «Aceptado» en la cola no alcanza: hay que
confirmar el papel (número secreto de Actividad) o el corte del rollo.

### Qué NO hacer durante la prueba

- **No cambiar IPs** (la ruta LAN con `192.168.1.100` está validada).
- No insistir con CUPS *raw* si `lpadmin -m raw` falla: usar el alta por
  Ajustes → Impresoras → IP (§2).
- No editar el `sudoers` ni los plists a mano; el instalador y `red-mac.sh` ya
  dejan todo reversible (`uninstall-macos.sh`).
- No pegar tokens ni la contraseña en el issue: el bloque §0 los omite.
