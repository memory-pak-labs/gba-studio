#!/usr/bin/env python3
import argparse
import base64
import json
import os
import subprocess
from pathlib import Path


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


def assert_manual_mgba_contract(evidence):
    gate = evidence.get("manual_mgba_stress_smoke") or {}
    if gate.get("ok") is not True:
        raise SystemExit("manual_mgba_stress_smoke must be true before writing the handoff payload.")
    if gate.get("evidence_type") != "manual_mgba_stress_smoke":
        raise SystemExit("manual_mgba_stress_smoke evidence_type must be manual_mgba_stress_smoke.")
    source = str(gate.get("source") or "")
    if not source or source == "mGBA stress smoke log path or note":
        raise SystemExit("manual_mgba_stress_smoke source must point to the real manual report or approval note.")
    if not valid_review_environment(gate.get("review_environment")):
        raise SystemExit("manual_mgba_stress_smoke review_environment must name the real emulator or suite.")


def write_handoff_from_evidence(readiness_evidence_path, output_dir, gbsdoctor=None):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    readiness_evidence_path = Path(readiness_evidence_path)
    evidence = load_json(readiness_evidence_path)
    assert_manual_mgba_contract(evidence)

    copied_evidence = output_dir / "readiness_evidence_mgba_manual.json"
    copied_evidence.write_bytes(readiness_evidence_path.read_bytes())
    validate_schema(gbsdoctor, copied_evidence, output_dir / "readiness_evidence_mgba_manual_validation.json")

    encoded = base64.b64encode(copied_evidence.read_bytes()).decode("ascii")
    (output_dir / "readiness_evidence_mgba_manual_base64.txt").write_text(encoded + "\n", encoding="utf-8")
    summary = {
        "kind": "mgba_manual_readiness_evidence_handoff",
        "ok": True,
        "readiness_evidence": "readiness_evidence_mgba_manual.json",
        "base64_payload": "readiness_evidence_mgba_manual_base64.txt",
        "engine_workflow_input": "manual_mgba_readiness_evidence_base64",
        "note": "Use the base64 payload as the Engine CI workflow_dispatch input after the manual mGBA review has truly passed.",
    }
    write_json(output_dir / "mgba_manual_handoff_summary.json", summary)
    return True


def run_smoke_mgba(
    smoke_script,
    manual_evidence_note,
    readiness_evidence_path,
    report_path,
    evidence_source,
    evidence_message,
    mgba_app,
    mgba_bin,
):
    env = os.environ.copy()
    env["REPORT_PATH"] = str(report_path)
    if mgba_app:
        env["MGBA_APP"] = str(mgba_app)
    if mgba_bin:
        env["MGBA_BIN"] = str(mgba_bin)
    subprocess.run(
        [
            str(smoke_script),
            "--stress",
            "--manual-pass",
            "--manual-evidence-note",
            str(manual_evidence_note),
            "--write-readiness-evidence",
            str(readiness_evidence_path),
            "--evidence-source",
            str(evidence_source),
            "--evidence-message",
            str(evidence_message),
        ],
        check=True,
        env=env,
    )


def main():
    parser = argparse.ArgumentParser(description="Write the manual mGBA readiness handoff consumed by Engine CI.")
    parser.add_argument("--readiness-evidence", help="Existing manual_mgba_stress_smoke readiness evidence JSON.")
    parser.add_argument("--manual-evidence-note", help="Approved manual mGBA note used to run smoke_mgba.sh.")
    parser.add_argument("--output-dir", required=True, help="Directory where handoff files will be written.")
    parser.add_argument("--report-path", help="Manual mGBA smoke report path when running smoke_mgba.sh.")
    parser.add_argument("--evidence-source", help="Evidence source recorded inside readiness evidence.")
    parser.add_argument("--evidence-message", default="Stress ROMs opened and manually confirmed in mGBA.")
    parser.add_argument("--smoke-script", default="scripts/smoke_mgba.sh")
    parser.add_argument("--gbsdoctor", help="Optional gbsdoctor executable used for schema validation.")
    parser.add_argument("--mgba-app", help="mGBA.app path used by smoke_mgba.sh.")
    parser.add_argument("--mgba-bin", help="mGBA executable used by smoke_mgba.sh.")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    readiness_evidence = Path(args.readiness_evidence) if args.readiness_evidence else output_dir / "readiness_evidence_mgba_manual.json"

    if args.manual_evidence_note:
        report_path = Path(args.report_path) if args.report_path else output_dir / "mgba_stress_manual_report.md"
        evidence_source = Path(args.evidence_source) if args.evidence_source else report_path
        run_smoke_mgba(
            smoke_script=Path(args.smoke_script),
            manual_evidence_note=Path(args.manual_evidence_note),
            readiness_evidence_path=readiness_evidence,
            report_path=report_path,
            evidence_source=evidence_source,
            evidence_message=args.evidence_message,
            mgba_app=Path(args.mgba_app) if args.mgba_app else None,
            mgba_bin=Path(args.mgba_bin) if args.mgba_bin else None,
        )
    elif not args.readiness_evidence:
        raise SystemExit("Provide --readiness-evidence or --manual-evidence-note.")

    write_handoff_from_evidence(
        readiness_evidence_path=readiness_evidence,
        output_dir=output_dir,
        gbsdoctor=Path(args.gbsdoctor) if args.gbsdoctor else None,
    )
    print(f"mGBA manual handoff: {output_dir}")


if __name__ == "__main__":
    main()
