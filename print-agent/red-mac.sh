#!/usr/bin/env bash
# Red de la impresora en macOS: agrega una IP secundaria en la subred de la
# impresora SIN tocar la IP principal ni el DHCP, así internet sigue andando.
#
#   bash red-mac.sh estado      # interfaz, IPs, alias, alcance e internet
#   bash red-mac.sh agregar     # agrega 192.168.1.100/24 a la interfaz activa (pide sudo)
#   bash red-mac.sh quitar      # la saca (reversible)
#
# Variables opcionales: MOBOS_PRINT_IMPRESORA, MOBOS_PRINT_ALIAS, MOBOS_PRINT_MASCARA,
# MOBOS_PRINT_IFACE (si no se pasa, se detecta la interfaz de la ruta por defecto).
set -euo pipefail

IMPRESORA="${MOBOS_PRINT_IMPRESORA:-192.168.1.23}"
PUERTO="${MOBOS_PRINT_PUERTO:-9100}"
ALIAS="${MOBOS_PRINT_ALIAS:-192.168.1.100}"
MASCARA="${MOBOS_PRINT_MASCARA:-255.255.255.0}"

iface() {
  if [[ -n "${MOBOS_PRINT_IFACE:-}" ]]; then echo "$MOBOS_PRINT_IFACE"; return; fi
  route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}'
}

alias_presente() {
  local i; i="$(iface)"
  [[ -n "$i" ]] && ifconfig "$i" 2>/dev/null | grep -q "inet $ALIAS"
}

internet_ok() {
  route -n get default 2>/dev/null | grep -q "gateway:"
}

estado() {
  local i; i="$(iface)"
  echo "Interfaz activa (Wi-Fi/Ethernet): ${i:-desconocida}"
  ifconfig "${i:-en0}" 2>/dev/null | awk '/inet /{print "  IP:", $2}'
  if alias_presente; then
    echo "  IP secundaria: $ALIAS (agregada)"
  else
    echo "  IP secundaria: $ALIAS (no agregada)"
  fi
  if internet_ok; then
    echo "Internet: ruta por defecto presente ✓"
  else
    echo "Internet: sin ruta por defecto ✗ (la IP principal y el DHCP no se tocan)"
  fi
  echo -n "Impresora $IMPRESORA:$PUERTO → "
  if command -v nc >/dev/null 2>&1 && nc -z -G 2 "$IMPRESORA" "$PUERTO" >/dev/null 2>&1; then
    echo "responde ✓"
  else
    echo "no responde ✗"
  fi
}

case "${1:-estado}" in
  estado)
    estado
    ;;
  agregar)
    i="$(iface)"
    if [[ -z "$i" ]]; then echo "No pude detectar la interfaz; pasá MOBOS_PRINT_IFACE=en0" >&2; exit 1; fi
    if alias_presente; then
      echo "La IP $ALIAS ya está en $i."
    else
      echo "Agregando $ALIAS/$MASCARA a $i (pide contraseña de administrador)…"
      sudo ifconfig "$i" alias "$ALIAS" netmask "$MASCARA"
    fi
    sleep 1
    estado
    echo
    echo "Nota: la IP principal sigue por DHCP y el internet no cambia. La IP"
    echo "secundaria se pierde al reiniciar o cambiar de red: volvé a correr «agregar»"
    echo "o pedí que el instalador la recree (MOBOS_PRINT_ALIAS=1)."
    ;;
  quitar)
    i="$(iface)"
    if [[ -z "$i" ]]; then echo "No pude detectar la interfaz; pasá MOBOS_PRINT_IFACE=en0" >&2; exit 1; fi
    if alias_presente; then
      echo "Quitando $ALIAS de $i…"
      sudo ifconfig "$i" -alias "$ALIAS" 2>/dev/null || true
    else
      echo "La IP $ALIAS no estaba agregada."
    fi
    sleep 1
    estado
    ;;
  *)
    echo "Uso: bash red-mac.sh [estado|agregar|quitar]" >&2
    exit 1
    ;;
esac
