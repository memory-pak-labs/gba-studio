// Frozen save writers from the Cutscene runtime before frame-based scripting.
void consume_cutscene_save_request() {
    const int request = event_state.save_request;
    if (request == 0) return;
    const int slot_index = event_state.save_request_slot;
    event_state.save_request = 0;
    event_state.save_request_slot = -1;
    gbs::RuntimeSaveService* service = gbs::active_runtime_save_service();
    if (service == nullptr) return;
    if (request == 1) {
        gbs::UniversalSaveData data {};
        if (gbs::make_universal_save_data(data, gbs::UniversalSaveRuntime::Cutscene,
                cutscene_state.scene_index, 0, 0, 0, 0,
                event_state.variables, gbs::universal_save_variable_count,
                event_state.inventory, gbs::universal_save_inventory_count,
                event_state.equipped_items, gbs::universal_save_equipment_slot_count,
                gbs::frame_count(), 0, &cutscene_state, sizeof(cutscene_state),
                event_state.text_variables, gbs::text_variable_count)) {
            const auto metadata = gbs::make_save_metadata("CUTSCENE", gbs::frame_count(), 0,
                static_cast<uint16_t>(cutscene_state.scene_index),
                static_cast<uint16_t>(cutscene_state.step_index));
            gbs::write_runtime_save(*service, slot_index, data, metadata);
        }
    } else if (request == 2) {
        gbs::request_universal_save_restore(service->bank, slot_index,
            gbs::runtime_availability(gbs::RuntimeKind::Cutscene));
    } else if (request == 3) {
        gbs::clear_runtime_save(*service, slot_index);
    }
}

void persist_cutscene_runtime_state() {
#if GBS_MULTI_RUNTIME
    // Mixed projects share universal campaign slots. Entering the opening or
    // advancing its frames must not replace a gameplay save with local data.
    return;
#else
    if (!gbastudio_cutscene_project::save_enabled) {
        return;
    }
    gbs::CutsceneSaveData save_data {};
    gbs::capture_cutscene_save_data(save_data, cutscene_state, event_state, gbs::frame_count());
    ++cutscene_save_sequence;
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "CUTSCENE",
        gbs::frame_count(),
        cutscene_save_sequence,
        static_cast<uint16_t>(cutscene_state.scene_index < 0 ? 0 : cutscene_state.scene_index),
        static_cast<uint16_t>(cutscene_state.step_index < 0 ? 0 : cutscene_state.step_index)
    );
    gbs::write_save_slot_record(
        gbastudio_cutscene_project::save_bank,
        0,
        &save_data,
        sizeof(save_data),
        metadata,
        cutscene_save_sequence
    );
#endif
}
