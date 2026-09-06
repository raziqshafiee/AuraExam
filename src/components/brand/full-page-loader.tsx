interface Props {
  message: string;
}

// Full-screen cover used during a navigation that would otherwise leave the
// outgoing page's content visible while the next route's data loads.
export function FullPageLoader({ message }: Props) {
  return (
    <div className="fixed inset-0 z-[60] bg-[#fffdf5] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-ink border-t-lime rounded-full animate-spin" />
      <p className="font-mono text-sm text-ink/60">{message}</p>
    </div>
  );
}
