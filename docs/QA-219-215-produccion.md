# Verificación en producción · #219/#215 — tránsito/recepción y checklist (demo)

Evidencia para los trackers **#219** (demo funcional) y **#215** (inventario/demo):
los dos flujos pedidos funcionan en la demo pública de producción, sin tocar
datos reales.

- **Base:** `https://app.moboss.online` · **versión verificada: v1.0.172**
- **Método:** Playwright headless sobre la demo anónima (Dueño demo); script
  reutilizable `e2e/prod/219-215-inventario.mjs`.
- **Resultado: 6/6 pasos, 0 hallazgos, 0 errores de consola.**
  Reporte y capturas: `docs/qa/219-215-produccion/`.

## Qué se verificó

| Paso | Resultado |
| --- | --- |
| Tránsito: la unidad en tránsito abre su recepción | Listado en tránsito con la unidad, modal de recepción con depósito destino y «Reimprimir etiqueta» (`03-recepcion-transito.jpg`). |
| Recepción confirmada | Aviso «…recibido en sucursal y disponible en stock» y la unidad **sale del listado de tránsito** en la misma pantalla (`04`, `05`). |
| Checklist: marcar y guardar | Ítems «Bien»/«Con observación», batería 91 %, ciclos 240 y repuesto no-OEM; al guardar aparece el **grado oficial (B)** con su puntaje y el progreso (`06`). |
| Checklist: persistencia | Al cerrar y reabrir la ficha se mantienen grado, puntaje y los repuestos no-OEM (`07`). |
| Verificación funcional | «✓ Verificado» deja la **firma del usuario demo** en la unidad (`08`). |

## Contrato de la demo (verificado, no es un bug)

La demo guarda las mutaciones **en memoria de la pestaña** (#204: nada toca base
ni `localStorage`; al recargar se vuelve al seed). Por eso la verificación mide
recepción y checklist **dentro del mismo documento**, que es donde el refresh de
la pantalla las refleja; la recarga reinicia los datos ficticios a propósito.
Los avisos de la app lo dicen en pantalla («Modo demo: datos ficticios…» /
«DEMO · NO SE GUARDÓ EN LA TIENDA»).

## Reproducir

```bash
node e2e/prod/219-215-inventario.mjs
# QA_APP=https://app.moboss.online (default) · QA_OUT=docs/qa/219-215-produccion
```

## Novedades para el dueño

- Se verificó en la web publicada que **recibir un equipo en tránsito** funciona
  en la demo: se elige el depósito, se confirma y el equipo deja de figurar en
  tránsito, con la etiqueta lista para reimprimir.
- El **checklist de inspección** también se probó de punta a punta: se marca,
  calcula grado y puntaje, y al cerrar y reabrir la ficha sigue ahí.
- La verificación física queda **firmada por el usuario demo**, así la demo
  muestra el flujo completo sin tocar datos reales (al recargar, la demo vuelve
  a su estado inicial a propósito).
