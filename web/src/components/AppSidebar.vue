<script setup>
import { routes } from '../router.js';
import { syncedAt } from '../store.js';
import { formatDateTime } from '../lib/dates.js';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { GraduationCap } from '@lucide/vue';
const { setOpenMobile } = useSidebar();
</script>
<template>
  <Sidebar collapsible="offcanvas">
    <SidebarHeader>
      <div class="flex items-center gap-2 px-2 py-1.5 text-base font-semibold tracking-tight">
        <GraduationCap class="size-5 text-primary" aria-hidden="true" /> Bedel
      </div>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem v-for="r in routes" :key="r.path">
            <SidebarMenuButton as-child size="lg" :is-active="$route.path === r.path" :tooltip="r.meta.title">
              <router-link :to="r.path" @click="setOpenMobile(false)">
                <component :is="r.meta.lucide" />
                <span>{{ r.meta.title }}</span>
              </router-link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <p class="px-2 pb-1 text-xs text-muted-foreground">
        Datos de Aules:<br />{{ syncedAt() ? formatDateTime(syncedAt()) : '-' }}
      </p>
    </SidebarFooter>
  </Sidebar>
</template>
