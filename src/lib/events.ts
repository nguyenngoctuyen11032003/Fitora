// Tiny app-wide event: features call notifyDataChanged() after writing meals,
// workouts, water… so other mounted views (dashboard, laptop sidebar) can refetch.

const EVT = 'fitora:data-changed';

export type DataKind = 'meals' | 'workouts' | 'daily' | 'body' | 'profile' | 'foods' | 'any';

export function notifyDataChanged(kind: DataKind = 'any'): void {
  window.dispatchEvent(new CustomEvent<DataKind>(EVT, { detail: kind }));
}

/** Subscribe; returns unsubscribe. */
export function onDataChanged(fn: (kind: DataKind) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<DataKind>).detail ?? 'any');
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}
