import { INITIAL, parseDiagram, WHITE, type Position } from '../../engine/board.ts'

// A "posição de estudo" da página Como funciona: o leitor monta a posição clicando nas
// casas, e os diagramas mostram o que o motor enxerga nela.

export const MIDGAME = parseDiagram(
  `
  . b . b . . . b
  b . . . b . b .
  . b . . . b . .
  . . b . . . . .
  . . . w . . . w
  w . w . . . w .
  . w . . . w . .
  w . . . w . w .
  `,
  WHITE,
)

export const EMPTY: Position = { white: 0, black: 0, kings: 0, side: WHITE }

export const PRESETS: { name: string; position: Position }[] = [
  { name: 'Posição inicial', position: INITIAL },
  { name: 'Meio de jogo', position: MIDGAME },
  { name: 'Vazio', position: EMPTY },
]

/** Troca o conteúdo da casa: vazia → pedra branca → dama branca → pedra preta → dama preta → vazia. */
export function cycleSquare(position: Position, square: number): Position {
  const bit = 1 << square
  const king = (position.kings & bit) !== 0
  const current = (position.white & bit) !== 0 ? (king ? 2 : 1) : (position.black & bit) !== 0 ? (king ? 4 : 3) : 0
  let next = (current + 1) % 5
  // Uma pedra nunca fica parada na linha em que viraria dama.
  if (next === 1 && square >= 28) next = 2
  if (next === 3 && square <= 3) next = 4
  return {
    white: next === 1 || next === 2 ? position.white | bit : position.white & ~bit,
    black: next === 3 || next === 4 ? position.black | bit : position.black & ~bit,
    kings: next === 2 || next === 4 ? position.kings | bit : position.kings & ~bit,
    side: position.side,
  }
}

export const samePosition = (a: Position, b: Position) => a.white === b.white && a.black === b.black && a.kings === b.kings
