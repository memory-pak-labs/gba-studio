    .section .text.irq, "ax", %progbits
    .arm
    .global gbs_hw_irq_entry
    .type gbs_hw_irq_entry, %function
    .extern gbs_hw_irq_dispatch

gbs_hw_irq_entry:
    /* The BIOS IRQ trampoline saves volatile registers and calls this slot as
       a normal ARM function. Preserve the callee-saved registers, dispatch,
       then return to the trampoline so it can restore the IRQ frame and use
       SUBS PC, LR, #4 for the exception return. */
    stmdb sp!, {r4-r11, lr}
    bl gbs_hw_irq_dispatch
    ldmia sp!, {r4-r11, lr}
    bx lr

    .size gbs_hw_irq_entry, . - gbs_hw_irq_entry
