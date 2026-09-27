# Diseño #279 · A3 aprobación OTP de presupuestos · A5 variante agotada

Diseño de las dos ampliaciones del plan #250 que quedaron en backlog (#279):

- **A3** · Presupuestos con **aprobación autenticada**: OTP + versión congelada +
  constancia (hash, firma opcional).
- **A5** · **Variante agotada**: el comprador propone alternativas; el
  vendedor/cliente decide (con OTP si cambia el precio).

Es un **preview de diseño** (solo DEV, datos ficticios): las pantallas existen
para revisarlas y para que FIN/CRM/CMP/POS las implementen. No toca pedidos,
presupuestos ni aprobaciones reales.

## Cómo verlas

```sh
npx vite --port 5203 --strictPort
# http://localhost:5203/diseno-aprobacion-otp
# http://localhost:5203/diseno-variante-agotada
```

Capturas (claro/oscuro desktop + móvil del paso clave) y medición AA/desborde:
`docs/qa/279-diseno/{a3,a5}/` con `scripts/qa-279-diseno.mjs` (**16 capturas, 0
bajos de AA, 0 desbordes**).

## A3 · Aprobación OTP (3 pasos)

| Paso | Qué muestra | Decisiones de diseño |
|---|---|---|
| 1 · Solicitud | Presupuesto (cliente, ítems, subtotal/descuento/total), **badge «Versión 2 · congelada»** + hash corto, quién pide y quién aprueba, la condición (p. ej. descuento > 5 %) | El presupuesto se congela **antes** de pedir el código: la aprobación es de una versión exacta; cualquier cambio crea la versión siguiente |
| 2 · Código | `PinInput` de **6 dígitos**, canal (WhatsApp + correo enmascarado), vence en **5:00**, reintento, **3 intentos → bloqueo 10 min** | Un solo código por solicitud; el error y los intentos restantes se muestran en el momento |
| 3 · Constancia | «Aprobado», versión bloqueada, quién/cuándo/canal/intentos, **firma opcional**, hash completo (`sha256:…`) y acciones **Descargar/Imprimir** | La constancia es la evidencia: el hash identifica la versión congelada |

## A5 · Variante agotada (4 pasos)

| Paso | Qué muestra | Decisiones de diseño |
|---|---|---|
| 1 · Proponer | Pedido + variante pedida **sin stock** y 3 alternativas con stock (sucursal/tránsito), precio y **diferencia** («Mismo precio · sin código» / «+Gs 900.000 · pide código») | La alternativa se elige de variantes reales con stock; el delta de precio define si hará falta código |
| 2 · Enviada | Badge «Requiere aprobación con código» (si cambia el precio), variante, precio, diferencia, **quién decide** (cliente o vendedor) y **expira en 24 h** | La propuesta viaja con vencimiento; se puede recordar o cancelar |
| 3 · Decisión | Aprobación con **OTP de 6 dígitos** cuando cambia el precio; aceptación simple cuando no cambia; opción «Mantener la original (espera)» | El código protege el cambio de precio (misma pieza que A3) |
| 4 · Resultado | «Alternativa aceptada», pedido actualizado con la variante y el precio final | Deja claro qué quedó y quién decidió |

## Coordinación

- **FIN** (presupuestos/autorizaciones): implementar A3 en el flujo de
  presupuestos reutilizando el lenguaje de `Autorizaciones` (aprobar/rechazar con
  nota). Backend: emitir/validar OTP, congelar versión + `hash`, auditar y emitir
  la constancia (PDF/impresión). Los estados del paso 2 (vence, intentos,
  bloqueo) están diseñados para el rate-limit del OTP.
- **CRM** (cliente): A5 en el portal del cliente — aviso de la propuesta,
  aceptar/rechazar y el OTP cuando cambia el precio. La variante aceptada tiene
  que reflejarse en el pedido y en su cronología.
- **CMP** (biblioteca): promover a `owncoding-ui` las piezas reutilizables —
  **`CodigoOtp`** (PinInput + estados: enviado/expirado/intentos/bloqueo) y la
  **fila de alternativa** (variante + stock + precio ± delta + acción).
  **Hallazgo de esta pasada**: `Badge color="slate"` en oscuro mide **3.66:1**
  sobre el chip (AA pide 4.5:1 en 12 px) según el auditor de #241; conviene
  ajustar ese tono en la biblioteca (en el diseño se usó `orange` para «Sin
  stock», que pasa AA).
- **POS/INV** (contexto): el disparador de A5 es una variante sin stock en el
  pedido/carrito; al aceptarse, la variante y el precio se aplican al pedido
  (y al stock reservado).

## Alcance de este preview

- Rutas DEV-only (`/diseno-*`): no existen en producción ni en el demo.
- Datos ficticios; sin API, sin backend, sin persistencia.
- Objetos compartidos (`BarraModulo`, `Card`, `FilaDato`, `Badge`, `Button`,
  `PinInput`, `Money/gs`): no se crean campos ni inputs nuevos (regla de
  `docs/CAMPOS.md`).
