#include <cassert>
#include <cstring>
#include "gbs/runtime_checkpoint.hpp"
int main(){
 gbs::DialogueState dialogue{};dialogue.visible=true;dialogue.key=gbs::checkpoint_backend_failure_dialogue.key;
 assert(gbs::checkpoint_dialogue_is_feedback(dialogue));
 assert(std::strstr(gbs::checkpoint_backend_failure_dialogue.text,"MANTIDO")==nullptr);
 dialogue.key=gbs::checkpoint_restore_failure_dialogue.key;assert(gbs::checkpoint_dialogue_is_feedback(dialogue));
 dialogue.key=gbs::checkpoint_failure_dialogue.key;assert(gbs::checkpoint_dialogue_is_feedback(dialogue));
 dialogue.key=gbs::checkpoint_menu_failure_dialogue.key;assert(gbs::checkpoint_dialogue_is_feedback(dialogue));
}
