import { createMiddleware } from "@tanstack/react-start";
import { createClient } from "./server";

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const supabase = createClient();
  
  // Refresh session if needed
  await supabase.auth.getUser();

  return next();
});
