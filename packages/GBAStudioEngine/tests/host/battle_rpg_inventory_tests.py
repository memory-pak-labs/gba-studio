import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("battle_inventory_assetc", Path(__file__).resolve().parents[2] / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)


class BattleInventoryExportTests(unittest.TestCase):
    def project(self):
        unit = {"name": "Unit", "unit": {"max_hp": 24, "attack": 1, "defense": 0, "speed": 5}, "abilities": [{"kind": "attack"}]}
        return {"encounters": [{"name": "Battle", "config": {}, "party": [unit], "enemies": [unit],
            "inventory_items": [{"label": "TONICO", "item": 3, "initial_quantity": 2, "heal_amount": 10}]}]}

    def test_emits_item_definition_attached_to_its_encounter(self):
        header = assetc.emit_battle_rpg_project_data_header(self.project())
        self.assertIn('gbs::BattleRpgInventoryItemData { "TONICO", 3, 2, 10 }', header)
        self.assertIn('encounter_0_inventory_items, 1', header)

    def test_rejects_invalid_or_duplicate_inventory_slots(self):
        for patch in ({"item": -1}, {"item": 16}, {"initial_quantity": -1}, {"heal_amount": 0}, {"heal_amount": 1000}, {"label": ""}):
            with self.subTest(patch=patch):
                project = self.project(); project["encounters"][0]["inventory_items"][0].update(patch)
                with self.assertRaises(SystemExit): assetc.emit_battle_rpg_project_data_header(project)
        project = self.project(); project["encounters"][0]["inventory_items"] *= 2
        with self.assertRaises(SystemExit): assetc.emit_battle_rpg_project_data_header(project)


if __name__ == "__main__": unittest.main()
