// Toast store singleton — không cần lib, chỉ 1 subscriber
type ToastKind = 'success' | 'error' | 'info';
export interface Toast { id: number; kind: ToastKind; message: string }

let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();
let items: Toast[] = [];

function push(kind: ToastKind, message: string) {
  const t: Toast = { id: nextId++, kind, message };
  items = [...items, t];
  listeners.forEach((fn) => fn(items));
  setTimeout(() => {
    items = items.filter((x) => x.id !== t.id);
    listeners.forEach((fn) => fn(items));
  }, 2500);
}

export const toast = {
  success: (msg: string) => push('success', msg),
  error:   (msg: string) => push('error', msg),
  info:    (msg: string) => push('info', msg),
};

export function subscribeToast(fn: (t: Toast[]) => void) {
  listeners.add(fn);
  fn(items);
  return () => { listeners.delete(fn); };
}
