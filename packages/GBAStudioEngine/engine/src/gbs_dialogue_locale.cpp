#include "gbs/dialogue.hpp"

#include <string.h>

namespace gbs {

namespace {

const char* configured_dialogue_locale = nullptr;

const char* dialogue_locale_from_id(uint8_t locale_id) {
    switch (locale_id) {
    case 1: return "pt-BR";
    case 2: return "en";
    case 3: return "es";
    default: return nullptr;
    }
}

} // namespace

void configure_dialogue_locale(const char* locale) {
    configured_dialogue_locale = locale;
}

void configure_dialogue_locale_id(uint8_t locale_id) {
    configured_dialogue_locale = dialogue_locale_from_id(locale_id);
}

const char* active_dialogue_locale() {
    return configured_dialogue_locale;
}

uint8_t active_dialogue_locale_id() {
    if (configured_dialogue_locale == nullptr) return 0;
    if (strcmp(configured_dialogue_locale, "pt-BR") == 0) return 1;
    if (strcmp(configured_dialogue_locale, "en") == 0) return 2;
    if (strcmp(configured_dialogue_locale, "es") == 0) return 3;
    return 0;
}

} // namespace gbs
