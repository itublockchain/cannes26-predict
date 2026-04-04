import { TOP_TOOLS } from "./chartConstants";
import styles from "./TradingChart.module.css";
import { cn } from "./utils/cn";

export interface TradingChartToolbarProps {
  isLocked: boolean;
  activeTool: string | null;
  brushAllowed: boolean;
  onSelectTool: (toolKey: string) => void;
  onDeleteSelected: () => void;
}

export function TradingChartToolbar({
  isLocked,
  activeTool,
  brushAllowed,
  onSelectTool,
  onDeleteSelected,
}: TradingChartToolbarProps) {
  const btnClass = (key: string) =>
    cn(
      styles.tbBtn,
      activeTool === key && styles.tbBtnActive,
      isLocked && styles.tbBtnDisabled,
    );

  const brushBtnClass = cn(
    styles.tbBtn,
    activeTool === "Brush" && styles.tbBtnActive,
    (!brushAllowed || isLocked) && styles.tbBtnDisabled,
  );

  return (
    <div
      className={cn(styles.toolbarShell, isLocked && styles.toolbarShellLocked)}
      aria-hidden={isLocked}
    >
      <aside
        className={cn(styles.toolbar, isLocked && styles.toolbarSlideAway)}
      >
        <div className={styles.tbGroup}>
          {TOP_TOOLS.map((tool) => (
            <button
              key={tool.key}
              className={btnClass(tool.key)}
              type="button"
              title={
                tool.shortcutKey
                  ? `${tool.title} (${tool.shortcutKey})`
                  : tool.title
              }
              disabled={isLocked}
              onClick={() => onSelectTool(tool.key)}
            >
              {tool.shortcutKey ? (
                <span className={styles.tbKeyHint} aria-hidden>
                  {tool.shortcutKey}
                </span>
              ) : null}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                dangerouslySetInnerHTML={{ __html: tool.svg }}
              />
            </button>
          ))}
        </div>
        <div className={styles.tbSpacer} />
        <div className={`${styles.tbGroup} ${styles.tbActions}`}>
          <button
            className={brushBtnClass}
            type="button"
            title="Fırça (tahmin penceresi) (Q)"
            disabled={!brushAllowed || isLocked}
            onClick={() => onSelectTool("Brush")}
          >
            <span className={styles.tbKeyHint} aria-hidden>
              Q
            </span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 13C18 13 22 13 22 18C22 20.2091 20.2091 22 18 22C15.7909 22 14 20.2091 14 18C14 16.5 15 15 16.5 13L18 13Z" />
              <path d="M17 13L12 8L2.5 17.5L5 20L14.5 10.5L17 13Z" />
            </svg>
          </button>
          <button
            className={cn(btnClass(""), styles.tbDanger)}
            type="button"
            title="Delete Selected"
            disabled={isLocked}
            onClick={onDeleteSelected}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </aside>
    </div>
  );
}
