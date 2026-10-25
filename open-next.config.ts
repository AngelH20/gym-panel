import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sin incremental cache (R2/KV): todas las páginas son dinámicas (leen
// cookies de Supabase en cada request) y no usamos ISR ni fetch cacheado,
// así que no hay nada que guardar. Si algún día se agrega ISR, ver
// https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({});
