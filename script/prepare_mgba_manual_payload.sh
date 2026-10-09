#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${GBA_STUDIO_DIST_DIR:-/Users/example/GBAStudio-dist}"
ENGINE_REPO="${GBA_STUDIO_ENGINE_REPO:-$(cd "$(dirname "$0")/.." && pwd)/packages/GBAStudioEngine}"
ENGINE_PACK="${GBA_STUDIO_ENGINE_PACK:-$ENGINE_REPO/dist/GBAStudioEnginePack}"
OUTPUT_DIR="$DIST_DIR/mgba-manual-handoff"
READINESS_EVIDENCE=""
MANUAL_EVIDENCE_NOTE=""
REPORT_PATH=""
EVIDENCE_SOURCE=""
EVIDENCE_MESSAGE="Stress ROMs opened and manually confirmed in an approved GBA emulator or suite."
MGBA_APP=""
MGBA_BIN=""
OUTPUT_JSON="$DIST_DIR/mgba_manual_payload_report.json"
OUTPUT_MD="$DIST_DIR/mgba_manual_payload_report.md"

usage() {
  cat <<'EOF'
Usage: script/prepare_mgba_manual_payload.sh [options]

Generates the real manual GBA validation base64 payload expected by the final release
preflight:
  GBAStudio-dist/mgba-manual-handoff/readiness_evidence_mgba_manual_base64.txt

Use either --readiness-evidence for an already generated manual evidence JSON,
or --manual-evidence-note after the real stress review has been approved in
mGBA, NanoBoyAdvance, or an approved automated suite.

Options:
  --dist-dir PATH              Distribution/evidence directory.
  --engine-repo PATH           GBAStudioEngine checkout.
  --engine-pack PATH           GBAStudioEnginePack directory.
  --output-dir PATH            Output handoff directory.
  --readiness-evidence PATH    Existing manual_mgba_stress_smoke readiness JSON.
  --manual-evidence-note PATH  Approved manual GBA emulator/suite review note.
  --report-path PATH           mGBA smoke report path when running smoke_mgba.sh.
  --evidence-source PATH       Evidence source recorded in readiness evidence.
  --evidence-message TEXT      Evidence message recorded in readiness evidence.
  --mgba-app PATH              mGBA.app path used by smoke_mgba.sh.
  --mgba-bin PATH              mGBA executable used by smoke_mgba.sh.
  --output PATH                JSON wrapper report.
  --markdown-output PATH       Markdown wrapper report.
  --help                       Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist-dir)
      DIST_DIR="$2"
      OUTPUT_DIR="$DIST_DIR/mgba-manual-handoff"
      OUTPUT_JSON="$DIST_DIR/mgba_manual_payload_report.json"
      OUTPUT_MD="$DIST_DIR/mgba_manual_payload_report.md"
      shift 2
      ;;
    --engine-repo)
      ENGINE_REPO="$2"
      ENGINE_PACK="$ENGINE_REPO/dist/GBAStudioEnginePack"
      shift 2
      ;;
    --engine-pack)
      ENGINE_PACK="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --readiness-evidence)
      READINESS_EVIDENCE="$2"
      shift 2
      ;;
    --manual-evidence-note)
      MANUAL_EVIDENCE_NOTE="$2"
      shift 2
      ;;
    --report-path)
      REPORT_PATH="$2"
      shift 2
      ;;
    --evidence-source)
      EVIDENCE_SOURCE="$2"
      shift 2
      ;;
    --evidence-message)
      EVIDENCE_MESSAGE="$2"
      shift 2
      ;;
    --mgba-app)
      MGBA_APP="$2"
      shift 2
      ;;
    --mgba-bin)
      MGBA_BIN="$2"
      shift 2
      ;;
    --output)
      OUTPUT_JSON="$2"
      shift 2
      ;;
    --markdown-output)
      OUTPUT_MD="$2"
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

if [[ -n "$READINESS_EVIDENCE" && -n "$MANUAL_EVIDENCE_NOTE" ]]; then
  echo "Use --readiness-evidence or --manual-evidence-note, not both." >&2
  exit 2
fi

if [[ -z "$READINESS_EVIDENCE" && -z "$MANUAL_EVIDENCE_NOTE" ]]; then
  echo "Provide --readiness-evidence or --manual-evidence-note." >&2
  exit 2
fi

ENGINE_SCRIPT="$ENGINE_REPO/scripts/write_mgba_manual_handoff.py"
SMOKE_SCRIPT="$ENGINE_REPO/scripts/smoke_mgba.sh"
GBSDOCTOR="$ENGINE_PACK/tools/gbsdoctor"

mkdir -p "$DIST_DIR" "$OUTPUT_DIR" "$(dirname "$OUTPUT_JSON")" "$(dirname "$OUTPUT_MD")"

if [[ ! -f "$ENGINE_SCRIPT" ]]; then
  echo "Engine handoff script not found: $ENGINE_SCRIPT" >&2
  exit 1
fi

args=(
  python3 "$ENGINE_SCRIPT"
  --output-dir "$OUTPUT_DIR"
)

if [[ -x "$GBSDOCTOR" ]]; then
  args+=(--gbsdoctor "$GBSDOCTOR")
fi

if [[ -n "$READINESS_EVIDENCE" ]]; then
  if ! python3 - "$READINESS_EVIDENCE" "$OUTPUT_JSON" "$OUTPUT_MD" "$DIST_DIR" "$ENGINE_REPO" "$ENGINE_PACK" "$OUTPUT_DIR" <<'PY'
import json
import pathlib
import re
import sys
from datetime import datetime, timezone

evidence_path = pathlib.Path(sys.argv[1])
output_json = pathlib.Path(sys.argv[2])
output_md = pathlib.Path(sys.argv[3])
dist_dir = sys.argv[4]
engine_repo = sys.argv[5]
engine_pack = sys.argv[6]
output_dir = sys.argv[7]

blockers = []
warnings = []
evidence = None


def classify_manual_review_suite(environment):
    value = str(environment or "").strip()
    lowered = value.lower()
    result = {
        "ok": False,
        "kind": "",
        "label": "",
        "environment": value,
        "allowed_kinds": ["mgba", "nanoboyadvance", "automated_suite"],
    }
    if not value:
        return result
    if re.search(r"\bmgba\b", lowered):
        result.update({"ok": True, "kind": "mgba", "label": "mGBA"})
    elif "nanoboyadvance" in lowered or "nano boy advance" in lowered:
        result.update({"ok": True, "kind": "nanoboyadvance", "label": "NanoBoyAdvance"})
    elif ("automated" in lowered or "automatizada" in lowered) and "suite" in lowered:
        result.update({"ok": True, "kind": "automated_suite", "label": "Approved automated suite"})
    return result


if not evidence_path.is_file():
    blockers.append("manual_mgba_readiness_evidence_missing")
else:
    try:
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    except Exception as error:
        blockers.append(f"manual_mgba_readiness_evidence_invalid_json: {error}")

manual_environment = ""
manual_review_suite = classify_manual_review_suite("")
if isinstance(evidence, dict):
    gate = evidence.get("manual_mgba_stress_smoke") or {}
    if gate.get("ok") is not True:
        blockers.append("manual_mgba_stress_smoke_not_ok")
    if gate.get("evidence_type") != "manual_mgba_stress_smoke":
        blockers.append("manual_mgba_stress_smoke_wrong_evidence_type")
    source = str(gate.get("source") or "")
    if not source or source == "mGBA stress smoke log path or note":
        blockers.append("manual_mgba_stress_smoke_missing_real_source")
    manual_environment = str(gate.get("review_environment") or "").strip()
    if not manual_environment:
        blockers.append("manual_mgba_stress_smoke_review_environment_missing")
    elif any(marker in manual_environment.lower() for marker in ["todo", "placeholder", "unknown", "pending", "pendente", "desconhecido"]):
        blockers.append("manual_mgba_stress_smoke_review_environment_invalid")
    else:
        manual_review_suite = classify_manual_review_suite(manual_environment)
        if not manual_review_suite.get("ok"):
            blockers.append("manual_mgba_stress_smoke_unsupported_review_suite")

report = {
    "kind": "gba_studio_mgba_manual_payload_report",
    "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "ok": not blockers,
    "dist_dir": dist_dir,
    "engine_repo": engine_repo,
    "engine_pack": engine_pack,
    "output_dir": output_dir,
    "manual_review_suite": manual_review_suite,
    "inputs": {
        "readiness_evidence": str(evidence_path),
        "manual_evidence_note": "",
    },
    "outputs": {
        "payload": str(pathlib.Path(output_dir) / "readiness_evidence_mgba_manual_base64.txt"),
        "evidence": str(pathlib.Path(output_dir) / "readiness_evidence_mgba_manual.json"),
        "summary": str(pathlib.Path(output_dir) / "mgba_manual_handoff_summary.json"),
    },
    "checks": {
        "manual_environment": manual_environment,
        "manual_review_suite": manual_review_suite,
        "readiness_evidence_present": evidence_path.is_file(),
    },
    "blockers": blockers,
    "warnings": warnings,
}
output_json.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

status = "OK" if report["ok"] else "BLOCKED"
lines = [
    "# GBA Studio Manual GBA Emulator/Suite Payload",
    "",
    f"Status: {status}",
    f"Generated: {report['generated_at']}",
    "",
    "## Readiness Evidence",
    "",
    f"- Path: `{evidence_path}`",
    f"- Manual Environment: `{manual_environment}`",
    f"- Manual Review Suite: `{manual_review_suite.get('kind') or 'unsupported'}`",
    "",
    "## Blockers",
    "",
]
if blockers:
    lines.extend(f"- {item}" for item in blockers)
else:
    lines.append("- none")
lines.append("")
output_md.write_text("\n".join(lines), encoding="utf-8")
sys.exit(0 if not blockers else 1)
PY
  then
    echo "Manual GBA emulator/suite payload BLOCKED: $OUTPUT_JSON"
    echo "Markdown report: $OUTPUT_MD"
    exit 1
  fi
  args+=(--readiness-evidence "$READINESS_EVIDENCE")
else
  if ! python3 - "$MANUAL_EVIDENCE_NOTE" "$DIST_DIR/mgba-review/mgba_review_manifest.json" "$OUTPUT_JSON" "$OUTPUT_MD" "$DIST_DIR" "$ENGINE_REPO" "$ENGINE_PACK" "$OUTPUT_DIR" <<'PY'
import json
import pathlib
import re
import sys
from datetime import datetime, timezone

note_path = pathlib.Path(sys.argv[1])
manifest_path = pathlib.Path(sys.argv[2])
output_json = pathlib.Path(sys.argv[3])
output_md = pathlib.Path(sys.argv[4])
dist_dir = sys.argv[5]
engine_repo = sys.argv[6]
engine_pack = sys.argv[7]
output_dir = sys.argv[8]

required_roms = [
    "stress_topdown_large.gba",
    "stress_platformer_large.gba",
    "stress_isometric_large.gba",
    "stress_sprites_oam_heavy.gba",
    "stress_tilesets_vram_heavy.gba",
    "stress_audio_heavy.gba",
]
if manifest_path.is_file():
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_roms = [item.get("name") for item in manifest.get("roms", []) if isinstance(item, dict)]
        if manifest_roms:
            required_roms = manifest_roms
    except Exception:
        pass

blockers = []
warnings = []
text = ""
manual_environment = ""


def classify_manual_review_suite(environment):
    value = str(environment or "").strip()
    lowered = value.lower()
    result = {
        "ok": False,
        "kind": "",
        "label": "",
        "environment": value,
        "allowed_kinds": ["mgba", "nanoboyadvance", "automated_suite"],
    }
    if not value:
        return result
    if re.search(r"\bmgba\b", lowered):
        result.update({"ok": True, "kind": "mgba", "label": "mGBA"})
    elif "nanoboyadvance" in lowered or "nano boy advance" in lowered:
        result.update({"ok": True, "kind": "nanoboyadvance", "label": "NanoBoyAdvance"})
    elif ("automated" in lowered or "automatizada" in lowered) and "suite" in lowered:
        result.update({"ok": True, "kind": "automated_suite", "label": "Approved automated suite"})
    return result


manual_review_suite = classify_manual_review_suite("")
if not note_path.is_file():
    blockers.append("manual_evidence_note_missing")
else:
    text = note_path.read_text(encoding="utf-8", errors="replace")
    status_match = re.search(r"(?im)^\s*Status:\s*(.+?)\s*$", text)
    status = status_match.group(1).strip() if status_match else ""
    if not re.search(r"(?i)\b(aprovado|approved|passed)\b", status):
        blockers.append("manual_evidence_note_status_not_approved")
    if re.search(r"(?i)\b(pendente|pending|failed|reprovado|travou|crash|tela branca|white screen|todo)\b", text):
        blockers.append("manual_evidence_note_contains_pending_or_failure_marker")

    environment_match = re.search(
        r"(?im)^\s*(Environment|Ambiente|Emulator|Emulador|Suite|Su[ií]te|mGBA Version)\s*:\s*(.+?)\s*$",
        text,
    )
    if environment_match:
        label = environment_match.group(1).strip()
        value = environment_match.group(2).strip()
        manual_environment = f"mGBA {value}" if label.lower() == "mgba version" else value
    if not manual_environment:
        blockers.append("manual_evidence_note_missing_review_environment")
    elif re.search(r"(?i)\b(todo|placeholder|unknown|desconhecido|pendente|pending)\b", manual_environment):
        blockers.append("manual_evidence_note_invalid_review_environment")
    else:
        manual_review_suite = classify_manual_review_suite(manual_environment)
        if not manual_review_suite.get("ok"):
            blockers.append("manual_evidence_note_unsupported_review_suite")

    missing_roms = [name for name in required_roms if name not in text]
    if missing_roms:
        blockers.append("manual_evidence_note_missing_required_roms:" + ",".join(missing_roms))

    empty_checks = []
    for line in text.splitlines():
        match = re.match(r"^\s{2,}-\s+(.+?):\s*$", line)
        if match:
            empty_checks.append(match.group(1).strip())
    if empty_checks:
        blockers.append("manual_evidence_note_has_empty_check_items:" + ",".join(empty_checks[:8]))
        if len(empty_checks) > 8:
            warnings.append(f"manual_evidence_note_empty_check_items_truncated:{len(empty_checks)}")

report = {
    "kind": "gba_studio_mgba_manual_payload_report",
    "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "ok": not blockers,
    "dist_dir": dist_dir,
    "engine_repo": engine_repo,
    "engine_pack": engine_pack,
    "output_dir": output_dir,
    "manual_review_suite": manual_review_suite,
    "inputs": {
        "readiness_evidence": "",
        "manual_evidence_note": str(note_path),
    },
    "outputs": {
        "payload": str(pathlib.Path(output_dir) / "readiness_evidence_mgba_manual_base64.txt"),
        "evidence": str(pathlib.Path(output_dir) / "readiness_evidence_mgba_manual.json"),
        "summary": str(pathlib.Path(output_dir) / "mgba_manual_handoff_summary.json"),
    },
    "checks": {
        "manual_note_present": note_path.is_file(),
        "manual_environment": manual_environment,
        "manual_review_suite": manual_review_suite,
        "required_roms": required_roms,
    },
    "blockers": blockers,
    "warnings": warnings,
}
output_json.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

status = "OK" if report["ok"] else "BLOCKED"
lines = [
    "# GBA Studio Manual GBA Emulator/Suite Payload",
    "",
    f"Status: {status}",
    f"Generated: {report['generated_at']}",
    "",
    "## Manual Note",
    "",
    f"- Path: `{note_path}`",
    "",
    "## Blockers",
    "",
]
if blockers:
    lines.extend(f"- {item}" for item in blockers)
else:
    lines.append("- none")
lines.extend(["", "## Warnings", ""])
if warnings:
    lines.extend(f"- {item}" for item in warnings)
else:
    lines.append("- none")
lines.append("")
output_md.write_text("\n".join(lines), encoding="utf-8")
sys.exit(0 if not blockers else 1)
PY
  then
    echo "Manual GBA emulator/suite payload BLOCKED: $OUTPUT_JSON"
    echo "Markdown report: $OUTPUT_MD"
    exit 1
  fi
  args+=(--manual-evidence-note "$MANUAL_EVIDENCE_NOTE")
  args+=(--smoke-script "$SMOKE_SCRIPT")
  args+=(--evidence-message "$EVIDENCE_MESSAGE")
  if [[ -n "$REPORT_PATH" ]]; then
    args+=(--report-path "$REPORT_PATH")
  fi
  if [[ -n "$EVIDENCE_SOURCE" ]]; then
    args+=(--evidence-source "$EVIDENCE_SOURCE")
  fi
  if [[ -n "$MGBA_APP" ]]; then
    args+=(--mgba-app "$MGBA_APP")
  fi
  if [[ -n "$MGBA_BIN" ]]; then
    args+=(--mgba-bin "$MGBA_BIN")
  fi
fi

"${args[@]}"

PAYLOAD="$OUTPUT_DIR/readiness_evidence_mgba_manual_base64.txt"
EVIDENCE="$OUTPUT_DIR/readiness_evidence_mgba_manual.json"
SUMMARY="$OUTPUT_DIR/mgba_manual_handoff_summary.json"

export DIST_DIR
export ENGINE_REPO
export ENGINE_PACK
export OUTPUT_DIR
export OUTPUT_JSON
export OUTPUT_MD
export READINESS_EVIDENCE
export MANUAL_EVIDENCE_NOTE
export PAYLOAD
export EVIDENCE
export SUMMARY

python3 <<'PY'
import base64
import json
import os
import pathlib
import re
from datetime import datetime, timezone

payload_path = pathlib.Path(os.environ["PAYLOAD"])
evidence_path = pathlib.Path(os.environ["EVIDENCE"])
summary_path = pathlib.Path(os.environ["SUMMARY"])
blockers = []
warnings = []


def classify_manual_review_suite(environment):
    value = str(environment or "").strip()
    lowered = value.lower()
    result = {
        "ok": False,
        "kind": "",
        "label": "",
        "environment": value,
        "allowed_kinds": ["mgba", "nanoboyadvance", "automated_suite"],
    }
    if not value:
        return result
    if re.search(r"\bmgba\b", lowered):
        result.update({"ok": True, "kind": "mgba", "label": "mGBA"})
    elif "nanoboyadvance" in lowered or "nano boy advance" in lowered:
        result.update({"ok": True, "kind": "nanoboyadvance", "label": "NanoBoyAdvance"})
    elif ("automated" in lowered or "automatizada" in lowered) and "suite" in lowered:
        result.update({"ok": True, "kind": "automated_suite", "label": "Approved automated suite"})
    return result


if not payload_path.is_file() or payload_path.stat().st_size == 0:
    blockers.append("mgba_manual_payload_missing")

evidence = None
if not evidence_path.is_file() or evidence_path.stat().st_size == 0:
    blockers.append("mgba_manual_evidence_missing")
else:
    try:
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    except Exception as error:
        blockers.append(f"mgba_manual_evidence_invalid_json: {error}")

if payload_path.is_file() and evidence_path.is_file():
    try:
        decoded = base64.b64decode(payload_path.read_text(encoding="utf-8").strip())
        if decoded != evidence_path.read_bytes():
            blockers.append("mgba_manual_payload_does_not_match_evidence")
    except Exception as error:
        blockers.append(f"mgba_manual_payload_invalid_base64: {error}")

if isinstance(evidence, dict):
    gate = evidence.get("manual_mgba_stress_smoke") or {}
    if gate.get("ok") is not True:
        blockers.append("manual_mgba_stress_smoke_not_ok")
    if gate.get("evidence_type") != "manual_mgba_stress_smoke":
        blockers.append("manual_mgba_stress_smoke_wrong_evidence_type")
    source = str(gate.get("source") or "")
    if not source or source == "mGBA stress smoke log path or note":
        blockers.append("manual_mgba_stress_smoke_missing_real_source")
    manual_environment = str(gate.get("review_environment") or "").strip()
    if not manual_environment:
        blockers.append("manual_mgba_stress_smoke_review_environment_missing")
    elif any(marker in manual_environment.lower() for marker in ["todo", "placeholder", "unknown", "pending", "pendente", "desconhecido"]):
        blockers.append("manual_mgba_stress_smoke_review_environment_invalid")
    elif not classify_manual_review_suite(manual_environment).get("ok"):
        blockers.append("manual_mgba_stress_smoke_unsupported_review_suite")

summary_ok = False
if summary_path.is_file():
    try:
        summary_ok = json.loads(summary_path.read_text(encoding="utf-8")).get("ok") is True
    except Exception as error:
        warnings.append(f"mgba_manual_handoff_summary_invalid_json: {error}")

manual_environment = ""
manual_note = pathlib.Path(os.environ["MANUAL_EVIDENCE_NOTE"])
if manual_note.is_file():
    text = manual_note.read_text(encoding="utf-8", errors="replace")
    environment_match = re.search(
        r"(?im)^\s*(Environment|Ambiente|Emulator|Emulador|Suite|Su[ií]te|mGBA Version)\s*:\s*(.+?)\s*$",
        text,
    )
    if environment_match:
        label = environment_match.group(1).strip()
        value = environment_match.group(2).strip()
        manual_environment = f"mGBA {value}" if label.lower() == "mgba version" else value
if not manual_environment and isinstance(evidence, dict):
    manual_environment = str((evidence.get("manual_mgba_stress_smoke") or {}).get("review_environment") or "").strip()
manual_review_suite = classify_manual_review_suite(manual_environment)
if manual_environment and not manual_review_suite.get("ok") and "manual_mgba_stress_smoke_unsupported_review_suite" not in blockers:
    blockers.append("manual_mgba_stress_smoke_unsupported_review_suite")

report = {
    "kind": "gba_studio_mgba_manual_payload_report",
    "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "ok": not blockers,
    "dist_dir": os.environ["DIST_DIR"],
    "engine_repo": os.environ["ENGINE_REPO"],
    "engine_pack": os.environ["ENGINE_PACK"],
    "output_dir": os.environ["OUTPUT_DIR"],
    "manual_review_suite": manual_review_suite,
    "inputs": {
        "readiness_evidence": os.environ["READINESS_EVIDENCE"],
        "manual_evidence_note": os.environ["MANUAL_EVIDENCE_NOTE"],
    },
    "outputs": {
        "payload": str(payload_path),
        "evidence": str(evidence_path),
        "summary": str(summary_path),
    },
    "checks": {
        "payload_present": payload_path.is_file() and payload_path.stat().st_size > 0,
        "evidence_present": evidence_path.is_file() and evidence_path.stat().st_size > 0,
        "manual_environment": manual_environment,
        "manual_review_suite": manual_review_suite,
        "summary_ok": summary_ok,
    },
    "blockers": blockers,
    "warnings": warnings,
}
pathlib.Path(os.environ["OUTPUT_JSON"]).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

status = "OK" if report["ok"] else "BLOCKED"
lines = [
    "# GBA Studio Manual GBA Emulator/Suite Payload",
    "",
    f"Status: {status}",
    f"Generated: {report['generated_at']}",
    "",
    "## Outputs",
    "",
    f"- Payload: `{payload_path}`",
    f"- Evidence: `{evidence_path}`",
    f"- Summary: `{summary_path}`",
    "",
    "## Blockers",
    "",
]
if blockers:
    lines.extend(f"- {item}" for item in blockers)
else:
    lines.append("- none")
lines.append("")
pathlib.Path(os.environ["OUTPUT_MD"]).write_text("\n".join(lines), encoding="utf-8")
PY

if python3 - "$OUTPUT_JSON" <<'PY'
import json
import sys
sys.exit(0 if json.load(open(sys.argv[1]))["ok"] else 1)
PY
then
  echo "Manual GBA emulator/suite payload ready: $PAYLOAD"
  echo "Report: $OUTPUT_JSON"
  exit 0
fi

echo "Manual GBA emulator/suite payload BLOCKED: $OUTPUT_JSON"
echo "Markdown report: $OUTPUT_MD"
exit 1
