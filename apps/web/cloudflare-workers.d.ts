// Browser-facing TypeScript build only needs the runtime binding's shape here.
// Keep the full Workers globals out of the DOM compilation context.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
