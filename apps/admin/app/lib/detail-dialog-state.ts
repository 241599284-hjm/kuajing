export type DetailDialogState<T> = {
  selectedId: string | null;
  detail: T | null;
  loading: boolean;
  error: string | null;
};

export type DetailDialogAction<T> =
  | { type: "open"; id: string }
  | { type: "loaded"; id: string; detail: T }
  | { type: "failed"; id: string; error: string }
  | { type: "close" };

export const initialDetailDialogState: DetailDialogState<never> = {
  selectedId: null,
  detail: null,
  loading: false,
  error: null
};

export function detailDialogReducer<T>(state: DetailDialogState<T>, action: DetailDialogAction<T>): DetailDialogState<T> {
  if (action.type === "close") return initialDetailDialogState;
  if (action.type === "open") return { selectedId: action.id, detail: null, loading: true, error: null };
  if (state.selectedId !== action.id) return state;
  if (action.type === "loaded") return { ...state, detail: action.detail, loading: false, error: null };
  return { ...state, detail: null, loading: false, error: action.error };
}
