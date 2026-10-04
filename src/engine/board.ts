// ---------- Bitboard ----------
//
// O jogo só usa as 32 casas escuras, então o tabuleiro cabe em um inteiro de 32 bits,
// um bit por casa. A posição toda são três deles: peças brancas, peças pretas e damas.
//
//         a   b   c   d   e   f   g   h
//   8     ·  28   ·  29   ·  30   ·  31
//   7    24   ·  25   ·  26   ·  27   ·
//   6     ·  20   ·  21   ·  22   ·  23
//   5    16   ·  17   ·  18   ·  19   ·
//   4     ·  12   ·  13   ·  14   ·  15
//   3     8   ·   9   ·  10   ·  11   ·
//   2     ·   4   ·   5   ·   6   ·   7
//   1     0   ·   1   ·   2   ·   3   ·
//
// As linhas são contadas a partir de 0 (a linha 0 é a fileira 1). Nas linhas pares as casas
// ficam nas colunas a, c, e, g; nas ímpares, em b, d, f, h.

export const WHITE = 0
export const BLACK = 1
export type Side = 0 | 1

export interface Position {
  white: number
  black: number
  kings: number
  /** Quem joga. */
  side: Side
}

export const INITIAL: Position = { white: 0x00000fff, black: 0xfff00000 | 0, kings: 0, side: WHITE }

/** Última linha de cada cor: onde a pedra vira dama. */
export const PROMOTION = [0xf0000000 | 0, 0x0000000f]

// ---------- Deslocamentos ----------
//
// Andar na diagonal é deslocar bits: 4 posições em uma direção, e 3 ou 5 na outra, conforme
// a linha seja par ou ímpar. As máscaras tiram as casas da borda, de onde o deslocamento
// iria parar do outro lado do tabuleiro.

export const EVEN_ROWS = 0x0f0f0f0f
export const ODD_ROWS = 0xf0f0f0f0 | 0
/** Linhas pares, menos a coluna a. */
export const EVEN_INNER = 0x0e0e0e0e
/** Linhas ímpares, menos a coluna h. */
export const ODD_INNER = 0x70707070

/** Todas as casas de `x`, um passo para cima e para a direita. */
export function northEast(x: number): number {
  return ((x & EVEN_ROWS) << 4) | ((x & ODD_INNER) << 5)
}

export function northWest(x: number): number {
  return ((x & ODD_ROWS) << 4) | ((x & EVEN_INNER) << 3)
}

export function southEast(x: number): number {
  return ((x & EVEN_ROWS) >>> 4) | ((x & ODD_INNER) >>> 3)
}

export function southWest(x: number): number {
  return ((x & ODD_ROWS) >>> 4) | ((x & EVEN_INNER) >>> 5)
}

export function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  x = (x + (x >>> 4)) & 0x0f0f0f0f
  return Math.imul(x, 0x01010101) >>> 24
}

// ---------- Geometria ----------

export const NE = 0
export const NW = 1
export const SE = 2
export const SW = 3

const STEP_ROW = [1, 1, -1, -1]
const STEP_COL = [1, -1, 1, -1]

export function rowOf(square: number): number {
  return square >> 2
}

export function colOf(square: number): number {
  return ((square & 3) << 1) | ((square >> 2) & 1)
}

/** Índice da casa em (linha, coluna), ou -1 se for uma casa clara ou fora do tabuleiro. */
export function squareAt(row: number, col: number): number {
  if (row < 0 || row > 7 || col < 0 || col > 7 || ((row + col) & 1) !== 0) return -1
  return row * 4 + (col >> 1)
}

// O caminho de cada casa em cada direção, até a borda. RAY[(casa * 4 + direção) * 8 + i] é a
// i-ésima casa do caminho e RAY_LENGTH[casa * 4 + direção] é quantas casas ele tem.
export const RAY = new Int8Array(32 * 4 * 8)
export const RAY_LENGTH = new Int8Array(32 * 4)

for (let square = 0; square < 32; square++) {
  for (let dir = 0; dir < 4; dir++) {
    let length = 0
    for (let k = 1; k < 8; k++) {
      const next = squareAt(rowOf(square) + STEP_ROW[dir] * k, colOf(square) + STEP_COL[dir] * k)
      if (next < 0) break
      RAY[(square * 4 + dir) * 8 + length++] = next
    }
    RAY_LENGTH[square * 4 + dir] = length
  }
}

// ---------- Notação ----------

export function squareName(square: number): string {
  return 'abcdefgh'[colOf(square)] + (rowOf(square) + 1)
}

export function squareFromName(name: string): number {
  return squareAt(Number(name[1]) - 1, name.charCodeAt(0) - 97)
}

/**
 * Monta uma posição a partir de um desenho do tabuleiro, da fileira 8 para a 1:
 * `w` pedra branca, `W` dama branca, `b` pedra preta, `B` dama preta, `.` casa vazia.
 * Os espaços são ignorados.
 */
export function parseDiagram(diagram: string, side: Side): Position {
  const rows = diagram
    .split('\n')
    .map((line) => line.replace(/\s/g, ''))
    .filter((line) => line.length > 0)
  if (rows.length !== 8 || rows.some((line) => line.length !== 8)) throw new Error('O diagrama precisa ter 8 linhas de 8 casas')
  const position: Position = { white: 0, black: 0, kings: 0, side }
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = rows[7 - row][col]
      if (piece === '.') continue
      const square = squareAt(row, col)
      if (square < 0 || !'wWbB'.includes(piece)) throw new Error(`Peça inválida em ${'abcdefgh'[col]}${row + 1}`)
      const bit = 1 << square
      if (piece === 'w' || piece === 'W') position.white |= bit
      else position.black |= bit
      if (piece === 'W' || piece === 'B') position.kings |= bit
    }
  }
  return position
}
