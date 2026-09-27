# Plantilla del ticket de prueba (#277, PRN + diseño)

El editor vive en la **ficha de la impresora**: Configuración → Dispositivos →
Impresoras. La ficha tiene tres entradas: **Imprimir prueba** (flujo completo),
**Plantilla** (abre el mismo editor, con el título de la plantilla) y **Editar**
(configuración de la impresora). Dentro del editor se elige el tipo de ticket, el
ancho 58/80, la variante de corte, las copias y —solo en el corto— la fecha y
hora, con **vista previa real** del rollo, y la **guarda en la impresora**.

## Ticket corto (predeterminado) y completo (opcional)

- **Ticket de prueba MobOS** (`corta`, predeterminado de la biblioteca): solo el
  título y `VALIDACIÓN XXXX-X`, con **fecha y hora opcional**. Menos papel y más
  rápido.
- **Prueba completa**, **Ticket de pedido**, **Ticket con QR**, **Ticket completo
  de venta**, **Caracteres y formato** y **Prueba de corte**: los tipos completos,
  con trazabilidad (impresora, método, conexión, puente, token, usuario, equipo,
  trabajo), QR/barras y acentos.
- El **modelo canónico** del ticket vive en la biblioteca (`paginaDePrueba`,
  owncoding-ui v0.49.0) y la app solo lo adapta (`src/lib/printing/tickets.js`)
  con su nombre, la base del QR y la página de verificación.

## Elegir el predeterminado (último usado = predeterminado)

La plantilla —**incluido el tipo**— se guarda al imprimir (`último usado`) y
también con el botón **Guardar plantilla**. La próxima vez, la ficha abre con la
última plantilla usada: si el operador pasó al ticket completo, ese queda como
predeterminado suyo; si nunca tocó nada, sale el ticket corto.

## Qué se puede editar

| Opción | Valores | Detalle |
|---|---|---|
| **Tipo de prueba** | Corta (predeterminada) + Completa + 5 tipos | El corto sale solo con título y validación. |
| **Fecha y hora** | On / off | Solo en el ticket corto; en el completo la fecha va con la trazabilidad. |
| **Ancho del papel** | 58 / 80 mm | Cambia el envoltorio del ticket (32 vs 48 columnas) y el ancho de la vista previa. |
| **Corte** | Completo · Parcial · Avanza + completo · Avanza + parcial | Variantes GS V de `escpos.js` (biblioteca). |
| **Copias** | 1 a 5 | Contador con `−`/`+`; el pie del ticket informa cuántas salen. |

## Persistencia (dos capas)

1. **Impresa en la impresora del backend**: `PrintPrinter.testTemplate` (JSONB,
   migración `20261227000000_print_printer_test_template`, aditiva e idempotente;
   el PATCH valida y acota el payload en `normalizarPlantillaPrueba`). La
   plantilla **viaja entre dispositivos**.
2. **Memoria local** (`mobos:impresion:plantilla-prueba`, núcleo puro en
   `plantillaPrueba.js`): respaldo cuando el servidor no responde y modo demo.
   El editor muestra **«Guardada en esta impresora»** o **«Recordada en este
   dispositivo»** según de dónde viene, y **Restablecer** vuelve a la
   configuración de la impresora (con el ticket corto).

La plantilla no toca la venta diaria: el editor lo aclara y el envío de la venta
sigue usando el ancho/copias de la impresora.

## Coordinación con la biblioteca y el backend

- `tickets.js`: la app delega el armado en `paginaDePrueba` (owncoding-ui
  v0.49.0) y solo aporta el nombre, la base del QR y la página de verificación.
  El tipo corto es `corta` y el completo `completa`; `escpos.js` no cambió.
- Backend: campo `testTemplate` + migración `20261227000000_print_printer_test_template`
  + PATCH de impresoras (`normalizarPlantillaPrueba` en `lib/print-bridge.ts`,
  que acota tipo, ancho 58/80, corte, copias 1–5 y `incluyeFecha`). El audit de
  impresoras no registra la plantilla (evita ruido); el GET ya devuelve el campo
  completo.
- El envío ya soportaba `copias`; la ficha ahora informa «· N copias» en la
  última prueba.

## Verificación

- Unitarios: `tickets.test.js` (completos con trazabilidad, corto con
  título/validación), `prueba.test.js` (adaptador: corto sin pie ni códigos,
  completo con trazabilidad), `plantillaPrueba.test.js` (contrato de la
  biblioteca, normalización y memoria) y backend `print-bridge.test.ts`
  (`normalizarPlantillaPrueba`: acota, filtra y rechaza lo inválido).
- e2e `impresion-plantilla.spec.js` (proyecto `admin`): el corto es el
  predeterminado; la fecha/hora es optativa; el completo conserva trazabilidad y
  códigos; 58 mm angosta la hoja de verdad (219 vs 302 px); el corte parcial
  viaja al builder (`[CORTE: parcial]`); 2 copias se reflejan en el pie;
  **Guardar plantilla** deja el chip «Guardada en esta impresora» y al reabrir
  la ficha vuelve con el tipo, ancho, corte y copias guardados.
- Capturas antes/después en `docs/qa/plantilla-prueba/{antes,despues}/` con
  `scripts/qa-plantilla-prueba.mjs` (claro, oscuro, móvil; acción con 58 mm + sin
  corte + 2 copias, el completo y las **acciones de la ficha** con la entrada
  «Plantilla»). Producción v1.0.190: **0/3 con editor**; rama: **3/3**, sin
  desborde en móvil. Lámina de cierre (matriz
  claro/oscuro/móvil × ANTES | DESPUÉS): `docs/qa/plantilla-prueba/comparativa-cierre.jpg`.
