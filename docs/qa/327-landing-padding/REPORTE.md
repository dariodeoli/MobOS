# #327 · Landing móvil: aire del hero

Pedido de Dario (issue **#327**): en mobile/tablet sobraba aire entre el header
sticky y la pill «Operación completa para tiendas móviles» (hero `#inicio`).

## Qué se cambió

- `src/pages/Landing.jsx`: el contenedor del hero pasa de `pt-16` (64 px) a
  `pt-8` (32 px) en mobile/tablet; el desktop no cambia (`lg:py-24`).
- La sección `#inicio` suma `scroll-mt-20` (igual que el resto de las
  secciones): sin eso, el salto al ancla con el header sticky dejaba la pill
  tapada por el header (73 px de alto) aun con el aire viejo.
- No se tocó copy, colores, componentes compartidos ni otras secciones.

## Medición (borde inferior del header → borde superior de la pill)

| Ancho | Antes | Después |
| --- | --- | --- |
| 360 px | 64 px | **32 px** |
| 390 px | 64 px | **32 px** |
| 414 px | 64 px | **32 px** |
| 768 px | 64 px | **32 px** |

Header sticky: 73 px de alto; con el fix la pill queda a 105 px del borde
superior (antes 137 px).

## Evidencia

- Capturas: `antes/hero-{claro,oscuro}-390.png` y
  `despues/hero-{claro,oscuro}-390.png` (viewport 390×844, con la página arriba
  de todo).
- Salto al ancla `#inicio` (logo): `antes/hero-ancla-*.png` (el header tapaba la
  pill) y `despues/hero-ancla-*.png` (queda debajo del header).
- Spec: `e2e/qa-327-landing-hero.spec.js` (proyecto `core`) — mide el aire en
  360/390/414/768 (entre 8 y 40 px), captura claro/oscuro y verifica el ancla.
  Para refrescar la evidencia: `MOBOS_CAPTURAS=docs/qa/327-landing-padding/despues`.
- Cobertura relacionada en verde: `e2e/qa-322-landing.spec.js` (recorrido móvil
  de la landing) y la entrada «landing» de `e2e/dsn-responsive-mobile.spec.js`.
