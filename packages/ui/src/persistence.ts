type PersistenceFlusher = () => Promise<void>;

const flushers = new Set<PersistenceFlusher>();

export function registerPersistenceFlusher(flusher: PersistenceFlusher): () => void {
  flushers.add(flusher);
  return () => flushers.delete(flusher);
}

export async function flushPendingPersistence(): Promise<void> {
  await Promise.all([...flushers].map((flush) => flush()));
}
