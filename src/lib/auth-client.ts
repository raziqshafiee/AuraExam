import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

// Lazy: constructing eagerly at module scope runs this during SSR too (this
// module is pulled into the server bundle via auth.ts), and the SSR build
// doesn't reliably inline import.meta.env.VITE_* — crashing every request.
export function getSupabaseClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
