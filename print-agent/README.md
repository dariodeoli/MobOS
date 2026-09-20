# MobOS Print — agente local de impresión térmica

Servicio chico que corre en la computadora del local (donde está la impresora) y
recibe de la app los bytes **ESC/POS** ya armados para imprimirlos **sin diálogo
del navegador**, por **LAN** o por **USB**.

```
app.moboss.online (https)  →  http://127.0.0.1:17890  →  impresora 58/80 mm
```

La app arma el ticket (una sola fuente de verdad del diseño) y el agente solo lo
transporta. Si la impresora está apagada o sin red, el trabajo queda en una
**cola persistente** y se reintenta solo.

## Instalación (macOS)

```bash
brew install node            # Node 20 o superior, una sola vez
curl -fsSL https://api.moboss.online/print-agent/install.sh | bash -s -- --code ABCDE-FGHIJ
```

El código sale de la app: **Configuración → Impresoras → Gestionar puentes →
Código**. Vence en 15 minutos, se usa una sola vez y no se vuelve a mostrar. El
instalador descarga el tarball versionado del backend, verifica su **SHA-256
antes de extraer**, deja el agente en `~/Library/Application Support/MobOS Print`
y carga el servicio `com.mobos.print` (arranca al iniciar sesión). No hace falta
clonar el repo.

Sin código (para vincular después):

```bash
curl -fsSL https://api.moboss.online/print-agent/install.sh | bash
```

Para desarrollo desde el clon: `bash print-agent/install.sh --from-repo`
(equivale al instalador clásico `install-macos.sh`).

## Modo remoto (puente por el backend)

Con un código de vinculación, el agente queda **pareado** y pasa a reclamar
trabajos del backend (no hace falta configurar nada en el navegador):

1. En la app: **Configuración → Impresoras → Gestionar puentes** → «Agregar
   puente» y copiá el código.
2. En la Mac del local: el one-liner de arriba con `--code ABCDE-FGHIJ`.
3. En la app: elegí ese puente en la impresora y tocá **Imprimir prueba**. La
   fila pasa a `aceptado` cuando el puente la imprime; confirmá el número
   secreto del papel en **Actividad**.

- El agente abre una conexión saliente cada 2 s (`claim`), imprime por los
  transportes de siempre y reporta `ACEPTADO`/`INCIERTO`/`FALLIDO`. Si el
  backend se cae, hace backoff 2→4→8→16→30 s y guarda los resultados en un
  outbox local hasta poder reportarlos.
- La app es la autoridad de la configuración: impresoras, ancho, copias y
  allow-list LAN llegan por `GET /api/print/bridge/config`. En la Mac puente el
  camino local `127.0.0.1` sigue ganando; los demás dispositivos encolan remoto.
- **Rollback:** para volver al modo 1.5.0 (solo local) poné `"apiUrl": ""` en
  `~/.mobos-print/config.json` y reiniciá el servicio; o revocá el puente en la
  app y el token deja de autenticar. La impresión local nunca depende del
  backend.

### Seguridad y privacidad del modo remoto

- El **token del puente** (256 bits aleatorios) solo sirve para
  `heartbeat`/`claim`/`result`/`config` de su propia empresa: no puede leer
  trabajos ajenos, ni rutas del servidor, ni archivos de la Mac. Viaja por HTTPS
  y se puede revocar; en reposo solo se guarda su hash SHA-256.
- **No se loguea** el token, ni el código de vinculación, ni el sufijo de
  confirmación, ni los bytes ESC/POS. El error que reporta el puente se trunca a
  200 caracteres.
- **Retención:** el payload se borra al reportar el resultado terminal, el hash
  del sufijo se borra al confirmar en papel y los metadatos se purgan a los 180
  días (lote acotado ≤ 200, oportunista en el `claim`).
- El instalador no ejecuta nada del paquete antes de que el checksum coincida:
  el nombre del artefacto es fijo, la allow-list del tarball no admite rutas
  absolutas ni `..`, y el código de vinculación se valida antes de descargar.

## Configurar la impresora

En la app, Configuración → Impresoras:

1. Verificá que el puente aparezca **en línea** (con su versión) en «Gestionar puentes…»; en modo local, que el agente diga **“Conectado”**.
2. Elegí la impresora:
   - **LAN**: `lan:192.168.1.23:9100` (la IP de la impresora y el puerto 9100).
   - **USB**: `usb:<nombre de la cola>`; las colas se listan solas si están
     dadas de alta en macOS (Ajustes → Impresoras y escáneres). El agente les
     manda los mismos bytes crudos con `lp -o raw`.
3. Elegí el ancho (el instalador deja **58 mm**, el rollo del local; en modo local, con `MOBOS_PRINT_ANCHO=80 bash install-macos.sh` queda en 80) y las copias. Los tickets salen con padding a los costados y **corte automático** al final.
4. **Imprimir prueba**: sale texto, acentos, negrita, doble alto, QR y código de
   barras. Si todo eso sale bien, la impresora quedó lista.

## Red

La impresora del local está configurada en `192.168.1.23:9100` (máscara 255.255.255.0, gateway 192.168.1.1, DHCP desactivado, ESC/POS, cortador habilitado) y el instalador la deja cargada como destino.

Ojo con la red: la impresora está en `192.168.1.23` y el instalador agrega la IP secundaria `192.168.1.100` para alcanzarla. Si el diagnóstico muestra `red_cambiada`, falta esa IP o cambió la red; si muestra `permiso_o_red`, el alias está presente y el fallo es del **permiso de Red Local** de macOS (Ajustes → Privacidad y seguridad → Red local → habilitá `node`) o de la impresora sin responder. El agente bindea el alias y, si el proceso de launchd sigue bloqueado, cae solo al respaldo CUPS (`socket://…`).

**Solución recomendada (definitiva):** que la impresora viva en la red del router. Dos caminos:
- En el panel de la impresora (o en `http://192.168.1.23`), activar **DHCP** para que el router le dé una IP `192.168.100.x` (y reservarla en el router para que no cambie).
- O darle una IP fija dentro de `192.168.100.x`, con la máscara `255.255.255.0` y el gateway del router (`192.168.100.1` o el que use).

Después se actualiza el destino en Configuración → Impresoras con la IP nueva.

**Parche temporal (solo si la Mac y la impresora están en el mismo switch/WiFi):** agregar a la Mac una IP secundaria en la red de la impresora, sin tocar el router:

```bash
sudo ifconfig en0 alias 192.168.1.100 netmask 255.255.255.0   # en0 = Wi-Fi o Ethernet
nc -z -G 2 192.168.1.23 9100 && echo "la impresora responde"
```

Es temporal: se pierde al reiniciar o cambiar de red. Si el router y la impresora no comparten el mismo cableado/WiFi, este parche no sirve y hay que ir por la solución recomendada. Lo más
cómodo es dejar la impresora con **IP fija** (o reserva DHCP) porque el agente la
usa por IP; si cambia, hay que actualizar el destino en Configuración.

**Desde el celular o cualquier PC** no hace falta tocar la red: con el **modo remoto** la app encola el comprobante, la etiqueta o la recepción en el backend y la Mac puente los imprime (ver «Puente de impresión»).

Prueba rápida desde la terminal (sin la app):

```bash
printf '\x1b@Hola\n\x1dV\x42\x00' | nc 192.168.1.23 9100
```

## Permiso del navegador

Chrome pide una vez el permiso de **acceso a la red local** cuando la app habla
con `127.0.0.1` (es el propio navegador protegiendo al usuario). Se acepta una
vez por navegador y listo. En Safari puede no estar disponible: en ese caso la
app cae al diálogo de impresión de siempre.

## Puente de impresión (varias computadoras y móviles)

> Con el **modo remoto** de arriba ya no hace falta configurar direcciones a mano:
> el agente reclama los trabajos del backend. Esta sección es el modo local
> clásico (agente en la misma red, sin backend), útil si la empresa todavía no
> usa la cola centralizada.

Una sola Mac siempre encendida queda como **puente**: es la única que conoce la
impresora y las demás le mandan los trabajos.

```
Computadoras y móviles (misma red)  →  Mac puente (agente)  →  ZKP8008 (USB o LAN)
```

- En la **Mac puente**: dejá \`http://127.0.0.1:17890\` y su token.
- En las **demás computadoras y móviles**: Configuración → Impresoras → *Dirección del agente* =
  \`http://<IP-de-la-Mac-puente>:17890\`, con el mismo token. En móviles, además, el navegador pide
  una vez el permiso de red local.
- Reservá **IP fija** para la Mac puente y para la impresora en el router
  (por ejemplo Mac \`192.168.100.20\`, impresora \`192.168.100.23\`) y que ambas estén en la misma subred.
- El agente escucha en toda la red (\`MOBOS_PRINT_HOST=0.0.0.0\`, por defecto). Para que sea solo de
  esta computadora, poné \`MOBOS_PRINT_HOST=127.0.0.1\`.
- macOS va a pedir permiso de **Firewall** la primera vez que el agente acepte conexiones entrantes.

### Cola centralizada

La cola vive en el backend: la app encola por HTTPS con la sesión y la Mac
puente (pareada con un código) la retira sola. Es el **modo remoto** descrito
arriba y cubre también usuarios fuera del local o con datos móviles.

## Endpoints del agente

| Método | Ruta | Para qué |
| --- | --- | --- |
| GET | `/health` | Estado, impresoras detectadas, cola y bloque `remoto` (activo, backoff, pendientes de reporte). |
| POST | `/print` | `{impresora, ancho, copias, data}` con `data` en base64 ESC/POS. |
| GET | `/jobs/:id` | Estado de un trabajo encolado. |
| POST | `/config` | Cambia impresora, ancho y copias sin tocar el archivo. |

Todas las llamadas locales desde la app llevan el header `x-mobos-print-token`.

## Archivos y logs

- Config: `~/.mobos-print/config.json` (`token` local, `apiUrl`, `bridgeToken`, impresora, ancho, copias, reintentos), permisos `0600`.
- Cola: `~/.mobos-print/cola.json` (incluye los resultados remotos sin reportar).
- Log: `~/.mobos-print/agente.log` (sin token, sin sufijo y sin bytes del ticket).

## Artefacto versionado (mantenimiento)

El instalador se sirve desde `backend/public/print-agent/` y se genera con el
packer (sin dependencias nuevas):

```bash
npm run pack:agent          # tarball + manifest.json + install.sh
npm run pack:agent:check    # gate anti-drift (falla si quedó viejo)
```

`npm run pack:agent:check` compara el tarball con las fuentes de `print-agent/`,
verifica la versión de `print-agent/package.json` contra `server.mjs` y avisa si
`install.sh` publicado difiere. Es obligatorio regenerarlo cuando cambien las
fuentes del agente.

## Sin Node (opcional)

Si la computadora del local no puede tener Node, el mismo agente se puede
compilar a un binario único (`bun build --compile print-agent/server.mjs`) y
apuntar el servicio a ese binario.
