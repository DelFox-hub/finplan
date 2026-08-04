const activeRelocationSaves = new Set<Promise<unknown>>();

export function trackRelocationSave<T>(promise: Promise<T>): Promise<T> {
  const tracked = promise.finally(() => {
    activeRelocationSaves.delete(tracked);
  });
  activeRelocationSaves.add(tracked);
  return tracked;
}

export async function waitForRelocationSaves() {
  while (activeRelocationSaves.size) {
    await Promise.allSettled([...activeRelocationSaves]);
  }
}
