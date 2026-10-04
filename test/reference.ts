import { BLACK, WHITE, squareAt, squareName, type Position, type Side } from '../src/engine/board.ts'

// Gerador de referência: as mesmas regras do gerador de bitboards, escritas do jeito mais
// direto possível, casa a casa, sobre uma matriz 8×8. É lento de propósito; serve só para
// conferir o outro.

/** `w` pedra branca, `W` dama branca, `b` pedra preta, `B` dama preta, `.` casa vazia. */
export type Grid = string[][]

export interface ReferenceMove {
  /** Casas por onde a peça passa, em notação algébrica. A primeira é a origem. */
  squares: string[]
  /** Casas das peças capturadas, na ordem. */
  taken: string[]
}

const DIAGONALS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

const name = (row: number, col: number) => 'abcdefgh'[col] + (row + 1)
const inside = (row: number, col: number) => row >= 0 && row < 8 && col >= 0 && col < 8
const isWhite = (piece: string) => piece === 'w' || piece === 'W'
const isKing = (piece: string) => piece === 'W' || piece === 'B'
const ownedBy = (piece: string, side: Side) => piece !== '.' && isWhite(piece) === (side === WHITE)

export function toGrid(position: Position): Grid {
  const grid: Grid = Array.from({ length: 8 }, () => new Array<string>(8).fill('.'))
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = squareAt(row, col)
      if (square < 0) continue
      const bit = 1 << square
      const king = (position.kings & bit) !== 0
      if ((position.white & bit) !== 0) grid[row][col] = king ? 'W' : 'w'
      else if ((position.black & bit) !== 0) grid[row][col] = king ? 'B' : 'b'
    }
  }
  return grid
}

function captures(grid: Grid, side: Side, row: number, col: number, king: boolean, squares: string[], taken: string[], out: ReferenceMove[]) {
  let found = false
  for (const [dr, dc] of DIAGONALS) {
    // Anda até a primeira peça: a pedra só olha a casa vizinha, a dama olha a diagonal inteira.
    let r = row + dr
    let c = col + dc
    if (king) {
      while (inside(r, c) && grid[r][c] === '.') {
        r += dr
        c += dc
      }
    }
    if (!inside(r, c) || grid[r][c] === '.' || ownedBy(grid[r][c], side) || taken.includes(name(r, c))) continue
    const victim = name(r, c)
    // Casas de pouso: a pedra só tem a casa logo depois, a dama tem todas as livres em seguida.
    r += dr
    c += dc
    while (inside(r, c) && grid[r][c] === '.') {
      found = true
      captures(grid, side, r, c, king, [...squares, name(r, c)], [...taken, victim], out)
      if (!king) break
      r += dr
      c += dc
    }
  }
  if (!found && taken.length > 0) out.push({ squares, taken })
}

/** Todas as jogadas legais, um item por caminho diferente. */
export function referenceMoves(grid: Grid, side: Side): ReferenceMove[] {
  const jumps: ReferenceMove[] = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = grid[row][col]
      if (!ownedBy(piece, side)) continue
      // A peça que captura sai da casa de origem, que fica livre durante a jogada.
      grid[row][col] = '.'
      captures(grid, side, row, col, isKing(piece), [name(row, col)], [], jumps)
      grid[row][col] = piece
    }
  }
  if (jumps.length > 0) {
    const most = Math.max(...jumps.map((move) => move.taken.length))
    return jumps.filter((move) => move.taken.length === most)
  }

  const moves: ReferenceMove[] = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = grid[row][col]
      if (!ownedBy(piece, side)) continue
      for (const [dr, dc] of DIAGONALS) {
        if (!isKing(piece) && dr !== (side === WHITE ? 1 : -1)) continue
        let r = row + dr
        let c = col + dc
        while (inside(r, c) && grid[r][c] === '.') {
          moves.push({ squares: [name(row, col), name(r, c)], taken: [] })
          if (!isKing(piece)) break
          r += dr
          c += dc
        }
      }
    }
  }
  return moves
}

/** Identifica o resultado da jogada: origem, destino e conjunto de peças capturadas. */
export function outcomeKey(move: ReferenceMove): string {
  return `${move.squares[0]}>${move.squares[move.squares.length - 1]}:${[...move.taken].sort().join(',')}`
}

/** Tira as jogadas que só diferem no caminho. */
export function distinctOutcomes(moves: ReferenceMove[]): ReferenceMove[] {
  const seen = new Set<string>()
  return moves.filter((move) => {
    const key = outcomeKey(move)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function play(grid: Grid, move: ReferenceMove): Grid {
  const next = grid.map((row) => [...row])
  const at = (square: string) => [Number(square[1]) - 1, square.charCodeAt(0) - 97]
  const [fromRow, fromCol] = at(move.squares[0])
  const [toRow, toCol] = at(move.squares[move.squares.length - 1])
  let piece = next[fromRow][fromCol]
  next[fromRow][fromCol] = '.'
  for (const square of move.taken) {
    const [row, col] = at(square)
    next[row][col] = '.'
  }
  if (piece === 'w' && toRow === 7) piece = 'W'
  if (piece === 'b' && toRow === 0) piece = 'B'
  next[toRow][toCol] = piece
  return next
}

export function referencePerft(grid: Grid, side: Side, depth: number): number {
  const moves = distinctOutcomes(referenceMoves(grid, side))
  if (depth === 1) return moves.length
  let total = 0
  for (const move of moves) total += referencePerft(play(grid, move), side === WHITE ? BLACK : WHITE, depth - 1)
  return total
}

/** O mesmo formato de `outcomeKey`, para uma jogada do gerador de bitboards. */
export function bitboardKey(from: number, to: number, captured: number): string {
  const taken: string[] = []
  for (let square = 0; square < 32; square++) if ((captured & (1 << square)) !== 0) taken.push(squareName(square))
  return `${squareName(from)}>${squareName(to)}:${taken.sort().join(',')}`
}
