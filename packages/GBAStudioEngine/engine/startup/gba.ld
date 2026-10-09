ENTRY(_start)

MEMORY
{
    ROM   (rx)  : ORIGIN = 0x08000000, LENGTH = 32M
    EWRAM (rw)  : ORIGIN = 0x02000000, LENGTH = 256K
    IWRAM (rwx) : ORIGIN = 0x03000000, LENGTH = 32K
}

SECTIONS
{
    . = ORIGIN(ROM);

    .gba.header : ALIGN(4)
    {
        KEEP(*(.gba.header))
    } > ROM

    .gbs.save_signature : ALIGN(4)
    {
        *(.gbs.save_signature)
    } > ROM

    .text : ALIGN(4)
    {
        *(.text.startup*)
        *(.text*)
        *(.rodata*)
        *(.glue_7)
        *(.glue_7t)
    } > ROM

    .init_array : ALIGN(4)
    {
        __init_array_start = .;
        KEEP(*(EXCLUDE_FILE (
            *menu_runtime.o
            *topdown_runtime.o
            *platformer_runtime.o
            *isometric_runtime.o
            *shmup_runtime.o
            *point_click_runtime.o
            *dungeon_crawler_runtime.o
            *racing_runtime.o
            *cutscene_runtime.o
            *visual_novel_runtime.o
            *world_map_runtime.o
            *battle_rpg_runtime.o
            *luta_runtime.o
        ) .init_array*))
        __init_array_end = .;
    } > ROM

    /* Each mixed runtime owns EWRAM state with non-zero initializers. Keep
       its constructors out of the boot list so the dispatcher can rerun
       them after clearing the shared runtime overlay. */
    .init_array_runtime_menu : ALIGN(4)
    {
        __init_array_runtime_menu_start = .;
        KEEP(*menu_runtime.o(.init_array*))
        __init_array_runtime_menu_end = .;
    } > ROM

    .init_array_runtime_topdown : ALIGN(4)
    {
        __init_array_runtime_topdown_start = .;
        KEEP(*topdown_runtime.o(.init_array*))
        __init_array_runtime_topdown_end = .;
    } > ROM

    .init_array_runtime_platformer : ALIGN(4)
    {
        __init_array_runtime_platformer_start = .;
        KEEP(*platformer_runtime.o(.init_array*))
        __init_array_runtime_platformer_end = .;
    } > ROM

    .init_array_runtime_isometric : ALIGN(4)
    {
        __init_array_runtime_isometric_start = .;
        KEEP(*isometric_runtime.o(.init_array*))
        __init_array_runtime_isometric_end = .;
    } > ROM

    .init_array_runtime_shmup : ALIGN(4)
    {
        __init_array_runtime_shmup_start = .;
        KEEP(*shmup_runtime.o(.init_array*))
        __init_array_runtime_shmup_end = .;
    } > ROM

    .init_array_runtime_point_click : ALIGN(4)
    {
        __init_array_runtime_point_click_start = .;
        KEEP(*point_click_runtime.o(.init_array*))
        __init_array_runtime_point_click_end = .;
    } > ROM

    .init_array_runtime_dungeon_crawler : ALIGN(4)
    {
        __init_array_runtime_dungeon_crawler_start = .;
        KEEP(*dungeon_crawler_runtime.o(.init_array*))
        __init_array_runtime_dungeon_crawler_end = .;
    } > ROM

    .init_array_runtime_racing : ALIGN(4)
    {
        __init_array_runtime_racing_start = .;
        KEEP(*racing_runtime.o(.init_array*))
        __init_array_runtime_racing_end = .;
    } > ROM

    .init_array_runtime_cutscene : ALIGN(4)
    {
        __init_array_runtime_cutscene_start = .;
        KEEP(*cutscene_runtime.o(.init_array*))
        __init_array_runtime_cutscene_end = .;
    } > ROM

    .init_array_runtime_visual_novel : ALIGN(4)
    {
        __init_array_runtime_visual_novel_start = .;
        KEEP(*visual_novel_runtime.o(.init_array*))
        __init_array_runtime_visual_novel_end = .;
    } > ROM

    .init_array_runtime_world_map : ALIGN(4)
    {
        __init_array_runtime_world_map_start = .;
        KEEP(*world_map_runtime.o(.init_array*))
        __init_array_runtime_world_map_end = .;
    } > ROM

    .init_array_runtime_battle_rpg : ALIGN(4)
    {
        __init_array_runtime_battle_rpg_start = .;
        KEEP(*battle_rpg_runtime.o(.init_array*))
        __init_array_runtime_battle_rpg_end = .;
    } > ROM

    .init_array_runtime_luta : ALIGN(4)
    {
        __init_array_runtime_luta_start = .;
        KEEP(*luta_runtime.o(.init_array*))
        __init_array_runtime_luta_end = .;
    } > ROM

    .iwram_code : ALIGN(4)
    {
        __iwram_code_start = .;
        *(.iwram .iwram.*)
        __iwram_code_end = .;
    } > IWRAM AT > ROM
    __iwram_code_load = LOADADDR(.iwram_code);

    __data_load = LOADADDR(.data);
    .data : ALIGN(4)
    {
        __data_start = .;
        *(.data*)
        __data_end = .;
    } > IWRAM AT > ROM

    .bss (NOLOAD) : ALIGN(4)
    {
        __bss_start = .;
        *(EXCLUDE_FILE (
            *menu_runtime.o
            *topdown_runtime.o
            *platformer_runtime.o
            *isometric_runtime.o
            *shmup_runtime.o
            *point_click_runtime.o
            *dungeon_crawler_runtime.o
            *racing_runtime.o
            *cutscene_runtime.o
            *visual_novel_runtime.o
            *world_map_runtime.o
            *battle_rpg_runtime.o
            *luta_runtime.o
        ) .bss*)
        *(COMMON)
        __bss_end = .;
    } > IWRAM

    .ewram_bss (NOLOAD) : ALIGN(4)
    {
        __ewram_bss_start = .;
        *(EXCLUDE_FILE (
            *menu_runtime.o
            *topdown_runtime.o
            *platformer_runtime.o
            *isometric_runtime.o
            *shmup_runtime.o
            *point_click_runtime.o
            *dungeon_crawler_runtime.o
            *racing_runtime.o
            *cutscene_runtime.o
            *visual_novel_runtime.o
            *world_map_runtime.o
            *battle_rpg_runtime.o
            *luta_runtime.o
        ) .ewram_bss*)
    } > EWRAM

    /* Mixed projects run one runtime at a time. Keep their private state in
       one reusable EWRAM window instead of reserving every runtime at once. */
    __ewram_runtime_start = .;
    .ewram_runtime_menu __ewram_runtime_start (NOLOAD) : { *menu_runtime.o(.ewram_bss*) *menu_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_topdown __ewram_runtime_start (NOLOAD) : { *topdown_runtime.o(.ewram_bss*) *topdown_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_platformer __ewram_runtime_start (NOLOAD) : { *platformer_runtime.o(.ewram_bss*) *platformer_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_isometric __ewram_runtime_start (NOLOAD) : { *isometric_runtime.o(.ewram_bss*) *isometric_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_shmup __ewram_runtime_start (NOLOAD) : { *shmup_runtime.o(.ewram_bss*) *shmup_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_point_click __ewram_runtime_start (NOLOAD) : { *point_click_runtime.o(.ewram_bss*) *point_click_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_dungeon_crawler __ewram_runtime_start (NOLOAD) : { *dungeon_crawler_runtime.o(.ewram_bss*) *dungeon_crawler_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_racing __ewram_runtime_start (NOLOAD) : { *racing_runtime.o(.ewram_bss*) *racing_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_cutscene __ewram_runtime_start (NOLOAD) : { *cutscene_runtime.o(.ewram_bss*) *cutscene_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_visual_novel __ewram_runtime_start (NOLOAD) : { *visual_novel_runtime.o(.ewram_bss*) *visual_novel_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_world_map __ewram_runtime_start (NOLOAD) : { *world_map_runtime.o(.ewram_bss*) *world_map_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_battle_rpg __ewram_runtime_start (NOLOAD) : { *battle_rpg_runtime.o(.ewram_bss*) *battle_rpg_runtime.o(.bss*) } > EWRAM
    .ewram_runtime_luta __ewram_runtime_start (NOLOAD) : { *luta_runtime.o(.ewram_bss*) *luta_runtime.o(.bss*) } > EWRAM

    . = __ewram_runtime_start + MAX(
        SIZEOF(.ewram_runtime_menu),
        MAX(
            SIZEOF(.ewram_runtime_topdown),
            MAX(
                SIZEOF(.ewram_runtime_platformer),
                MAX(
                    SIZEOF(.ewram_runtime_isometric),
                    MAX(
                        SIZEOF(.ewram_runtime_shmup),
                        MAX(
                            SIZEOF(.ewram_runtime_point_click),
                            MAX(
                                SIZEOF(.ewram_runtime_dungeon_crawler),
                                MAX(
                                    SIZEOF(.ewram_runtime_racing),
                                    MAX(
                                        SIZEOF(.ewram_runtime_cutscene),
                                        MAX(
                                            SIZEOF(.ewram_runtime_visual_novel),
                                            MAX(
                                                SIZEOF(.ewram_runtime_world_map),
                                                MAX(
                                                    SIZEOF(.ewram_runtime_battle_rpg),
                                                    SIZEOF(.ewram_runtime_luta)
                                                )
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            )
        )
    );
    . = ALIGN(4);
    __ewram_runtime_end = .;

    __ewram_bss_end = .;

    /* Audio mixing runs in VBlank; measured call chains exceed 256 bytes. */
    __irq_stack_size = 0x200;
    __svc_stack_size = 0x100;
    __system_stack_size = 0x2000;
    __irq_handler_slot = ORIGIN(IWRAM) + LENGTH(IWRAM) - 4;
    __irq_stack_top = __irq_handler_slot;
    __irq_stack_bottom = __irq_stack_top - __irq_stack_size;
    __svc_stack_top = __irq_stack_bottom;
    __svc_stack_bottom = __svc_stack_top - __svc_stack_size;
    __stack_top = __svc_stack_bottom;
    __stack_bottom = __stack_top - __system_stack_size;
    ASSERT(__bss_end <= __stack_bottom, "IWRAM overflow: .data/.bss overlaps reserved stacks")
}
