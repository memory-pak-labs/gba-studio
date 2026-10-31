"""Exercise the production Luta resource loader with a saturated DMA queue."""

from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "templates/exported_luta/main.cpp").read_text()
start = source.index("bool stream_stage_resource_group(")
end = source.index("\nvoid write_three_digits(", start)
loader = source[start:end]

fixture = r'''
#include <cassert>
#include <cstddef>
namespace gbs {
struct LutaStageData {};
struct ResourceBankGroup { size_t bank_count; };
enum class ResourceStreamStatus { Ok, DmaQueueFull, MissingUploadSource };
struct ResourceStreamResult { bool success; ResourceStreamStatus status; };
size_t queued = 0, required = 15, calls = 0, waits = 0, transactions = 0;
bool missing = false, stalled = false;
template <typename T> ResourceBankGroup resource_bank_group_from_luta_stage(const T&, const LutaStageData&) { return {25}; }
size_t dma_vblank_queue_count() { return queued; }
struct QueueStats { size_t queued_bytes; };
QueueStats dma_vblank_queue_stats() { return {queued * 32}; }
void begin_render_publication_transaction() { ++transactions; }
void wait_vblank() { ++waits; if (!stalled) queued = queued > 6 ? queued - 6 : 0; }
ResourceStreamResult stream_resource_bank_group_with_uploads(int, int, int, ResourceBankGroup, int, int) {
    ++calls;
    if (missing) return {false, ResourceStreamStatus::MissingUploadSource};
    if (queued + required > 32) return {false, ResourceStreamStatus::DmaQueueFull};
    queued += required;
    return {true, ResourceStreamStatus::Ok};
}
}
struct Project { int resource_bank_group_count = 1, resource_bank_upload_sources = 0, resource_bank_upload_source_count = 0; } project;
int resource_manager = 0, active_resource_bank_group = 0, scratch_resource_bank_group = 0;
''' + loader + r'''
int main() {
    gbs::LutaStageData stage{};
    gbs::queued = 18;
    assert(stream_stage_resource_group(stage));
    assert(gbs::waits == 1 && gbs::transactions == 2 && gbs::calls == 2);
    gbs::queued = 0; gbs::required = 33; gbs::calls = gbs::waits = 0;
    assert(!stream_stage_resource_group(stage));
    assert(gbs::waits == 0 && gbs::calls == 1);
    gbs::missing = true; gbs::queued = 18; gbs::calls = gbs::waits = 0;
    assert(!stream_stage_resource_group(stage));
    assert(gbs::waits == 0 && gbs::calls == 1);
    gbs::missing = false; gbs::stalled = true; gbs::required = 15; gbs::queued = 18; gbs::calls = gbs::waits = 0;
    assert(!stream_stage_resource_group(stage));
    assert(gbs::waits == 1 && gbs::calls == 1);
}
'''

with tempfile.TemporaryDirectory(prefix="gba-luta-resource-queue-") as temp:
    cpp = Path(temp) / "test.cpp"
    exe = Path(temp) / "test"
    cpp.write_text(fixture)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print("Luta resource loader waits for temporary DMA pressure: PASS")
