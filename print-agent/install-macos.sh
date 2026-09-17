#!/usr/bin/env bash
# Instala el agente de impresión de MobOS como servicio del usuario en macOS.
# Deja el agente arrancando al iniciar sesión y muestra el token para pegar en
# Configuración → Impresoras.
set -euo pipefail

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$HOME/Library/Application Support/MobOS Print"
PLIST="$HOME/Library/LaunchAgents/com.mobos.print.plist"
CONFIG="$HOME/.mobos-print/config.json"

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node 20 o superior. Instalalo con: brew install node" >&2
  exit 1
fi

NODE="$(command -v node)"
echo "Instalando el agente en: $DESTINO"
mkdir -p "$DESTINO" "$HOME/Library/LaunchAgents"
cp "$ORIGEN/server.mjs" "$ORIGEN/transportes.mjs" "$ORIGEN/cola.mjs" "$ORIGEN/config.mjs" "$ORIGEN/package.json" "$DESTINO/"

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
  <key>StandardOutPath</key><string>$HOME/.mobos-print/agente.log</string>
  <key>StandardErrorPath</key><string>$HOME/.mobos-print/agente.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"
sleep 2

echo
echo "Agente instalado y corriendo en http://127.0.0.1:17890"
if [[ -f "$CONFIG" ]]; then
  echo "Token (pegalo en Configuración → Impresoras):"
  "$NODE" -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).token)" "$CONFIG"
else
  echo "Revisá el log en ~/.mobos-print/agente.log"
fi
echo
echo "Si ya tenías una impresora configurada en el agente, no hace falta repetir nada."
