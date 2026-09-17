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
bash print-agent/install-macos.sh
```

El instalador copia el agente a `~/Library/Application Support/MobOS Print`,
crea el servicio `com.mobos.print` (arranca al iniciar sesión) y muestra el
**token** que hay que pegar en la app: **Configuración → Impresoras**.

## Configurar la impresora

En la app, Configuración → Impresoras:

1. Verificá que el agente diga **“Conectado”**.
2. Elegí la impresora:
   - **LAN**: `lan:192.168.1.23:9100` (la IP de la impresora y el puerto 9100).
   - **USB**: `usb:<nombre de la cola>`; las colas se listan solas si están
     dadas de alta en macOS (Ajustes → Impresoras y escáneres). El agente les
     manda los mismos bytes crudos con `lp -o raw`.
3. Elegí el ancho (el instalador deja **58 mm**, el rollo del local; con `MOBOS_PRINT_ANCHO=80 bash install-macos.sh` queda en 80) y las copias. Los tickets salen con padding a los costados y **corte automático** al final.
4. **Imprimir prueba**: sale texto, acentos, negrita, doble alto, QR y código de
   barras. Si todo eso sale bien, la impresora quedó lista.

## Red

La impresora ya está configurada en `192.168.1.23:9100` (máscara 255.255.255.0, gateway 192.168.1.1, DHCP desactivado, ESC/POS, cortador habilitado) y el instalador la deja cargada como destino.

Lo que falta es de red: la Mac está en `192.168.100.x` y la impresora en `192.168.1.23`, así que **no se ven** aunque el agente esté andando.

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

Prueba rápida desde la terminal (sin la app):

```bash
printf '\x1b@Hola\n\x1dV\x42\x00' | nc 192.168.1.23 9100
```

## Permiso del navegador

Chrome pide una vez el permiso de **acceso a la red local** cuando la app habla
con `127.0.0.1` (es el propio navegador protegiendo al usuario). Se acepta una
vez por navegador y listo. En Safari puede no estar disponible: en ese caso la
app cae al diálogo de impresión de siempre.

## Endpoints del agente

| Método | Ruta | Para qué |
| --- | --- | --- |
| GET | `/health` | Estado, impresoras detectadas y cola. Con token agrega el detalle. |
| POST | `/print` | `{impresora, ancho, copias, data}` con `data` en base64 ESC/POS. |
| GET | `/jobs/:id` | Estado de un trabajo encolado. |
| POST | `/config` | Cambia impresora, ancho y copias sin tocar el archivo. |

Todas las llamadas desde la app llevan el header `x-mobos-print-token`.

## Archivos y logs

- Config: `~/.mobos-print/config.json` (token, impresora, ancho, copias, reintentos).
- Cola: `~/.mobos-print/cola.json`.
- Log: `~/.mobos-print/agente.log`.

## Sin Node (opcional)

Si la computadora del local no puede tener Node, el mismo agente se puede
compilar a un binario único (`bun build --compile print-agent/server.mjs`) y
apuntar el servicio a ese binario.
