import { useRef, useState, useCallback, useEffect } from "react";
import type { GamePhase } from "../chartConstants";

interface SyncActions {
  addToolWithDevClear: (
    toolKey: string,
    opts?: { replacePreviousOfSameKind?: boolean },
  ) => void;
  updateActiveTool: (toolKey: string | null) => void;
}

interface UseGamePhaseParams {
  gameStartTimeRef: React.MutableRefObject<number | null>;
  lastTimeRef: React.MutableRefObject<number | null>;
  gameObservationEndTimeRef: React.MutableRefObject<number | null>;
  gameTahminEndTimeRef: React.MutableRefObject<number | null>;
  isLockedRef: React.MutableRefObject<boolean>;
  chartContainerRef: React.RefObject<HTMLDivElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineToolsRef: React.RefObject<any | null>;
  emitDrawingCapability: (reason: string, options?: { forceLog?: boolean }) => void;
}

interface UseGamePhaseReturn {
  gamePhase: GamePhase;
  gamePhaseRef: React.MutableRefObject<GamePhase>;
  /** Injecting addToolWithDevClear/updateActiveTool at call-time breaks the
   *  circular dependency between useGamePhase and useToolSelection. */
  syncPhaseAndMaybeAutoBrush: (actions: SyncActions) => void;
}

export function useGamePhase({
  gameStartTimeRef,
  lastTimeRef,
  gameObservationEndTimeRef,
  gameTahminEndTimeRef,
  isLockedRef,
  chartContainerRef,
  lineToolsRef,
  emitDrawingCapability,
}: UseGamePhaseParams): UseGamePhaseReturn {
  const [gamePhase, setGamePhase] = useState<GamePhase>(1);
  const gamePhaseRef = useRef<GamePhase>(1);
  gamePhaseRef.current = gamePhase;

  // Keep emitDrawingCapability stable in closures via ref
  const emitRef = useRef(emitDrawingCapability);
  useEffect(() => {
    emitRef.current = emitDrawingCapability;
  }, [emitDrawingCapability]);

  const syncPhaseAndMaybeAutoBrush = useCallback(
    (actions: SyncActions) => {
      const t0 = gameStartTimeRef.current;
      const lt = lastTimeRef.current;
      const obsEnd = gameObservationEndTimeRef.current;
      const tahEnd = gameTahminEndTimeRef.current;
      if (t0 === null || lt === null || obsEnd === null || tahEnd === null) return;

      const phase: GamePhase = lt < obsEnd ? 1 : lt < tahEnd ? 2 : 3;

      setGamePhase((prev) => {
        if (prev === 1 && phase === 2 && !isLockedRef.current) {
          queueMicrotask(() => {
            if (!isLockedRef.current && lineToolsRef.current) {
              actions.addToolWithDevClear("Brush");
              actions.updateActiveTool("Brush");
              requestAnimationFrame(() => {
                chartContainerRef.current?.focus({ preventScroll: true });
              });
              emitRef.current("auto-brush-phase-2", { forceLog: true });
            }
          });
        }
        return phase;
      });
    },
    [
      gameStartTimeRef,
      lastTimeRef,
      gameObservationEndTimeRef,
      gameTahminEndTimeRef,
      isLockedRef,
      lineToolsRef,
      chartContainerRef,
    ],
  );

  return { gamePhase, gamePhaseRef, syncPhaseAndMaybeAutoBrush };
}
