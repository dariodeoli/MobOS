# #240/#250 · Buscador dependiente de dispositivos en Asistencia técnica

Adopción del objeto que CMP publicó en la biblioteca **owncoding-ui v0.24.0**
(`BuscadorDispositivo`, «lote 30»): el modelo manda (búsqueda por nombre o
código) y recién después se despliegan sus variantes. En Asistencia técnica
entra en la **recepción de equipos** (orden de servicio) y de **repuestos**
(caso de garantía).

## Qué cambió

| Superficie | Cambio |
|---|---|
| **Orden de servicio** (`ServicioTecnico`) | El campo «Dispositivo» deja de ser texto libre suelto: usa `BuscadorDispositivo tipo="servicio"` (modelo → capacidad/color). La etiqueta compuesta («iPhone 15 · 256 GB · Azul») se guarda en `device`, el mismo campo de siempre: lista, búsqueda, tickets e impresos no cambian. |
| **Tipo del checklist** | Al cambiar el modelo se sincroniza «Tipo de dispositivo» (iPhone, MacBook, iPad, AirPods, Apple Watch; el resto, Otros) y se limpia el servicio del catálogo, así el checklist de recepción corresponde al equipo. |
| **Editar una orden** | La etiqueta guardada se vuelve a abrir con `partesDispositivo` y el buscador queda con el modelo y las variantes cargadas. |
| **Caso de garantía** (`Garantias`) | La lista de repuestos suma el buscador `tipo="accesorios"` (producto o modelo compatible → marca/categoría): «Agregar a la lista» escribe la línea en el campo de siempre (una por repuesto), que sigue viajando como `parts` a la ficha y al informe. |
| **Tablero por etapas** | Las tarjetas muestran el modelo destacado y la variante al costado, con el mismo puente de etiquetas (`partesDispositivo`/`varianteDispositivo`) — la pasada que sumaba al pipeline. |
| **Sin lógica duplicada** | El separador de la etiqueta y el mapeo de tipo viven solo en `lib/dispositivos.js`, con unitarios; una regla de objetos protege la adopción. |

## QA

`e2e/qa-240-buscador-dispositivo.spec.js` (proyecto admin, **6/6**):

- 4 corridas (claro/oscuro × desktop/mobile): en la orden nueva, capacidad y
  color **no existen** hasta elegir el modelo; al elegir «iPhone 17» se
  despliegan y la orden guardada muestra `iPhone 17 · 256 GB · <color>` en la
  lista. **0 textos bajo AA** en el diálogo y **sin scroll horizontal**.
- 2 corridas (claro × desktop/mobile): un modelo fuera del catálogo
  («MacBook Air M2», texto libre) se guarda tal cual y **sincroniza el tipo**;
  el repuesto del caso se elige del catálogo (Pantalla OLED → Apple → Repuestos),
  se agrega a la lista y el caso guardado muestra `Repuestos: …`.

Capturas (10) en `docs/rediseno/`:
`c241f4g-buscador-orden-{claro,oscuro}-{desktop,mobile}.png`,
`c241f4g-buscador-lista-{claro,oscuro}-{desktop,mobile}.png`,
`c241f4g-buscador-libre-claro-{desktop,mobile}.png` y
`c241f4g-buscador-repuestos-claro-{desktop,mobile}.png`.

```bash
MOBOS_CAPTURAS=docs/rediseno \
  npx playwright test e2e/qa-240-buscador-dispositivo.spec.js --project=admin
```

## Checks

`npm run lint` 0 errores · `npm test` **703 ✓** · backend `test:unit` **75 ✓** ·
builds FE/BE con `BUILD_ID` ✓ · `prisma:validate` ✓ · `test:e2e:smoke` **19/19** ✓ ·
spec de la adopción **6/6** ✓ · lote E **8/8** ✓ · tablero **6/6** ✓ ·
shards **138/138/137** ✓ · sin cambios de schema.
