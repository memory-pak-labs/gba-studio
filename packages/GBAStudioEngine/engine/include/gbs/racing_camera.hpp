#pragma once
#include <stdint.h>
#include "gbs/types.hpp"

namespace gbs {

struct RacingCameraConfig {
    int height = 48;
    int distance = 64;
    int focal_length = 96;
};

struct RacingCameraPose {
    int x_x256;
    int y_x256;
    int sine_x256;
    int cosine_x256;
};

struct RacingProjectedPoint {
    int x;
    int y;
    int scale_x256;
    int depth_x256;
    bool visible;
};

struct RacingCameraFloorLine {
    int16_t pa;
    int16_t pc;
    int32_t reference_x_8;
    int32_t reference_y_8;
    bool visible;
};

struct RacingCameraFloorBasis {
    int scale_x256;
    int depth_x256;
    bool visible;
};

constexpr int racing_camera_sine(uint16_t angle) {
    constexpr int values[17] = {0,98,181,237,256,237,181,98,0,-98,-181,-237,-256,-237,-181,-98,0};
    const unsigned int bounded = angle & 4095;
    const unsigned int step = bounded >> 8;
    return values[step] + (values[step+1]-values[step]) * static_cast<int>(bounded & 255) / 256;
}

constexpr RacingCameraPose racing_camera_pose(Vec2i player_x256, uint16_t heading_x256, RacingCameraConfig config) {
    const int sine=racing_camera_sine(heading_x256);
    const int cosine=racing_camera_sine(static_cast<uint16_t>(heading_x256+1024));
    return {player_x256.x-sine*config.distance,player_x256.y+cosine*config.distance,sine,cosine};
}

constexpr RacingCameraFloorBasis racing_camera_floor_basis(RacingCameraConfig config, int horizon, int y) {
    if(y<=horizon || y>=160) return {0,0,false};
    return {config.height*256/(y-horizon),config.height*config.focal_length*256/(y-horizon),true};
}

constexpr RacingCameraFloorLine racing_camera_floor_from_basis(RacingCameraPose camera, RacingCameraFloorBasis basis) {
    if(!basis.visible) return {0,0,0,0,false};
    const int scale=basis.scale_x256;
    const int depth=basis.depth_x256;
    const int pa=scale*camera.cosine_x256/256;
    const int pc=scale*camera.sine_x256/256;
    return {static_cast<int16_t>(pa),static_cast<int16_t>(pc),
        camera.x_x256+camera.sine_x256*depth/256-pa*120,
        camera.y_x256-camera.cosine_x256*depth/256-pc*120,true};
}

constexpr RacingCameraFloorLine racing_camera_floor_line(
    RacingCameraPose camera, RacingCameraConfig config, int horizon, int y
) {
    return racing_camera_floor_from_basis(camera,racing_camera_floor_basis(config,horizon,y));
}

constexpr RacingProjectedPoint racing_camera_project(
    RacingCameraPose camera, Vec2i point_x256, RacingCameraConfig config, int horizon
) {
    const int dx=point_x256.x-camera.x_x256;
    const int dy=point_x256.y-camera.y_x256;
    const int depth=(dx*camera.sine_x256-dy*camera.cosine_x256)/256;
    if(depth<=8*256) return {0,0,0,depth,false};
    const int lateral=(dx*camera.cosine_x256+dy*camera.sine_x256)/256;
    const int x=120+lateral*config.focal_length/depth;
    const int y=horizon+config.height*config.focal_length*256/depth;
    const int scale=config.distance*256*256/depth;
    return {x,y,scale,depth,x>=-32&&x<=272&&y>horizon&&y<192&&scale>=24};
}

} // namespace gbs
