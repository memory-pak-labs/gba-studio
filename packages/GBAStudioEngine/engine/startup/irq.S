    .section .iwram.irq, "ax", %progbits
    .arm
    .global gbs_hw_irq_entry
    .type gbs_hw_irq_entry, %function
    .extern gbs_hw_irq_dispatch

gbs_hw_irq_entry:
    /* BIOS saves volatile registers. The C ABI dispatcher preserves r4-r11
       and returns directly to the BIOS trampoline. A tail branch avoids
       duplicate register saves and keeps the IRQ stack 8-byte aligned. */
    b gbs_hw_irq_dispatch

    .size gbs_hw_irq_entry, . - gbs_hw_irq_entry

    .align 2
    .global gbs_hw_mix_audio_with_hblank
    .type gbs_hw_mix_audio_with_hblank, %function
    .extern gbs_audio_vblank_update
gbs_hw_mix_audio_with_hblank:
    /* IRQ mode has one banked LR/SPSR, so nested work must run in System
       mode. Save both IRQ state and the interrupted System LR. Only HBlank
       remains enabled; the raster fast path never recursively mixes audio. */
    stmdb sp!, {r4-r8, lr}
    mrs r4, spsr
    mrs r5, cpsr
    ldr r6, =0x04000200
    ldrh r7, [r6]
    mov r8, #2
    strh r8, [r6]
    bic r0, r5, #0x1f
    orr r0, r0, #0x1f
    msr cpsr_c, r0
    /* An interrupted leaf may have only 4-byte SP alignment. */
    mov r8, sp
    bic sp, sp, #7
    stmdb sp!, {r4-r8, lr}
    bic r0, r0, #0x80
    msr cpsr_c, r0
    bl gbs_audio_vblank_update
    mrs r0, cpsr
    orr r0, r0, #0x80
    msr cpsr_c, r0
    ldmia sp!, {r4-r8, lr}
    mov sp, r8
    msr cpsr_c, r5
    msr spsr_cxsf, r4
    strh r7, [r6]
    ldmia sp!, {r4-r8, lr}
    bx lr
    .size gbs_hw_mix_audio_with_hblank, . - gbs_hw_mix_audio_with_hblank
