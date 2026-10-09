#!/usr/bin/env python3
import importlib.util
import base64
import json
import tempfile
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]


def load_verify_cross_platform():
    spec = importlib.util.spec_from_file_location(
        "verify_cross_platform",
        REPO / "scripts" / "verify_cross_platform.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_engine_primary_handoff():
    spec = importlib.util.spec_from_file_location(
        "write_engine_primary_handoff",
        REPO / "scripts" / "write_engine_primary_handoff.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_mgba_manual_handoff():
    spec = importlib.util.spec_from_file_location(
        "write_mgba_manual_handoff",
        REPO / "scripts" / "write_mgba_manual_handoff.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_platform_status_labels_match_evidence_scope():
    verify_cross_platform = load_verify_cross_platform()

    assert verify_cross_platform.platform_validation_label(False, "cross_platform_ci") == "validated-local-dry-run"
    assert verify_cross_platform.platform_validation_label(True, "local_cross_platform_dry_run") == "validated-local-dry-run"
    assert verify_cross_platform.platform_validation_label(True, "cross_platform_ci") == "validated-cross-platform-ci"
    assert verify_cross_platform.platform_validation_label(True, "hardware_real") == "validated-hardware-real"


def test_skip_toolchain_evidence_is_limited_to_cross_platform_ci():
    verify_cross_platform = load_verify_cross_platform()

    assert verify_cross_platform.evidence_can_skip_toolchain("cross_platform_ci") is True
    assert verify_cross_platform.evidence_can_skip_toolchain("local_cross_platform_dry_run") is False
    assert verify_cross_platform.evidence_can_skip_toolchain("hardware_real") is False


def test_platform_key_uses_ci_override_and_normalizes_msys():
    verify_cross_platform = load_verify_cross_platform()

    assert verify_cross_platform.resolve_platform_key("Darwin", None) == "macos"
    assert verify_cross_platform.resolve_platform_key("Linux", None) == "linux"
    assert verify_cross_platform.resolve_platform_key("MINGW64_NT-10.0-26100", None) == "windows"
    assert verify_cross_platform.resolve_platform_key("Linux", "windows") == "windows"


def test_engine_ci_workflow_merges_cross_platform_ci_evidence():
    workflow = (REPO / ".github" / "workflows" / "engine-ci.yml").read_text(encoding="utf-8")
    makefile = (REPO / "Makefile").read_text(encoding="utf-8")

    assert "push:\n    branches: [main]" in workflow
    assert "pull_request:" in workflow
    assert "workflow_dispatch:" in workflow
    assert "Validate private maturation policy" in workflow
    assert "GBA_STUDIO_PRIVATE_MATURITY_ONLY" in workflow
    assert "github.event.repository.private" in workflow
    assert "private-maturation only" in workflow
    assert "manual_mgba_readiness_evidence_base64" in workflow
    assert "cross-platform-ci-evidence:" in workflow
    assert "merge-cross-platform-evidence:" in workflow
    assert "readiness_evidence_cross_platform_merged.json" in workflow
    assert "readiness_evidence_engine_primary.json" in workflow
    assert "readiness_evidence_engine_primary_base64.txt" in workflow
    assert "engine-primary-readiness-evidence-handoff" in workflow
    assert "scripts/write_engine_primary_handoff.py" in workflow
    assert "required_missing" in workflow
    assert "Merged cross-platform CI evidence is still missing required platforms." in workflow
    assert "--validated-platform \"$platform\"" in workflow
    assert "--merge-readiness-evidence" in workflow
    assert "macos-latest" in workflow
    assert "ubuntu-latest" in workflow
    assert "windows-latest" in workflow
    assert workflow.count("make host-test") == 2
    assert "host-test:" in makefile
    assert "gbsbuild-host-test:" in makefile
    assert "gbsbuild-test: gbsbuild-host-test check-toolchain" in makefile


def test_engine_primary_handoff_writes_skipped_summary_without_manual_evidence():
    handoff = load_engine_primary_handoff()

    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp)
        result = handoff.write_handoff(
            cross_platform_evidence_path=None,
            manual_mgba_evidence_base64="",
            manual_mgba_evidence_path=None,
            output_dir=output_dir,
        )

        assert result is False
        skipped = json.loads((output_dir / "engine_primary_handoff_skipped.json").read_text())
        assert skipped["kind"] == "engine_primary_readiness_evidence_handoff"
        assert skipped["ok"] is False
        assert "manual_mgba_readiness_evidence_base64" in skipped["reason"]


def test_engine_primary_handoff_merges_evidence_and_writes_app_payload():
    handoff = load_engine_primary_handoff()
    cross_platform = {
        "manual_mgba_stress_smoke": {
            "ok": False,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        },
        "hardware_or_ci_validation": {
            "ok": True,
            "evidence_type": "cross_platform_ci",
            "source": "github actions",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "macOS/Linux/Windows passed",
            "validated_platforms": ["macos", "windows", "linux"]
        },
        "gba_studio_engine_primary_rollout": {
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "app workflow",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "app adds private engine-primary rollout evidence"
        }
    }
    manual = {
        "manual_mgba_stress_smoke": {
            "ok": True,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "manual mGBA approval note",
            "checked_at": "2026-06-24T00:00:00Z",
            "review_environment": "mGBA fixture",
            "message": "approved"
        },
        "hardware_or_ci_validation": {
            "ok": False,
            "evidence_type": "cross_platform_ci",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        },
        "gba_studio_engine_primary_rollout": {
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        }
    }

    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp)
        cross_path = output_dir / "cross.json"
        cross_path.write_text(json.dumps(cross_platform), encoding="utf-8")
        manual_base64 = base64.b64encode(json.dumps(manual).encode("utf-8")).decode("ascii")

        result = handoff.write_handoff(
            cross_platform_evidence_path=cross_path,
            manual_mgba_evidence_base64=manual_base64,
            manual_mgba_evidence_path=None,
            output_dir=output_dir,
        )

        assert result is True
        merged_path = output_dir / "readiness_evidence_engine_primary.json"
        merged = json.loads(merged_path.read_text())
        assert merged["manual_mgba_stress_smoke"]["ok"] is True
        assert merged["hardware_or_ci_validation"]["ok"] is True
        assert set(merged["hardware_or_ci_validation"]["validated_platforms"]) == {"macos", "windows", "linux"}
        payload = (output_dir / "readiness_evidence_engine_primary_base64.txt").read_text().strip()
        assert json.loads(base64.b64decode(payload)) == merged
        summary = json.loads((output_dir / "engine_primary_handoff_summary.json").read_text())
        assert summary["app_secret_name"] == "GBASTUDIO_ENGINE_PRIMARY_READINESS_EVIDENCE_BASE64"
        assert summary["private_maturation_only"] is True
        assert set(summary["required_platforms"]) == {"macos", "windows", "linux"}
        assert summary["included_gates"] == [
            "manual_mgba_stress_smoke",
            "hardware_or_ci_validation",
            "gba_studio_engine_primary_rollout",
        ]
        assert summary["hardware_or_ci_validation"]["evidence_type"] == "cross_platform_ci"
        assert set(summary["hardware_or_ci_validation"]["validated_platforms"]) == {"macos", "windows", "linux"}


def test_engine_primary_handoff_rejects_manual_evidence_without_environment():
    handoff = load_engine_primary_handoff()
    cross_platform = {
        "manual_mgba_stress_smoke": {
            "ok": False,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        },
        "hardware_or_ci_validation": {
            "ok": True,
            "evidence_type": "cross_platform_ci",
            "source": "github actions",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "macOS/Linux/Windows passed",
            "validated_platforms": ["macos", "windows", "linux"]
        },
        "gba_studio_engine_primary_rollout": {
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "app workflow",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "app adds private engine-primary rollout evidence"
        }
    }
    manual = {
        "manual_mgba_stress_smoke": {
            "ok": True,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "manual NanoBoyAdvance approval note",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "approved"
        },
        "hardware_or_ci_validation": {
            "ok": False,
            "evidence_type": "cross_platform_ci",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        },
        "gba_studio_engine_primary_rollout": {
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        }
    }

    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp)
        cross_path = output_dir / "cross.json"
        cross_path.write_text(json.dumps(cross_platform), encoding="utf-8")
        manual_base64 = base64.b64encode(json.dumps(manual).encode("utf-8")).decode("ascii")

        try:
            handoff.write_handoff(
                cross_platform_evidence_path=cross_path,
                manual_mgba_evidence_base64=manual_base64,
                manual_mgba_evidence_path=None,
                output_dir=output_dir,
            )
        except SystemExit as error:
            assert "review_environment" in str(error)
        else:
            raise AssertionError("manual evidence without review_environment was accepted")


def test_engine_primary_handoff_rejects_incomplete_or_local_ci_evidence():
    handoff = load_engine_primary_handoff()
    manual = {
        "manual_mgba_stress_smoke": {
            "ok": True,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "manual mGBA approval note",
            "checked_at": "2026-06-24T00:00:00Z",
            "review_environment": "mGBA 0.10.5",
            "message": "approved"
        },
        "hardware_or_ci_validation": {
            "ok": False,
            "evidence_type": "cross_platform_ci",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        },
        "gba_studio_engine_primary_rollout": {
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        }
    }
    manual_base64 = base64.b64encode(json.dumps(manual).encode("utf-8")).decode("ascii")
    cases = [
        (
            {
                "ok": True,
                "evidence_type": "cross_platform_ci",
                "source": "github actions linux-only",
                "checked_at": "2026-06-24T00:00:00Z",
                "message": "Linux passed",
                "validated_platforms": ["linux"],
            },
            "missing required platforms",
        ),
        (
            {
                "ok": True,
                "evidence_type": "local_cross_platform_dry_run",
                "source": "local dry-run",
                "checked_at": "2026-06-24T00:00:00Z",
                "message": "Local dry-run passed",
                "validated_platforms": ["macos", "windows", "linux"],
            },
            "evidence_type must be cross_platform_ci",
        ),
    ]

    for hardware_gate, expected_error in cases:
        cross_platform = {
            "manual_mgba_stress_smoke": {
                "ok": False,
                "evidence_type": "manual_mgba_stress_smoke",
                "source": "pending",
                "checked_at": "2026-06-24T00:00:00Z",
                "message": "pending"
            },
            "hardware_or_ci_validation": hardware_gate,
            "gba_studio_engine_primary_rollout": {
                "ok": False,
                "evidence_type": "gba_studio_engine_primary_rollout",
                "source": "app workflow",
                "checked_at": "2026-06-24T00:00:00Z",
                "message": "app adds private engine-primary rollout evidence"
            }
        }

        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            cross_path = output_dir / "cross.json"
            cross_path.write_text(json.dumps(cross_platform), encoding="utf-8")
            try:
                handoff.write_handoff(
                    cross_platform_evidence_path=cross_path,
                    manual_mgba_evidence_base64=manual_base64,
                    manual_mgba_evidence_path=None,
                    output_dir=output_dir,
                )
            except SystemExit as error:
                assert expected_error in str(error)
            else:
                raise AssertionError("weak cross-platform evidence was accepted")


def test_mgba_manual_handoff_rejects_unapproved_evidence():
    handoff = load_mgba_manual_handoff()
    evidence = {
        "manual_mgba_stress_smoke": {
            "ok": False,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "pending note",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        },
        "hardware_or_ci_validation": {
            "ok": False,
            "evidence_type": "hardware_real",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending",
            "validated_platforms": []
        },
        "gba_studio_engine_primary_rollout": {
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        }
    }

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "readiness_evidence_mgba_manual.json"
        path.write_text(json.dumps(evidence), encoding="utf-8")
        try:
            handoff.write_handoff_from_evidence(path, Path(tmp))
        except SystemExit as error:
            assert "manual_mgba_stress_smoke must be true" in str(error)
        else:
            raise AssertionError("unapproved mGBA evidence was accepted")


def test_mgba_manual_handoff_writes_base64_payload_and_summary():
    handoff = load_mgba_manual_handoff()
    evidence = {
        "manual_mgba_stress_smoke": {
            "ok": True,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "manual mGBA approval note",
            "checked_at": "2026-06-24T00:00:00Z",
            "review_environment": "NanoBoyAdvance fixture",
            "message": "approved"
        },
        "hardware_or_ci_validation": {
            "ok": False,
            "evidence_type": "hardware_real",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending",
            "validated_platforms": []
        },
        "gba_studio_engine_primary_rollout": {
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "pending",
            "checked_at": "2026-06-24T00:00:00Z",
            "message": "pending"
        }
    }

    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp)
        path = output_dir / "readiness_evidence_mgba_manual.json"
        path.write_text(json.dumps(evidence), encoding="utf-8")

        handoff.write_handoff_from_evidence(path, output_dir)

        payload = (output_dir / "readiness_evidence_mgba_manual_base64.txt").read_text().strip()
        assert json.loads(base64.b64decode(payload)) == evidence
        summary = json.loads((output_dir / "mgba_manual_handoff_summary.json").read_text())
        assert summary["kind"] == "mgba_manual_readiness_evidence_handoff"
        assert summary["engine_workflow_input"] == "manual_mgba_readiness_evidence_base64"


def main():
    test_platform_status_labels_match_evidence_scope()
    test_skip_toolchain_evidence_is_limited_to_cross_platform_ci()
    test_platform_key_uses_ci_override_and_normalizes_msys()
    test_engine_ci_workflow_merges_cross_platform_ci_evidence()
    test_engine_primary_handoff_writes_skipped_summary_without_manual_evidence()
    test_engine_primary_handoff_merges_evidence_and_writes_app_payload()
    test_engine_primary_handoff_rejects_manual_evidence_without_environment()
    test_engine_primary_handoff_rejects_incomplete_or_local_ci_evidence()
    test_mgba_manual_handoff_rejects_unapproved_evidence()
    test_mgba_manual_handoff_writes_base64_payload_and_summary()


if __name__ == "__main__":
    main()
