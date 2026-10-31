#include <cassert>
#include "gbs/racing.hpp"
namespace gbs {
constexpr int reference_progress(
    const RacingTopdownTrackData& track,
    Vec2i position_pixels
) {
    if (track.path_points == nullptr || track.path_point_count < 2) return 0;
    int prefix_x256 = 0;
    int best_progress_x256 = 0;
    int64_t best_distance_squared = 0x7fffffffffffffffLL;
    for (size_t index = 0; index < track.path_point_count; ++index) {
        const Vec2i from = track.path_points[index];
        const Vec2i to = track.path_points[(index + 1) % track.path_point_count];
        const int dx = to.x - from.x;
        const int dy = to.y - from.y;
        const int64_t denominator = static_cast<int64_t>(dx) * dx + static_cast<int64_t>(dy) * dy;
        if (denominator == 0) continue;
        const int64_t numerator = static_cast<int64_t>(position_pixels.x - from.x) * dx +
            static_cast<int64_t>(position_pixels.y - from.y) * dy;
        const int64_t bounded = numerator < 0 ? 0 : numerator > denominator ? denominator : numerator;
        const int projected_x = from.x + static_cast<int>(static_cast<int64_t>(dx) * bounded / denominator);
        const int projected_y = from.y + static_cast<int>(static_cast<int64_t>(dy) * bounded / denominator);
        const int64_t offset_x = position_pixels.x - projected_x;
        const int64_t offset_y = position_pixels.y - projected_y;
        const int64_t distance_squared = offset_x * offset_x + offset_y * offset_y;
        if (distance_squared < best_distance_squared) {
            best_distance_squared = distance_squared;
            best_progress_x256 = prefix_x256 + static_cast<int>(
                racing_topdown_segment_length_pixels(from, to) * 256LL * bounded / denominator
            );
        }
        prefix_x256 += racing_topdown_segment_length_pixels(from, to) * 256;
    }
    return best_progress_x256;
}

}
int main() {
    const gbs::Vec2i points[]={{240,112},{368,112},{432,176},{432,336},{368,400},{144,400},{80,336},{80,176},{144,112}};
    gbs::RacingTopdownTrackData track {}; track.path_points=points; track.path_point_count=9;
    for(int y=-80;y<600;y+=7) for(int x=-80;x<600;x+=7)
        assert(gbs::racing_topdown_path_progress_x256(track,{x,y})==gbs::reference_progress(track,{x,y}));
    const gbs::Vec2i unusual[]={{0,0},{0,0},{-6000,4000},{2000,8000},{-32,-400},{18,82}};
    track.path_points=unusual; track.path_point_count=6;
    for(int y=-9000;y<10000;y+=173) for(int x=-9000;x<10000;x+=181)
        assert(gbs::racing_topdown_path_progress_x256(track,{x,y})==gbs::reference_progress(track,{x,y}));
    track.path_point_count=0; assert(gbs::racing_topdown_path_progress_x256(track,{100,100})==0);
}
