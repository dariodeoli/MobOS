# #245 · Hardening de `qa-249-inventario-touch.spec.js` — evidencia

## Qué pasaba (causa raíz)

El test «mobile 390» fallaba en CI con **`locator.click`: Test timeout of 90000ms
exceeded** y **171 reintentos** de Playwright:

```
- waiting for getByTestId('inventario-fila').first().locator('b').first()
  - locator resolved to <b title="iPhone 15 E2E Serial" class="min-w-0 truncate …">
- attempting click action
  171 × waiting for element to be visible, enabled and stable
    - element is not visible
```

No era el timeout: **el nombre del modelo quedaba con ancho 0**. En la fila, el
serial (`SerialTexto`) iba con `shrink-0`, la batería y la condición también, y el
nombre era el único flexible: con un serial largo (los de la semilla, p. ej.
`E2EE2EIPHONE15MUBKLQWC2`, 24 caracteres) el nombre se comprimía a 0 px → para
Playwright el `<b>` no es visible → el clic reintenta sin fin.

Por eso era intermitente: depende de **cuál** unidad queda primera en el orden
«Recientes». Con el serial corto (`356789102345678`) el nombre conserva ~18 px y
el test pasa; con un serial largo, 0 px y el test muere.

## Antes / después (reproducción local, fuente ancha como el runner)

| Captura | Qué muestra |
|---|---|
| `00-ci-fallo-mobile-390.png` | La captura real del fallo en CI (varias filas sin nombre). |
| `01-antes-serial-largo.png` | Local, serial largo + fuente ancha: el nombre mide **0 px** (CSS anterior) y el clic falla («Timeout 4000ms exceeded»). |
| `02-despues-ficha-abierta.png` | Mismo escenario con el fix: el nombre mide **63,9 px** y la ficha se abre tocando la fila. |

Medición local del repro (misma corrida):

```
ANTES_NOMBRE   {"width":0}            ANTES_CLIC   falla: locator.click: Timeout 4000ms exceeded
DESPUES_NOMBRE {"width":63.90625}     DESPUES_FICHA_OK
```

## El fix

1. **UI** (`src/components/control/Inventario.jsx`): el nombre lleva
   `min-w-[3rem]` (mínimo legible, con su `title` completo) y el **serial cede
   antes** (se le quita `shrink-0`; `SerialTexto` ya conserva la cabeza recortada
   con la cola y el `title`). El grupo del nombre va con `overflow-hidden` para
   que nunca invada la columna siguiente.
2. **Spec** (`e2e/qa-249-inventario-touch.spec.js`): esperas deterministas
   (`expect(locator).toBeVisible()` antes de medir, sin subir ningún timeout) y
   locators estables:
   - la casilla se toca por su **etiqueta de 44 px** (`label:has(input[type=checkbox])`)
     y se verifica el estado con `toBeChecked()` / `not.toBeChecked()`;
   - la ficha se abre **tocando la fila** (ícono de categoría, blanco fijo de la
     primera columna) en vez de un texto que puede colapsar;
   - guarda de regresión: el nombre del modelo tiene que medir **≥ 40 px**.

## Corridas

- Repro con serial largo + fuente ancha: antes falla el clic, después pasa.
- Spec endurecido: `--repeat-each=4` → **8 passed**, **0 reintentos**.
- Smoke y specs afectados del dominio, verdes (ver handover).
