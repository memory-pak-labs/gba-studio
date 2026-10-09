#!/usr/bin/env python3
"""Focused regression for a menu shortcut's destination selection."""

import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "assetc"))
import assetc  # noqa: E402


def main():
    output = []
    assetc.emit_menu_items(output, {"items": [
        {"label": "Idioma", "action": "push_screen", "target_screen": 1, "target_item": 4},
        {"label": "Configurações", "action": "push_screen", "target_screen": 1},
    ]}, 0)
    assetc.emit_menu_items(output, {"items": [
        {"label": "Slot 3", "save_slot": 2, "requires_save": True},
        {"label": "Idioma", "action": "adjust_variable", "adjust_variable": 15,
         "value_labels": ["PT", "EN", "ES"], "detail_lines": ["Idioma", "Preferencia"]},
    ]}, 1)
    generated = "\n".join(output)
    assert "-1, 2, nullptr, 0" in generated
    assert '"PT", "EN", "ES"' in generated
    assert "menu_screen_1_item_1_value_labels, 3" in generated
    # Compile against MenuItemData so adding trailing fields cannot hide a
    # wrong destination, save slot, binding, label table or detail-line layout.
    checks = r'''
static_assert(menu_screen_0_items[0].target_screen_index == 1);
static_assert(menu_screen_0_items[0].target_item_index == 4);
static_assert(menu_screen_0_items[0].save_slot == -1);
static_assert(menu_screen_0_items[0].action == gbs::MenuItemAction::PushScreen);
static_assert(menu_screen_0_items[1].target_screen_index == 1);
static_assert(menu_screen_0_items[1].target_item_index == -1);
static_assert(menu_screen_0_items[1].detail_lines[0] == nullptr);
static_assert(menu_screen_0_items[1].detail_lines[1] == nullptr);
static_assert(menu_screen_0_items[1].detail_lines[2] == nullptr);
static_assert(menu_screen_1_items[0].save_slot == 2);
static_assert(menu_screen_1_items[0].requires_save);
static_assert(menu_screen_1_items[1].value.variable_index == 15);
static_assert(menu_screen_1_items[1].binding.format == gbs::MenuItemBindingFormat::Number);
static_assert(menu_screen_1_items[1].value_label_count == 3);
static_assert(menu_screen_1_items[1].value_labels == menu_screen_1_item_1_value_labels);
static_assert(menu_screen_1_items[1].value_labels[0][0] == 'P');
static_assert(menu_screen_1_items[1].value_labels[1][0] == 'E');
static_assert(menu_screen_1_items[1].value_labels[1][1] == 'N');
static_assert(menu_screen_1_items[1].value_labels[2][0] == 'E');
static_assert(menu_screen_1_items[1].value_labels[2][1] == 'S');
static_assert(menu_screen_1_items[1].detail_lines[0][0] == 'I');
static_assert(menu_screen_1_items[1].detail_lines[1][0] == 'P');
static_assert(menu_screen_1_items[1].detail_lines[2] == nullptr);
'''
    with tempfile.TemporaryDirectory(prefix="assetc-menu-focus-") as directory:
        source = Path(directory) / "menu.cpp"
        source.write_text('#include "gbs/menu.hpp"\n' + generated + '\n' + checks)
        compiler = shlex.split(os.environ.get("HOST_CXX", "clang++"))
        subprocess.run(compiler + ["-std=c++17", "-fsyntax-only", "-I",
                                  str(Path(__file__).resolve().parents[2] / "engine/include"),
                                  str(source)], check=True)


if __name__ == "__main__":
    main()
