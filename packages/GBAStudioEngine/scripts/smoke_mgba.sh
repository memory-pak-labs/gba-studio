#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

REPORT_DIR="${REPORT_DIR:-build/smoke}"
REPORT_PATH="${REPORT_PATH:-$REPORT_DIR/mgba_smoke_report.md}"
MGBA_APP="${MGBA_APP:-/Applications/mGBA.app}"
MGBA_BIN="${MGBA_BIN:-}"
MODE="single"
CHECK_ONLY=0
MANUAL_PASS=0
WRITE_READINESS_EVIDENCE=""
EVIDENCE_SOURCE=""
EVIDENCE_MESSAGE=""
MANUAL_EVIDENCE_NOTE=""
ROM_ARGS=()

if [ -n "${GBS_STRESS_BUILD_ROOT:-}" ]; then
  STRESS_BUILD_ROOT="$GBS_STRESS_BUILD_ROOT"
elif [ -d "build/stress-projects" ]; then
  STRESS_BUILD_ROOT="build/stress-projects"
elif [ -d "$SCRIPT_DIR/../../../build/stress-projects" ]; then
  STRESS_BUILD_ROOT="$(cd "$SCRIPT_DIR/../../../build/stress-projects" && pwd)"
else
  STRESS_BUILD_ROOT="build/stress-projects"
fi

usage() {
  cat <<'EOF'
Uso:
  scripts/smoke_mgba.sh [ROM]
  scripts/smoke_mgba.sh --all
  scripts/smoke_mgba.sh --stress
  scripts/smoke_mgba.sh --check-only --all
  scripts/smoke_mgba.sh --check-only --stress
  scripts/smoke_mgba.sh --stress --manual-pass --manual-evidence-note mgba_manual_note.md --write-readiness-evidence readiness_evidence.json

Variaveis:
  MGBA_APP=/Applications/mGBA.app
  MGBA_BIN=/caminho/para/mgba
  REPORT_PATH=build/smoke/mgba_smoke_report.md
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --all)
      MODE="all"
      shift
      ;;
    --stress)
      MODE="stress"
      shift
      ;;
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    --manual-pass)
      MANUAL_PASS=1
      shift
      ;;
    --write-readiness-evidence)
      if [ "$#" -lt 2 ]; then
        echo "--write-readiness-evidence exige um caminho de saida." >&2
        exit 2
      fi
      WRITE_READINESS_EVIDENCE="$2"
      shift 2
      ;;
    --evidence-source)
      if [ "$#" -lt 2 ]; then
        echo "--evidence-source exige um texto de origem." >&2
        exit 2
      fi
      EVIDENCE_SOURCE="$2"
      shift 2
      ;;
    --evidence-message)
      if [ "$#" -lt 2 ]; then
        echo "--evidence-message exige uma mensagem." >&2
        exit 2
      fi
      EVIDENCE_MESSAGE="$2"
      shift 2
      ;;
    --manual-evidence-note)
      if [ "$#" -lt 2 ]; then
        echo "--manual-evidence-note exige um arquivo de nota/manual report." >&2
        exit 2
      fi
      MANUAL_EVIDENCE_NOTE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      ROM_ARGS+=("$1")
      shift
      ;;
  esac
done

if [ -n "$WRITE_READINESS_EVIDENCE" ]; then
  if [ "$MODE" != "stress" ]; then
    echo "--write-readiness-evidence so pode ser usado com --stress." >&2
    exit 2
  fi
  if [ "$MANUAL_PASS" -ne 1 ]; then
    echo "--write-readiness-evidence exige --manual-pass apos verificacao manual real." >&2
    exit 2
  fi
  if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "--manual-pass nao pode ser usado com --check-only." >&2
    exit 2
  fi
  if [ -z "$MANUAL_EVIDENCE_NOTE" ]; then
    echo "--write-readiness-evidence exige --manual-evidence-note com uma nota de smoke manual aprovada." >&2
    exit 2
  fi
fi

detect_mgba() {
  if [ -n "$MGBA_BIN" ] && [ -x "$MGBA_BIN" ]; then
    printf '%s\n' "$MGBA_BIN"
    return 0
  fi
  if [ -d "$MGBA_APP" ] && [ -x "$MGBA_APP/Contents/MacOS/mGBA" ]; then
    printf '%s\n' "$MGBA_APP/Contents/MacOS/mGBA"
    return 0
  fi
  if command -v mgba >/dev/null 2>&1; then
    command -v mgba
    return 0
  fi
  if command -v mGBA >/dev/null 2>&1; then
    command -v mGBA
    return 0
  fi
  if command -v mgba-qt >/dev/null 2>&1; then
    command -v mgba-qt
    return 0
  fi
  return 1
}

default_roms() {
  printf '%s\n' \
    "build/gba/examples/topdown_basic/topdown_basic.gba" \
    "build/gba/examples/platformer_basic/platformer_basic.gba" \
    "build/gba/examples/isometric_basic/isometric_basic.gba"
  if [ -f "build/verify-package/generated_project/build/verify_generated_project.gba" ]; then
    printf '%s\n' "build/verify-package/generated_project/build/verify_generated_project.gba"
  fi
}

stress_roms() {
  printf '%s\n' \
    "$STRESS_BUILD_ROOT/topdown_large/build/stress_topdown_large.gba" \
    "$STRESS_BUILD_ROOT/platformer_large/build/stress_platformer_large.gba" \
    "$STRESS_BUILD_ROOT/isometric_large/build/stress_isometric_large.gba" \
    "$STRESS_BUILD_ROOT/sprites_oam_heavy/build/stress_sprites_oam_heavy.gba" \
    "$STRESS_BUILD_ROOT/tilesets_vram_heavy/build/stress_tilesets_vram_heavy.gba" \
    "$STRESS_BUILD_ROOT/audio_heavy/build/stress_audio_heavy.gba" \
    "$STRESS_BUILD_ROOT/shmup_large/build/stress_shmup_large.gba" \
    "$STRESS_BUILD_ROOT/point_click_large/build/stress_point_click_large.gba" \
    "$STRESS_BUILD_ROOT/dungeon_crawler_large/build/stress_dungeon_crawler_large.gba" \
    "$STRESS_BUILD_ROOT/racing_large/build/stress_racing_large.gba" \
    "$STRESS_BUILD_ROOT/hardware_contention/build/stress_hardware_contention.gba"
}

file_sha256() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
    return 0
  fi
  cksum "$path" | awk '{print $1}'
}

validate_manual_evidence_note() {
  local note_path="$1"
  if [ ! -f "$note_path" ]; then
    echo "Nota de evidencia manual nao encontrada: $note_path" >&2
    return 1
  fi
  if ! grep -Eiq '(aprovado|approved|passed)' "$note_path"; then
    echo "Nota de evidencia manual deve conter aprovacao explicita: aprovado, approved ou passed." >&2
    return 1
  fi
  if grep -Eiq '(^|[^[:alpha:]])(\[ \]|TODO|pendente|pending|failed|reprovado|travou|crash|tela branca|white screen)([^[:alpha:]]|$)' "$note_path"; then
    echo "Nota de evidencia manual contem pendencia ou falha explicita." >&2
    return 1
  fi
  local rom
  for rom in "${ROMS[@]}"; do
    local rom_name
    rom_name="$(basename "$rom")"
    if ! grep -Fq "$rom_name" "$note_path"; then
      echo "Nota de evidencia manual nao cita ROM stress obrigatoria: $rom_name" >&2
      return 1
    fi
  done
}

open_rom() {
  local rom="$1"
  if [ "$(uname -s)" = "Darwin" ] && [ -d "$MGBA_APP" ]; then
    open -a "$MGBA_APP" "$rom"
  else
    "$MGBA_RESOLVED" "$rom" >/dev/null 2>&1 &
  fi
}

write_readiness_evidence() {
  local output_path="$1"
  local checked_at="$2"
  local source="$3"
  local message="$4"
  local review_environment="$5"
  python3 - "$output_path" "$checked_at" "$source" "$message" "$review_environment" <<'PY'
import json
import pathlib
import sys

output_path = pathlib.Path(sys.argv[1])
checked_at = sys.argv[2]
source = sys.argv[3]
message = sys.argv[4]
review_environment = sys.argv[5]
payload = {
    "manual_mgba_stress_smoke": {
        "ok": True,
        "evidence_type": "manual_mgba_stress_smoke",
        "source": source,
        "checked_at": checked_at,
        "review_environment": review_environment,
        "message": message,
    },
    "hardware_or_ci_validation": {
        "ok": False,
        "evidence_type": "hardware_real",
        "source": "hardware test log, CI run URL, or CI job id",
        "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
        "message": "Validate on real hardware or cross-platform CI.",
        "validated_platforms": [],
    },
    "gba_studio_engine_primary_rollout": {
        "ok": False,
        "evidence_type": "gba_studio_engine_primary_rollout",
        "source": "GBA Studio private engine-primary export smoke log path or note",
        "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
        "message": "Keep gbastudio_engine as the private primary backend gate while preserving Butano only as legacy rollback.",
    },
}
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
}

if [ "$CHECK_ONLY" -eq 1 ]; then
  MGBA_RESOLVED="nao executado (check-only)"
elif ! MGBA_RESOLVED="$(detect_mgba)"; then
  echo "mGBA nao encontrado. Configure MGBA_APP ou MGBA_BIN." >&2
  exit 2
fi

if [ "$MODE" = "all" ]; then
  ROMS=()
  while IFS= read -r rom; do
    ROMS+=("$rom")
  done < <(default_roms)
elif [ "$MODE" = "stress" ]; then
  ROMS=()
  while IFS= read -r rom; do
    ROMS+=("$rom")
  done < <(stress_roms)
elif [ "${#ROM_ARGS[@]}" -gt 0 ]; then
  ROMS=("${ROM_ARGS[@]}")
else
  ROMS=("build/gba/examples/topdown_basic/topdown_basic.gba")
fi

mkdir -p "$REPORT_DIR"
REPORT_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "# mGBA Smoke Report"
  echo
  echo "- Data: $REPORT_DATE"
  echo "- mGBA: $MGBA_RESOLVED"
  echo "- Modo: $([ "$CHECK_ONLY" -eq 1 ] && echo check-only || echo manual-open)"
  echo "- Alvo: $MODE"
  echo
  echo "## ROMs"
} > "$REPORT_PATH"

missing=0
for rom in "${ROMS[@]}"; do
  if [ ! -f "$rom" ]; then
    echo "ROM nao encontrada: $rom" >&2
    echo "- [missing] $rom" >> "$REPORT_PATH"
    missing=1
    continue
  fi
  size="$(wc -c < "$rom" | tr -d ' ')"
  echo "- [ok] $rom ($size bytes)" >> "$REPORT_PATH"
done

if [ "$missing" -ne 0 ]; then
  if [ "$MODE" = "stress" ]; then
    echo "Algumas ROMs de stress nao foram encontradas. Rode: make verify-stress" >&2
  else
    echo "Algumas ROMs nao foram encontradas. Rode: make all verify-package" >&2
  fi
  exit 2
fi

if [ -n "$WRITE_READINESS_EVIDENCE" ]; then
  validate_manual_evidence_note "$MANUAL_EVIDENCE_NOTE"
fi

cat >> "$REPORT_PATH" <<'EOF'

## Checklist Manual

- Boot sem tela branca ou travamento.
- Top-down: dialogo inicial, player, D-pad, camera, colisao, NPC, portal, SFX/musica e overlay com Select.
- Platformer: gravidade, pulo, coyote/jump buffer, ladder/one-way, hazard, checkpoint e camera zone.
- Isometric: atores visiveis por depth, movimento em grid, colisao por tile/ator e ator seguidor.
- Projeto gerado: boot equivalente ao template exportado e sem dependencia do repo privado.
- Stress: topdown_large, platformer_large, isometric_large, sprites_oam_heavy, tilesets_vram_heavy e audio_heavy sem tela branca, travamento ou audio ausente.
EOF

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "Smoke mGBA check-only OK. Relatorio: $REPORT_PATH"
  exit 0
fi

for rom in "${ROMS[@]}"; do
  echo "Abrindo no mGBA: $rom"
  open_rom "$rom"
  sleep 1
done

if [ -n "$WRITE_READINESS_EVIDENCE" ]; then
  note_sha256="$(file_sha256 "$MANUAL_EVIDENCE_NOTE")"
  {
    echo
    echo "## Evidencia Manual"
    echo
    echo "- Nota: $MANUAL_EVIDENCE_NOTE"
    echo "- Nota SHA256: $note_sha256"
  } >> "$REPORT_PATH"
  if [ -z "$EVIDENCE_SOURCE" ]; then
    EVIDENCE_SOURCE="$REPORT_PATH"
  fi
  if [ -z "$EVIDENCE_MESSAGE" ]; then
    EVIDENCE_MESSAGE="Stress ROMs opened and manually confirmed in mGBA."
  fi
  write_readiness_evidence "$WRITE_READINESS_EVIDENCE" "$REPORT_DATE" "$EVIDENCE_SOURCE" "$EVIDENCE_MESSAGE" "mGBA $MGBA_RESOLVED"
  {
    echo
    echo "## Readiness Evidence"
    echo
    echo "- [ok] manual_mgba_stress_smoke: $WRITE_READINESS_EVIDENCE"
    echo "- [pending] hardware_or_ci_validation"
    echo "- [pending] gba_studio_engine_primary_rollout"
  } >> "$REPORT_PATH"
fi

echo "ROMs abertas no mGBA. Relatorio: $REPORT_PATH"
if [ -n "$WRITE_READINESS_EVIDENCE" ]; then
  echo "Evidencia parcial de readiness escrita em: $WRITE_READINESS_EVIDENCE"
fi
