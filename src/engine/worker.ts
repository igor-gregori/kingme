import type { Position } from './board.ts'
import { search, type SearchInfo, type SearchOptions, type SearchResult } from './search.ts'

export interface SearchRequest {
  id: number
  position: Position
  history: Position[]
  options: SearchOptions
}

/** Uma mensagem por profundidade concluída (`info`) e uma no fim (`result`). */
export type SearchMessage = { id: number; info: SearchInfo } | { id: number; result: SearchResult }

// A busca roda fora da thread principal para a interface não travar enquanto a IA pensa.
self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { id, position, history, options } = event.data
  const result = search(position, history, options, (info) => self.postMessage({ id, info } satisfies SearchMessage))
  self.postMessage({ id, result } satisfies SearchMessage)
}
