<script setup>
import { store } from './store.js';
import AppSidebar from './components/AppSidebar.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
</script>
<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset class="min-w-0">
      <header class="flex h-12 shrink-0 items-center gap-2 px-2">
        <SidebarTrigger />
        <span class="text-sm font-medium text-muted-foreground">{{ $route.meta.title }}</span>
      </header>
      <div class="w-full min-w-0 px-4 pb-10 md:px-6">
        <Alert v-if="store.error" variant="destructive">
          <AlertTitle>No se pudieron cargar los datos</AlertTitle>
          <AlertDescription>{{ store.error }}</AlertDescription>
        </Alert>
        <router-view v-else-if="store.loaded" />
        <p v-else class="text-sm text-muted-foreground">Cargando…</p>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
