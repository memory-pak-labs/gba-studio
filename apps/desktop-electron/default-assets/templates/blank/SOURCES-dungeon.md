# Dungeon defaults — orange materials and optional purple hand

Original AI artwork generated with the built-in OpenAI image_gen tool on 2026-10-19. The user explicitly approved the prepared v2 comparison and authorized integration on 2026-10-19. No external game pixels are included. Project-owned assets, following the blank-template asset provenance convention.

## Sources and preparation

Materials source SHA256: 0d0540970d5641cd130e56b07b610b44bf25700915383ba6ccdf3dfd01d1d7a4. Four equal atlas panels (wall, floor, ceiling, door) were extracted with nearest sampling to64×64. The approved BG candidate uses12 named orange RGB555 colors without dithering. Eight runtime slots reuse the wall four times and the floor for the joint material. Prepared file hashes are in dungeon-defaults.json. The representative240×160 background comes from the compiled v2 view, not a new painting.

Hand source SHA256:11625ff421b214af00c9e7c4ec0e82756adf690779cfc17447ca2429e2795572. Alpha was measured before choosing a binary128 threshold. The visible bbox was cropped and nearest-sampled to a64×64 canvas. gba-sprite-pack --no-snap produced15 visible RGB555 colors plus transparency,1OBJ64×64,64tiles and2048bytes. No visible mask pixels were lost. The single idle pose is intentional; no extra movement/action poses are claimed. Prepared hash is in player-defaults.json.

Technical evidence before promotion:52 free-cell maze/208views/max393worldtiles and81 free-cell initial room/324views/max417worldtiles. Both fit the479tile-per-view limit; both use one BG palette bank. Any changed geometry must be compiled and measured again.

New default 11×11 Dungeon rooms use the approved 52-passage maze, start at (5,9) facing north, and door at (5,6), matching the representative background. Its exact rows and original recipe hash are recorded in dungeon-defaults.json. Existing authored room layouts are preserved. Other room dimensions use a bordered empty grid for the author to edit.

References: the existing orange neutral-background-dungeon-crawler.png and neutral-background-point-click.png for the background style; neutral-cursor-hand.png for the purple placeholder palette only. Source images and non-distributed candidate history remain in the local review archive.

## Generation prompts

### background

Create an ORIGINAL production texture atlas for a simple Game Boy Advance first-person grid dungeon, matching the provided orange dungeon background's restrained placeholder art direction. The reference is STYLE AND PALETTE ONLY, not an edit target. Output a square atlas divided into EXACTLY 2 columns and 2 rows of equal-size square panels, touching edge to edge, absolutely no gutters, labels, borders or text. Each panel represents a 64x64 native pixel texture shown at uniform enlarged nearest-neighbor pixel scale. Deliberately SIMPLE low-resolution pixel art, crisp large clusters, very few amber/orange/burnt-orange/dark-brown shades, approximately 12 colors shared overall. No antialiasing, no realistic surfaces, no painterly texture, no noise, no glow, no vignette, no gradient.
TOP LEFT: seamless FLAT FRONT-FACING orange sandstone brick wall material, staggered large masonry blocks, thin dark brown mortar, restrained top edge highlights, about four broad horizontal courses. No perspective and no wall corners.
TOP RIGHT: seamless FLAT TOP-DOWN square terracotta paving material, broad simple slab surfaces, thin dark orange joints, clean and quiet.
BOTTOM LEFT: seamless FLAT TOP-DOWN ceiling material, warm darker amber stone panels with simple straight seams, less contrast than wall, no wood grain.
BOTTOM RIGHT: a single straight FRONT-FACING closed dungeon door filling the square material, arched plain wooden amber door inset in orange stone frame, dark brown outline, simple vertical planks, one tiny brass handle, no surrounding corridor. Same scale of pixels and same palette as other panels.
These materials will be used by our actual raycaster, which creates the perspective. Do NOT draw a composed corridor, characters, icons or user interface in this atlas. Flat unlit textures only. Use the supplied reference to keep the orange placeholder palette and restrained detail.

### hand

Generate ONE original pixel-art sprite on a truly transparent background: a simple right-hand glove and a short forearm as viewed by its owner in a first-person dungeon crawler. This is an OPTIONAL visible player foreground overlay, NOT a pointing mouse cursor, NOT a full character portrait, NOT an enemy facing the camera. Back of a relaxed lightly closed hand with readable thumb, wrist entering from bottom right, fingertips pointing toward upper left, natural first-person exploration pose, empty hand with no weapon. Purple/lavender glove, dark plum outline, a tiny violet cuff. Match the restrained monochromatic purple placeholder style of the supplied reference sprite (style reference only; do not copy its upward-pointing cursor pose). Very simple Game Boy Advance pixel art with large crisp clusters and 6–8 purple shades plus transparency, no glow, no gradients, no antialiasing, no noise, no text, no other objects, no shadow behind sprite. Design for a final 64x64 native pixel canvas, shown enlarged at uniform nearest-neighbor scale, keep entire hand silhouette clear and the forearm touching lower edge. Make it legible and compact, not anatomically detailed. One pose only.
