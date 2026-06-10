import { cn } from "@/lib/utils";

export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 24" className={cn("w-24 h-5", className)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M2 12 Q 14 2, 26 12 T 50 12 T 74 12 T 98 12 T 118 12" />
    </svg>
  );
}

export function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("w-8 h-8", className)} fill="currentColor">
      <path d="M20 0 L24 16 L40 20 L24 24 L20 40 L16 24 L0 20 L16 16 Z" />
    </svg>
  );
}

export function Dots({ className }: { className?: string }) {
  const cells = Array.from({ length: 25 });
  return (
    <div className={cn("grid grid-cols-5 gap-1.5 w-fit", className)}>
      {cells.map((_, i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-current" />
      ))}
    </div>
  );
}

export function Zigzag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 20" className={cn("w-24 h-4", className)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
      <path d="M2 18 L14 4 L26 18 L38 4 L50 18 L62 4 L74 18 L86 4 L98 18 L110 4 L118 14" />
    </svg>
  );
}

export function Blob({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("w-20 h-20", className)} fill="currentColor">
      <path d="M50 5 C 75 5, 95 25, 95 50 S 75 95, 50 95 S 5 75, 5 50 S 25 5, 50 5 Z" />
    </svg>
  );
}

export function DoodleBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Star className="absolute top-[8%] left-[6%] w-12 h-12 text-amber rotate-12" />
      <Squiggle className="absolute top-[28%] left-[3%] w-28 h-6 text-pink -rotate-12" />
      <Dots className="absolute top-[10%] right-[8%] text-violet" />
      <Zigzag className="absolute bottom-[18%] right-[5%] w-32 text-sky" />
      <Blob className="absolute bottom-[8%] left-[8%] w-16 h-16 text-lime/70 -rotate-6" />
      <Star className="absolute bottom-[30%] right-[18%] w-6 h-6 text-pink" />
    </div>
  );
}
