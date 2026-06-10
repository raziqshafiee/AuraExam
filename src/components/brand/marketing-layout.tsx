import { type ReactNode } from "react";
import { MarketingNav } from "./marketing-nav";
import { MarketingFooter } from "./marketing-footer";

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
