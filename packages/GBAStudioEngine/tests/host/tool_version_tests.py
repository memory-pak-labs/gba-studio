"""Check the versions exposed by the engine's public command-line tools."""
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
pack = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
version = (root / "VERSION").read_text(encoding="utf-8").strip()
assert json.loads((root / "enginepack.json").read_text(encoding="utf-8"))["version"] == version
if pack:
    assert (pack / "VERSION").read_text(encoding="utf-8").strip() == version
    assert json.loads((pack / "enginepack.json").read_text(encoding="utf-8"))["version"] == version

for name in ("assetc", "gbsbuild", "gbsdoctor"):
    script = pack / "tools" / name if pack else root / "tools" / name / f"{name}.py"
    result = subprocess.run([sys.executable, str(script), "--version"], check=True, capture_output=True, text=True)
    assert result.stdout.strip() == f"{name} {version}", (name, result.stdout.strip(), version)
print(f"Engine Pack and tool versions match: {version}")
