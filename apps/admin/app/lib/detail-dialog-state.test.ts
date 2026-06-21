import { describe, expect, it } from "vitest";
import { detailDialogReducer, initialDetailDialogState } from "./detail-dialog-state.js";

type Detail = { id: string; name: string };

describe("detail dialog state", () => {
  it("clears stale detail and locks loading when a new business id opens", () => {
    const previous = { selectedId: "order-1", detail: { id: "order-1", name: "old" }, loading: false, error: null };

    expect(detailDialogReducer<Detail>(previous, { type: "open", id: "order-2" })).toEqual({
      selectedId: "order-2",
      detail: null,
      loading: true,
      error: null
    });
  });

  it("ignores a stale detail response after another id was selected", () => {
    const current = { selectedId: "order-2", detail: null, loading: true, error: null };

    expect(detailDialogReducer<Detail>(current, {
      type: "loaded",
      id: "order-1",
      detail: { id: "order-1", name: "stale" }
    })).toBe(current);
  });

  it("clears the selected id, cached detail and loading state when closed", () => {
    const current = { selectedId: "order-2", detail: { id: "order-2", name: "current" }, loading: true, error: "old error" };

    expect(detailDialogReducer<Detail>(current, { type: "close" })).toEqual(initialDetailDialogState);
  });
});
