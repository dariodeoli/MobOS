#!/usr/bin/env bash
# Desinstala el agente de impresión de MobOS de macOS. Deja la configuración y
# el historial en ~/.mobos-print por si querés reinstalarlo después. Si quedó
# una IP secundaria agregada por red-mac.sh, la quita (reversible y sin tocar
# la IP principal ni el DHCP).
set -euo pipefail

DESTINO="$HOME/Library/Application Support/MobOS Print"
PLIST="$HOME/Library/LaunchAgents/com.mobos.print.plist"

echo "Deteniendo el servicio…"
launchctl unload "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"

# Saca el permiso sudoers de la IP secundaria si quedó instalado.
if [[ -f /etc/sudoers.d/mobos-print ]]; then
  echo "Quitando el permiso de red automática (pide contraseña)…"
  sudo rm -f /etc/sudoers.d/mobos-print 2>/dev/null || true
fi
# Saca la cola CUPS de red si existe.
if lpstat -p 2>/dev/null | grep -q "printer MobOS_LAN"; then
  sudo lpadmin -x MobOS_LAN 2>/dev/null || true
fi

# Quita la IP secundaria si todavía existe el script de red (acá o en el destino).
RED_MAC=""
if [[ -f "$DESTINO/red-mac.sh" ]]; then RED_MAC="$DESTINO/red-mac.sh"; fi
if [[ -z "$RED_MAC" ]]; then
  ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  [[ -f "$ORIGEN/red-mac.sh" ]] && RED_MAC="$ORIGEN/red-mac.sh"
fi
if [[ -n "$RED_MAC" ]]; then
  echo "Quitando la IP secundaria de la impresora si estaba agregada…"
  bash "$RED_MAC" quitar >/dev/null 2>&1 || true
fi

rm -rf "$DESTINO"

echo "Agente desinstalado."
echo "Se conservan tus datos en ~/.mobos-print (config, cola e historial)."
echo "Para borrarlos del todo: rm -rf ~/.mobos-print"
