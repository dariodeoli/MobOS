#!/usr/bin/env bash
# Saca las MISMAS pantallas de la app de iPhone (simulador) y de la web móvil
# (Playwright, 390x844, demo) y las junta lado a lado para comparar a mano.
#
#   bash scripts/ios-paridad-capturas.sh [salida]        (por defecto /tmp/mobos-paridad)
#
# Variables:
#   SKIP_BUILD=1      reutiliza dist/ y el .app ya compilados (solo recaptura)
#   SIM_NAME          nombre del simulador propio (por defecto mobos-paridad-390 = iPhone 16e, 390x844)
#   PUERTO_PUENTE     puerto del puente de QA (5433) · PUERTO_WEB  puerto del vite de la web (5431)
#
# Cómo funciona (solo QA, nada de esto entra a la app de tienda):
#  1. build:ios (VITE_PLATFORM=ios) y xcodebuild para simulador. ML Kit no trae arm64 de
#     simulador (docs/IOS-APP.md): se quita del Podfile SOLO durante la corrida y se restaura.
#  2. La copia del .app que se instala en el simulador apunta (server.url) a
#     scripts/ios-paridad-puente.mjs, que sirve dist/ por HTTP y deja ejecutar los pasos de
#     scripts/ios-paridad-pasos.mjs DENTRO de la WebView real (WKWebView de la app).
#  3. La web corre los mismos pasos en Chromium móvil (scripts/ios-paridad-web.mjs).
#  4. scripts/ios-paridad-comparar.mjs arma un PNG por pantalla: simulador | web.
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SALIDA="${1:-/tmp/mobos-paridad}"
SIM_NAME="${SIM_NAME:-mobos-paridad-390}"
PUERTO_PUENTE="${PUERTO_PUENTE:-5433}"
PUERTO_WEB="${PUERTO_WEB:-5431}"
DD="/tmp/mobos-ios-dd-paridad"
APP_COPIA="/tmp/mobos-app-puente/App.app"
PIDS=()
cd "$RAIZ"

limpiar() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  # Restaura el Podfile (se toca solo durante la compilación del simulador).
  [ -f /tmp/Podfile.paridad.bak ] && cp /tmp/Podfile.paridad.bak ios/App/Podfile
  [ -f /tmp/Podfile.lock.paridad.bak ] && cp /tmp/Podfile.lock.paridad.bak ios/App/Podfile.lock
  rm -f /tmp/Podfile.paridad.bak /tmp/Podfile.lock.paridad.bak
}
trap limpiar EXIT

# 1) Compilar la app para el simulador (arm64, sin ML Kit).
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "== build:ios"
  npm run build:ios >/tmp/paridad-build-ios.log 2>&1 || { tail -20 /tmp/paridad-build-ios.log; exit 1; }
  cp ios/App/Podfile /tmp/Podfile.paridad.bak; cp ios/App/Podfile.lock /tmp/Podfile.lock.paridad.bak
  sed -i '' '/CapacitorMlkitBarcodeScanning/d' ios/App/Podfile
  (cd ios/App && pod install >/tmp/paridad-pod.log 2>&1)
  echo "== xcodebuild (simulador)"
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO build >/tmp/paridad-xcodebuild.log 2>&1 \
    || { tail -30 /tmp/paridad-xcodebuild.log; exit 1; }
  cp /tmp/Podfile.paridad.bak ios/App/Podfile; cp /tmp/Podfile.lock.paridad.bak ios/App/Podfile.lock
  rm -f /tmp/Podfile.paridad.bak /tmp/Podfile.lock.paridad.bak
fi

# 2) Simulador propio (no se toca el de otros agentes) con la copia que apunta al puente.
SIM="$(xcrun simctl list devices | awk -v n="$SIM_NAME" '$0 ~ n" \\(" { match($0, /\([0-9A-F-]{36}\)/); print substr($0, RSTART+1, RLENGTH-2); exit }')"
if [ -z "$SIM" ]; then
  SIM="$(xcrun simctl create "$SIM_NAME" com.apple.CoreSimulator.SimDeviceType.iPhone-16e com.apple.CoreSimulator.SimRuntime.iOS-27-0)"
fi
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || true
rm -rf /tmp/mobos-app-puente && mkdir -p /tmp/mobos-app-puente
cp -R "$DD/Build/Products/Debug-iphonesimulator/App.app" "$APP_COPIA"
node -e "const f=process.argv[1];const fs=require('fs');const c=JSON.parse(fs.readFileSync(f));c.server={url:'http://127.0.0.1:'+process.argv[2],cleartext:true};fs.writeFileSync(f,JSON.stringify(c,null,2))" "$APP_COPIA/capacitor.config.json" "$PUERTO_PUENTE"
xcrun simctl terminate "$SIM" online.moboss.app 2>/dev/null || true
xcrun simctl install "$SIM" "$APP_COPIA"
xcrun simctl status_bar "$SIM" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3

# 3) Puente + app.
node scripts/ios-paridad-puente.mjs "$PUERTO_PUENTE" >/tmp/paridad-puente.log 2>&1 & PIDS+=("$!")
sleep 1
xcrun simctl launch "$SIM" online.moboss.app >/dev/null
echo "== esperando a la app"
for _ in $(seq 1 40); do
  if echo "return 1" | curl -s --max-time 25 --data-binary @- "http://127.0.0.1:$PUERTO_PUENTE/__paridad/run" | grep -q '"ok":true'; then break; fi
  sleep 2
done
sleep 5   # deja que termine el arranque nativo (splash, Keychain)

echo "== capturas del simulador"
SIM="$SIM" OUT="$SALIDA/ios" PUENTE="http://127.0.0.1:$PUERTO_PUENTE" node scripts/ios-paridad-ios.mjs

# 4) Web móvil (vite propio salvo que BASE_URL ya apunte a uno).
if [ -z "${BASE_URL:-}" ]; then
  npm run dev -- --host 127.0.0.1 --port "$PUERTO_WEB" --strictPort >/tmp/paridad-vite.log 2>&1 & PIDS+=("$!")
  for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PUERTO_WEB/" && break; sleep 1; done
  BASE_URL="http://127.0.0.1:$PUERTO_WEB"
fi
echo "== capturas de la web móvil"
BASE_URL="$BASE_URL" OUT="$SALIDA/web" node scripts/ios-paridad-web.mjs

echo "== lado a lado"
node scripts/ios-paridad-comparar.mjs "$SALIDA/ios" "$SALIDA/web" "$SALIDA/lado-a-lado"
echo "Listo: $SALIDA/lado-a-lado"
