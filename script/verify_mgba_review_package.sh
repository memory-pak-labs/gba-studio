#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${GBA_STUDIO_DIST_DIR:-/Users/example/GBAStudio-dist}"
REVIEW_DIR=""
OUTPUT_JSON=""
OUTPUT_MD=""

usage() {
  cat <<'EOF'
Usage: script/verify_mgba_review_package.sh [options]

Verifies the manual GBA emulator/suite stress review package structure, ROM checksums, manifest
metadata, and manual approval note readiness.

Options:
  --dist-dir PATH        Distribution/evidence directory.
  --review-dir PATH      Manual GBA emulator/suite review package directory.
  --output PATH          JSON verification report.
  --markdown-output PATH Markdown verification report.
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
if [[ -z "$OUTPUT_JSON" ]]; then
  OUTPUT_JSON="$DIST_DIR/mgba_review_package_verification_report.json"
fi
if [[ -z "$OUTPUT_MD" ]]; then
  OUTPUT_MD="$DIST_DIR/mgba_review_package_verification_report.md"
fi

mkdir -p "$(dirname "$OUTPUT_JSON")" "$(dirname "$OUTPUT_MD")"

export DIST_DIR
export REVIEW_DIR
export OUTPUT_JSON
export OUTPUT_MD

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
output_json = pathlib.Path(os.environ["OUTPUT_JSON"])
output_md = pathlib.Path(os.environ["OUTPUT_MD"])

required_roms = [
    "stress_topdown_large.gba",
    "stress_platformer_large.gba",
    "stress_isometric_large.gba",
    "stress_sprites_oam_heavy.gba",
    "stress_tilesets_vram_heavy.gba",
    "stress_audio_heavy.gba",
]
required_files = [
    "README.md",
    "SHA256SUMS.txt",
    "mgba_manual_approval_note.md",
    "mgba_review_manifest.json",
    "open_all_mgba.command",
]

blockers = []
warnings = []
checks = {}


def add_check(name, ok, **extra):
    checks[name] = {"ok": bool(ok), **extra}
    if not ok:
        blockers.append(name)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_child(base, rel):
    candidate = (base / rel).resolve()
    base_resolved = base.resolve()
    if candidate == base_resolved or base_resolved in candidate.parents:
        return candidate, ""
    return candidate, "path_outside_review_dir"


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


add_check("review_dir", review.is_dir(), path=str(review))

missing_files = []
if review.is_dir():
    missing_files = [rel for rel in required_files if not (review / rel).is_file()]
add_check("required_files", review.is_dir() and not missing_files, missing=missing_files)

manifest_path = review / "mgba_review_manifest.json"
manifest = None
manifest_error = ""
if manifest_path.is_file():
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as error:
        manifest_error = str(error)
add_check(
    "manifest_json",
    isinstance(manifest, dict) and manifest.get("kind") == "mgba_stress_review_package",
    path=str(manifest_path),
    error=manifest_error,
)

manifest_roms = []
manifest_failures = []
if isinstance(manifest, dict):
    rom_entries = manifest.get("roms") or []
    if not isinstance(rom_entries, list):
        manifest_failures.append({"error": "roms is not a list"})
        rom_entries = []
    for item in rom_entries:
        if not isinstance(item, dict):
            manifest_failures.append({"item": item, "error": "rom entry is not an object"})
            continue
        name = item.get("name")
        packaged_path = item.get("packaged_path")
        expected_size = item.get("size_bytes")
        if not name or not packaged_path:
            manifest_failures.append({"item": item, "error": "missing name or packaged_path"})
            continue
        manifest_roms.append(name)
        candidate, path_error = safe_child(review, packaged_path)
        if path_error:
            manifest_failures.append({"name": name, "path": packaged_path, "error": path_error})
            continue
        if not candidate.is_file():
            manifest_failures.append({"name": name, "path": packaged_path, "error": "missing"})
            continue
        actual_size = candidate.stat().st_size
        if actual_size <= 0:
            manifest_failures.append({"name": name, "path": packaged_path, "error": "empty"})
        if expected_size != actual_size:
            manifest_failures.append({
                "name": name,
                "path": packaged_path,
                "error": "size_mismatch",
                "expected_size": expected_size,
                "actual_size": actual_size,
            })
    missing_manifest_roms = [name for name in required_roms if name not in manifest_roms]
    if missing_manifest_roms:
        manifest_failures.append({"error": "required_roms_missing", "missing": missing_manifest_roms})

    if manifest.get("manual_gate") != "manual_mgba_stress_smoke":
        manifest_failures.append({"error": "manual_gate_mismatch", "manual_gate": manifest.get("manual_gate")})
    gate_status = str(manifest.get("manual_gate_status", "")).strip().lower()
    if gate_status not in {"approved", "aprovado", "passed", "pending", "pendente"}:
        manifest_failures.append({"error": "manual_gate_status_unknown", "manual_gate_status": gate_status})
    elif gate_status in {"pending", "pendente"}:
        warnings.append("manifest_manual_gate_status_pending")

add_check("manifest_rom_entries", isinstance(manifest, dict) and not manifest_failures, failures=manifest_failures)

checksum_path = review / "SHA256SUMS.txt"
checksum_failures = []
checksum_count = 0
if checksum_path.is_file():
    for line in checksum_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        checksum_count += 1
        try:
            expected, rel = line.split(None, 1)
        except ValueError:
            checksum_failures.append({"line": line, "error": "invalid_checksum_line"})
            continue
        expected = expected.strip().lower()
        rel = rel.strip()
        if rel.startswith("*"):
            rel = rel[1:]
        candidate, path_error = safe_child(review, rel)
        if not re.fullmatch(r"[0-9a-f]{64}", expected):
            checksum_failures.append({"path": rel, "error": "invalid_sha256", "expected": expected})
            continue
        if path_error:
            checksum_failures.append({"path": rel, "error": path_error})
            continue
        if not candidate.is_file():
            checksum_failures.append({"path": rel, "error": "missing"})
            continue
        actual = sha256(candidate)
        if actual != expected:
            checksum_failures.append({"path": rel, "expected": expected, "actual": actual})
add_check(
    "checksums",
    checksum_path.is_file() and checksum_count > 0 and not checksum_failures,
    count=checksum_count,
    failures=checksum_failures,
)

note_path = review / "mgba_manual_approval_note.md"
note_blockers = []
note_warnings = []
note_text = ""
manual_environment = ""
manual_review_suite = classify_manual_review_suite("")
if not note_path.is_file():
    note_blockers.append("manual_evidence_note_missing")
else:
    note_text = note_path.read_text(encoding="utf-8", errors="replace")
    status_match = re.search(r"(?im)^\s*Status:\s*(.+?)\s*$", note_text)
    status = status_match.group(1).strip() if status_match else ""
    if not re.search(r"(?i)\b(aprovado|approved|passed)\b", status):
        note_blockers.append("manual_evidence_note_status_not_approved")
    if re.search(r"(?i)\b(pendente|pending|failed|reprovado|travou|crash|tela branca|white screen|todo)\b", note_text):
        note_blockers.append("manual_evidence_note_contains_pending_or_failure_marker")

    environment_match = re.search(
        r"(?im)^\s*(Environment|Ambiente|Emulator|Emulador|Suite|Su[ií]te|mGBA Version)\s*:\s*(.+?)\s*$",
        note_text,
    )
    if environment_match:
        label = environment_match.group(1).strip()
        value = environment_match.group(2).strip()
        manual_environment = f"mGBA {value}" if label.lower() == "mgba version" else value
    if not manual_environment:
        note_blockers.append("manual_evidence_note_missing_review_environment")
    elif re.search(r"(?i)\b(todo|placeholder|unknown|desconhecido|pendente|pending)\b", manual_environment):
        note_blockers.append("manual_evidence_note_invalid_review_environment")
    else:
        manual_review_suite = classify_manual_review_suite(manual_environment)
        if not manual_review_suite.get("ok"):
            note_blockers.append("manual_evidence_note_unsupported_review_suite")

    missing_note_roms = [name for name in required_roms if name not in note_text]
    if missing_note_roms:
        note_blockers.append("manual_evidence_note_missing_required_roms:" + ",".join(missing_note_roms))

    empty_checks = []
    for line in note_text.splitlines():
        match = re.match(r"^\s{2,}-\s+(.+?):\s*$", line)
        if match:
            empty_checks.append(match.group(1).strip())
    if empty_checks:
        note_blockers.append("manual_evidence_note_has_empty_check_items:" + ",".join(empty_checks[:8]))
        if len(empty_checks) > 8:
            note_warnings.append(f"manual_evidence_note_empty_check_items_truncated:{len(empty_checks)}")

warnings.extend(note_warnings)
checks["manual_approval_note"] = {
    "ok": not note_blockers,
    "path": str(note_path),
    "manual_environment": manual_environment,
    "manual_review_suite": manual_review_suite,
    "blockers": note_blockers,
    "warnings": note_warnings,
}
blockers.extend(note_blockers)

open_command = review / "open_all_mgba.command"
if open_command.is_file() and not os.access(open_command, os.X_OK):
    warnings.append("open_all_mgba_command_not_executable")

mgba_binary = ""
if isinstance(manifest, dict):
    mgba_binary = str(manifest.get("mgba") or "")
    if mgba_binary and not pathlib.Path(mgba_binary).exists():
        warnings.append("mgba_binary_not_found_on_this_machine")

integrity_check_names = ["review_dir", "required_files", "manifest_json", "manifest_rom_entries", "checksums"]
integrity_ok = all(checks.get(name, {}).get("ok") for name in integrity_check_names)
manual_review_ready = not note_blockers
ok = integrity_ok and manual_review_ready

report = {
    "kind": "gba_studio_mgba_review_package_verification",
    "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "ok": ok,
    "integrity_ok": integrity_ok,
    "manual_review_ready": manual_review_ready,
    "dist_dir": str(dist),
    "review_dir": str(review),
    "mgba_binary": mgba_binary,
    "manual_environment": manual_environment,
    "manual_review_suite": manual_review_suite,
    "checks": checks,
    "blockers": blockers,
    "warnings": warnings,
}

output_json.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

status = "OK" if ok else "BLOCKED"
lines = [
    "# GBA Studio mGBA Review Package Verification",
    "",
    f"Status: {status}",
    f"Integrity OK: {integrity_ok}",
    f"Manual Review Ready: {manual_review_ready}",
    f"Generated: {report['generated_at']}",
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

echo "Manual GBA emulator/suite review package verification OK: $OUTPUT_JSON"
echo "Markdown report: $OUTPUT_MD"
