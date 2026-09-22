# §11 — brecha «eliminar bloque de pago»: intento revertido

**Estado: NO implementada.** El 22/09 agregué un botón de papelera por bloque insertándolo
antes del cierre del contenedor del map; el build pasaba pero **`e2e/pos-checkout` (split)
quedó en rojo** (54 s, 1 failed), así que lo revertí para no dejar el POS roto.

**Causa probable:** el botón quedó como hermano del bloque y no dentro de su celda/grilla
(`sm:grid-cols-[1.2fr_1fr_1fr_auto]`), alterando la estructura que el flujo de pago espera
(el botón principal y el conteo de bloques del test).

**Próximo intento (con lectura completa de la región):** insertar el botón dentro de la
cuarta columna (`auto`) de la grilla del bloque — la que ya reserva el layout — y correr
`e2e/pos-checkout` con `--timeout=90000` antes de commitear.

**Sigue pendiente también:** estado por bloque / «marcar como no pagado» (decisión de producto).
