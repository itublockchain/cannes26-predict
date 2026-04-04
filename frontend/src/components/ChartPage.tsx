import { useCallback, useState } from 'react'
import {
  SecondPaneChart,
  TradingChart,
  type GameRoundWindow,
} from './TradingChart'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000'

export function ChartPage() {
  const [gameRoundWindow, setGameRoundWindow] =
    useState<GameRoundWindow | null>(null)

  const onGameRoundWindowKnown = useCallback((w: GameRoundWindow) => {
    setGameRoundWindow(w)
  }, [])

  return (
    <TradingChart
      wsUrl={WS_URL}
      onGameRoundWindowKnown={onGameRoundWindowKnown}
      resultSidePane={
        <SecondPaneChart wsUrl={WS_URL} gameWindow={gameRoundWindow} />
      }
      onDrawingComplete={(points) => {
        console.log('[Drawing]', points)
      }}
      onGameStateChange={(state) => {
        console.log('[Game State]', state)
      }}
    />
  )
}
