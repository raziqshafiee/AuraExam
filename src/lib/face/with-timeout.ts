// Resolves with `null` on timeout instead of rejecting — used to bound every
// identity-check call (loadHuman/extractDescriptor/faceVerify) so a stalled
// camera, model download, or network request can NEVER hang the caller.
// Never rejects: a thrown/rejected `promise` also resolves to null. This is
// the fail-soft primitive Task 5's review found missing (Global Constraint
// #8) — every faceVerify call site added in Task 6 is wrapped with it.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    promise.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    );
  });
}
