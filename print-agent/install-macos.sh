#!/usr/bin/env bash
# Instala el agente de impresión de MobOS como servicio del usuario en macOS.
# Deja el agente arrancando al iniciar sesión, configura la impresora conocida
# (192.168.1.23:9100, 80 mm) y avisa si la red todavía no está lista.
set -euo pipefail

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$HOME/Library/Application Support/MobOS Print"
PLIST="$HOME/Library/LaunchAgents/com.mobos.print.plist"
CONFIG_DIR="$HOME/.mobos-print"
CONFIG="$CONFIG_DIR/config.json"
IMPRESORA="192.168.1.23"
PUERTO="9100"
# Token y ancho opcionales: si los pasás, quedan fijados; el ancho por defecto
# es 58 mm (el rollo que se usa en el local) y con MOBOS_PRINT_ANCHO=80 se cambia.
TOKEN="${MOBOS_PRINT_TOKEN:-}"
ANCHO="${MOBOS_PRINT_ANCHO:-58}"

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node 20 o superior. Instalalo con: brew install node" >&2
  exit 1
fi

NODE="$(command -v node)"
echo "Instalando el agente en: $DESTINO"
mkdir -p "$DESTINO" "$HOME/Library/LaunchAgents" "$CONFIG_DIR"
cp "$ORIGEN/server.mjs" "$ORIGEN/transportes.mjs" "$ORIGEN/cola.mjs" "$ORIGEN/config.mjs" "$ORIGEN/package.json" "$DESTINO/"

# Impresora conocida: LAN de la ZKP8008 con ancho 80 mm.
if [[ ! -f "$CONFIG" || -n "$TOKEN" ]]; then
  "$NODE" -e "
    const fs = require('fs')
    const [ruta, token] = process.argv.slice(1)
    let actual = {}
    try { actual = JSON.parse(fs.readFileSync(ruta, 'utf8')) } catch { actual = {} }
    const config = {
      ...actual,
      impresora: 'lan:${IMPRESORA}:${PUERTO}',
      ancho: ${ANCHO},
      copias: actual.copias || 1,
      reintentos: actual.reintentos || 5,
      esperaMs: actual.esperaMs || 15000,
      lan: ['lan:${IMPRESORA}:${PUERTO}'],
    }
    if (token) config.token = token
    fs.writeFileSync(ruta, JSON.stringify(config, null, 2) + '\\n')
  " "$CONFIG" "$TOKEN"
  if [[ -n "$TOKEN" ]]; then
    echo "Configuración lista con la impresora lan:${IMPRESORA}:${PUERTO} (${ANCHO} mm) y el token indicado."
  else
    echo "Configuración creada con la impresora lan:${IMPRESORA}:${PUERTO} en ${ANCHO} mm."
  fi
else
  echo "Configuración existente: no se toca (pasá MOBOS_PRINT_TOKEN o MOBOS_PRINT_ANCHO para cambiarla)."
fi

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.mobos.print</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DESTINO/server.mjs</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$CONFIG_DIR/agente.log</string>
  <key>StandardErrorPath</key><string>$CONFIG_DIR/agente.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"
sleep 2

echo
echo "Agente corriendo en http://127.0.0.1:17890"
if [[ -f "$CONFIG" ]]; then
  echo "Token (pegalo en Configuración → Impresoras):"
  "$NODE" -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).token || '')" "$CONFIG"
fi

echo
echo "Red: la Mac y la impresora tienen que estar en la misma subred."
if command -v nc >/dev/null 2>&1 && nc -z -G 2 "$IMPRESORA" "$PUERTO" >/dev/null 2>&1; then
  echo "  ✓ La impresora $IMPRESORA:$PUERTO responde desde esta Mac."
  echo "    Siguiente paso: Configuración → Impresoras → Imprimir prueba."
else
  echo "  ✗ La impresora $IMPRESORA:$PUERTO NO responde desde esta Mac."
  echo "    Lo ideal es que el router y la impresora compartan la subred (192.168.1.x);"
  echo "    cambiar la IP de la Mac a mano solo sirve si esa red existe de verdad."
  echo "    Cuando estén en la misma red, tocá “Actualizar estado” en la app."
fi
