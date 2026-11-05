#ifndef GBS_NAME_KEYBOARD_H
#define GBS_NAME_KEYBOARD_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
#define GBS_NAME_INLINE static constexpr
#else
#define GBS_NAME_INLINE static inline
#endif
typedef struct { int16_t x, y; } gbs_name_key_position;
typedef struct {
    int columns, rows, column_gap, row_gap;
    const gbs_name_key_position* keys;
    size_t key_count;
} gbs_name_keyboard_geometry;
typedef struct { int16_t x, y, width, height; } gbs_name_key_bounds;
/* Coordinates, gaps and sizes are in 8px tiles, relative to the keyboard. */
GBS_NAME_INLINE gbs_name_key_bounds gbs_name_key_rect(const gbs_name_keyboard_geometry* geometry, int index) {
    const int columns = geometry ? geometry->columns : 8;
    const int rows = geometry ? geometry->rows : 4;
    const int gx = geometry ? geometry->column_gap : 0, gy = geometry ? geometry->row_gap : 0;
    gbs_name_key_bounds rect = {0,0,(int16_t)(index < 26 ? 2 : 5),2};
    if (geometry && geometry->keys && index >= 0 && index < (int)geometry->key_count) {
        rect.x = geometry->keys[index].x; rect.y = geometry->keys[index].y;
    } else if (columns > 0 && index < 26) {
        rect.x = (int16_t)(index % columns * (2 + gx)); rect.y = (int16_t)(index / columns * (2 + gy));
    } else { rect.x = (int16_t)((index - 26) * 6); rect.y = (int16_t)(rows * (2 + gy)); }
    return rect;
}
GBS_NAME_INLINE int gbs_name_geometry_valid(const gbs_name_keyboard_geometry* geometry, int x, int y) {
    if (!geometry || geometry->columns < 4 || geometry->columns > 13 || geometry->rows < (26 + geometry->columns - 1) / geometry->columns || geometry->rows > 9 ||
        geometry->column_gap < 0 || geometry->column_gap > 4 || geometry->row_gap < 0 || geometry->row_gap > 4 ||
        (geometry->keys ? geometry->key_count != 29 : geometry->key_count != 0)) return 0;
    for (int i=0;i<29;++i) { const gbs_name_key_bounds r=gbs_name_key_rect(geometry,i);
        if(x+r.x<0 || y+r.y<0 || x+r.x+r.width>30 || y+r.y+r.height>20) return 0;
    }
    return 1;
}
/* Horizontal order visits every key within a row; vertical order visits every
 * authored row and picks its nearest center. Ties use the immutable key index. */
GBS_NAME_INLINE int gbs_name_key_next(const gbs_name_keyboard_geometry* geometry, int selected, int horizontal, int vertical) {
    if(selected<0 || selected>=29)return 0;
    const gbs_name_key_bounds current=gbs_name_key_rect(geometry,selected);
    const int center=current.x*2+current.width;
    int best=-1;
    if(horizontal) {
        for(int i=0;i<29;++i){const gbs_name_key_bounds r=gbs_name_key_rect(geometry,i);if(r.y!=current.y || i==selected)continue;
            const int c=r.x*2+r.width;
            if(horizontal>0 ? (c<center || (c==center&&i<selected)) : (c>center || (c==center&&i>selected)))continue;
            if(best<0)best=i;else {const gbs_name_key_bounds b=gbs_name_key_rect(geometry,best);const int bc=b.x*2+b.width;
                if(horizontal>0 ? (c<bc||(c==bc&&i<best)) : (c>bc||(c==bc&&i>best)))best=i;
            }
        }
        if(best>=0)return best;
        for(int i=0;i<29;++i){const gbs_name_key_bounds r=gbs_name_key_rect(geometry,i);if(r.y!=current.y)continue;
            if(best<0)best=i;else {const gbs_name_key_bounds b=gbs_name_key_rect(geometry,best);const int c=r.x*2+r.width,bc=b.x*2+b.width;
                if(horizontal>0 ? (c<bc||(c==bc&&i<best)) : (c>bc||(c==bc&&i>best)))best=i;
            }
        }
    } else if(vertical) {
        int target=current.y,found=0;
        for(int i=0;i<29;++i){const int y=gbs_name_key_rect(geometry,i).y;
            if(vertical>0 ? y>current.y : y<current.y){if(!found || (vertical>0 ? y<target : y>target)){target=y;found=1;}}
        }
        if(!found){for(int i=0;i<29;++i){const int y=gbs_name_key_rect(geometry,i).y;if(!found||(vertical>0?y<target:y>target)){target=y;found=1;}}}
        int distance=10000;
        for(int i=0;i<29;++i){const gbs_name_key_bounds r=gbs_name_key_rect(geometry,i);if(r.y!=target)continue;int d=r.x*2+r.width-center;if(d<0)d=-d;
            if(d<distance){distance=d;best=i;}
        }
    }
    return best<0?selected:best;
}
#undef GBS_NAME_INLINE
#endif
