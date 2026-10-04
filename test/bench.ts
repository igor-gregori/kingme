import { INITIAL, parseDiagram, WHITE, type Position } from '../src/engine/board.ts'
import { applyMove, legalMoves } from '../src/engine/movegen.ts'
import { search } from '../src/engine/search.ts'

// Mede a busca a partir de algumas posições, com o orçamento de tempo de cada nível.

/** Joga `plies` lances com a própria busca, rasa, para chegar a uma posição de meio de jogo plausível. */
function advance(position: Position, plies: number): Position {
  for (let ply = 0; ply < plies; ply++) {
    const { best } = search(position, [], { maxDepth: 10, timeMs: 1000 })
    if (!best) break
    position = applyMove(position, legalMoves(position).find((move) => move.from === best.from && move.to === best.to && move.captured === best.captured)!)
  }
  return position
}

const positions: Record<string, Position> = {
  'posição inicial': INITIAL,
  'abertura (12 lances)': advance(INITIAL, 12),
  'meio de jogo (30 lances)': advance(INITIAL, 30),
  'final com damas': parseDiagram(
    `
    . . . . . B . .
    . . . . . . . .
    . b . . . . . .
    . . . . . . b .
    . . . w . . . .
    w . . . . . . .
    . . . . . w . .
    . . W . . . . .
    `,
    WHITE,
  ),
}

for (const timeMs of [1000, 3000]) {
  console.log(`\n${timeMs / 1000} s por posição`)
  for (const [name, position] of Object.entries(positions)) {
    const r = search(position, [], { maxDepth: 99, timeMs })
    const rate = (r.nodes / r.ms / 1000).toFixed(1)
    console.log(
      `${name.padEnd(26)} profundidade ${String(r.depth).padStart(2)}  ${String(r.nodes).padStart(9)} nós  ` +
        `${r.ms.toFixed(0).padStart(5)} ms  ${rate.padStart(5)} M nós/s  pontuação=${r.score}`,
    )
  }
}
