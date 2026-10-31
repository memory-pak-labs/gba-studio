"""Check native actor animation bindings, including legacy four-view sets."""
import importlib.util
from pathlib import Path
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / "tools" / "assetc" / "assetc.py"
spec = importlib.util.spec_from_file_location("assetc", path)
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

names = ["idle_up", "walk_down", "idle_screen_up", "walk_screen_right"]
actor = {"animations": [{"name": name} for name in names]}
out = []
with patch.object(assetc, "emit_topdown_animation_frame_subset", side_effect=lambda _out, _p, name, *_args: "clip_" + name):
    assetc.emit_isometric_actor_animation_set(out, "actor", actor, {}, "actor")

fields = [line.strip().removesuffix(",") for line in out[1:-2]]
assert len(fields) == 32
assert fields[1] == "&clip_idle_up"
assert fields[4] == "&clip_walk_down"
assert fields[25] == "&clip_idle_screen_up"
assert fields[31] == "&clip_walk_screen_right"
assert sum(field != "nullptr" for field in fields) == 4
