# Impresión F3: USB físico directo (node-usb) — diseño y protocolo de prueba física

Estado: **diseño, sin implementar** (ver «Por qué no se implementa ahora»).
Alcance: impresora térmica **ZKP8008** del local, conectada por cable USB a la
computadora puente. No cambia los caminos que hoy funcionan (LAN TCP y CUPS).

Referencias: `issue #16` (diagnóstico del agente), `issue #17` (launchd/CUPS),
`print-agent/transportes.mjs`, `print-agent/config.mjs`, `docs/IMPRESION.md`.

## 1. Objetivo

Agregar, **detrás de una bandera**, un cuarto método de transporte a la matriz
de impresión (LAN TCP · CUPS-LAN · USB directo · CUPS-USB · diálogo del
navegador): hablarle a la impresora por el cable USB sin depender de CUPS ni de
que la impresora tenga red. Se valida con el dispositivo real antes de integrar.

## 2. Estado actual (lo que ya existe)

| Camino | Cómo sale | Dónde vive |
| --- | --- | --- |
| LAN TCP | Socket crudo a `host:9100` (ESC/POS) | `enviarLan()` en `transportes.mjs` |
| CUPS-LAN | Cola `socket://host:9100` con `lp -o raw` | respaldo automático de `enviar()` |
| CUPS-USB | Cola `usb://…` o `cups:<cola>` con `lp -o raw` | `enviarUsb()` en `transportes.mjs` |
| Diálogo | HTML del comprobante (`printHtml`) | app (`OrderReceipt.jsx`) |

- El destino `usb:<cola>` de la app **no es USB directo**: es una cola CUPS, que
  puede ser de red o de cable. `/health` lo informa honesto con `red.cupsUri`
  (`usb://…` o `socket://…`) y `red.colaTipo` (`usb` o `red`).
- No hay acceso al dispositivo USB: el agente nunca abre un file descriptor del
  USB, solo invoca `lp`. Por eso «USB» hoy depende de que CUPS tenga la cola.
- macOS moderno ya no permite crear colas *raw* con `lpadmin -m raw`
  (comentario en `colaUri()`); una cola preexistente sigue funcionando. Esa
  restricción es la principal razón para evaluar el acceso directo.
- El agente se distribuye como tarball **sin dependencias** (solo `.mjs` y
  `package.json`, allow-list de `scripts/pack-agent.mjs`), se verifica por
  SHA-256 antes de extraer y corre con Node >= 20.

## 3. Opciones evaluadas

### A. `node-usb` (libusb nativo) — recomendada condicionada

- **Qué es**: addon nativo (N-API) que expone libusb: enumera dispositivos,
  lee descriptores y hace transferencias *bulk* al endpoint OUT.
- **A favor**: independencia total de CUPS y de la red; permite leer estado del
  dispositivo, detectar desconexión y elegir endpoint al conectar; N-API v3 es
  estable entre versiones de Node.
- **En contra**: agrega un binario nativo al agente que hoy es JS puro:
  descarga/prebuild por plataforma (`darwin-arm64`, `darwin-x64`), tamaño del
  tarball, allow-list y checksum del packer, y firma ad-hoc en Apple Silicon.
  Requiere permiso de dispositivo (en macOS, normalmente sin prompt si es USB
  clase impresora estándar; algunos bridges serie piden kext y **no** sirven
  con libusb genérico).
- **Conclusión**: es la única opción que cumple «sin CUPS». Se implementa solo
  después de la prueba física y con la bandera apagada por defecto.

### B. `lp` crudo sobre cola USB (lo que ya existe)

- **Qué es**: `lp -d <cola> -o raw archivo.bin` con una cola `usb://ZKP8008`.
- **A favor**: cero dependencias, ya implementado y probado (`enviarUsb()`).
- **En contra**: depende de que CUPS tenga la cola creada y no permite leer
  descriptores ni estado. Si la cola no existe, no hay camino.
- **Conclusión**: se mantiene como método y como fallback de A.

### C. Backend USB de CUPS (`/usr/libexec/cups/backend/usb`)

- **Qué es**: el «usbprint» real de macOS es este backend; no existe un CLI
  `usbprint` público en macOS 15. `lp` + cola `usb://` es su interfaz.
- **A favor**: es el mismo camino B, sin dependencias.
- **En contra**: mismas limitaciones que B; crear la cola requiere permisos de
  administrador y `lpadmin` ya no crea colas raw.
- **Conclusión**: idéntico a B; no agrega nada por sí solo.

### D. `ipp-usb` (IPP sin driver sobre USB)

- **Qué es**: demonio que publica una impresora USB como IPP para imprimir sin
  driver.
- **A favor**: estándar moderno si la impresora lo soporta.
- **En contra**: `ipp-usb` es de Linux (no hay paquete mantenido para macOS),
  requiere que el firmware implemente IPP-over-USB y la ZKP8008 es una térmica
  ESC/POS: casi seguro que no lo expone. Agrega un demonio más al puente.
- **Conclusión**: descartada salvo que la prueba con `system_profiler` muestre
  una interfaz de clase impresora con IPP; aun así, el costo de empaquetado es
  mayor que el de A.

### E. No hacer nada (estado actual)

- **A favor**: cero riesgo, LAN y CUPS cubren el local.
- **En contra**: si CUPS pierde la cola o la impresora queda solo con cable, no
  hay salida por USB más que recrear la cola a mano.

## 4. Requisitos de la ZKP8008 a relevar con el equipo real

Nada de esto se asume: se completa en el paso 1 del protocolo y queda como
constante **solo si se confirma en el papel**.

| Dato | Para qué | Cómo se obtiene |
| --- | --- | --- |
| VID / PID | Filtrar el dispositivo sin depender del nombre | `system_profiler SPUSBDataType` |
| N.º de serie | Distinguir dos impresoras iguales | `system_profiler SPUSBDataType` |
| Clase de interfaz | 7 = impresora (ESC/POS bulk); 255/vendor = bridge serie | `ioreg -p IOUSB -l -w 0` |
| `bInterfaceNumber` | Interfaz correcta si hay más de una | `ioreg` |
| `bEndpointAddress` OUT | A dónde se escriben los bytes (ej. `0x01`) | `ioreg` |
| `bEndpointAddress` IN (si existe) | Leer estado (papel, error) | `ioreg` |
| `wMaxPacketSize` | Tamaño de chunk de la transferencia *bulk* | `ioreg` |
| Clase de velocidad (`bcdUSB`, velocidad) | Diagnóstico de lentitud | `ioreg` |

Hipótesis a verificar (no hechos): las térmicas chinas suelen traer (a) clase
impresora 07h con endpoint bulk OUT, o (b) un bridge serie CH340/CP210x/PL2303
que **no** se maneja con libusb genérico. El resultado del paso 1 decide si A es
viable tal cual o requiere un driver de bridge.

## 5. Protocolo de prueba física (con cable, en el local)

Se ejecuta con Dario o quien tenga la impresora a mano. Nada de esto se corre
en CI.

### Paso 0 — Preparar

1. Apagar la impresora, conectar el cable USB directo a la Mac puente y
   encenderla.
2. Verificar que la app sigue imprimiendo por LAN o CUPS antes de tocar nada
   (si ya falla, no es un problema del USB).
3. Liberar la cola CUPS si existe para evitar que CUPS retenga el dispositivo:
   `lpstat -v` y, si aparece una cola `usb://…`, no hace falta borrarla para
   esta prueba — sirve de comparación. Solo evitar imprimir por esa cola
   mientras se prueba el acceso directo.

### Paso 1 — Registrar identidad y descriptores

```bash
system_profiler SPUSBDataType | sed -n '/ZKP/,+12p'
ioreg -p IOUSB -l -w 0 | grep -A 25 -i "ZKP\|printer"
```

- Anotar en este documento: VID, PID, serie, `bInterfaceClass`, interfaz y
  endpoint OUT.
- **Éxito del paso**: VID/PID/serie identificados y endpoint OUT confirmado.
  **Fallo**: el dispositivo no aparece (`system_profiler` sin entrada nueva),
  o la interfaz es de bridge serie sin clase impresora. En ese caso, A queda
  bloqueada y se documenta el chip del bridge.

### Paso 2 — Prototipo mínimo (solo si el paso 1 habilitó A)

- Instalar `usb` (node-usb v3) **fuera del repo**, en una carpeta de prueba, no
  en `print-agent/` (evita tocar el tarball).
- Script corto: abrir por VID/PID, reclamar interfaz, escribir `ESC @` +
  `Hola USB\n` + corte (`GS V 0`) al endpoint OUT.
- **Éxito**: sale el papel con «Hola USB» y corta. **Fallo**: `LIBUSB_ERROR_*`
  se registra tal cual (permiso, busy, pipe) sin reintentos.

### Paso 3 — Tickets ciegos por método (3 por método)

Usar el ticket de prueba de la app (Configuración → Impresoras → **Imprimir
prueba**), que ya imprime un **código de 4 dígitos** distinto por corrida con
un dígito secreto para confirmar en Actividad. El texto del papel es la única
prueba válida: el código no se muestra antes de imprimir.

| Método | Destino de prueba | Corridas |
| --- | --- | --- |
| USB directo (A) | `usbdir:<VID>:<PID>` (bandera `usbDirecto`) | 3 |
| CUPS-USB | `usb:ZKP8008` (cola `usb://…`) | 3 |
| CUPS-LAN | `cups:MobOS_LAN` (cola `socket://…`) | 3 |
| LAN TCP | `lan:192.168.1.23:9100` | 3 |

Por corrida registrar: código de 4 dígitos visto, dígito secreto, calidad
(legible / cortado / centrado), ancho real (58/80), corte (sí/no) y tiempo
aproximado. Un resultado «no salió» es un dato, no un reintento silencioso.

### Paso 4 — Qué mirar en `/health` y `/diagnostico`

Con el agente corriendo y token válido:

- `GET /health` → `red.transporte`, `red.cupsUri`, `red.colaTipo`,
  `red.autotest`, `impresoras.usb` y `cola`. Para USB directo se espera que el
  `transporte` reportado sea `usb-directo` (nombre nuevo, honesto) y que
  `impresoras.usb` no sea la única fuente de detección.
- `GET /diagnostico?destino=usbdir:<VID>:<PID>` → `alcance`, `errno`, `motivo`,
  `transporte`. Hoy `diagnosticoRed()` no conoce USB directo: si el paso 2
  funciona, se extiende con una rama que intente abrir el dispositivo y
  reporte descriptor/endpoint (sin imprimir).
- En la app, Configuración → Impresoras debe mostrar el método real, sin
  llamar «USB» a una cola de red ni al revés.

### Paso 5 — Casos borde obligatorios

1. **Reconexión**: desenchufar y volver a enchufar en medio de la cola; el
   próximo trabajo debe reabrir el dispositivo y salir una sola vez.
2. **Dos impresoras**: dos ZKP8008 conectadas; el filtro por VID/PID + serie
   debe elegir la configurada, no la primera que aparezca.
3. **Puerto ocupado por CUPS**: con la cola CUPS activa, el acceso directo debe
   informar «ocupado» claro y ofrecer CUPS-USB como alternativa, sin duplicar.
4. **Resultado incierto**: cortar el cable justo después de aceptar; el trabajo
   queda `incierto` (no se reintenta solo) y el operador decide en la cola.

### Criterio de aceptación (éxito)

- 3/3 tickets por método, con el código de 4 dígitos y el dígito secreto
  coincidentes en el papel, legibles y cortados.
- USB directo no imprime dos veces ante un resultado incierto (0 duplicados en
  las 3 corridas + caso borde 4).
- La app puede confirmar en papel («Actividad de impresión») cada corrida.
- `/health` y `/diagnostico` reflejan el método real.
- Si cualquier criterio falla, el método no se habilita y la bandera queda
  apagada; se documenta el fallo.

## 6. Impacto en el empaquetado

| Área | Hoy | Con `node-usb` |
| --- | --- | --- |
| Contenido | 7 fuentes `.mjs` + `package.json` | + binario nativo por plataforma |
| Tamaño | ~100 KB | + cientos de KB por arquitectura |
| Instalación | `curl` + extraer, sin `npm install` | igual, pero el tarball debe incluir los prebuilds |
| Checksum | SHA-256 del tarball | igual (incluye los binarios) |
| Arquitecturas | arm64 y x64 (Node) | prebuild arm64 **y** x64; Apple Silicon exige firma ad-hoc válida |
| Firma/notarización | no aplica (JS) | `.node` necesita al menos firma ad-hoc; Gatekeeper podría marcar cuarentena si el archivo llega con `com.apple.quarantine` |
| `bun build --compile` (opcional) | binario único | debe embeber el `.node`; hoy no está probado |
| CI | `npm --prefix print-agent test` | sin hardware no se puede probar el camino real; solo unit con mock del binding |

Reglas duras del repo que el cambio debe respetar: allow-list del packer,
`pack:agent:check` verde, versión de `package.json` = `server.mjs`, y rollback
documentado.

## 7. Fallback y riesgos

- **Fallback de runtime**: si USB directo falla *antes* de aceptar, se usa la
  cola CUPS-USB si existe; si no, LAN; si no, cola remota/puente. Nunca los dos
  transportes por el mismo trabajo (la cola honesta `aceptado ≠ confirmado` se
  mantiene).
- **Riesgo de duplicado**: transferencia bulk que falla después de enviar bytes
  → `incierto`, sin auto-retry (mismo criterio que `enviarLan()`).
- **Riesgo de driver**: bridge serie (CH340/CP210x) no soportado por libusb
  genérico → se detecta en el paso 1 y el método queda descartado para ese
  hardware.
- **Riesgo de empaquetado**: binario nativo sin firmar → la instalación falla
  en macOS. Mitigación: prebuild con firma ad-hoc, verificación de carga al
  arrancar (`process.dlopen`) y rollback a la versión JS pura.
- **Riesgo de permisos**: macOS puede pedir permiso de dispositivo; si aparece
  un prompt que el usuario no puede ver (launchd), el agente debe reportarlo
  como error claro, no como «impreso».
- **Riesgo de mantenimiento**: dos métodos USB confunden. La app debe mostrar
  siempre el método real (`cupsUri`) y el nuevo solo con bandera activa.

## 8. Recomendación

1. **No implementar USB directo hoy.** `node-usb` es una dependencia nativa:
   contradice el agente sin dependencias, no se puede probar en CI sin el
   dispositivo y el repo pide no dejar una implementación a medias.
2. **Sí dejar este diseño y ejecutar el protocolo físico**; el paso 1 se puede
   hacer hoy sin tocar código y decide si la ZKP8008 es viable por libusb.
3. **Implementación futura** (solo si el paso 1 la habilita): rama
   `usb-directo` en `transportes.mjs` detrás de `usbDirecto: false` en la
   config, destino `usbdir:<VID>:<PID>`, con tests unitarios del parser de
   descriptores y de la selección de endpoint, y `pack:agent:check` cubriendo
   el prebuild. La bandera por defecto queda apagada y CUPS-USB sigue siendo el
   camino USB estable.

## 9. Por qué no se implementa ahora

- El propio issue lo pide así: «diseño y protocolo de prueba física», y
  prohíbe una implementación a medias que no se pueda probar sin hardware.
- Sin los descriptores reales (paso 1) no se sabe si la impresora es clase 07h
  o un bridge serie: escribir el transporte ahora sería adivinar.
- El empaquetado versionado del agente es JS puro por decisión explícita; sumar
  un binario nativo cambia el artefacto, los checksums y la instalación, y eso
  merece una decisión aparte con la prueba física ya hecha.
