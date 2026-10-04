import { BLACK, INITIAL, WHITE, type Position, type Side } from './engine/board.ts'
import { applyMove, legalMoves, moveName, promotes, type Move } from './engine/movegen.ts'
import { DRAW_PLIES } from './engine/search.ts'

export interface Piece {
  /** Identidade da peça ao longo da partida: a casa em que ela começou. */
  id: number
  square: number
  side: Side
  king: boolean
}

/** Uma jogada já feita, com o que a interface precisa para mostrar e animar. */
export interface PlayedMove extends Move {
  name: string
  side: Side
  piece: number
  promotes: boolean
  /** As peças capturadas, como estavam antes de sair do tabuleiro, na ordem em que foram puladas. */
  takenPieces: Piece[]
}

export type Outcome =
  | { winner: Side; reason: 'sem-pecas' | 'sem-jogadas' }
  | { winner: null; reason: 'repeticao' | 'damas' }

export interface Game {
  position: Position
  /** Posições desde a última captura ou jogada de pedra, sem contar a atual. */
  history: Position[]
  moves: PlayedMove[]
  pieces: Piece[]
  /** Jogadas legais na posição atual; vazio se a partida acabou. */
  legal: Move[]
  outcome: Outcome | null
}

export function piecesOf(position: Position): Piece[] {
  const pieces: Piece[] = []
  for (let square = 0; square < 32; square++) {
    const bit = 1 << square
    const king = (position.kings & bit) !== 0
    if ((position.white & bit) !== 0) pieces.push({ id: square, square, side: WHITE, king })
    else if ((position.black & bit) !== 0) pieces.push({ id: square, square, side: BLACK, king })
  }
  return pieces
}

const samePosition = (a: Position, b: Position) =>
  a.white === b.white && a.black === b.black && a.kings === b.kings && a.side === b.side

/** Reconstrói a partida a partir da lista de jogadas. */
export function buildGame(moves: readonly Move[], start: Position = INITIAL): Game {
  let position = start
  let history: Position[] = []
  let pieces = piecesOf(start)
  const played: PlayedMove[] = []

  for (const move of moves) {
    const mover = pieces.find((piece) => piece.square === move.from)!
    const crowned = promotes(position, move)
    played.push({
      ...move,
      name: moveName(move),
      side: position.side,
      piece: mover.id,
      promotes: crowned,
      takenPieces: move.taken.map((square) => pieces.find((piece) => piece.square === square)!),
    })
    // Só jogada de dama sem captura pode ser desfeita no tabuleiro; qualquer outra zera a contagem.
    history = mover.king && move.captured === 0 ? [...history, position] : []
    pieces = pieces
      .filter((piece) => (move.captured & (1 << piece.square)) === 0)
      .map((piece) => (piece === mover ? { ...piece, square: move.to, king: piece.king || crowned } : piece))
    position = applyMove(position, move)
  }

  const legal = legalMoves(position)
  let outcome: Outcome | null = null
  if (legal.length === 0) {
    const own = position.side === WHITE ? position.white : position.black
    outcome = { winner: (position.side ^ 1) as Side, reason: own === 0 ? 'sem-pecas' : 'sem-jogadas' }
  } else if (history.filter((past) => samePosition(past, position)).length >= 2) {
    outcome = { winner: null, reason: 'repeticao' }
  } else if (history.length >= DRAW_PLIES) {
    outcome = { winner: null, reason: 'damas' }
  }

  return { position, history, moves: played, pieces, legal: outcome ? [] : legal, outcome }
}

/** O caminho de cada jogada, origem primeiro: é assim que a partida é salva no navegador. */
export function serialize(moves: readonly Move[]): number[][] {
  return moves.map((move) => [move.from, ...move.path])
}

/** Refaz uma partida salva, conferindo cada jogada com as regras. Devolve null se algo não bater. */
export function restore(saved: unknown): Move[] | null {
  if (!Array.isArray(saved)) return null
  const moves: Move[] = []
  let game = buildGame(moves)
  for (const squares of saved) {
    if (!Array.isArray(squares)) return null
    const move = game.legal.find(
      (legal) => legal.path.length === squares.length - 1 && [legal.from, ...legal.path].every((square, i) => square === squares[i]),
    )
    if (!move) return null
    moves.push(move)
    game = buildGame(moves)
  }
  return moves
}
