# Traspaso MobOS — 14-10-2026

Para seguir en otra computadora. Todo el código está en GitHub (`main`); no queda trabajo solo en la compu anterior.

## Arranque en la compu nueva

```bash
gh repo clone dariodeoli/MobOS && cd MobOS
npm ci && (cd backend && npm ci)
```

- Reglas de agentes, roles y modelos: `docs/traspaso/agents-shared.md`. Copiarlo a `.claude/agents-shared.md` y excluirlo en `.git/info/exclude`.
- Planes: `mobos-redesign-plan.md`, `mobos-redesign-audit.md`, `mobos-multiempresa-plan.md` (esta carpeta).
- Sala de agentes: https://claude.ai/artifact/NvU6kwMEAoTv4cUqw4KLHx#mobos. Escribir solo en `apps/mobos/{agents,events,releases,meta}` y actualizar `apps/mobos.ultimaActividad` en cada hito.
- Si Xcode git falla al hacer merge ("stash failed"), usar `/Library/Developer/CommandLineTools/usr/bin/git`.

## Producción

- 14-10 12:55Z: v1.0.225 con #379 (gráficos, login, animaciones, códigos, campos, header) verificada con smoke y health.
- #380 multiempresa (#377) mergeado. Publicación en curso al escribir esto. Al arrancar, comprobar que `checkedAt` de `https://api.moboss.online/api/health` sea posterior a 13:00Z. La migración `20270104000000_tenant_membership` corre al arrancar el backend.
- Publicar: `npm run release:build-current` y luego `MOBOS_INTEGRATOR=1 npm run release:publish`, después `npm run release:smoke`. Verificar el deploy de `mobos-api` en Coolify.

## PRs abiertos

- #381 e2e global-setup (#364) y #382 POS paginado en servidor + badges (#354, #357). Rama actualizada con main; mergear cuando el CI esté verde (`gh pr merge N --merge --match-head-commit <sha>`, sin `--admin`).

## Issues

Implementados pero sin cerrar: verificar en prod y cerrar.
#351 #352 #355 #356 (parcial: compactar shell para que la primera unidad quede a ≤200 px) #358 #359 #360 #365 #371 #372 #373 #374 #375 #376 #377.

Pendientes reales, en orden:
1. #367 versión 1.0.226 y fecha en NOVEDADES (después de #381/#382).
2. #370 análisis UX/responsive completo (360/390 px).
3. #361 presencia del equipo en línea.
4. #362 #363 componentes owncoding-ui (RUC compacto, BuscadorProveedor, BancoCombobox).
5. #366 / #17 cola CUPS e impresión física (requiere la impresora).
6. #350 demo completa (Dario: dejar para el final).
7. #353 Analytics del POS: decisión de Dario pendiente (¿mover a Análisis?).
8. Anteriores: #345 #344 #343 #342 #341 #87 #85 #74 #3.

## Decisiones vigentes

- Por defecto el vendedor ve costos; el admin lo cambia en Configuración > Permisos.
- Multiempresa: el PIN se salta solo si el vendedor actual es el usuario vinculado de la cuenta. Cada empresa tiene su propio plan. Los MEMBER ven el selector solo si tienen 2 o más empresas.
- Máximo 3 agentes en paralelo, mobile primero, un writer por rama.
