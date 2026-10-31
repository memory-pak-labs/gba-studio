"""Keep temporal movement distinct from immediate positioning in assetc."""

import importlib.util
from pathlib import Path


assetc_path = Path(__file__).resolve().parents[2] / "tools" / "assetc" / "assetc.py"
spec = importlib.util.spec_from_file_location("assetc", assetc_path)
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

for operation, expected in (
    ("move_actor_to", "MoveActorTo"),
    ("move_actor_relative", "MoveActorRelative"),
    ("move_actor", "MoveActor"),
    ("set_actor_position", "SetActorPosition"),
):
    command = {"op": operation, "actor": -1, "x": -16, "y": 8}
    assert assetc.event_command_from_json(command, "actor motion") == (expected, -1, -16, 8)
