import {
  NE,
  NW,
  PROMOTION,
  RAY,
  RAY_LENGTH,
  SE,
  SW,
  WHITE,
  northEast,
  northWest,
  southEast,
  southWest,
  squareName,
  type Position,
  type Side,
} from './board.ts'

// ---------- Jogadas ----------
//
// Dentro da busca uma jogada são dois inteiros, sem alocar nada: origem e destino em
// MOVE_SQUARES e as peças capturadas, como bitboard, em MOVE_CAPTURED. Cada nível da busca
// tem a sua fatia desses vetores, de MAX_MOVES posições.

export const MAX_MOVES = 160
export const MAX_PLY = 128

/** origem | destino << 5 */
export const MOVE_SQUARES = new Int16Array(MAX_PLY * MAX_MOVES)
export const MOVE_CAPTURED = new Int32Array(MAX_PLY * MAX_MOVES)

/** A jogada completa, com o caminho casa a casa: é o que a interface e os testes usam. */
export interface Move {
  from: number
  to: number
  /** Bitboard das peças capturadas. */
  captured: number
  /** Casas em que a peça pousa, em ordem. A última é `to`. */
  path: number[]
  /** Casas das peças capturadas, na ordem em que são puladas. */
  taken: number[]
}

// Estado da geração em andamento.
let opponent = 0
/** Casas ocupadas, sem a peça que está capturando: a casa de onde ela saiu fica livre. */
let occupied = 0
let origin = 0
let base = 0
let count = 0
/** Quantas peças captura a maior sequência encontrada até agora. */
let longest = 0
let detailed: Move[] | null = null
/** Guarda todas as sequências de captura, sem aplicar a lei da maioria (só para a explicação). */
let everySequence = false
const landings = new Int8Array(16)
const jumped = new Int8Array(16)

function record(to: number, captured: number, length: number): void {
  // Lei da maioria: só valem as sequências que capturam mais peças.
  if (!everySequence) {
    if (length < longest) return
    if (length > longest) {
      longest = length
      count = 0
      if (detailed) detailed.length = 0
    }
  }
  if (detailed) {
    detailed.push({
      from: origin,
      to,
      captured,
      path: Array.from(landings.subarray(0, length)),
      taken: Array.from(jumped.subarray(0, length)),
    })
    count++
    return
  }
  // Caminhos diferentes que capturam as mesmas peças e param na mesma casa são a mesma jogada.
  const squares = origin | (to << 5)
  for (let i = base, end = base + count; i < end; i++) {
    if (MOVE_SQUARES[i] === squares && MOVE_CAPTURED[i] === captured) return
  }
  if (count === MAX_MOVES) return
  MOVE_SQUARES[base + count] = squares
  MOVE_CAPTURED[base + count] = captured
  count++
}

// As peças capturadas só saem do tabuleiro no fim da jogada: até lá continuam ocupando a
// casa, bloqueiam a passagem e não podem ser puladas de novo.

function captureWithMan(square: number, captured: number, length: number): void {
  let found = false
  for (let dir = 0; dir < 4; dir++) {
    if (RAY_LENGTH[square * 4 + dir] < 2) continue
    const ray = (square * 4 + dir) * 8
    const over = RAY[ray]
    const bit = 1 << over
    if ((opponent & bit) === 0 || (captured & bit) !== 0) continue
    const landing = RAY[ray + 1]
    if ((occupied & (1 << landing)) !== 0) continue
    found = true
    landings[length] = landing
    jumped[length] = over
    captureWithMan(landing, captured | bit, length + 1)
  }
  if (!found && length > 0) record(square, captured, length)
}

function captureWithKing(square: number, captured: number, length: number): void {
  let found = false
  for (let dir = 0; dir < 4; dir++) {
    const ray = (square * 4 + dir) * 8
    const rayLength = RAY_LENGTH[square * 4 + dir]
    // Desliza até a primeira peça no caminho.
    let k = 0
    while (k < rayLength && (occupied & (1 << RAY[ray + k])) === 0) k++
    if (k >= rayLength - 1) continue
    const over = RAY[ray + k]
    const bit = 1 << over
    if ((opponent & bit) === 0 || (captured & bit) !== 0) continue
    // Pode pousar em qualquer casa livre depois dela.
    for (k++; k < rayLength; k++) {
      const landing = RAY[ray + k]
      if ((occupied & (1 << landing)) !== 0) break
      found = true
      landings[length] = landing
      jumped[length] = over
      captureWithKing(landing, captured | bit, length + 1)
    }
  }
  if (!found && length > 0) record(square, captured, length)
}

function addQuiet(from: number, to: number): void {
  if (detailed) {
    detailed.push({ from, to, captured: 0, path: [to], taken: [] })
  } else {
    if (count === MAX_MOVES) return
    MOVE_SQUARES[base + count] = from | (to << 5)
    MOVE_CAPTURED[base + count] = 0
  }
  count++
}

/** Emite as jogadas simples das pedras que chegam em `targets` andando contra a direção `back`. */
function addManMoves(targets: number, back: number): void {
  while (targets !== 0) {
    const bit = targets & -targets
    targets ^= bit
    const to = 31 - Math.clz32(bit)
    addQuiet(RAY[(to * 4 + back) * 8], to)
  }
}

/**
 * Gera as jogadas legais de `side` em MOVE_SQUARES e MOVE_CAPTURED, a partir do índice
 * `offset`, e devolve quantas são. Se houver captura, só as capturas são legais.
 */
export function generate(white: number, black: number, kings: number, side: Side, offset: number): number {
  const own = side === WHITE ? white : black
  const all = white | black
  const empty = ~all
  opponent = side === WHITE ? black : white
  base = offset
  count = 0
  longest = 0

  const men = own & ~kings
  // Pedras com uma peça adversária ao lado e a casa seguinte vazia, nas quatro direções de uma vez.
  let jumpers =
    men &
    (southWest(southWest(empty) & opponent) |
      southEast(southEast(empty) & opponent) |
      northWest(northWest(empty) & opponent) |
      northEast(northEast(empty) & opponent))
  while (jumpers !== 0) {
    const bit = jumpers & -jumpers
    jumpers ^= bit
    origin = 31 - Math.clz32(bit)
    occupied = all ^ bit
    captureWithMan(origin, 0, 0)
  }
  let ownKings = own & kings
  while (ownKings !== 0) {
    const bit = ownKings & -ownKings
    ownKings ^= bit
    origin = 31 - Math.clz32(bit)
    occupied = all ^ bit
    captureWithKing(origin, 0, 0)
  }
  if (count > 0) return count

  // Sem captura: as pedras andam uma casa para a frente, e as damas deslizam.
  if (side === WHITE) {
    addManMoves(northEast(men) & empty, SW)
    addManMoves(northWest(men) & empty, SE)
  } else {
    addManMoves(southEast(men) & empty, NW)
    addManMoves(southWest(men) & empty, NE)
  }
  ownKings = own & kings
  while (ownKings !== 0) {
    const bit = ownKings & -ownKings
    ownKings ^= bit
    const from = 31 - Math.clz32(bit)
    for (let dir = 0; dir < 4; dir++) {
      const ray = (from * 4 + dir) * 8
      const rayLength = RAY_LENGTH[from * 4 + dir]
      for (let k = 0; k < rayLength; k++) {
        const to = RAY[ray + k]
        if ((all & (1 << to)) !== 0) break
        addQuiet(from, to)
      }
    }
  }
  return count
}

/** Quantas peças cada jogada da última geração captura (0 se não houve captura). */
export function captureLength(): number {
  return longest
}

/** As jogadas legais com o caminho completo. Aqui cada caminho diferente conta como uma jogada. */
export function legalMoves(position: Position): Move[] {
  const moves: Move[] = []
  detailed = moves
  generate(position.white, position.black, position.kings, position.side, 0)
  detailed = null
  return moves
}

/**
 * Todas as sequências de captura que a busca em profundidade encontra, inclusive as que a
 * lei da maioria descarta. Vazio se não há captura. A página "Como funciona" usa para
 * mostrar o que foi descartado; o jogo usa `legalMoves`.
 */
export function captureSequences(position: Position): Move[] {
  everySequence = true
  const moves = legalMoves(position)
  everySequence = false
  return moves.filter((move) => move.captured !== 0)
}

export function applyMove(position: Position, move: { from: number; to: number; captured: number }): Position {
  const fromBit = 1 << move.from
  const toBit = 1 << move.to
  const white = position.side === WHITE
  const own = ((white ? position.white : position.black) & ~fromBit) | toBit
  const other = (white ? position.black : position.white) & ~move.captured
  let kings = position.kings & ~move.captured
  if ((kings & fromBit) !== 0) kings = (kings & ~fromBit) | toBit
  // Só vira dama a pedra que termina a jogada na última linha.
  else if ((toBit & PROMOTION[position.side]) !== 0) kings |= toBit
  return {
    white: white ? own : other,
    black: white ? other : own,
    kings,
    side: (position.side ^ 1) as Side,
  }
}

/** A jogada termina com uma pedra virando dama? */
export function promotes(position: Position, move: { from: number; to: number }): boolean {
  return (position.kings & (1 << move.from)) === 0 && (PROMOTION[position.side] & (1 << move.to)) !== 0
}

/** `c3-d4` para uma jogada simples, `d4xf6` para uma captura, `c3xe5xg7` para uma captura em série. */
export function moveName(move: Move): string {
  if (move.captured === 0) return `${squareName(move.from)}-${squareName(move.to)}`
  return [move.from, ...move.path].map(squareName).join('x')
}
