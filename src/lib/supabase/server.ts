import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { parse, serialize } from "cookie-es";
import type { Database } from "../database.types";

export const createClient = () => {
  const request = getRequest();

  return createServerClient<Database>(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookieHeader = request?.headers.get("Cookie") ?? "";
          const cookies = parse(cookieHeader);
          return Object.entries(cookies).map(([name, value]) => ({
            name,
            value: value ?? "",
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookie = serialize(name, value, options as any);
            setResponseHeader("Set-Cookie", cookie);
          });
        },
      },
    }
  );
};
