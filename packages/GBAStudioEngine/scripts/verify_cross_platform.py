#!/usr/bin/env python3
import argparse
from datetime import datetime, timezone
import json
import platform
import subprocess
import sys
from pathlib import Path


def run_json(command):
    result = subprocess.run(command, check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        return {
            "ok": False,
            "returncode": result.returncode,
            "stderr": result.stderr,
        }
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        return {
            "ok": False,
            "returncode": result.returncode,
            "stderr": f"invalid json: {error}",
        }
    payload["returncode"] = result.returncode
    return payload


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_readiness_evidence(path, checked_at, source, message, evidence_type, validated_platform):
    payload = {
        "manual_mgba_stress_smoke": {
            "ok": False,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "mGBA stress smoke report path",
            "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
            "message": "Confirm stress ROMs manually with scripts/smoke_mgba.sh --stress --manual-pass.",
        },
        "hardware_or_ci_validation": {
            "ok": True,
            "evidence_type": evidence_type,
            "source": source,
            "checked_at": checked_at,
            "message": message,
            "validated_platforms": [validated_platform] if evidence_type in ("cross_platform_ci", "local_cross_platform_dry_run") else [],
        },
        "gba_studio_engine_primary_rollout": {
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "GBA Studio private engine-primary export smoke log path or note",
            "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
            "message": "Keep gbastudio_engine as the private primary backend gate while preserving Butano only as legacy rollback.",
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload


def platform_validation_label(hardware_ci_pass, evidence_type):
    if not hardware_ci_pass:
        return "validated-local-dry-run"
    if evidence_type == "cross_platform_ci":
        return "validated-cross-platform-ci"
    if evidence_type == "hardware_real":
        return "validated-hardware-real"
    return "validated-local-dry-run"


def evidence_can_skip_toolchain(evidence_type):
    return evidence_type == "cross_platform_ci"


def resolve_platform_key(system_name, validated_platform):
    if validated_platform:
        return validated_platform
    lowered = (system_name or "").lower()
    if lowered == "darwin":
        return "macos"
    if lowered == "linux":
        return "linux"
    if lowered == "windows" or lowered.startswith(("mingw", "msys", "cygwin")):
        return "windows"
    return lowered or "unknown"


def main():
    parser = argparse.ArgumentParser(description="GBAStudio Engine Pack cross-platform local verifier")
    parser.add_argument("--engine-pack", default="dist/GBAStudioEnginePack")
    parser.add_argument("--project-dir", default="build/verify-package/generated_project")
    parser.add_argument("--output", default="build/cross-platform-report.json")
    parser.add_argument("--skip-toolchain", action="store_true")
    parser.add_argument("--hardware-ci-pass", action="store_true", help="Confirma explicitamente que esta execucao conta como evidencia de hardware/CI.")
    parser.add_argument("--write-readiness-evidence", help="Grava readiness_evidence.json parcial para o gate hardware_or_ci_validation.")
    parser.add_argument("--evidence-source", help="Origem registrada na evidencia de hardware/CI.")
    parser.add_argument("--evidence-message", help="Mensagem registrada na evidencia de hardware/CI.")
    parser.add_argument("--evidence-type", default="cross_platform_ci", choices=["hardware_real", "cross_platform_ci", "local_cross_platform_dry_run"], help="Tipo de evidencia gravado no gate hardware_or_ci_validation.")
    parser.add_argument("--validated-platform", choices=["macos", "windows", "linux"], help="Plataforma canonica validada por este job de CI.")
    args = parser.parse_args()
    if args.write_readiness_evidence and not args.hardware_ci_pass:
        parser.error("--write-readiness-evidence exige --hardware-ci-pass.")
    if args.write_readiness_evidence and args.skip_toolchain and not evidence_can_skip_toolchain(args.evidence_type):
        parser.error("--write-readiness-evidence com --skip-toolchain exige --evidence-type cross_platform_ci.")

    root = Path.cwd()
    engine_pack = (root / args.engine_pack).resolve()
    project_dir = (root / args.project_dir).resolve()
    output_path = (root / args.output).resolve()
    evidence_path = (root / args.write_readiness_evidence).resolve() if args.write_readiness_evidence else None
    doctor = engine_pack / "tools" / "gbsdoctor"
    build = engine_pack / "tools" / "gbsbuild"

    doctor_command = [
        str(doctor),
        "--engine-pack",
        str(engine_pack),
        "--project-dir",
        str(project_dir),
        "--json",
    ]
    if args.skip_toolchain:
        doctor_command.append("--skip-toolchain")

    build_command = [
        str(build),
        "--engine-pack",
        str(engine_pack),
        "--project-dir",
        str(project_dir),
        "--target",
        "cross_platform_probe",
        "--dry-run",
        "--json",
    ]

    doctor_report = run_json(doctor_command)
    build_report = run_json(build_command)
    current_system = platform.system()
    current_key = resolve_platform_key(current_system, args.validated_platform)

    platforms = {
        "macos": "pending",
        "windows": "pending",
        "linux": "pending",
    }
    if current_key in platforms and doctor_report.get("ok") and build_report.get("command"):
        platforms[current_key] = platform_validation_label(args.hardware_ci_pass, args.evidence_type)

    checked_at = utc_now()
    report = {
        "ok": doctor_report.get("ok", False) and bool(build_report.get("command")),
        "platform": {
            "system": current_system,
            "machine": platform.machine(),
            "python": platform.python_version(),
        },
        "engine_pack": str(engine_pack),
        "project_dir": str(project_dir),
        "platform_status": platforms,
        "doctor": doctor_report,
        "build_dry_run": build_report,
        "notes": [
            "Este verificador prova a plataforma atual.",
            "Windows/Linux so devem ser marcados como validados quando este script rodar nesses sistemas reais ou em CI equivalente.",
        ],
    }

    if evidence_path:
        report["readiness_evidence"] = {
            "requested": True,
            "path": str(evidence_path),
            "gate": "hardware_or_ci_validation",
            "written": False,
        }
        if report["ok"]:
            source = args.evidence_source or str(output_path)
            if args.evidence_message:
                message = args.evidence_message
            elif args.evidence_type == "local_cross_platform_dry_run":
                message = (
                    f"Local cross-platform dry-run passed on {current_key}; "
                    "archive only, does not promote primary backend."
                )
            else:
                message = (
                    f"Cross-platform verifier passed on {current_key}; operator confirmed this run as hardware/CI evidence."
                )
            write_readiness_evidence(evidence_path, checked_at, source, message, args.evidence_type, current_key)
            report["readiness_evidence"]["written"] = True
            report["readiness_evidence"]["source"] = source
            report["readiness_evidence"]["evidence_type"] = args.evidence_type

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
