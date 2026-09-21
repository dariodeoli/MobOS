# QA #201/#209/#210/#223 — Verificación post-deploy (v1.0.134)

- **Superficie verificada:** `https://app.moboss.online/demo` (demo anónima),
  versión observada **v1.0.134**.
- **Verificador reutilizable:** `scripts/qa-201-210-plataforma-produccion.mjs`
  (`QA_BASE_URL` cambia la base; `QA_OUT` dónde deja la evidencia) →
  `docs/qa/201-210-produccion/resultados.json` + 10 capturas.
- **Sin sesión real ni datos de tiendas:** solo la demo pública.

## Resultado (9/9 · 0 fallos · 0 llamadas al API · 0 errores de consola)

| Paso | Estado | Detalle | Captura |
| --- | --- | --- | --- |
| Bloqueo en claro (#210) | ✅ | Logo MobOS (`/logo.svg`), avatar de la persona (iniciales en demo, sin foto rota) y PIN auto-validado con 3001 | `01` |
| Último usado (#209) | ✅ | Documentación arranca en `Todo`, POS queda recordado al volver (navegación SPA) y **no** escribe en `localStorage` en demo | `02`, `03` |
| Demo sin persistencia (#201) | ✅ | Dos guardados reales (integrante y plantilla): sin claves nuevas en localStorage/sessionStorage/IndexedDB/cookies/cachés | `04` |
| Recarga descarta (#201) | ✅ | Los guardados ficticios desaparecen y el último usado vuelve al default | `05` |
| Cero llamadas al API (#201) | ✅ | Ninguna request a `/api/` en todo el recorrido | — |
| **Topbar solo marca (#223)** | ✅ | `shell-tienda` y la miga móvil muestran **MobOS** (la miga se ve en mayúsculas por estilo); la identidad de la empresa («MobOS Tienda Demo») sigue en el menú | `06`, `07`, `08` |
| Bloqueo en oscuro (#210) | ✅ | Sobre fondo oscuro el logo claro (`/logo-dark.svg`) | `09` |
| Bloqueo en móvil (#210) | ✅ | Tarjeta completa a 390 px con logo y avatar | `10` |
| Bundle desplegado | ✅ | El bundle publicado expone `lock-logo-empresa`, `mobos:ultimo:`, `mobos:ultimo-usado` y `sucursal-activa` | — |

## No verificable sin sesión real (pasos manuales)

- **Foto subida y logo de tienda reales**: entrar a `/login` con empresa + PIN;
  subir foto en Mi identidad y logo en Configuración → Negocio; bloquear la
  pantalla (menú de tres puntos) y mirar foto + logo en claro/oscuro.
- **PresencePill con la foto de todas las personas**: requiere sesión real con
  2+ personas en línea (la demo no comparte presencia, #192). La cobertura
  local está en `e2e/shell-roles.spec.js` (foto subida, iniciales y nombre
  corto con la presencia mockeada).
- **Topbar en cuenta real**: usa el mismo `AppShell` que la demo, así que la
  marca se verificó ahí; en una cuenta real solo cambia `empresa.nombre`, que
  ya no participa del encabezado.

## Cómo repetir la verificación

```bash
# Producción (capturas + resultados.json; exit 1 si hay fallos reales)
node scripts/qa-201-210-plataforma-produccion.mjs

# Cualquier deploy alternativo
QA_BASE_URL=https://mi-deploy.example node scripts/qa-201-210-plataforma-produccion.mjs
```
