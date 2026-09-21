#!/usr/bin/env bash
# Instalador del agente de impresión de MobOS sin clonar el repo:
#   curl -fsSL https://api.moboss.online/print-agent/install.sh | bash -s -- --code ABCDE-FGHIJ
# Descarga el tarball versionado que publica el backend, verifica su SHA-256
# antes de extraer, valida la allow-list y recién ahí ejecuta el agente y lo
# vincula. No ejecuta nada del paquete antes de que el checksum coincida.
# Desarrollo: `bash print-agent/install.sh --from-repo` usa install-macos.sh.
set -euo pipefail

API="${MOBOS_PRINT_API_URL:-https://api.moboss.online}"
DESTINO="${MOBOS_PRINT_INSTALL_DIR:-$HOME/Library/Application Support/MobOS Print}"
DIR_CONFIG="${MOBOS_PRINT_DIR:-$HOME/.mobos-print}"
PLIST="$HOME/Library/LaunchAgents/com.mobos.print.plist"
CODIGO=""
SERVICIO=1
DESDE_REPO=0
ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" && pwd)"

uso() {
  echo "Uso: install.sh [--code ABCDE-FGHIJ] [--api-url URL] [--dir RUTA] [--no-service] [--from-repo]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --code|--codigo) CODIGO="${2:-}"; shift 2 ;;
    --api-url) API="${2:-}"; shift 2 ;;
    --dir) DESTINO="${2:-}"; shift 2 ;;
    --no-service|--sin-servicio) SERVICIO=0; shift ;;
    --from-repo|--desde-repo) DESDE_REPO=1; shift ;;
    -h|--help) uso; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; uso; exit 1 ;;
  esac
done
API="${API%/}"

# Camino de desarrollo: el instalador del repo sigue usando install-macos.sh.
if [[ "$DESDE_REPO" == "1" ]]; then
  if [[ -f "$ORIGEN/install-macos.sh" ]]; then
    exec bash "$ORIGEN/install-macos.sh"
  fi
  echo "No se encontró install-macos.sh junto a este instalador (--from-repo necesita el repo clonado)." >&2
  exit 1
fi

# 1. Node 20 o superior: el agente usa fetch global y AbortSignal.timeout.
if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node 20 o superior. Instalalo con: brew install node" >&2
  exit 1
fi
NODE_MAYOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAYOR" -lt 20 ]]; then
  echo "Se necesita Node 20 o superior (tenés $(node --version))." >&2
  exit 1
fi

# 2. Código de vinculación opcional: se valida ANTES de descargar nada.
if [[ -n "$CODIGO" ]]; then
  NORMALIZADO="$(printf '%s' "$CODIGO" | tr -d '[:space:]-' | tr '[:lower:]' '[:upper:]' | tr 'IL' '11' | tr 'O' '0')"
  if [[ ! "$NORMALIZADO" =~ ^[0-9A-Z]{10}$ ]]; then
    echo "El código de vinculación no es válido (formato ABCDE-FGHIJ)." >&2
    exit 1
  fi
  CODIGO="${NORMALIZADO:0:5}-${NORMALIZADO:5}"
fi

# 3. Manifest: nombre de archivo fijo y checksum antes de descargar el paquete.
TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

if ! curl -fsSL "$API/print-agent/manifest.json" -o "$TEMPORAL/manifest.json"; then
  echo "No se pudo descargar el manifiesto del instalador desde $API." >&2
  exit 1
fi
DATOS_MANIFIESTO="$(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write([m.version, m.file, m.sha256, m.size].join("\n"))' "$TEMPORAL/manifest.json")"
VERSION="$(printf '%s\n' "$DATOS_MANIFIESTO" | sed -n '1p')"
ARCHIVO="$(printf '%s\n' "$DATOS_MANIFIESTO" | sed -n '2p')"
SHA256="$(printf '%s\n' "$DATOS_MANIFIESTO" | sed -n '3p')"
PESO="$(printf '%s\n' "$DATOS_MANIFIESTO" | sed -n '4p')"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ || ! "$PESO" =~ ^[0-9]+$ ]]; then
  echo "El manifiesto del instalador es inválido." >&2
  exit 1
fi
if [[ "$ARCHIVO" != "mobos-print-agent-$VERSION.tgz" ]]; then
  echo "El manifiesto apunta a un nombre de archivo inesperado: $ARCHIVO" >&2
  exit 1
fi
if [[ ! "$SHA256" =~ ^[a-f0-9]{64}$ ]]; then
  echo "El manifiesto no publica un checksum SHA-256 válido." >&2
  exit 1
fi

# 4. Descarga y verificación del checksum: sin coincidencia no se extrae nada.
echo "Descargando MobOS Print Agent v${VERSION}…"
if ! curl -fsSL "$API/print-agent/$ARCHIVO" -o "$TEMPORAL/$ARCHIVO"; then
  echo "No se pudo descargar el paquete $ARCHIVO." >&2
  exit 1
fi
if command -v shasum >/dev/null 2>&1; then
  CALCULADO="$(shasum -a 256 "$TEMPORAL/$ARCHIVO" | awk '{print $1}')"
else
  CALCULADO="$(sha256sum "$TEMPORAL/$ARCHIVO" | awk '{print $1}')"
fi
if [[ "$CALCULADO" != "$SHA256" ]]; then
  echo "El checksum no coincide: el paquete se descartó sin instalar." >&2
  exit 1
fi

# 5. Allow-list de entradas: nada de rutas absolutas, `..` ni archivos ajenos.
# Además de los .mjs del agente viajan los módulos vendorizados del USB directo
# (#96) como node_modules/usb/** y node_modules/node-gyp-build/**.
PREFIJO="mobos-print-agent-$VERSION/"
while IFS= read -r entrada; do
  [[ -z "$entrada" ]] && continue
  if [[ "$entrada" == /* || "$entrada" == *".."* ]]; then
    echo "El paquete contiene rutas no permitidas: $entrada" >&2
    exit 1
  fi
  if [[ "$entrada" != "$PREFIJO"* ]]; then
    echo "El paquete contiene una ruta fuera de $PREFIJO: $entrada" >&2
    exit 1
  fi
  resto="${entrada#"$PREFIJO"}"
  if [[ ! "$resto" =~ ^(server|transportes|cola|config|remoto|usb|pair)\.mjs$ && "$resto" != "package.json" \
        && ! "$resto" =~ ^node_modules/(usb|node-gyp-build)/[A-Za-z0-9._@+/-]+$ ]]; then
    echo "El paquete contiene un archivo no permitido: $entrada" >&2
    exit 1
  fi
done <<< "$(tar -tzf "$TEMPORAL/$ARCHIVO")"

# 6. Instalación atómica por reemplazo de archivos verificados.
mkdir -p "$DESTINO" "$DIR_CONFIG"
tar -xzf "$TEMPORAL/$ARCHIVO" -C "$DESTINO" --strip-components=1
chmod 600 "$DIR_CONFIG/config.json" 2>/dev/null || true
echo "Agente instalado en: $DESTINO"

# 7. Vinculación: el token solo queda en config.json (0600), nunca en el log.
if [[ -n "$CODIGO" ]]; then
  ( cd "$DESTINO" && MOBOS_PRINT_DIR="$DIR_CONFIG" node "$DESTINO/pair.mjs" --code "$CODIGO" --api-url "$API" --version "$VERSION" )
else
  echo "Sin código de vinculación: generá uno en la app (Configuración → Impresoras → Puentes)"
  echo "y corré: node \"$DESTINO/pair.mjs\" --code ABCDE-FGHIJ --api-url $API"
fi

# 8. Servicio de usuario (launchd), solo macOS y salvo --no-service.
if [[ "$SERVICIO" == "1" && "$(uname -s)" == "Darwin" ]]; then
  NODE="$(command -v node)"
  mkdir -p "$HOME/Library/LaunchAgents"
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
  <key>StandardOutPath</key><string>$DIR_CONFIG/agente.log</string>
  <key>StandardErrorPath</key><string>$DIR_CONFIG/agente.log</string>
</dict>
</plist>
PLIST
  launchctl unload "$PLIST" >/dev/null 2>&1 || true
  launchctl load "$PLIST"
  echo "Servicio com.mobos.print cargado (arranca al iniciar sesión)."
fi

echo
echo "Listo. El agente escucha en http://127.0.0.1:17890"
echo "En la app: Configuración → Impresoras → Imprimir prueba."
