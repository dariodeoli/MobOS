# Traspaso MobOS — 15-10-2026 06:00 (hora de Paraguay)

## Cómo trabajamos
- El integrador (sesión con Dario) delega: escritores Sonnet en worktrees `codex/*`, QA Sonnet (plata/permisos/DB) o Haiku (pantalla), mapeador Haiku, arquitecto Opus solo para temas grandes. Reglas en `docs/traspaso/agents-shared.md` (copiar a `.claude/agents-shared.md`, excluido de git) — incluye el **plan de ahorro de tokens**.
- Máx. 3 agentes en archivos distintos. Una QA por tanda. Agente > 300k tokens → uno nuevo con brief de 10 líneas. Nunca `git checkout` en el checkout principal.
- Integración en **tandas**: rama `codex/tanda-N` que junta PRs, un CI (~20 min), `gh pr merge --merge --match-head-commit`, nunca `--admin`.
- Deploy: `npm run release:build-current` → `MOBOS_INTEGRATOR=1 npm run release:publish` → verificar web (hash del bundle) y API (una ruta nueva deja de dar 404) → `MOBOS_API_URL=https://api.moboss.online npm run release:smoke`. La API aplica migraciones al arrancar (`backend/Dockerfile`). Credenciales de deploy en el llavero (webhook a los dos UUID de Coolify + token).
- Horas siempre en hora de Paraguay. Commits sin atribución de IA. Reportes cortos en castellano.

## Estado de producción
- Versión 1.0.226, actualizada por tandas. Main `e6c370a5` (tanda 4) publicado 05:47. Todas las migraciones hasta `20270125000000_datos_caja_recepcion` aplicadas.
- Coolify (proyecto MobOS): `mobos-api`, `mobos-db`, `mobos-production`. Supabase viejo borrado. `MOBOS_PLATFORM_OWNER_EMAIL=dariodeoli@gmail.com`; variables Apple (team F65VS7VHB9, key Y232HM59NN) cargadas; las claves .p8 las pegó Dario.

## En curso
- #466 planilla de Unidades apretada (`codex/planilla-v2`).
- #455 vuelto registrado y caja por moneda (`codex/caja-moneda`) → requiere QA.

## Pendiente
- Conciliación automática por día/sucursal con colores (#451, plata → QA).
- Créditos de verificación IMEI: plan del arquitecto listo; faltan precios, cupo mensual, tope de acumulación, si PagaYa permite cobros únicos.
- Caja: diferencia con esperado guardado vs en vivo; borde de milisegundo entre turnos (QA tanda 4, bajos).
- Reembolso como saldo a favor no baja «Pagado»; tope de cobros tras reembolso parcial.
- App iOS (Capacitor) en pausa: hecho lo fácil (eliminar cuenta, /soporte, privacidad). `docs/IOS.md`.
- Release 1.0.227 con NOVEDADES completas de todo lo publicado desde 1.0.225.
- #448 restos: seña en reserva, Taller que entre en «Todo», barra de Stock en una fila. #461 restos menores.

## Preguntas abiertas para Dario
1. En computadora, «¿El cliente ya se llevó el producto?»: ¿en el detalle del pedido (hoy) o en el POS?
2. Créditos IMEI: precios, verificaciones por mes, tope de acumulación.
3. Menú de fila del stock a 28 px en escritorio: ¿ok o más grande?
