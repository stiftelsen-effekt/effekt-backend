import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_DELAY_MS, PENDING_MIN_MS, useDelayedFlag } from "./use-delayed-flag";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(initial: boolean, options?: Parameters<typeof useDelayedFlag>[1]) {
  return renderHook(({ active }) => useDelayedFlag(active, options), {
    initialProps: { active: initial },
  });
}

describe("useDelayedFlag", () => {
  it("stays off for loads shorter than the delay", () => {
    const { result, rerender } = setup(true);
    act(() => vi.advanceTimersByTime(PENDING_DELAY_MS - 10));
    expect(result.current).toBe(false);
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(PENDING_DELAY_MS * 2));
    expect(result.current).toBe(false);
  });

  it("turns on once the load has taken longer than the delay", () => {
    const { result } = setup(true);
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(PENDING_DELAY_MS));
    expect(result.current).toBe(true);
  });

  it("stays on for the minimum duration after a slow load ends", () => {
    const { result, rerender } = setup(true);
    act(() => vi.advanceTimersByTime(PENDING_DELAY_MS + 50));
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(PENDING_MIN_MS - 60));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(20));
    expect(result.current).toBe(false);
  });

  it("turns off at once when it has already been on longer than the minimum", () => {
    const { result, rerender } = setup(true);
    act(() => vi.advanceTimersByTime(PENDING_DELAY_MS + PENDING_MIN_MS + 100));
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(false);
  });

  it("restarts the delay when activity flickers off and on", () => {
    const { result, rerender } = setup(true);
    act(() => vi.advanceTimersByTime(200));
    rerender({ active: false });
    rerender({ active: true });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(PENDING_DELAY_MS - 200));
    expect(result.current).toBe(true);
  });

  it("takes a custom delay and minimum", () => {
    const { result, rerender } = setup(true, { delay: 0, minDuration: 0 });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(true);
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(false);
  });

  it("starts off when inactive", () => {
    const { result } = setup(false);
    act(() => vi.advanceTimersByTime(PENDING_DELAY_MS * 3));
    expect(result.current).toBe(false);
  });
});
