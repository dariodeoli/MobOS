# Auditoría responsive de MobOS — landing y app

Fecha: 2026-10-18. Cobertura de viewport: 320×800, 360×800, 390×844, 414×896, 768×1024, 1024×768 y 1440×900.

## Resultado

La matriz cubrió 43 estados de la landing y la app: inicio, menú móvil, secciones IMEI/precio/FAQ/demo, `/resumen`, `/pos` y hoja «Más». Después del arreglo no se detectó overflow horizontal ni errores JavaScript en los casos medidos. El menú principal, header y sidebar mantienen el orden; a 320–768 px el shell usa header superior y navegación inferior; desde 1024 px usa sidebar fija de 224 px. El header de landing mide 73 px en móvil y 81 px desde 768 px.

El hallazgo corregido era el aviso fijo de métricas: su barra cubría el pie de landing —incluido «Desarrollado por Owncoding»— y contenido cercano al borde inferior en varios anchos. Ahora el aviso apila el texto y controles en móvil, deja el enlace y botón de cierre en áreas separadas, mantiene ambas áreas táctiles en al menos 44×44 px, y reserva su altura al final del documento con `padding-bottom` y `scroll-padding-bottom`. El contenedor fijo deja pasar eventos fuera de la tarjeta (`pointer-events: none`) y la tarjeta conserva interacción.

Las pruebas focales verifican los siete anchos y desplazan al final de la landing en 390 y 1440 px para comprobar que Owncoding queda completamente por encima del aviso. Resultado: 9/9 focales nuevas pasaron.

## Hallazgos que quedan fuera de este cambio

- No se encontró overflow horizontal de documento en los 43 estados. La banda de categorías de accesorios del POS es una región de desplazamiento horizontal interna intencional.
- Landing no mostró controles por debajo de 44 px en la matriz. En la app, los enlaces pequeños «Cómo funciona» (81×16 px) y «Ocultar» (51×16 px) del banner de demo aparecen entre 320 y 768 px. En POS a 768 px también hay controles/chips de 32–36 px; requieren una revisión aparte.
- El resumen muestra texto de KPI parcialmente recortado a 320/360 px. POS a 320–414 px y el resumen a 360 px tienen tarjetas inferiores parcialmente bajo la navegación fija al tomar la captura sin desplazamiento; la navegación y la barra de cobro ocupan sus capas esperadas. El menú «Más» usa un diálogo de pantalla completa con z-index 50 y la hoja de cobro/POS el nivel 30.
- Al recorrer secciones, una barra fija puede coincidir visualmente con contenido que queda en el borde inferior de esa vista. El espacio reservado permite llegar al final real y dejar accesible el pie; el aviso se puede cerrar. Este cambio no rediseña el resto de la densidad del POS.

## Evidencia visual

Capturas de la pasada completa inicial (antes del arreglo del aviso) y menú/app: [`captures/`](captures/). Capturas del aviso tras el arreglo:

- Móvil 320 px: [`consent-320-landing-after.png`](captures/consent-320-landing-after.png)
- Demo 390 px: [`consent-390-demo-after.png`](captures/consent-390-demo-after.png)
- Tablet 768 px: [`consent-768-landing-after.png`](captures/consent-768-landing-after.png)
- Escritorio 1440 px: [`consent-1440-landing-after.png`](captures/consent-1440-landing-after.png)

`coverage-before-fix.json` conserva las mediciones originales; `coverage.json` contiene las medidas después del arreglo. La matriz bloquea requests fuera de los dos hosts locales y `/api`; por eso los requests de fuentes y métricas aparecen como bloqueados y no forman parte de la prueba.

## Reproducir

Desde la raíz del repositorio:

```sh
npm ci
VITE_API_URL=http://127.0.0.1:1 npm run build
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/mobos-responsive-audit-key.pem \
  -out /tmp/mobos-responsive-audit-cert.pem -days 1 \
  -subj /CN=moboss.online
npx vite preview --config docs/qa/responsive-audit-566/preview.config.mjs
```

En otra terminal, con preview disponible en `https://moboss.online:5327` y `https://app.moboss.online:5327` (la matriz configura Chrome para resolver ambos hosts a `127.0.0.1`):

```sh
node docs/qa/responsive-audit-566/audit-matrix.mjs
node docs/qa/responsive-audit-566/capture-consent.mjs
```

Para repetir solo mediciones y evitar crear capturas grandes:

```sh
AUDIT_NO_SCREENSHOTS=1 node docs/qa/responsive-audit-566/audit-matrix.mjs
```

Regresión de aviso con el arnés E2E del repo:

```sh
npx playwright test e2e/frontend/aviso-privacidad.frontend.spec.js --project=core
```
