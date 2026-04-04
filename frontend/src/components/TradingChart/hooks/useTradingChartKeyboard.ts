import { useEffect, type Dispatch, type SetStateAction } from "react";

export interface UseTradingChartKeyboardParams {
  isLocked: boolean;
  setChartDebugMode: Dispatch<SetStateAction<boolean>>;
  undoLastDrawing: () => void;
  redoLastDrawing: () => void;
  handleSelectTool: (toolKey: string) => void;
  removeSelectedAndPersist: () => void;
}

export function useTradingChartKeyboard({
  isLocked,
  setChartDebugMode,
  undoLastDrawing,
  redoLastDrawing,
  handleSelectTool,
  removeSelectedAndPersist,
}: UseTradingChartKeyboardParams): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest?.("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      if (
        e.shiftKey &&
        e.key.toLowerCase() === "b" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setChartDebugMode((v) => !v);
        return;
      }

      if (isLocked) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoLastDrawing();
        else undoLastDrawing();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;
      if (key === "1") {
        e.preventDefault();
        handleSelectTool("TrendLine");
        return;
      }
      if (key === "2") {
        e.preventDefault();
        handleSelectTool("Ray");
        return;
      }
      if (key === "3") {
        e.preventDefault();
        handleSelectTool("HorizontalLine");
        return;
      }
      if (key === "4") {
        e.preventDefault();
        handleSelectTool("FibRetracement");
        return;
      }
      if (key === "q" || key === "Q") {
        e.preventDefault();
        handleSelectTool("Brush");
        return;
      }
      if (key === "Delete" || key === "Backspace") {
        removeSelectedAndPersist();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isLocked,
    removeSelectedAndPersist,
    handleSelectTool,
    undoLastDrawing,
    redoLastDrawing,
    setChartDebugMode,
  ]);
}
