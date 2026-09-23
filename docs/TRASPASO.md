# Traspaso MobOS — estado al 20/09/2026

Documento de arranque para seguir trabajando desde otra computadora. Responde
tres cosas: **cómo se trabaja**, **qué está hecho** y **qué falta**, con las
recomendaciones para retomar sin contexto previo.

## 1. Qué hay en el repo

| Parte | Stack | Dónde |
| --- | --- | --- |
| App (panel del vendedor/dueño) | React 18 + Vite + Tailwind | `src/` |
| Backend (API) | Next.js 14 (App Router) + Prisma + PostgreSQL | `backend/` |
| Agente de impresión | Node ESM sin dependencias | `print-agent/` |
| Specs de cambios grandes | OpenSpec | `openspec/specs/`, `openspec/changes/archive/` |

Versión publicada en `main`: **v1.0.110**. El deploy lo hace el integrador con
`npm run release:publish` (webhook de Coolify).

## 2. Reglas de trabajo (duro)

### 2.1 Worktrees (agentes)

- Trabajás **solo en tu worktree y tu rama**; pusheás a `origin/<tu-rama>`. Nunca
  mergeás ni pusheás a `main` (el hook `pre-push` lo bloquea).
- **Rebase obligatorio** antes de empezar y antes de entregar:
  `git fetch origin --prune && git rebase origin/main`. Si el diff neto contra
  `origin/main` queda vacío, la rama quedó superseded: se descarta y se avisa.
- **Handover**: rama, `git log --oneline origin/main..HEAD`, qué hace cada commit,
  rutas tocadas y resultado de verificaciones.
- **Checks de entrega** antes de pushear:
  1. `npm run lint` (0 errores) · 2. `npm run build` + `npm --prefix backend run build`
  (con `backend/.next/BUILD_ID`) · 3. `npm --prefix backend run prisma:validate` ·
  4. `npm test` + `npm --prefix backend run test:unit` · 5. sin marcadores de conflicto ·
  6. rutas API: solo handlers, sin slugs duplicados, toda columna nueva con migración ·
  7. `npm run db:check` (compara la base real con el schema y muestra el SQL faltante) ·
  8. si tocás `print-agent/`: `npm run pack:agent` y commiteá el artefacto; gate
     anti-drift `npm run pack:agent:check`.
- **Migraciones**: aditivas, idempotentes y re-ejecutables (`IF NOT EXISTS`,
  guards por conteo + `ON CONFLICT`). Nunca editar una migración ya aplicada.
- **e2e**: la base y los puertos son compartidos; aislá con `MOBOS_E2E_PGDATA`,
  `MOBOS_E2E_PGPORT`, `MOBOS_E2E_API_PORT`, `MOBOS_E2E_WEB_PORT` únicos por rama.
  Gate rápido: `npm run test:e2e:smoke` (~20 s); suite completa: para el release.
- **Nunca matar procesos por puerto** (pueden ser de otro agente).
- Estado raro de git (refs rotas, fetch que falla): **parar y avisar**; no
  “arreglar” refs por cuenta propia.
- `hd` (rápido), `hdd` (completo) y `ht` (alias del completo) son comandos de
  Dario y son **exclusivos del integrador**; los modos y el **glosario en
  simple** están en `owncoding-ui/docs/COMANDOS.md` (v0.14.11).

### 2.2 Integrador (único que toca `main`)

- Mergea de a una rama, con verificación; pushea con `MOBOS_INTEGRATOR=1`.
- `hd` (rápido): fetch → relevar ramas → integrar + lint/builds/tests/smoke del
  dominio tocado → push → release. Sin suite completa ni smoke de producción.
- `hdd`/`ht` (completo): lo anterior + suite completa + CI verde →
  `npm run release:publish` → `npm run release:smoke` → cierres.
- Conflictos: **parar y consultar** con Dario, nunca resolver en silencio.
- Issues: cierra solo tras verificar por contenido contra `origin/main`, citando
  el commit que lo implementa.
- Refs rotas: backup a `/tmp` antes de tocar y reportar.

### 2.3 Objetos y convenciones predeterminadas

- Inventario de objetos reutilizables: `docs/PLANTILLA-OBJETOS.md`.
- Campos de formulario: `docs/CAMPOS.md` (skill **rdi**) y `docs/PLANTILLA-CAMPOS.md`.
- Tablas/listados: `docs/TABLAS.md`. Fotos de personas: `docs/AVATAR.md`.
- Tokens, enlaces y sesiones: `docs/TOKENS.md`. Impresión: `docs/IMPRESION.md`.
- Rediseño en curso: `docs/REDISENO.md`.
- Cada pedido vive como **issue** (backlog canónico); nada “de memoria”.

## 3. Entorno en la computadora nueva

- Node 24 + npm 11; PostgreSQL local (Homebrew `postgresql`); Playwright con
  navegadores instalados (`npx playwright install chromium`).
- Instalar dependencias en los tres proyectos: `npm i`, `npm --prefix backend i`,
  `npm --prefix print-agent i`.
- Hooks del repo: `bash scripts/setup-hooks.sh` (activa `.githooks`).
- Variables: `.env` raíz (`VITE_API_URL`) y `backend/.env` (`DATABASE_URL`,
  `MOBOS_APP_URL`, claves de AEX/email cuando correspondan).
- Comandos útiles: `npm run dev` · `npm run lint` · `npm test` ·
  `npm run test:e2e:smoke` · `npm run db:check` · `npm --prefix backend run test:unit`
  · `npm run pack:agent:check` · `npm run release:smoke` (integrador).

## 4. Impresión (lo más delicado del sistema)

- La app arma el ticket **ESC/POS** y el agente solo lo transporta. El agente
  decide LAN (TCP directo), CUPS o USB (`lp -o raw`) y tiene **cola honesta**
  (aceptado / confirmado / incierto, sin auto-reintento de lo incierto).
- **Puente remoto** (impresión desde el celular o cualquier PC): el agente abre
  una conexión saliente al backend (polling 2 s con token de puente); la app
  encola por HTTPS y el puente imprime y reporta. La config de impresoras y
  puentes es del backend por empresa (localStorage es caché); en la Mac del
  puente gana el camino local. Ver `openspec/specs/` (`remote-print-jobs`,
  `print-config-authority`, `print-agent-distribution`) y
  `openspec/changes/archive/2026-09-19-print-bridge-remoto/`.
- Instalación en la Mac del local (sin clonar el repo):
  `curl -fsSL https://api.moboss.online/print-agent/install.sh | bash -s -- --code ABCDE-FGHIJ`
  (el código se genera en la app: Configuración → Impresoras → puentes).
- macOS: si el agente corre por **launchd** y la impresora está en otra subred,
  hay que conceder **Red Local** (Ajustes → Privacidad y seguridad → Red local) y
  puede necesitar la IP secundaria/alias del puente.
- USB directo (`node-usb`): diseño y protocolo en `print-agent/USB-DIRECTO.md`,
  todavía no implementado.

## 5. Ramas y qué está pendiente de merge

- `main`: v1.0.110 (integrador).
- **`MOS-05` (worktree de esta sesión): 23 commits por encima de `origin/main`,
  ya pusheados.** Contenido: selector de sucursal (#58), títulos y menú (#57),
  popup de invitar (#53), auditoría completa (#59–#65), equipo/invitaciones/
  comisiones (#54–#56), impresión LAN y plantillas (#16, #17, #34), documentos no
  fiscales (#43) y USB directo (#23), consistencia y cuenta (#29, #12), listas de
  precios (#28) y etiqueta AEX (#3).
- Otros worktrees vistos: `impresion` (impresion-f1-f2), `mos-01`, `mos-03`,
  `mos-04`, `mos-06`, `os-inv-e2e`, `os-inv-fase3`.
- Nota de higiene: `#70` pide reconciliar la impresión unificada de MOS-01 con
  main; `#94` pide dividir features grandes en unidades de trabajo (los últimos
  lotes de MOS-05 agrupan varios issues por commit para no inflar la rama).

## 6. Pendientes agrupados (46 issues abiertos)

1. **Precios (#28 entregado en MOS-05):** bugs y deuda detectados en revisión —
   #76 (categoría con distinta capitalización), #77 y #92 (permisos del GET),
   #78 (null en items, PricingError sin mapear), #79 y #90 (moneda/fallback USD),
   #89 (mayúsculas/acentos en ítems por categoría), #80/#91/#93 (higiene y tests).
   **Recomendación:** mergear MOS-05 → arreglar primero #76, #77, #89 (rompen el
   uso real) → después #78/#79/#90 y cerrar con #93 (cobertura).
2. **Traspaso y docs:** #67 (estado de MOS-04), #69 (este traspaso), #73 (manual de
   trabajo), #88 (compendio de arranque).
3. **Deploy e infra:** #75 (producción está detrás de main: bloquea la página de
   pedido #66 y el portal), #74 (subdominio `clientes.moboss.online`), #71 (Google
   OAuth en el Hub), #87 (volumen `MOBOS_STORAGE_DIR` y scheduler de mantenimiento).
4. **Delivery y features nuevas:** #44 (delivery propio con rol y rendición), #81
   (recordatorios de cobranza por WhatsApp), #82 (campañas de recompra), #83
   (liquidación de comisiones con comprobante y QR), #85 (SIFEN), #86 (POS
   offline-first).
5. **Impresión / logística:** #17 (falta la prueba física en la Mac: permiso de
   Red Local + ticket en papel), #3 (pendientes del flujo AEX).
6. **Proceso:** #94 (dividir features grandes).
7. **Features de impresora nuevas (creadas el 20/09):** #95 multi-puente por
   sucursal (asignar qué puente imprime en cada sucursal, quedó fuera de alcance
   de `print-bridge-remoto`), #96 USB físico directo en serio (`node-usb`, hoy
   solo el diseño de #23), #97 etiquetas de producto/precio con código de barras,
   #98 impresión de reportes (cierre de caja y resumen del día).

## 7. Cómo retomar (orden sugerido)

1. Integrador: mergear `MOS-05` con el ciclo `ht` (23 commits, todo verificado y
   pusheado) y deployar.
2. Atacar los bugs de precios (#76, #77, #89) sobre la base ya mergeada.
3. #75 (deploy al día) para destrabar #66 y #74.
4. #44 (delivery) y #81–#83 (cobranzas/comisiones) como los siguientes features
   de producto.
5. #17: cuando estés frente a la Mac del local, concedé Red Local y hacé la
   prueba en papel; con eso se cierra.
