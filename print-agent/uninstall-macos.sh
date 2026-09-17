#!/usr/bin/env bash
# Desinstala el agente de impresión de MobOS de macOS. Deja la configuración y
# el historial en ~/.mobos-print por si querés reinstalarlo después.
set -euo pipefail

DESTINO="$HOME/Library/Application Support/MobOS Print"
PLIST="$HOME/Library/LaunchAgents/com.mobos.print.plist"

echo "Deteniendo el servicio…"
launchctl unload "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
rm -rf "$DESTINO"

echo "Agente desinstalado."
echo "Se conservan tus datos en ~/.mobos-print (config, cola e historial)."
echo "Para borrarlos del todo: rm -rf ~/.mobos-print"
