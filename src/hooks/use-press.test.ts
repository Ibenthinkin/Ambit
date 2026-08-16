// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePress } from "./use-press";

// The handlers take React's synthetic PointerEvent, but everything this hook reads off an event is
// `button`, `clientX`, `clientY` — so the tests hand it plain objects rather than standing up
// jsdom PointerEvents (which jsdom's support for is patchy) through a real DOM render. That keeps
// these tests about the state machine, which is the part with the bugs.
function pointer(x = 0, y = 0, button = 0) {
  return { clientX: x, clientY: y, button } as React.PointerEvent;
}

describe("usePress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onTap on a clean press and release", () => {
    const onTap = vi.fn();
    const { result } = renderHook(() => usePress({ onTap }));

    act(() => result.current.onPointerDown(pointer(10, 10)));
    act(() => result.current.onPointerUp(pointer(10, 10)));

    expect(onTap).toHaveBeenCalledOnce();
  });

  it("fires onLongPress at the threshold, and suppresses the tap that follows", () => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => usePress({ onTap, onLongPress }));

    act(() => result.current.onPointerDown(pointer(10, 10)));
    act(() => void vi.advanceTimersByTime(450));
    expect(onLongPress).toHaveBeenCalledOnce();

    // The finger is still down; releasing it must NOT also register a tap.
    act(() => result.current.onPointerUp(pointer(10, 10)));
    expect(onTap).not.toHaveBeenCalled();
  });

  it("does not fire onLongPress early", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => usePress({ onLongPress }));

    act(() => result.current.onPointerDown(pointer(10, 10)));
    act(() => void vi.advanceTimersByTime(449));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  // The slop boundary gets asserted from both sides deliberately: an off-by-one here is invisible
  // in manual testing on a desktop and ruins scrolling on a phone.
  it("still taps at 11px of travel — inside the 12px slop", () => {
    const onTap = vi.fn();
    const { result } = renderHook(() => usePress({ onTap }));

    act(() => result.current.onPointerDown(pointer(0, 0)));
    act(() => result.current.onPointerMove(pointer(11, 0)));
    act(() => result.current.onPointerUp(pointer(11, 0)));

    expect(onTap).toHaveBeenCalledOnce();
  });

  // Exactly at the threshold. 11px and 13px on their own don't distinguish `> slop` from
  // `>= slop`; this one does, and the README's wording ("cancel if movement *exceeds* 12px") makes
  // 12px still a tap.
  it("still taps at exactly 12px of travel", () => {
    const onTap = vi.fn();
    const { result } = renderHook(() => usePress({ onTap }));

    act(() => result.current.onPointerDown(pointer(0, 0)));
    act(() => result.current.onPointerMove(pointer(12, 0)));
    act(() => result.current.onPointerUp(pointer(12, 0)));

    expect(onTap).toHaveBeenCalledOnce();
  });

  it("cancels the tap at 13px of travel — outside the 12px slop", () => {
    const onTap = vi.fn();
    const { result } = renderHook(() => usePress({ onTap }));

    act(() => result.current.onPointerDown(pointer(0, 0)));
    act(() => result.current.onPointerMove(pointer(13, 0)));
    act(() => result.current.onPointerUp(pointer(13, 0)));

    expect(onTap).not.toHaveBeenCalled();
  });

  it("guards both axes, not just x", () => {
    const onTap = vi.fn();
    const { result } = renderHook(() => usePress({ onTap }));

    act(() => result.current.onPointerDown(pointer(0, 0)));
    act(() => result.current.onPointerMove(pointer(0, 13)));
    act(() => result.current.onPointerUp(pointer(0, 13)));

    expect(onTap).not.toHaveBeenCalled();
  });

  it("travelling past the slop also cancels a pending long press", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => usePress({ onLongPress }));

    act(() => result.current.onPointerDown(pointer(0, 0)));
    act(() => void vi.advanceTimersByTime(200));
    act(() => result.current.onPointerMove(pointer(40, 0))); // became a scroll
    act(() => void vi.advanceTimersByTime(400));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("pointer-cancel fires neither callback", () => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => usePress({ onTap, onLongPress }));

    act(() => result.current.onPointerDown(pointer(10, 10)));
    act(() => result.current.onPointerCancel());
    act(() => void vi.advanceTimersByTime(1000));
    act(() => result.current.onPointerUp(pointer(10, 10)));

    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("ignores the secondary mouse button entirely", () => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => usePress({ onTap, onLongPress }));

    act(() => result.current.onPointerDown(pointer(10, 10, 2)));
    act(() => void vi.advanceTimersByTime(1000));
    act(() => result.current.onPointerUp(pointer(10, 10)));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });

  it("clears a pending long-press timer on unmount", () => {
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() => usePress({ onLongPress }));

    act(() => result.current.onPointerDown(pointer(10, 10)));
    unmount();
    act(() => void vi.advanceTimersByTime(1000));

    // A long press typically opens a sheet that unmounts the pressed element — the timer must not
    // outlive it and fire into a dead component.
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("survives a second gesture after a long press (state resets)", () => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => usePress({ onTap, onLongPress }));

    act(() => result.current.onPointerDown(pointer(10, 10)));
    act(() => void vi.advanceTimersByTime(450));
    act(() => result.current.onPointerUp(pointer(10, 10)));
    expect(onTap).not.toHaveBeenCalled();

    // A fresh, quick press right afterwards must tap normally — `longFired` has to have reset.
    act(() => result.current.onPointerDown(pointer(10, 10)));
    act(() => result.current.onPointerUp(pointer(10, 10)));
    expect(onTap).toHaveBeenCalledOnce();
    expect(onLongPress).toHaveBeenCalledOnce();
  });
});
