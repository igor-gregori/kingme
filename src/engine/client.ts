import type { Position } from './board.ts'
import type { SearchInfo, SearchOptions, SearchResult } from './search.ts'
import type { SearchMessage, SearchRequest } from './worker.ts'

let worker: Worker | undefined
let nextId = 0
let running: { id: number; onInfo: (info: SearchInfo) => void; resolve: (result: SearchResult) => void } | undefined

/**
 * Pede uma busca ao worker. `onInfo` recebe cada profundidade concluída, e a promessa
 * resolve com o resultado final. Só existe uma busca por vez: começar outra cancela a anterior.
 */
export function startSearch(
  position: Position,
  history: readonly Position[],
  options: SearchOptions,
  onInfo: (info: SearchInfo) => void,
): Promise<SearchResult> {
  stopSearch()
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<SearchMessage>) => {
      if (event.data.id !== running?.id) return
      if ('info' in event.data) {
        running.onInfo(event.data.info)
      } else {
        const { resolve } = running
        running = undefined
        resolve(event.data.result)
      }
    }
  }
  const request: SearchRequest = { id: nextId++, position, history: [...history], options }
  return new Promise((resolve) => {
    running = { id: request.id, onInfo, resolve }
    worker!.postMessage(request)
  })
}

/**
 * Cancela a busca em andamento; a promessa dela nunca resolve. O worker não escuta mensagens
 * enquanto busca, então o jeito de interromper é encerrá-lo e criar outro na próxima busca.
 */
export function stopSearch(): void {
  if (!running) return
  running = undefined
  worker?.terminate()
  worker = undefined
}
