/**
 * Minimal typings for the Workers bindings this route uses.
 *
 * Deliberately local and small instead of adding `@cloudflare/workers-types` to the project:
 * this app is overwhelmingly DOM code (the whole `src/` gallery runs in a browser), and the
 * Workers global types redeclare `fetch`, `Response`, `Headers` and friends with incompatible
 * shapes. Pulling them in globally to type one file would destabilise typechecking everywhere.
 * Only the surface actually used is declared here.
 */

interface KVNamespace {
  get(key: string, type: 'json'): Promise<unknown>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
