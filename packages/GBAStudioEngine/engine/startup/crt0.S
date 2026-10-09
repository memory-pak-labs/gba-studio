    .section .gba.header, "ax", %progbits
    .global __gba_header
__gba_header:
    b _start
    .space 188

    .section .text.startup, "ax", %progbits
    .arm
    .global _start
    .extern gbs_start

_start:
    mrs r0, cpsr
    bic r0, r0, #0xC0
    bic r0, r0, #0x1F
    orr r1, r0, #0x12
    msr cpsr_c, r1
    ldr sp, =__irq_stack_top
    orr r1, r0, #0x13
    msr cpsr_c, r1
    ldr sp, =__svc_stack_top
    orr r1, r0, #0x1F
    msr cpsr_c, r1
    ldr sp, =__stack_top

    ldr r0, =__data_load
    ldr r1, =__data_start
    ldr r2, =__data_end
1:
    cmp r1, r2
    ldrlo r3, [r0], #4
    strlo r3, [r1], #4
    blo 1b

    ldr r0, =__iwram_code_load
    ldr r1, =__iwram_code_start
    ldr r2, =__iwram_code_end
7:
    cmp r1, r2
    ldrlo r3, [r0], #4
    strlo r3, [r1], #4
    blo 7b

    mov r0, #0
    ldr r1, =__bss_start
    ldr r2, =__bss_end
2:
    cmp r1, r2
    strlo r0, [r1], #4
    blo 2b

    ldr r1, =__ewram_bss_start
    ldr r2, =__ewram_bss_end
6:
    cmp r1, r2
    strlo r0, [r1], #4
    blo 6b

    ldr r4, =__init_array_start
    ldr r5, =__init_array_end
4:
    cmp r4, r5
    bhs 5f
    ldr r3, [r4], #4
    mov lr, pc
    bx r3
    b 4b
5:

    bl gbs_start
3:
    b 3b
