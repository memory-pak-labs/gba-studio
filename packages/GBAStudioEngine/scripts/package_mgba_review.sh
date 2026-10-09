#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

OUTPUT_DIR="${OUTPUT_DIR:-build/mgba-review}"
SOURCE_REPORT="${SOURCE_REPORT:-build/smoke/mgba_stress_check_only_report.md}"
MGBA_APP="${MGBA_APP:-/Applications/mGBA.app}"
MGBA_BIN="${MGBA_BIN:-}"

usage() {
  cat <<'EOF'
Usage:
  scripts/package_mgba_review.sh [--output DIR] [--source-report PATH]

Creates a manual mGBA stress review package with ROMs, hashes, manifest,
checklist, and a launcher script. This package does not mark the manual gate as
passed; it prepares auditable inputs for the real manual review.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --source-report)
      SOURCE_REPORT="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

stress_roms=(
  "build/stress-projects/topdown_large/build/stress_topdown_large.gba"
  "build/stress-projects/platformer_large/build/stress_platformer_large.gba"
  "build/stress-projects/isometric_large/build/stress_isometric_large.gba"
  "build/stress-projects/sprites_oam_heavy/build/stress_sprites_oam_heavy.gba"
  "build/stress-projects/tilesets_vram_heavy/build/stress_tilesets_vram_heavy.gba"
  "build/stress-projects/audio_heavy/build/stress_audio_heavy.gba"
  "build/stress-projects/shmup_large/build/stress_shmup_large.gba"
  "build/stress-projects/point_click_large/build/stress_point_click_large.gba"
  "build/stress-projects/dungeon_crawler_large/build/stress_dungeon_crawler_large.gba"
  "build/stress-projects/racing_large/build/stress_racing_large.gba"
  "build/stress-projects/hardware_contention/build/stress_hardware_contention.gba"
)

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

missing=0
for rom in "${stress_roms[@]}"; do
  if [ ! -f "$rom" ]; then
    echo "Missing stress ROM: $rom" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "Run make verify-stress before packaging the mGBA review bundle." >&2
  exit 2
fi

MGBA_RESOLVED="$(detect_mgba || true)"
generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/roms"

manifest="$OUTPUT_DIR/mgba_review_manifest.json"
checksums="$OUTPUT_DIR/SHA256SUMS.txt"
readme="$OUTPUT_DIR/README.md"
launcher="$OUTPUT_DIR/open_all_mgba.command"
note_template="$OUTPUT_DIR/mgba_manual_approval_note.md"

: > "$checksums"

python3 - "$manifest" "$generated_at" "$MGBA_RESOLVED" "$SOURCE_REPORT" "${stress_roms[@]}" <<'PY'
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
generated_at = sys.argv[2]
mgba = sys.argv[3]
source_report = sys.argv[4]
roms = sys.argv[5:]
payload = {
    "kind": "mgba_stress_review_package",
    "generated_at": generated_at,
    "mgba": mgba,
    "source_report": source_report,
    "manual_gate": "manual_mgba_stress_smoke",
    "manual_gate_status": "pending",
    "roms": [],
}
for rom in roms:
    path = pathlib.Path(rom)
    payload["roms"].append({
        "name": path.name,
        "source_path": rom,
        "packaged_path": f"roms/{path.name}",
        "size_bytes": path.stat().st_size,
    })
manifest_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

for rom in "${stress_roms[@]}"; do
  rom_name="$(basename "$rom")"
  cp "$rom" "$OUTPUT_DIR/roms/$rom_name"
  rom_sha="$(file_sha256 "$OUTPUT_DIR/roms/$rom_name")"
  printf '%s  roms/%s\n' "$rom_sha" "$rom_name" >> "$checksums"
done

cat > "$note_template" <<'EOF'
# mGBA Stress Manual Approval Note

Status: pendente

Set Status to aprovado only after every ROM below has been opened in mGBA and
the visible/audio/input checks pass.

## Checklist

- stress_topdown_large.gba:
  - boot:
  - input:
  - camera:
  - collision:
  - portal:
  - audio:
  - save:
- stress_platformer_large.gba:
  - boot:
  - jump:
  - hazards:
  - checkpoint:
  - camera:
  - audio:
- stress_isometric_large.gba:
  - boot:
  - depth:
  - grid movement:
  - actor collision:
  - audio:
- stress_sprites_oam_heavy.gba:
  - boot:
  - sprites:
  - OAM pressure:
  - input:
- stress_tilesets_vram_heavy.gba:
  - boot:
  - VRAM pressure:
  - backgrounds:
  - scrolling:
- stress_audio_heavy.gba:
  - boot:
  - music:
  - sfx:
  - mixer:
  - dropouts:
- stress_shmup_large.gba:
  - boot:
  - waves and enemies:
  - projectiles:
  - OAM pressure:
  - input:
- stress_point_click_large.gba:
  - boot:
  - cursor:
  - hotspots:
  - scene transitions:
  - save:
- stress_dungeon_crawler_large.gba:
  - boot:
  - grid movement:
  - turns:
  - view distance:
  - collision:
- stress_racing_large.gba:
  - boot:
  - steering:
  - acceleration and braking:
  - long track streaming:
  - camera:
- stress_hardware_contention.gba:
  - boot:
  - audio mixer:
  - IRQ and VBlank telemetry:
  - HBlank DMA:
  - VRAM streaming:
  - dropouts or missed frames:
EOF

{
  echo "# mGBA Stress Review Package"
  echo
  echo "- Generated: $generated_at"
  echo "- mGBA: ${MGBA_RESOLVED:-not-found}"
  echo "- Manual gate: manual_mgba_stress_smoke"
  echo "- Manual gate status: pending"
  echo
  echo "## Files"
  echo
  echo "- mgba_review_manifest.json"
  echo "- SHA256SUMS.txt"
  echo "- mgba_manual_approval_note.md"
  echo "- open_all_mgba.command"
  echo "- roms/*.gba"
  echo
  echo "## Review Flow"
  echo
  echo "1. Run ./open_all_mgba.command or open each ROM under roms/."
  echo "2. Fill mgba_manual_approval_note.md."
  echo "3. Change Status from pendente to aprovado only after every check passes."
  echo "4. From the engine repo, run the manual evidence handoff generator:"
  echo
  echo '```sh'
  echo "scripts/write_mgba_manual_handoff.py \\"
  echo "  --manual-evidence-note \"$OUTPUT_DIR/mgba_manual_approval_note.md\" \\"
  echo "  --output-dir /Users/example/GBAStudio-dist/mgba-manual-handoff \\"
  echo "  --report-path /Users/example/GBAStudio-dist/mgba_stress_manual_report.md \\"
  echo "  --evidence-source /Users/example/GBAStudio-dist/mgba_stress_manual_report.md \\"
  echo "  --gbsdoctor /Users/example/Developer/GBAStudioEngine/dist/GBAStudioEnginePack/tools/gbsdoctor"
  echo '```'
  echo
  echo "5. Use the generated readiness_evidence_mgba_manual_base64.txt as the"
  echo "   Engine CI workflow_dispatch input manual_mgba_readiness_evidence_base64."
} > "$readme"

{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo 'cd "$(dirname "$0")"'
  if [ -n "$MGBA_RESOLVED" ]; then
    printf 'MGBA=%q\n' "$MGBA_RESOLVED"
  else
    echo 'MGBA="${MGBA:-mgba}"'
  fi
  echo 'for rom in roms/*.gba; do'
  echo '  echo "Opening $rom"'
  echo '  "$MGBA" "$rom" >/dev/null 2>&1 &'
  echo '  sleep 1'
  echo 'done'
} > "$launcher"
chmod +x "$launcher"

python3 - "$manifest" "$checksums" <<'PY'
import json
import pathlib
import sys

manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
checksums = pathlib.Path(sys.argv[2]).read_text().strip().splitlines()
assert manifest["kind"] == "mgba_stress_review_package"
assert manifest["manual_gate_status"] == "pending"
assert len(manifest["roms"]) == 6
assert len(checksums) == 6
assert all(item["size_bytes"] > 0 for item in manifest["roms"])
PY

echo "mGBA review package: $OUTPUT_DIR"
