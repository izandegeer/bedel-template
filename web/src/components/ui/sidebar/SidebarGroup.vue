<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({
  class: { type: null, required: false },
})
</script>

<template>
  <div
    data-slot="sidebar-group"
    data-sidebar="group"
    :class="cn('p-2 relative flex w-full min-w-0 flex-col', props.class)"
  >
    <slot />
  </div>
</template>
