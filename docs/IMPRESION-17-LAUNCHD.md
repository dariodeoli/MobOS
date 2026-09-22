# #17 · launchd + IP secundaria + cola CUPS — diagnóstico y pasos exactos

Guía de aplicación directa para cerrar **#17** en la Mac del puente. Está escrita
para que la aplique quien tiene la Mac (Dario), **sin que nadie entre a ella**:
todos los comandos son de lectura y los cambios son pasos explícitos con su
resultado esperado. El checklist completo de la prueba física vive en
`docs/IMPRESION-PRUEBA-FISICA.md`; las reglas del módulo, en `docs/IMPRESION.md`.

> Estado del código (`origin/main`, agente **1.7.2**): el caso ya está cubierto
> por el bind al alias, el respaldo CUPS, el autotest desde el propio proceso de
> launchd y el diagnóstico por `errno`. Lo único que falta es la verificación
> física: el ticket por el papel.

## 1. Diagnóstico (por qué pasa)

La red está bien: `ifconfig en0` muestra la secundaria `192.168.1.100`, `ping` y
`nc -vz 192.168.1.23 9100` responden y desde Terminal se envía ESC/POS. Aun así,
el agente lanzado por **launchd** da `EHOSTUNREACH` y la cola CUPS `MOBOS_LAN`
no existía. Las tres causas, en orden de probabilidad:

1. **Permiso de Red local de macOS.** El proceso `node` que inicia launchd queda
   sin la excepción de Red local: el mismo código con `localAddress` al alias
   sale desde Terminal, pero desde launchd macOS devuelve `EHOSTUNREACH`
   (la ruta existe, el permiso no). Se concede una sola vez en Ajustes.
2. **La IP secundaria no persiste.** `192.168.1.100` se pierde al reiniciar o
   cambiar de red. Sin alias, el bind da `EADDRNOTAVAIL` o no hay ruta a
   `192.168.1.x`. El instalador deja un permiso (`/etc/sudoers.d/mobos-print`)
   que la recrea al iniciar la Mac; si no está, se corre `red-mac.sh agregar`.
3. **No hay cola CUPS de respaldo.** `lpadmin` necesita administrador (el agente
   corre como usuario). La cola `socket://` la usa el daemon CUPS —que sí tiene
   permiso de Red local— así que imprime aunque el TCP directo esté bloqueado.
   Se crea una vez (comando exacto o alta manual por IP, §3.4).

## 2. Diagnóstico en un solo paso (copiar y pegar)

No cambia nada: sólo lee y guarda `~/mobos-17.txt` para pegar en el issue.

```bash
CONFIG="$HOME/.mobos-print/config.json"
TOKEN=""; [ -f "$CONFIG" ] && TOKEN=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).token||'')" "$CONFIG" 2>/dev/null)
salud() { curl -s --max-time 3 http://127.0.0.1:17890/health -H "x-mobos-print-token: $TOKEN"; }
{
  echo "## #17 · diagnóstico $(date)"
  echo; echo "### agente"
  salud | python3 -c 'import json,sys; d=json.load(sys.stdin); print("version:", d.get("version"), "· impresora:", d.get("impresora"), "· ancho:", d.get("ancho"))' 2>/dev/null || echo "  (el agente no responde en 127.0.0.1:17890)"
  echo; echo "### launchd"
  PID=$(launchctl list 2>/dev/null | awk '/com.mobos.print/{print $1}')
  echo "  pid: ${PID:-(no aparece com.mobos.print)}"
  [ -n "$PID" ] && ps -o command= -p "$PID" 2>/dev/null || echo "  (sin proceso del agente)"
  echo; echo "### red de la Mac"
  ifconfig en0 2>/dev/null | grep -F 'inet 192.168.1.100' || echo "  (alias 192.168.1.100 ausente)"
  route -n get 192.168.1.23 2>&1 | grep -E 'gateway|interface' || true
  echo -n "  nc con bind (Terminal): "; nc -vz -s 192.168.1.100 192.168.1.23 9100 2>&1 | tail -1
  echo; echo "### /health · red"
  salud | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k: d.get("red",{}).get(k) for k in ("tcp","cups","cupsUri","colaTipo","transporte","ultimoTransporte","autotest","alias")}, indent=2, ensure_ascii=False))' 2>/dev/null || echo "  (sin /health)"
  echo; echo "### /diagnostico"
  curl -s --max-time 5 "http://127.0.0.1:17890/diagnostico" -H "x-mobos-print-token: $TOKEN" | python3 -m json.tool 2>/dev/null || echo "  (sin /diagnostico)"
  echo; echo "### cola CUPS"
  lpstat -v 2>/dev/null | grep -i -E 'mobos|192\.168\.1\.23' || echo "  (sin cola CUPS para la impresora)"
} | tee "$HOME/mobos-17.txt"
```

Qué mirar primero:

- `red.autotest.ok=true` con `origen=192.168.1.100` → el proceso de launchd
  alcanza la impresora: listo para la prueba de papel.
- `red.autotest.errno=EHOSTUNREACH` con `alias.presente=true` → permiso de Red
  local (§3.2).
- `red.autotest.errno=EADDRNOTAVAIL` → falta la IP secundaria (§3.3).
- `red.tcp=false` con `red.cups` no vacío → hoy imprime por el respaldo CUPS
  (§3.4 y §4).

## 3. Pasos exactos (en orden)

### 3.1 Actualizar el agente al artefacto publicado

```bash
curl -fsSL https://api.moboss.online/print-agent/install.sh | bash
# Con el repo clonado en la Mac, alternativa:
#   git pull && bash print-agent/install-macos.sh
```

Esperado: termina con «Agente corriendo en http://127.0.0.1:17890» y el
`version` de `/health` coincide con `backend/public/print-agent/manifest.json`
(hoy **1.7.2**).

### 3.2 Conceder Red local a node (una sola vez)

1. Abrir **Ajustes del Sistema → Privacidad y seguridad → Red local**.
   El instalador abre el panel exacto al terminar.
2. Activar el interruptor de **node** (si hay varias entradas, la del binario que
   muestra el diagnóstico en «proceso»). Si `node` no aparece todavía: correr la
   prueba de §3.5 una vez, volver al panel y activarlo.
3. Reiniciar el servicio para que launchd tome el permiso:

```bash
launchctl unload ~/Library/LaunchAgents/com.mobos.print.plist
launchctl load   ~/Library/LaunchAgents/com.mobos.print.plist
```

Esperado en `/health`: `red.autotest.ok=true`, `red.autotest.origen="192.168.1.100"`
y `red.tcp=true`.

### 3.3 Asegurar la IP secundaria

```bash
ifconfig en0 | grep -F 'inet 192.168.1.100' || bash print-agent/red-mac.sh agregar
```

- Con el instalador nuevo, el permiso sudoers la recrea en cada arranque
  (`bash print-agent/red-mac.sh auto`, sin contraseña). Verificar con
  `sudo -n true`: si no da error, el permiso está.
- Es normal que se pierda al cambiar de red; en ese caso, «Reparar conexión» en
  Configuración → Impresoras hace lo mismo.

### 3.4 Crear la cola CUPS de respaldo (una sola vez)

Opción A — comando (pide contraseña):

```bash
sudo lpadmin -p MobOS_LAN -E -v socket://192.168.1.23:9100 -m raw
lpstat -v MobOS_LAN
```

Opción B — si `lpadmin -m raw` da error en esta Mac (es el caso reportado):
**Ajustes → Impresoras y escáneres → Agregar impresora → pestaña IP**:
Dirección `192.168.1.23`, Protocolo **HP Jetdirect – Socket**, Nombre
`MobOS_LAN`, Usar **Generic PostScript Printer** (el agente envía el ticket con
`lp -o raw`, así que el driver no filtra los bytes).

Verificación: `lpstat -v | grep -i mobos` tiene que mostrar
`socket://192.168.1.23:9100`. Esperado en `/health`: `red.cups="MobOS_LAN"`,
`red.cupsUri="socket://192.168.1.23:9100"`, `red.colaTipo="red"`.

> El nombre es libre: el agente usa `MobOS_LAN` si existe y, si no, cualquier
> cola `socket://` que apunte a esa impresora.

### 3.5 Imprimir la prueba DESDE launchd (no desde Terminal)

1. Configuración → Impresoras → **Reparar conexión** (crea el alias si falta,
  reintenta el autotest y detecta la cola CUPS).
2. **Imprimir prueba**.
3. Confirmar en `/health` el `red.transporte` real (`directo` si el permiso de
  Red local quedó bien; `cups` si salió por el respaldo) y `red.ultimoTransporte`.
4. En Configuración → Estado del sistema → Actividad:
   - `aceptado` → confirmar «Ya salió el papel» con el número del ticket.
   - `pendiente` → esperar el reintento (el agente reintenta solo).
   - `incierto` → revisar la impresora antes de reimprimir.
   - `fallido` → ver la tabla de `docs/IMPRESION-PRUEBA-FISICA.md` §4.

### 3.6 Verificar el papel

- Sale el ticket de prueba completo (**4 secciones**) y el rollo se **corta**
  (GS V 0).
- Si no corta o sale incompleto: probar las 4 variantes de la prueba de corte
  (Configuración → Impresoras) y anotar en #17 qué sección falta antes de tocar
  código.

## 4. Cómo leer el resultado

| En `/health` / `/diagnostico` | Significa | Qué hacer |
| --- | --- | --- |
| `red.autotest.errno=EHOSTUNREACH` y `red.alias.presente=true` | macOS bloquea al proceso de launchd | §3.2 (Red local) |
| `red.autotest.errno=EADDRNOTAVAIL` | La IP secundaria no está | §3.3 |
| `red.autotest.errno=ECONNREFUSED` | Impresora apagada o IP cambiada | Encenderla y «Actualizar estado» |
| `red.tcp=false` y `red.cups="MobOS_LAN"` | Sale por el respaldo CUPS | Verificar el papel; opcional §3.2 para el directo |
| `red.tcp=true` y `red.transporte="directo"` | LAN directa OK | Prueba de corte y listo |
| `red.cups=""` | Sin cola de respaldo | §3.4 |

## 5. Cierre de #17 — qué pegar en el issue

- El archivo completo **`~/mobos-17.txt`** (§2).
- `version` del agente, `red.transporte`, `red.ultimoTransporte`.
- Resultado físico: ¿salió el ticket completo? ¿el rollo se cortó?

Criterio: la prueba figura exitosa **solo con entrega real por LAN/CUPS y el
ticket verificado en papel**. Si algo falla, pegar la salida y el `errno` exacto;
con eso se ajusta el código sin adivinar.
