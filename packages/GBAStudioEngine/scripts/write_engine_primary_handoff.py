#!/usr/bin/env python3
import argparse
import base64
import json
import subprocess
from pathlib import Path


REQUIRED_PLATFORMS = {"macos", "windows", "linux"}


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, payload):
    Path(path).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def validate_schema(gbsdoctor, document_path, output_path):
    if not gbsdoctor:
        return
    subprocess.run(
        [
            str(gbsdoctor),
            "--validate-public-schema",
            "readiness_evidence",
            "--schema-document",
            str(document_path),
            "--json",
        ],
        check=True,
        stdout=Path(output_path).open("w", encoding="utf-8"),
    )


def valid_review_environment(value):
    text = str(value or "").strip()
    if not text:
        return False
    lowered = text.lower()
    return not any(marker in lowered for marker in ["todo", "placeholder", "unknown", "pending", "pendente", "desconhecido"])


def skipped_handoff(output_dir):
    payload = {
        "kind": "engine_primary_readiness_evidence_handoff",
        "ok": False,
        "reason": "manual_mgba_readiness_evidence_base64 input was not provided",
        "next_action": "Run workflow_dispatch with real manual_mgba_stress_smoke readiness evidence to produce the app handoff artifact.",
    }
    write_json(output_dir / "engine_primary_handoff_skipped.json", payload)


def decode_manual_evidence(manual_mgba_evidence_base64, manual_mgba_evidence_path, output_dir):
    if manual_mgba_evidence_path:
        payload = Path(manual_mgba_evidence_path).read_bytes()
    elif manual_mgba_evidence_base64:
        payload = base64.b64decode(manual_mgba_evidence_base64)
    else:
        return None

    output = output_dir / "readiness_evidence_mgba_manual.json"
    output.write_bytes(payload)
    return output


def merge_engine_primary_evidence(cross_platform, manual):
    merged = dict(cross_platform)
    merged["manual_mgba_stress_smoke"] = manual.get("manual_mgba_stress_smoke")
    return merged


def assert_engine_primary_handoff_contract(evidence):
    manual_gate = evidence.get("manual_mgba_stress_smoke") or {}
    hardware_gate = evidence.get("hardware_or_ci_validation") or {}
    if manual_gate.get("ok") is not True:
        raise SystemExit("manual_mgba_stress_smoke must be true for the app handoff.")
    if manual_gate.get("evidence_type") != "manual_mgba_stress_smoke":
        raise SystemExit("manual_mgba_stress_smoke evidence_type must be manual_mgba_stress_smoke.")
    if not valid_review_environment(manual_gate.get("review_environment")):
        raise SystemExit("manual_mgba_stress_smoke review_environment must name the real emulator or suite.")
    if hardware_gate.get("ok") is not True:
        raise SystemExit("hardware_or_ci_validation must be true for the app handoff.")
    if hardware_gate.get("evidence_type") != "cross_platform_ci":
        raise SystemExit("hardware_or_ci_validation evidence_type must be cross_platform_ci.")
    platforms = set(hardware_gate.get("validated_platforms") or [])
    if platforms != REQUIRED_PLATFORMS:
        missing = ", ".join(sorted(REQUIRED_PLATFORMS - platforms))
        raise SystemExit(f"hardware_or_ci_validation is missing required platforms: {missing}")


def write_handoff(
    cross_platform_evidence_path,
    manual_mgba_evidence_base64,
    manual_mgba_evidence_path,
    output_dir,
    gbsdoctor=None,
):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manual_path = decode_manual_evidence(manual_mgba_evidence_base64, manual_mgba_evidence_path, output_dir)
    if manual_path is None:
        skipped_handoff(output_dir)
        return False
    if cross_platform_evidence_path is None:
        raise SystemExit("--cross-platform-evidence is required when manual mGBA evidence is provided.")

    validate_schema(gbsdoctor, manual_path, output_dir / "readiness_evidence_mgba_manual_validation.json")
    cross_platform = load_json(cross_platform_evidence_path)
    manual = load_json(manual_path)
    merged = merge_engine_primary_evidence(cross_platform, manual)
    assert_engine_primary_handoff_contract(merged)

    merged_path = output_dir / "readiness_evidence_engine_primary.json"
    write_json(merged_path, merged)
    validate_schema(gbsdoctor, merged_path, output_dir / "readiness_evidence_engine_primary_validation.json")

    encoded = base64.b64encode(merged_path.read_bytes()).decode("ascii")
    (output_dir / "readiness_evidence_engine_primary_base64.txt").write_text(encoded + "\n", encoding="utf-8")
    summary = {
        "kind": "engine_primary_readiness_evidence_handoff",
        "ok": True,
        "private_maturation_only": True,
        "readiness_evidence": "readiness_evidence_engine_primary.json",
        "base64_payload": "readiness_evidence_engine_primary_base64.txt",
        "app_secret_name": "GBASTUDIO_ENGINE_PRIMARY_READINESS_EVIDENCE_BASE64",
        "app_workflow_input": "engine_primary_readiness_evidence_base64",
        "included_gates": [
            "manual_mgba_stress_smoke",
            "hardware_or_ci_validation",
            "gba_studio_engine_primary_rollout",
        ],
        "required_platforms": sorted(REQUIRED_PLATFORMS),
        "hardware_or_ci_validation": {
            "evidence_type": merged["hardware_or_ci_validation"].get("evidence_type"),
            "validated_platforms": sorted(merged["hardware_or_ci_validation"].get("validated_platforms") or []),
            "source": merged["hardware_or_ci_validation"].get("source"),
            "checked_at": merged["hardware_or_ci_validation"].get("checked_at"),
        },
        "note": "Use the base64 payload as the app release workflow input/secret; the app workflow adds its own private engine-primary rollout evidence before the final gate.",
    }
    write_json(output_dir / "engine_primary_handoff_summary.json", summary)
    return True


def main():
    parser = argparse.ArgumentParser(description="Write the Engine primary readiness handoff consumed by the app release workflow.")
    parser.add_argument("--cross-platform-evidence", help="Merged cross-platform CI readiness evidence JSON.")
    parser.add_argument("--manual-mgba-evidence-base64", default="", help="Base64-encoded manual mGBA readiness evidence JSON.")
    parser.add_argument("--manual-mgba-evidence-file", help="Manual mGBA readiness evidence JSON file.")
    parser.add_argument("--output-dir", required=True, help="Directory where handoff files will be written.")
    parser.add_argument("--gbsdoctor", help="Optional gbsdoctor executable used for schema validation.")
    args = parser.parse_args()

    wrote = write_handoff(
        cross_platform_evidence_path=Path(args.cross_platform_evidence) if args.cross_platform_evidence else None,
        manual_mgba_evidence_base64=args.manual_mgba_evidence_base64,
        manual_mgba_evidence_path=Path(args.manual_mgba_evidence_file) if args.manual_mgba_evidence_file else None,
        output_dir=Path(args.output_dir),
        gbsdoctor=Path(args.gbsdoctor) if args.gbsdoctor else None,
    )
    print("Engine primary handoff written." if wrote else "Engine primary handoff skipped.")


if __name__ == "__main__":
    main()
