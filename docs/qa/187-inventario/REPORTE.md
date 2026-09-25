# Recorrido funcional de producción · Inventario / stock (#187)

- Base: https://app.moboss.online
- Versión desplegada: v1.0.169
- Fecha: 2026-09-25T15:17:17.471Z
- Método: Playwright headless (chromium) sobre la demo pública de producción

## Pasos

- ✅ **entrada a la demo como dueño** — versión 1.0.169 · perfiles demo visibles: true · capturas: 01-acceso-demo.jpg, 02-panel-demo.jpg
- ✅ **inventario: listado compacto de una línea, sin variante duplicada y con costo** — 23 filas de ≤44 px con las 7 columnas · primera: iPhone 15 Pro 256GB Titanio AUR000100000 0000 100% Distr… USD 0,00 D1 Disponible — Sin ver · capturas: 03-inventario-listado.jpg
- ✅ **inventario: búsqueda por IMEI y orden por modelo** — búsqueda por IMEI: 1 fila(s) · orden por modelo aplicado · capturas: 04-inventario-busqueda-imei.jpg, 05-inventario-orden-modelo.jpg
- ✅ **sync con POS: el modelo de Inventario aparece igual en el catálogo** — inventario: iPhone 15 Pro 256GB Titanio AUR000100000 0000 100% Distr… US · POS: iPhone 15 Pro 256GB 2 variantes · desde Gs 6.750.000 6 en st · capturas: 06-inventario-modelo-base.jpg, 07-pos-catalogo-modelo.jpg
- ✅ **carga rápida con costo diferido (USD/Gs) y proveedor** — campos completos · monedas: PYG, USD, BRL, EUR, USDT · alta simulada con aviso · capturas: 08-carga-rapida-form.jpg, 09-carga-rapida-guardada.jpg
- ✅ **ficha de la unidad: códigos (QR/barras), IMEI, acciones y cronología** — QR y barras visibles · IMEI y secciones completas · capturas: 10-unidad-ficha.jpg
- ✅ **reservas: listado con cliente y vencimiento** — 3 reservas con cliente, vencimiento y acciones · capturas: 11-reservas-listado.jpg
- ✅ **ubicaciones: código corto, sucursal y acciones** — Depósito 1/2 con código corto D1/D2, sucursal, unidades y acciones · capturas: 12-ubicaciones-listado.jpg
- ✅ **en tránsito: recepción con reimpresión de etiqueta (#220)** — unidad en tránsito: iPhone 12 128GB Verde AUR002400000 0000 100% Impor… USD 253, · recepción con depósito y reimpresión · capturas: 13-transito-listado.jpg, 14-recepcion-transito.jpg
- ✅ **vendidos: estados de entrega y comprobante** — vendidos con estados de entrega, UBI y acciones · capturas: 15-vendidos-listado.jpg
- ✅ **acciones masivas por lote** — selección de 2 unidades con acciones masivas visibles · capturas: 16-acciones-masivas.jpg
- ✅ **compartido y conteo rápido** — compartido con política visible y conteo rápido abierto · capturas: 17-compartido-panel.jpg, 18-conteo-rapido.jpg
- ✅ **el demo no llama al API del dominio** — 0 llamadas de impresión/inventario · 0 al API general (presence/avatar del shell)

## Hallazgos

- Sin hallazgos bloqueantes.

## Fuera de alcance (prueba física, en manos de Dario)

- #17 (launchd/IP secundaria + CUPS) y #96 (USB directo en la ZKP8008): checklist `docs/IMPRESION-PRUEBA-FISICA.md`.
- La impresión del dominio ya se verificó por separado (`docs/qa/impresion-prod/`).

Veredicto: 13/13 pasos OK · 0 llamadas de impresión · 0 hallazgos.

