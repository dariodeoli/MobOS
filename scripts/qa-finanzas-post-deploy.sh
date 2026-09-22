#!/usr/bin/env bash
# Verificación post-deploy del dominio Finanzas: espera la versión publicada y
# corre todas las sondas re-ejecutables sobre producción (demo pública).
#
# Uso: bash scripts/qa-finanzas-post-deploy.sh [version]
#   (sin versión, usa la de version.json del checkout)
set -uo pipefail

VERSION="${1:-$(node -e 'console.log(JSON.parse(require("fs").readFileSync("version.json", "utf8")).version)')}"
APP="https://app.moboss.online"
OUT="docs/qa/produccion-$VERSION"

echo "== Esperando v$VERSION en producción =="
PROD=""
for _ in $(seq 1 40); do
  PROD="$(node scripts/qa-version.mjs 2>/dev/null | tail -1)"
  [ "$PROD" = "$VERSION" ] && break
  sleep 30
done
if [ "$PROD" != "$VERSION" ]; then
  echo "Producción sigue en $PROD (esperaba $VERSION)."
  exit 1
fi
echo "Producción en v$PROD ✓"

estado=0
correr() {
  local nombre="$1"; shift
  echo
  echo "== $nombre =="
  if ! "$@"; then estado=1; fi
}

correr "release:smoke" npm run release:smoke
correr "§9 montos" env QA_BASE_URL="$APP" QA_OUT="$OUT/montos" node scripts/qa-148-montos-produccion.mjs
correr "§17/§18/§19" env QA_BASE_URL="$APP" QA_OUT="$OUT/148-17-18-19" node scripts/qa-148-17-18-19-produccion.mjs
correr "§18 ventas por caja" env QA_SOLO_DEMO=1 QA_BASE_URL="$APP" QA_OUT="$OUT/ventas-por-caja" node scripts/qa-148-ventas-por-caja.mjs
correr "§18 analytics" env QA_SOLO_DEMO=1 QA_BASE_URL="$APP" QA_OUT="$OUT/analytics" node scripts/qa-148-analytics-pos.mjs
correr "recorrido #185" env QA_BASE_URL="$APP" QA_OUT="docs/qa/185/produccion-$VERSION" node scripts/qa-185-finanzas-demo.mjs
correr "Resumen/Análisis (#171)" env QA_BASE_URL="$APP" node scripts/qa-171-resumen-analisis-produccion.mjs
correr "último usado (#209)" env QA_BASE_URL="$APP" node scripts/qa-209-finanzas-produccion.mjs

echo
if [ "$estado" -eq 0 ]; then
  echo "Verificación post-deploy del dominio Finanzas v$VERSION: TODO OK"
else
  echo "Verificación post-deploy del dominio Finanzas v$VERSION: hay fallos (ver arriba)"
fi
exit "$estado"
