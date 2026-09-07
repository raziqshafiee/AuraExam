import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { parse, serialize } from "cookie-es";
import type { Database } from "../database.types";

export const createClient = () => {
  const request = getRequest();

  return createServerClient<Database>(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
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
          // setResponseHeader replaces same-name headers when given a single
          // string (Headers.set semantics) — looping and calling it once per
          // cookie silently drops every cookie but the last one in the batch.
          // Passing the whole batch as an array routes it through the
          // delete-then-append path instead, which is what multiple
          // simultaneous Set-Cookie headers (e.g. chunked session cookies)
          // actually require.
          const cookies = cookiesToSet.map(({ name, value, options }) =>
            serialize(name, value, options as any)
          );
          if (cookies.length > 0) {
            setResponseHeader("Set-Cookie", cookies);
          }
        },
      },
    }
  );
};
