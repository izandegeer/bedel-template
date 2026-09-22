<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({
  class: { type: null, required: false },
})
</script>

<template>
  <div
    data-slot="sidebar-group-content"
    data-sidebar="group-content"
    :class="cn('text-sm w-full', props.class)"
  >
    <slot />
  </div>
</template>
