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
# Token y ancho opcionales: si los pasás, quedan fijados. El ancho predeterminado
# es 80 mm (papel estándar de la ZKP8008); con MOBOS_PRINT_ANCHO=58 se cambia.
TOKEN="${MOBOS_PRINT_TOKEN:-}"
ANCHO="${MOBOS_PRINT_ANCHO:-80}"

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node 20 o superior. Instalalo con: brew install node" >&2
  exit 1
fi

NODE="$(command -v node)"
echo "Instalando el agente en: $DESTINO"
mkdir -p "$DESTINO" "$HOME/Library/LaunchAgents" "$CONFIG_DIR"
cp "$ORIGEN/server.mjs" "$ORIGEN/transportes.mjs" "$ORIGEN/cola.mjs" "$ORIGEN/config.mjs" "$ORIGEN/package.json" "$ORIGEN/red-mac.sh" "$DESTINO/"

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

# Permiso sin prompt para recrear la IP secundaria al iniciar la Mac (red de la
# impresora). Se valida con visudo antes de tocar /etc/sudoers.d.
IFACE_ACTIVA="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
IFACE_ACTIVA="${IFACE_ACTIVA:-en0}"
ALIAS="${MOBOS_PRINT_ALIAS:-192.168.1.100}"
MASCARA="${MOBOS_PRINT_MASCARA:-255.255.255.0}"
SUDOERS_TMP="$(mktemp)"
printf '%s ALL=(root) NOPASSWD: /sbin/ifconfig %s alias %s netmask %s, /sbin/ifconfig %s -alias %s\n' "$USER" "$IFACE_ACTIVA" "$ALIAS" "$MASCARA" "$IFACE_ACTIVA" "$ALIAS" > "$SUDOERS_TMP"
echo "Instalando el permiso de red (IP secundaria automática al iniciar sesión; pide tu contraseña)…"
if sudo /usr/sbin/visudo -c -f "$SUDOERS_TMP" >/dev/null 2>&1 && sudo cp "$SUDOERS_TMP" /etc/sudoers.d/mobos-print && sudo chmod 440 /etc/sudoers.d/mobos-print; then
  echo "  Permiso instalado: la IP secundaria $ALIAS se recrea sola al iniciar la Mac."
  bash "$DESTINO/red-mac.sh" auto
else
  echo "  No se pudo instalar el permiso (contraseña cancelada o sudo no disponible)."
  echo "  Alternativa: corré «bash red-mac.sh agregar» cada vez que reinicies la Mac."
fi
rm -f "$SUDOERS_TMP"

# Cola CUPS de red (fallback cuando macOS bloquea la salida directa del agente):
# el daemon CUPS del sistema habla con la impresora por socket.
COMANDO_CUPS="sudo lpadmin -p MobOS_LAN -E -v socket://$IMPRESORA:$PUERTO -m raw"
if ! lpstat -p 2>/dev/null | grep -q "printer MobOS_LAN"; then
  echo "Creando la cola de red MobOS_LAN (socket://$IMPRESORA:$PUERTO)…"
  echo "  Puede pedirte la contraseña de administrador:"
  if sudo lpadmin -p MobOS_LAN -E -v "socket://$IMPRESORA:$PUERTO" -m raw; then
    echo "  Cola CUPS lista: MobOS_LAN → socket://$IMPRESORA:$PUERTO"
  else
    echo
    echo "  ⚠ No se pudo crear la cola CUPS (falta permiso de administrador)."
    echo "  Copiá y ejecutá este comando exacto en la Terminal del puente:"
    echo
    echo "      $COMANDO_CUPS"
    echo
    echo "  Después verificá que exista:  lpstat -p | grep MobOS_LAN"
    echo "  Con la cola creada, la app la usa como respaldo automático ante EHOSTUNREACH."
  fi
else
  echo "Cola de red MobOS_LAN ya existe."
fi

echo
echo "Agente corriendo en http://127.0.0.1:17890"
if [[ -f "$CONFIG" ]]; then
  echo "Token (pegalo en Configuración → Impresoras):"
  "$NODE" -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).token || '')" "$CONFIG"
fi

IP_LAN="$(ipconfig getifaddr "$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')" 2>/dev/null || true)"
echo
echo "Puente de impresión (esta Mac):"
echo "  En esta computadora:  http://127.0.0.1:17890"
[[ -n "$IP_LAN" ]] && echo "  En las demás computadoras y móviles (misma red): http://${IP_LAN}:17890"
echo "  Si macOS pregunta si Node puede aceptar conexiones entrantes, aceptá (Firewall)."
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
