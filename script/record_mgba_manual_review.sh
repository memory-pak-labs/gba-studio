#!/usr/bin/env bash
set -uo pipefail

DIST_DIR="${GBA_STUDIO_DIST_DIR:-/Users/example/GBAStudio-dist}"
REVIEW_DIR=""
RECORD_PATH=""
OUTPUT_JSON=""
OUTPUT_MD=""
INIT_TEMPLATE=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: script/record_mgba_manual_review.sh [options]

Creates or applies a structured manual GBA emulator/suite review record. The script does not
perform the review; it only turns an operator-filled JSON record into the
approval note expected by the final release gates.

Options:
  --dist-dir PATH        Distribution/evidence directory.
  --review-dir PATH      Manual GBA emulator/suite review package directory.
  --record PATH          Manual review record JSON.
  --init-template        Create/update a pending record template from manifest.
  --dry-run              Validate without writing approval note/manifest/checksums.
  --output PATH          JSON report.
  --markdown-output PATH Markdown report.
  --help                 Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist-dir)
      DIST_DIR="$2"
      shift 2
      ;;
    --review-dir)
      REVIEW_DIR="$2"
      shift 2
      ;;
    --record)
      RECORD_PATH="$2"
      shift 2
      ;;
    --init-template)
      INIT_TEMPLATE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
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

if [[ -z "$REVIEW_DIR" ]]; then
  REVIEW_DIR="$DIST_DIR/mgba-review"
fi
if [[ -z "$RECORD_PATH" ]]; then
  RECORD_PATH="$REVIEW_DIR/mgba_manual_review_record.json"
fi
if [[ -z "$OUTPUT_JSON" ]]; then
  OUTPUT_JSON="$DIST_DIR/mgba_manual_review_record_report.json"
fi
if [[ -z "$OUTPUT_MD" ]]; then
  OUTPUT_MD="$DIST_DIR/mgba_manual_review_record_report.md"
fi

mkdir -p "$(dirname "$OUTPUT_JSON")" "$(dirname "$OUTPUT_MD")"

export DIST_DIR
export REVIEW_DIR
export RECORD_PATH
export OUTPUT_JSON
export OUTPUT_MD
export INIT_TEMPLATE
export DRY_RUN

python3 <<'PY'
import hashlib
import json
import os
import pathlib
import re
import sys
from datetime import datetime, timezone

dist = pathlib.Path(os.environ["DIST_DIR"])
review = pathlib.Path(os.environ["REVIEW_DIR"])
record_path = pathlib.Path(os.environ["RECORD_PATH"])
output_json = pathlib.Path(os.environ["OUTPUT_JSON"])
output_md = pathlib.Path(os.environ["OUTPUT_MD"])
init_template = os.environ["INIT_TEMPLATE"] == "1"
dry_run = os.environ["DRY_RUN"] == "1"

generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

default_checks = {
    "stress_topdown_large.gba": ["boot", "input", "camera", "collision", "portal", "audio", "save"],
    "stress_platformer_large.gba": ["boot", "jump", "hazards", "checkpoint", "camera", "audio"],
    "stress_isometric_large.gba": ["boot", "depth", "grid movement", "actor collision", "audio"],
    "stress_sprites_oam_heavy.gba": ["boot", "sprites", "OAM pressure", "input"],
    "stress_tilesets_vram_heavy.gba": ["boot", "VRAM pressure", "backgrounds", "scrolling"],
    "stress_audio_heavy.gba": ["boot", "music", "sfx", "mixer", "dropouts"],
}

blockers = []
warnings = []
checks = {}
written = []


def add_check(name, ok, **extra):
    checks[name] = {"ok": bool(ok), **extra}
    if not ok:
        blockers.append(name)


def read_manifest():
    path = review / "mgba_review_manifest.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data, ""
    except Exception as error:
        return None, str(error)


def rom_names_from_manifest(manifest):
    if not isinstance(manifest, dict):
        return list(default_checks)
    names = []
    for item in manifest.get("roms") or []:
        if isinstance(item, dict) and isinstance(item.get("name"), str) and item["name"]:
            names.append(item["name"])
    return names or list(default_checks)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def derive_record_from_note(note_path, rom_names):
    if not note_path.is_file():
        return None, ["manual_approval_note_missing_for_record_derivation"]
    text = note_path.read_text(encoding="utf-8", errors="replace")
    failures = []

    def field(pattern, label):
        match = re.search(pattern, text)
        value = match.group(1).strip() if match else ""
        if not value:
            failures.append(f"manual_approval_note_missing_{label}")
        return value

    status = field(r"(?im)^\s*Status:\s*(.+?)\s*$", "status").lower()
    reviewer = field(r"(?im)^\s*Reviewer:\s*(.+?)\s*$", "reviewer")
    checked_at = field(r"(?im)^\s*Checked At:\s*(.+?)\s*$", "checked_at")
    environment = field(r"(?im)^\s*(?:Environment|Ambiente|Emulator|Emulador|Suite|Su[ií]te):\s*(.+?)\s*$", "review_environment")

    if status and not re.search(r"(?i)\b(aprovado|approved|passed)\b", status):
        failures.append("manual_approval_note_status_not_approved")
    if checked_at and not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", checked_at):
        failures.append("manual_approval_note_checked_at_invalid")
    if environment and re.search(r"(?i)\b(todo|placeholder|unknown|desconhecido|pendente|pending)\b", environment):
        failures.append("manual_approval_note_review_environment_invalid")
    if re.search(r"(?i)\b(pending|pendente|failed|reprovado|crash|white screen|tela branca|travou|todo)\b", text):
        failures.append("manual_approval_note_contains_failure_marker")

    parsed = {}
    current_rom = None
    for line in text.splitlines():
        rom_match = re.match(r"^\s*-\s+([^:]+\.gba):\s*$", line)
        if rom_match:
            current_rom = rom_match.group(1).strip()
            parsed.setdefault(current_rom, {})
            continue
        check_match = re.match(r"^\s{2,}-\s+(.+?):\s*(.+?)\s*$", line)
        if current_rom and check_match:
            check_name = check_match.group(1).strip()
            check_value = check_match.group(2).strip()
            if not check_value:
                failures.append(f"manual_approval_note_empty_check:{current_rom}:{check_name}")
                continue
            if not re.search(r"(?i)\b(ok|aprovado|approved|passed|confirmed)\b", check_value):
                failures.append(f"manual_approval_note_check_not_ok:{current_rom}:{check_name}")
            parsed[current_rom][check_name] = check_value

    roms = []
    for rom_name in rom_names:
        checks = []
        expected_checks = default_checks.get(rom_name, ["boot"])
        if rom_name not in parsed:
            failures.append(f"manual_approval_note_missing_rom:{rom_name}")
        for check_name in expected_checks:
            value = (parsed.get(rom_name) or {}).get(check_name, "")
            if not value:
                failures.append(f"manual_approval_note_missing_check:{rom_name}:{check_name}")
            checks.append({
                "name": check_name,
                "ok": bool(value),
                "note": value,
            })
        roms.append({"name": rom_name, "checks": checks})

    if failures:
        return None, sorted(set(failures))

    return {
        "kind": "gba_studio_mgba_manual_review_record",
        "status": "approved",
        "reviewer": reviewer,
        "checked_at": checked_at,
        "mgba_version": "",
        "review_environment": environment,
        "manual_review_suite": classify_manual_review_suite(environment),
        "review_dir": str(review),
        "roms": roms,
        "overall_notes": "Derived from approved manual GBA emulator/suite note.",
    }, []


manifest, manifest_error = read_manifest()
add_check("review_dir", review.is_dir(), path=str(review))
add_check("manifest_json", isinstance(manifest, dict) and manifest.get("kind") == "mgba_stress_review_package", path=str(review / "mgba_review_manifest.json"), error=manifest_error)

rom_names = rom_names_from_manifest(manifest)
record_source = ""

if init_template:
    record = {
        "kind": "gba_studio_mgba_manual_review_record",
        "status": "pending",
        "reviewer": "",
        "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
        "mgba_version": "",
        "review_environment": "",
        "manual_review_suite": "",
        "review_dir": str(review),
        "roms": [
            {
                "name": name,
                "checks": [
                    {"name": check_name, "ok": False, "note": ""}
                    for check_name in default_checks.get(name, ["boot"])
                ],
            }
            for name in rom_names
        ],
        "overall_notes": "",
        "instructions": "After opening every ROM in the selected GBA emulator or automated suite, set status to approved, fill reviewer/checked_at/review_environment, and mark every check ok=true with any relevant note.",
    }
    if not dry_run:
        record_path.parent.mkdir(parents=True, exist_ok=True)
        record_path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        written.append(str(record_path))
    add_check("record_template", True, path=str(record_path), rom_count=len(rom_names))
    blockers.append("manual_review_record_pending")
else:
    record = None
    record_error = ""
    if record_path.is_file():
        try:
            record = json.loads(record_path.read_text(encoding="utf-8"))
            record_source = "record_json"
        except Exception as error:
            record_error = str(error)
    if not (isinstance(record, dict) and record.get("kind") == "gba_studio_mgba_manual_review_record"):
        derived, derive_failures = derive_record_from_note(review / "mgba_manual_approval_note.md", rom_names)
        if derived is not None:
            record = derived
            record_source = "manual_approval_note"
            if not dry_run:
                record_path.parent.mkdir(parents=True, exist_ok=True)
                record_path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
                written.append(str(record_path))
        elif derive_failures:
            record_error = "; ".join(derive_failures)
    add_check("record_json", isinstance(record, dict) and record.get("kind") == "gba_studio_mgba_manual_review_record", path=str(record_path), source=record_source, error=record_error or ("missing" if not record_path.is_file() else ""))

    if isinstance(record, dict):
        status = str(record.get("status") or "").strip().lower()
        reviewer = str(record.get("reviewer") or "").strip()
        checked_at = str(record.get("checked_at") or "").strip()
        mgba_version = str(record.get("mgba_version") or "").strip()
        review_environment = str(record.get("review_environment") or "").strip()
        if not review_environment and mgba_version:
            review_environment = f"mGBA {mgba_version}"
        manual_review_suite = classify_manual_review_suite(review_environment)
        add_check("record_status_approved", status in {"approved", "aprovado", "passed"}, status=status)
        add_check("record_reviewer", bool(reviewer), reviewer_present=bool(reviewer))
        add_check("record_checked_at", bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", checked_at)), checked_at=checked_at)
        add_check(
            "record_review_environment",
            bool(review_environment) and not re.search(r"(?i)\b(todo|placeholder|unknown|desconhecido|pendente|pending)\b", review_environment),
            review_environment=review_environment,
        )
        add_check("record_review_suite", manual_review_suite.get("ok"), manual_review_suite=manual_review_suite)

        record_roms = record.get("roms") if isinstance(record.get("roms"), list) else []
        by_name = {item.get("name"): item for item in record_roms if isinstance(item, dict)}
        missing_roms = [name for name in rom_names if name not in by_name]
        add_check("record_roms_complete", not missing_roms, missing=missing_roms)

        failed_checks = []
        missing_checks = []
        failure_markers = []
        for rom_name in rom_names:
            item = by_name.get(rom_name) or {}
            check_entries = item.get("checks") if isinstance(item.get("checks"), list) else []
            by_check = {entry.get("name"): entry for entry in check_entries if isinstance(entry, dict)}
            for check_name in default_checks.get(rom_name, ["boot"]):
                entry = by_check.get(check_name)
                if not entry:
                    missing_checks.append(f"{rom_name}:{check_name}")
                    continue
                if entry.get("ok") is not True:
                    failed_checks.append(f"{rom_name}:{check_name}")
                note = str(entry.get("note") or "")
                if re.search(r"(?i)\b(pending|pendente|failed|reprovado|crash|white screen|tela branca|travou|todo)\b", note):
                    failure_markers.append(f"{rom_name}:{check_name}")
        add_check("record_checks_complete", not missing_checks, missing=missing_checks[:20])
        add_check("record_checks_ok", not failed_checks, failed=failed_checks[:20])
        add_check("record_notes_no_failure_markers", not failure_markers, markers=failure_markers[:20])

        if not blockers:
            note_lines = [
                "# GBA Stress Manual Approval Note",
                "",
                "Status: aprovado",
                "",
                f"Reviewer: {reviewer}",
                f"Checked At: {checked_at}",
                f"Environment: {review_environment}",
            ]
            if mgba_version:
                note_lines.append(f"mGBA Version: {mgba_version}")
            note_lines.extend(["", "## Checklist", ""])
            for rom_name in rom_names:
                note_lines.append(f"- {rom_name}:")
                item = by_name[rom_name]
                by_check = {entry.get("name"): entry for entry in item.get("checks", []) if isinstance(entry, dict)}
                for check_name in default_checks.get(rom_name, ["boot"]):
                    note = str((by_check.get(check_name) or {}).get("note") or "").strip()
                    suffix = f" - {note}" if note else ""
                    note_lines.append(f"  - {check_name}: ok{suffix}")
            overall_notes = str(record.get("overall_notes") or "").strip()
            if overall_notes:
                note_lines.extend(["", "## Notes", "", overall_notes])
            note_text = "\n".join(note_lines) + "\n"

            manifest_copy = dict(manifest)
            manifest_copy["manual_gate_status"] = "approved"
            manifest_copy["manual_review_record"] = str(record_path.relative_to(review) if record_path.is_relative_to(review) else record_path)
            manifest_copy["manual_review_checked_at"] = checked_at
            manifest_copy["manual_review_reviewer"] = reviewer
            manifest_copy["manual_review_environment"] = review_environment
            manifest_copy["manual_review_suite"] = manual_review_suite

            if not dry_run:
                (review / "mgba_manual_approval_note.md").write_text(note_text, encoding="utf-8")
                (review / "mgba_review_manifest.json").write_text(json.dumps(manifest_copy, indent=2, sort_keys=True) + "\n", encoding="utf-8")
                checksum_files = [
                    "README.md",
                    "open_all_mgba.command",
                    "mgba_review_manifest.json",
                    "mgba_manual_approval_note.md",
                    pathlib.Path(record_path).relative_to(review).as_posix() if pathlib.Path(record_path).resolve().is_relative_to(review.resolve()) else "",
                    *[f"roms/{name}" for name in rom_names],
                ]
                checksum_lines = []
                for rel in checksum_files:
                    if not rel:
                        continue
                    candidate = review / rel
                    if candidate.is_file():
                        checksum_lines.append(f"{sha256(candidate)}  {rel}")
                (review / "SHA256SUMS.txt").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")
                written.extend([
                    str(review / "mgba_manual_approval_note.md"),
                    str(review / "mgba_review_manifest.json"),
                    str(review / "SHA256SUMS.txt"),
                ])
            else:
                warnings.append("dry_run_review_not_written")

ok = not blockers
report = {
    "kind": "gba_studio_mgba_manual_review_record_report",
    "generated_at": generated_at,
    "ok": ok,
    "dry_run": dry_run,
    "init_template": init_template,
    "dist_dir": str(dist),
    "review_dir": str(review),
    "record": str(record_path),
    "record_source": record_source,
    "manual_review_suite": manual_review_suite if "manual_review_suite" in locals() else classify_manual_review_suite(""),
    "checks": checks,
    "written": written,
    "blockers": blockers,
    "warnings": warnings,
}
output_json.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

status = "OK" if ok else "BLOCKED"
lines = [
    "# GBA Studio mGBA Manual Review Record",
    "",
    f"Status: {status}",
    f"Generated: {generated_at}",
    f"Record: `{record_path}`",
    "",
    "## Checks",
    "",
]
for name, check in checks.items():
    marker = "PASS" if check.get("ok") else "FAIL"
    lines.append(f"- {name}: {marker}")
lines.extend(["", "## Blockers", ""])
if blockers:
    lines.extend(f"- `{item}`" for item in blockers)
else:
    lines.append("- none")
lines.extend(["", "## Warnings", ""])
if warnings:
    lines.extend(f"- `{item}`" for item in warnings)
else:
    lines.append("- none")
lines.append("")
output_md.write_text("\n".join(lines), encoding="utf-8")

if not ok:
    sys.exit(1)
PY

if python3 - "$OUTPUT_JSON" <<'PY'
import json
import sys
sys.exit(0 if json.load(open(sys.argv[1]))["ok"] else 1)
PY
then
  echo "Manual GBA emulator/suite review record OK: $OUTPUT_JSON"
  echo "Markdown report: $OUTPUT_MD"
  exit 0
fi

echo "Manual GBA emulator/suite review record BLOCKED: $OUTPUT_JSON"
echo "Markdown report: $OUTPUT_MD"
exit 1
