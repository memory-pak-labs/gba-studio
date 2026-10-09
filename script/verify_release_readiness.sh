#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${GBA_STUDIO_DIST_DIR:-$ROOT_DIR/dist}"
MANIFEST="$DIST_DIR/BUILD_MANIFEST.txt"
MANIFEST_ONLY=0

usage() {
  echo "usage: $0 [--manifest-only] [BUILD_MANIFEST.txt]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest-only)
      MANIFEST_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      MANIFEST="$1"
      shift
      ;;
  esac
done

[[ -f "$MANIFEST" ]] || {
  echo "Manifesto de release nao encontrado: $MANIFEST" >&2
  exit 2
}

manifest_value() {
  local key="$1"
  awk -v key="$key" '
    index($0, key ": ") == 1 {
      sub(key ": ", "", $0)
      print
      exit
    }
  ' "$MANIFEST"
}

errors=()

add_error() {
  errors+=("$1")
}

require_value() {
  local key="$1"
  local expected="$2"
  local actual
  actual="$(manifest_value "$key")"
  if [[ "$actual" != "$expected" ]]; then
    add_error "$key precisa ser '$expected' (atual: '${actual:-missing}')."
  fi
}

bundle="$(manifest_value "Bundle")"
archive="$(manifest_value "Archive")"
dmg="$(manifest_value "DMG")"
dmg_sha="$(manifest_value "DMG SHA256")"
codesign_label="$(manifest_value "Codesign")"

if [[ "$codesign_label" != Developer\ ID\ Application:* ]]; then
  add_error "Codesign precisa ser Developer ID Application (atual: '${codesign_label:-missing}')."
fi

require_value "Hardened Runtime" "enabled"
require_value "Toolchain" "external"
require_value "Engine Pack" "bundled"
require_value "Notarization Requested" "yes"
require_value "Notarization Status" "accepted-and-stapled"

if [[ -n "$(manifest_value "BUTANO_SOURCE")" || -n "$(manifest_value "DEVKITPRO_SOURCE")" ]]; then
  add_error "Manifesto final nao pode registrar Butano/devkitPro legado como fonte empacotada; use Toolchain: external e Engine Pack: bundled."
fi

if [[ -z "$dmg_sha" || "$dmg_sha" == "missing" ]]; then
  add_error "DMG SHA256 precisa estar presente no manifesto."
fi

if [[ "$MANIFEST_ONLY" != "1" ]]; then
  [[ -d "$bundle" ]] || add_error "Bundle nao encontrado: ${bundle:-missing}."
  [[ -f "$archive" && -s "$archive" ]] || add_error "Archive nao encontrado ou vazio: ${archive:-missing}."
  [[ -f "$dmg" && -s "$dmg" ]] || add_error "DMG nao encontrado ou vazio: ${dmg:-missing}."

  if [[ -f "$dmg" && -n "$dmg_sha" && "$dmg_sha" != "missing" ]]; then
    actual_sha="$(/usr/bin/shasum -a 256 "$dmg" | awk '{print $1}')"
    [[ "$actual_sha" == "$dmg_sha" ]] || add_error "DMG SHA256 diverge do arquivo atual (manifesto: $dmg_sha, atual: $actual_sha)."
  fi

  if [[ -d "$bundle" ]]; then
    /usr/bin/codesign --verify --deep --strict --verbose=2 "$bundle" >/dev/null 2>&1 || \
      add_error "codesign --verify falhou para $bundle."
    /usr/bin/codesign -dv --verbose=4 "$bundle" 2>&1 | grep -q "Runtime Version" || \
      add_error "Assinatura nao declara Hardened Runtime em $bundle."
    /usr/bin/xcrun stapler validate "$bundle" >/dev/null 2>&1 || \
      add_error "stapler validate falhou para $bundle."
    /usr/sbin/spctl --assess --type execute --verbose=4 "$bundle" >/dev/null 2>&1 || \
      add_error "Gatekeeper spctl assessment falhou para $bundle."
  fi
fi

if [[ "${#errors[@]}" -gt 0 ]]; then
  echo "Release readiness FAILED:"
  for error in "${errors[@]}"; do
    echo "- $error"
  done
  exit 1
fi

echo "Release readiness OK: $MANIFEST"
