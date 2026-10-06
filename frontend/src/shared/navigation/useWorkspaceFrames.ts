import { useCallback, useLayoutEffect, useRef } from "react";

/** Cancel deferred focus and measurements whenever the mounted workspace suspends. */
export function useWorkspaceFrames(active: boolean) {
  const state = useRef({ active, generation: 0, frames: new Set<number>() });
  useLayoutEffect(() => {
    const current = state.current;
    current.active = active;
    if (!active) {
      ++current.generation;
      for (const frame of current.frames) window.cancelAnimationFrame(frame);
      current.frames.clear();
    }
    return () => {
      current.active = false;
      ++current.generation;
      for (const frame of current.frames) window.cancelAnimationFrame(frame);
      current.frames.clear();
    };
  }, [active]);
  return useCallback((callback: FrameRequestCallback) => {
    const current = state.current;
    if (!current.active) return 0;
    const generation = current.generation;
    const frame = window.requestAnimationFrame((time) => {
      current.frames.delete(frame);
      if (current.active && generation === current.generation) callback(time);
    });
    current.frames.add(frame);
    return frame;
  }, []);
}
