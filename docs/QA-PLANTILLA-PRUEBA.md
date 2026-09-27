# Plantilla del ticket de prueba (PRN + diseño)

El editor vive en la **ficha de la impresora**: Configuración → Dispositivos →
Impresoras → **Imprimir prueba**. Ahí el operador arma cómo sale el papel de
prueba antes de mandarlo: qué bloques incluye, ancho 58/80, variante de corte y
copias, con **vista previa real** del rollo.

## Qué se puede editar

| Opción | Valores | Detalle |
|---|---|---|
| **Qué incluye** | Encabezado · Número secreto · Trazabilidad · QR y código de barras · Acentos y símbolos | Cada bloque se prende/apaga con un chip `aria-pressed`. El cuerpo del tipo de prueba siempre sale. |
| **Ancho del papel** | 58 / 80 mm | Cambia el envoltorio del ticket (32 vs 48 columnas) y el ancho de la vista previa. |
| **Corte** | Completo · Parcial · Avanza + completo · Avanza + parcial · Sin corte | Variantes GS V de `escpos.js`; «Sin corte» solo avanza y deja el papel unido al rollo. |
| **Copias** | 1 a 5 | Contador con `−`/`+`; el pie del ticket informa cuántas salen. |

Honestidad en pantalla: si se apaga **Número secreto**, el aviso pasa a decir
que la confirmación en papel queda desactivada; si el ancho elegido difiere del
configurado, la impresora sigue mostrando su dato real en la cabecera.

## Memoria por impresora ("último usado")

`src/lib/printing/plantillaPrueba.js` (núcleo puro) guarda la última plantilla
usada **por impresora** en `mobos:impresion:plantilla-prueba`. Es una selección:
se recuerda al imprimir, se muestra con el chip «Recordada en esta impresora» y
se puede restablecer a la configuración de la impresora con un toque. Si nunca
se usó, la plantilla arranca copiando ancho/corte/copias de la propia impresora.
La memoria no toca la venta diaria: el editor aclara «Solo cambia el ticket de
prueba».

## Coordinación con PRN

- `tickets.js` (`ticketPruebaTipo`) acepta `incluye` y `corte` **con defaults
  retrocompatibles** (todos los bloques y corte completo). Sin las opciones, el
  ticket sale exactamente como antes.
- `escpos.js` no cambió: el editor usa las variantes de corte que ya existían.
- El envío ya soportaba `copias` (el router y el agente lo clampean 1–5); ahora
  la prueba puede mandar más de una y la ficha lo informa («· N copias»).
- Pendiente si PRN lo quiere server-side: persistir la plantilla en
  `PrintPrinter` (hoy es memoria local del navegador, patrón «último usado»).

## Verificación

- Unitarios: `tickets.test.js` (bloques apagados/encendidos, variantes de corte,
  ancho 58 mm a 32 columnas, copias en el pie) y `plantillaPrueba.test.js`
  (defaults de la impresora, normalización, deriva de ids contra el builder,
  memoria con y sin storage).
- e2e `impresion-plantilla.spec.js` (proyecto `admin`): abre el editor desde la
  ficha, apaga «QR y código de barras» y el papel lo pierde, pasa a 58 mm y la
  hoja se angosta de verdad (219 px vs 302 px), elige «Sin corte» y desaparece
  `[CORTE]`, sube a 2 copias y el pie dice `Copias 2`. No imprime: cancela.
- Capturas antes/después en `docs/qa/plantilla-prueba/{antes,despues}/` con
  `scripts/qa-plantilla-prueba.mjs` (claro, oscuro y móvil; y una toma con
  58 mm + sin corte + 2 copias). Producción v1.0.190: **0/3 con editor**;
  rama: **3/3**, sin desborde en móvil.
