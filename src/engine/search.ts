import {
  ODD_ROWS,
  PROMOTION,
  WHITE,
  northEast,
  northWest,
  popcount,
  southEast,
  southWest,
  type Position,
  type Side,
} from './board.ts'
import { MAX_MOVES, MAX_PLY, MOVE_CAPTURED, MOVE_SQUARES, applyMove, generate } from './movegen.ts'

// Quem fica sem jogada no lance de número n da busca perde por WIN - n: vencer mais cedo
// vale mais. Qualquer pontuação com módulo >= WIN_MIN é uma vitória (ou derrota) provada;
// abaixo disso é a função de avaliação falando, em centésimos de pedra.
export const WIN = 30000
export const WIN_MIN = 29000
const INF = 32000

/** Meios-lances seguidos só de damas, sem captura, que empatam a partida: 20 de cada lado. */
export const DRAW_PLIES = 40

export interface SearchOptions {
  /** Até quantos lances à frente a busca vai. */
  maxDepth: number
  timeMs: number
  /** Sorteia até este tanto de pontos a mais para cada jogada da raiz, para variar as partidas. */
  noise?: number
  /** Chance de jogar de propósito uma jogada que não é a melhor. */
  blunder?: number
  /** As três técnicas abaixo vêm ligadas; a página "Como funciona" desliga para comparar. */
  alphaBeta?: boolean
  ordering?: boolean
  table?: boolean
}

/** A jogada como a busca enxerga: sem o caminho casa a casa. */
export interface EngineMove {
  from: number
  to: number
  captured: number
}

/** Os contadores da busca: o que ela fez por dentro para chegar à resposta. */
export interface SearchStats {
  /** Posições visitadas. */
  nodes: number
  ms: number
  /** O lance mais distante que a busca alcançou, contando as capturas além da profundidade pedida. */
  reach: number
  /** Posições visitadas além da profundidade pedida, seguindo capturas (quiescência). */
  extensions: number
  /** Posições que receberam nota da função de avaliação. */
  evaluations: number
  /** Consultas à tabela de transposição, quantas encontraram a posição e quantas dispensaram a busca. */
  tableProbes: number
  tableHits: number
  tableCuts: number
  /** Fração da tabela ocupada, de 0 a 1. */
  tableFill: number
  /** Cortes da poda alfa-beta, e quantos deles aconteceram logo na primeira jogada testada. */
  cutoffs: number
  firstCutoffs: number
}

export interface SearchInfo extends SearchStats {
  /** Última profundidade concluída. */
  depth: number
  /** Pontuação de `best`, do ponto de vista de quem joga. */
  score: number
  best: EngineMove | null
  /** Linha principal: `best` e, em seguida, as respostas que a busca espera dos dois lados. */
  line: EngineMove[]
}

export interface SearchResult extends SearchInfo {
  /** A jogada escolhida. Só é diferente de `best` quando o nível erra de propósito. */
  played: EngineMove | null
}

// ---------- Avaliação ----------

const MAN = 100
const KING = 300
const ADVANCE = 3
const CENTER = 4
const BACK_ROW = 6
const MOBILITY = 2

// c3, e3, d4, f4, c5, e5, d6, f6
const CENTER_SQUARES = 0x00666600
const ROWS_4_TO_7 = 0xffff0000 | 0
const ROWS_2_3_6_7 = 0xff00ff00 | 0

export interface Evaluation {
  material: number
  advance: number
  center: number
  backRow: number
  mobility: number
  total: number
}

let material = 0
let advance = 0
let center = 0
let backRow = 0
let mobility = 0

/** Soma dos números das linhas das pedras: os três bits do número da linha, um popcount cada. */
function rowSum(men: number): number {
  return 4 * popcount(men & ROWS_4_TO_7) + 2 * popcount(men & ROWS_2_3_6_7) + popcount(men & ODD_ROWS)
}

function kingSteps(pieces: number, empty: number): number {
  if (pieces === 0) return 0
  return (
    popcount(northEast(pieces) & empty) +
    popcount(northWest(pieces) & empty) +
    popcount(southEast(pieces) & empty) +
    popcount(southWest(pieces) & empty)
  )
}

/** Calcula os cinco termos, sempre do ponto de vista das brancas. */
function measure(white: number, black: number, kings: number): void {
  const whiteMen = white & ~kings
  const blackMen = black & ~kings
  const whiteKings = white & kings
  const blackKings = black & kings
  const whiteMenCount = popcount(whiteMen)
  const blackMenCount = popcount(blackMen)
  const whiteKingCount = popcount(whiteKings)
  const blackKingCount = popcount(blackKings)
  const empty = ~(white | black)

  // Quem está na frente quer trocar peças: a mesma vantagem pesa mais com o tabuleiro vazio.
  const balance = MAN * (whiteMenCount - blackMenCount) + KING * (whiteKingCount - blackKingCount)
  const pieces = whiteMenCount + blackMenCount + whiteKingCount + blackKingCount
  material = balance + (((balance * (24 - pieces)) / 64) | 0)

  advance = ADVANCE * (rowSum(whiteMen) - (7 * blackMenCount - rowSum(blackMen)))
  center = CENTER * (popcount(white & CENTER_SQUARES) - popcount(black & CENTER_SQUARES))
  // Pedras na primeira linha impedem o adversário de fazer dama, enquanto ele tiver pedras.
  backRow =
    BACK_ROW *
    ((blackMen !== 0 ? popcount(whiteMen & PROMOTION[1]) : 0) - (whiteMen !== 0 ? popcount(blackMen & PROMOTION[0]) : 0))
  mobility =
    MOBILITY *
    (popcount(northEast(whiteMen) & empty) +
      popcount(northWest(whiteMen) & empty) +
      kingSteps(whiteKings, empty) -
      popcount(southEast(blackMen) & empty) -
      popcount(southWest(blackMen) & empty) -
      kingSteps(blackKings, empty))
}

function evaluate(white: number, black: number, kings: number, side: Side): number {
  evaluations++
  measure(white, black, kings)
  const total = material + advance + center + backRow + mobility
  return side === WHITE ? total : -total
}

/** A avaliação de uma posição, termo a termo, do ponto de vista das brancas. */
export function evaluation(position: Position): Evaluation {
  measure(position.white, position.black, position.kings)
  return { material, advance, center, backRow, mobility, total: material + advance + center + backRow + mobility }
}

// ---------- Tabela de transposição ----------
//
// Endereçamento direto, sempre substitui. Cada entrada guarda os três bitboards da posição,
// então duas posições diferentes nunca são confundidas.

const TABLE_BITS = 20
const TABLE_SHIFT = 32 - TABLE_BITS
const EXACT = 1
const LOWER = 2
const UPPER = 3

let tableWhite: Int32Array | undefined
let tableBlack: Int32Array | undefined
let tableKings: Int32Array | undefined
// (pontuação + 32768) << 16 | profundidade << 8 | tipo << 1 | quem joga. Zero = vazio.
let tableData: Int32Array | undefined
/** A melhor jogada encontrada na posição (origem | destino << 5), para testar primeiro. */
let tableMove: Int16Array | undefined

function tableSlot(white: number, black: number, kings: number, side: Side): number {
  let hash = (Math.imul(white, 0x9e3779b1) + Math.imul(black, 0x85ebca6b) + Math.imul(kings ^ -side, 0xc2b2ae35)) | 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
  return (hash ^ (hash >>> 15)) >>> TABLE_SHIFT
}

// ---------- Ordenação ----------

const ORDER = new Int32Array(MAX_PLY * MAX_MOVES)
/** Duas jogadas simples por nível que já causaram um corte ali. */
const KILLERS = new Int16Array(MAX_PLY * 2)
/** Quanto cada jogada simples (por cor, origem e destino) já causou cortes nesta busca. */
const HISTORY = new Int32Array(2 * 1024)

const FIRST = 1 << 30
const KILLER = 1 << 29
const PROMOTES = 1 << 28
const HISTORY_MAX = 1 << 27

// ---------- Linha principal ----------
//
// A melhor sequência encontrada a partir de cada nível da busca: a jogada que melhorou o
// resultado ali, seguida da linha do nível seguinte. A do nível 1 é a resposta esperada.

const LINE_SQUARES = new Int16Array(MAX_PLY * MAX_PLY)
const LINE_CAPTURED = new Int32Array(MAX_PLY * MAX_PLY)
const LINE_SIZE = new Uint8Array(MAX_PLY)
/** Quantas jogadas da linha principal a busca informa. */
const LINE_SHOWN = 12

// ---------- Busca ----------

// Posições desde a última jogada irreversível (captura ou jogada de pedra): as da partida e,
// em seguida, as do caminho que a busca está percorrendo. Servem para achar repetições.
const MAX_HISTORY = DRAW_PLIES + 8
const PATH_WHITE = new Int32Array(MAX_HISTORY + MAX_PLY)
const PATH_BLACK = new Int32Array(MAX_HISTORY + MAX_PLY)
const PATH_KINGS = new Int32Array(MAX_HISTORY + MAX_PLY)
let pathRoot = 0

let nodes = 0
let reach = 0
let extensions = 0
let evaluations = 0
let tableProbes = 0
let tableHits = 0
let tableCuts = 0
let tableUsed = 0
let cutoffs = 0
let firstCutoffs = 0
let deadline = 0
let aborted = false
let useAlphaBeta = true
let useOrdering = true
let useTable = true

function negamax(
  white: number,
  black: number,
  kings: number,
  side: Side,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  /** Meios-lances seguidos só de damas, sem captura, até chegar aqui. */
  reversible: number,
): number {
  if ((++nodes & 2047) === 0 && performance.now() > deadline) aborted = true
  if (aborted) return 0
  LINE_SIZE[ply] = 0
  if (ply > reach) reach = ply
  if (depth < 0) extensions++

  // Posição repetida no caminho conta como empate: quem repetiu uma vez pode repetir de novo.
  const index = pathRoot + ply
  PATH_WHITE[index] = white
  PATH_BLACK[index] = black
  PATH_KINGS[index] = kings
  for (let back = 4; back <= reversible; back += 2) {
    const i = index - back
    if (PATH_WHITE[i] === white && PATH_BLACK[i] === black && PATH_KINGS[i] === kings) return 0
  }

  if (ply >= MAX_PLY - 1) return evaluate(white, black, kings, side)
  if (!useAlphaBeta) {
    alpha = -INF
    beta = INF
  }

  let slot = 0
  let first = -1
  if (useTable && depth > 0) {
    tableProbes++
    slot = tableSlot(white, black, kings, side)
    const data = tableData![slot]
    if (
      data !== 0 &&
      (data & 1) === side &&
      tableWhite![slot] === white &&
      tableBlack![slot] === black &&
      tableKings![slot] === kings
    ) {
      tableHits++
      first = tableMove![slot]
      if (((data >>> 8) & 255) >= depth) {
        let value = (data >>> 16) - 32768
        // Vitórias são guardadas contando os lances a partir da posição, não da raiz.
        if (value >= WIN_MIN) value -= ply
        else if (value <= -WIN_MIN) value += ply
        const type = (data >>> 1) & 3
        if (type === EXACT || (type === LOWER ? value >= beta : value <= alpha)) {
          tableCuts++
          return value
        }
      }
    }
  }

  const base = ply * MAX_MOVES
  const count = generate(white, black, kings, side, base)
  if (count === 0) return ply - WIN
  if (reversible >= DRAW_PLIES) return 0
  const capture = MOVE_CAPTURED[base] !== 0
  // Quiescência: no limite da busca, só avalia quando não há captura pendente.
  if (depth <= 0 && !capture) return evaluate(white, black, kings, side)

  const end = base + count
  const ordered = useOrdering && count > 1
  if (ordered) {
    for (let i = base; i < end; i++) {
      const squares = MOVE_SQUARES[i]
      let order: number
      if (squares === first) order = FIRST
      else if (capture) order = popcount(MOVE_CAPTURED[i] & kings)
      else if (squares === KILLERS[ply * 2]) order = KILLER
      else if (squares === KILLERS[ply * 2 + 1]) order = KILLER - 1
      else order = HISTORY[(side << 10) | squares]
      if ((kings & (1 << (squares & 31))) === 0 && (PROMOTION[side] & (1 << (squares >> 5))) !== 0) order += PROMOTES
      ORDER[i] = order
    }
  }

  const alpha0 = alpha
  let best = -INF
  let bestSquares = -1
  for (let i = base; i < end; i++) {
    if (ordered) {
      // Traz para a vez a jogada mais promissora das que faltam.
      let top = i
      for (let j = i + 1; j < end; j++) if (ORDER[j] > ORDER[top]) top = j
      if (top !== i) {
        const squares = MOVE_SQUARES[top]
        const captured = MOVE_CAPTURED[top]
        MOVE_SQUARES[top] = MOVE_SQUARES[i]
        MOVE_CAPTURED[top] = MOVE_CAPTURED[i]
        ORDER[top] = ORDER[i]
        MOVE_SQUARES[i] = squares
        MOVE_CAPTURED[i] = captured
      }
    }
    const squares = MOVE_SQUARES[i]
    const captured = MOVE_CAPTURED[i]
    const fromBit = 1 << (squares & 31)
    const toBit = 1 << (squares >> 5)
    const king = (kings & fromBit) !== 0

    let nextWhite: number
    let nextBlack: number
    if (side === WHITE) {
      nextWhite = (white ^ fromBit) | toBit
      nextBlack = black & ~captured
    } else {
      nextBlack = (black ^ fromBit) | toBit
      nextWhite = white & ~captured
    }
    let nextKings = kings & ~captured
    if (king) nextKings = (nextKings ^ fromBit) | toBit
    else if ((toBit & PROMOTION[side]) !== 0) nextKings |= toBit

    const value = -negamax(
      nextWhite,
      nextBlack,
      nextKings,
      (side ^ 1) as Side,
      depth - 1,
      ply + 1,
      -beta,
      -alpha,
      king && captured === 0 ? reversible + 1 : 0,
    )
    if (aborted) return 0

    if (value > best) {
      best = value
      bestSquares = squares
      if (value > alpha) {
        alpha = value
        if (alpha >= beta) {
          cutoffs++
          if (i === base) firstCutoffs++
          if (!capture) {
            if (KILLERS[ply * 2] !== squares) {
              KILLERS[ply * 2 + 1] = KILLERS[ply * 2]
              KILLERS[ply * 2] = squares
            }
            const key = (side << 10) | squares
            HISTORY[key] += depth > 0 ? depth * depth : 1
            if (HISTORY[key] > HISTORY_MAX) for (let k = 0; k < HISTORY.length; k++) HISTORY[k] >>= 1
          }
          break
        }
        // Nova melhor linha deste nível: esta jogada e a continuação que veio do nível seguinte.
        const line = ply * MAX_PLY
        const size = LINE_SIZE[ply + 1]
        LINE_SQUARES[line] = squares
        LINE_CAPTURED[line] = captured
        for (let k = 0; k < size; k++) {
          LINE_SQUARES[line + 1 + k] = LINE_SQUARES[line + MAX_PLY + k]
          LINE_CAPTURED[line + 1 + k] = LINE_CAPTURED[line + MAX_PLY + k]
        }
        LINE_SIZE[ply] = size + 1
      }
    }
  }

  if (useTable && depth > 0) {
    let value = best
    if (value >= WIN_MIN) value += ply
    else if (value <= -WIN_MIN) value -= ply
    const type = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT
    if (tableData![slot] === 0) tableUsed++
    tableWhite![slot] = white
    tableBlack![slot] = black
    tableKings![slot] = kings
    tableData![slot] = ((value + 32768) << 16) | ((depth > 255 ? 255 : depth) << 8) | (type << 1) | side
    tableMove![slot] = bestSquares
  }
  return best
}

/**
 * Completa a linha principal: onde a busca parou de anotar (em geral porque a tabela de
 * transposição já tinha a resposta), segue pela melhor jogada guardada em cada posição.
 */
function completeLine(position: Position, line: EngineMove[]): EngineMove[] {
  let current = position
  for (const move of line) current = applyMove(current, move)
  while (useTable && line.length < LINE_SHOWN) {
    const { white, black, kings, side } = current
    const slot = tableSlot(white, black, kings, side)
    const data = tableData![slot]
    if (data === 0 || (data & 1) !== side || tableWhite![slot] !== white || tableBlack![slot] !== black || tableKings![slot] !== kings) break
    // Em uma entrada "no máximo isso" nenhuma jogada chegou a ser boa: não há o que mostrar.
    if (((data >>> 1) & 3) === UPPER) break
    const squares = tableMove![slot]
    const count = generate(white, black, kings, side, 0)
    let index = 0
    while (index < count && MOVE_SQUARES[index] !== squares) index++
    if (index === count) break
    const move = { from: squares & 31, to: squares >> 5, captured: MOVE_CAPTURED[index] }
    line.push(move)
    current = applyMove(current, move)
  }
  return line.slice(0, LINE_SHOWN)
}

function stats(start: number): SearchStats {
  return {
    nodes,
    ms: performance.now() - start,
    reach,
    extensions,
    evaluations,
    tableProbes,
    tableHits,
    tableCuts,
    tableFill: tableUsed / (1 << TABLE_BITS),
    cutoffs,
    firstCutoffs,
  }
}

/**
 * Busca a melhor jogada para `position`. `history` são as posições anteriores da partida
 * desde a última captura ou jogada de pedra, da mais antiga para a mais nova: é por elas que
 * a busca enxerga os empates por repetição e por 20 lances só de damas.
 *
 * Aprofunda um lance por vez até acabar o tempo, bater `maxDepth` ou provar o resultado, e
 * avisa `onInfo` a cada profundidade concluída.
 */
export function search(
  position: Position,
  history: readonly Position[],
  options: SearchOptions,
  onInfo?: (info: SearchInfo) => void,
): SearchResult {
  if (!tableData) {
    tableWhite = new Int32Array(1 << TABLE_BITS)
    tableBlack = new Int32Array(1 << TABLE_BITS)
    tableKings = new Int32Array(1 << TABLE_BITS)
    tableData = new Int32Array(1 << TABLE_BITS)
    tableMove = new Int16Array(1 << TABLE_BITS)
  }
  // Cada busca começa do zero: o nível de dificuldade não herda o que outra busca já viu.
  tableData.fill(0)
  KILLERS.fill(-1)
  HISTORY.fill(0)
  useAlphaBeta = options.alphaBeta ?? true
  useOrdering = options.ordering ?? true
  useTable = options.table ?? true

  const tail = history.slice(-MAX_HISTORY)
  tail.forEach((past, i) => {
    PATH_WHITE[i] = past.white
    PATH_BLACK[i] = past.black
    PATH_KINGS[i] = past.kings
  })
  pathRoot = tail.length
  PATH_WHITE[pathRoot] = position.white
  PATH_BLACK[pathRoot] = position.black
  PATH_KINGS[pathRoot] = position.kings

  const start = performance.now()
  deadline = start + options.timeMs
  aborted = false
  nodes = reach = extensions = evaluations = 0
  tableProbes = tableHits = tableCuts = tableUsed = 0
  cutoffs = firstCutoffs = 0

  const { white, black, kings, side } = position
  const count = generate(white, black, kings, side, 0)
  const moves: EngineMove[] = []
  for (let i = 0; i < count; i++) {
    moves.push({ from: MOVE_SQUARES[i] & 31, to: MOVE_SQUARES[i] >> 5, captured: MOVE_CAPTURED[i] })
  }
  let info: SearchInfo = { depth: 0, score: count === 0 ? -WIN : 0, best: moves[0] ?? null, line: moves.slice(0, 1), ...stats(start) }
  if (count === 0) return { ...info, played: null }

  const noise = moves.map(() => (options.noise ? Math.floor(Math.random() * (options.noise + 1)) : 0))
  const order = moves.map((_, i) => i)
  const maxDepth = Math.min(options.maxDepth, MAX_PLY - 2)

  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -INF
    let best = -1
    let bestScore = -INF
    let line: EngineMove[] = []
    for (const i of order) {
      const move = moves[i]
      const next = applyMove(position, move)
      const reversible = move.captured === 0 && (kings & (1 << move.from)) !== 0
      // Com ruído, a jogada i só precisa ser melhor que (alpha - ruído) para virar a escolhida.
      // "0 -" em vez de "-" para um empate sair como 0, não como -0.
      const value = 0 - negamax(next.white, next.black, next.kings, next.side, depth - 1, 1, -INF, noise[i] - alpha, reversible ? pathRoot + 1 : 0)
      if (aborted) break
      if (value + noise[i] > alpha) {
        alpha = value + noise[i]
        best = i
        bestScore = value
        // A linha do nível 1 será sobrescrita pela próxima jogada da raiz: copia agora.
        line = [move]
        for (let k = 0; k < LINE_SIZE[1]; k++) {
          const squares = LINE_SQUARES[MAX_PLY + k]
          line.push({ from: squares & 31, to: squares >> 5, captured: LINE_CAPTURED[MAX_PLY + k] })
        }
      }
    }
    // Iteração interrompida: só aproveita se achou uma jogada melhor que a da iteração
    // anterior, que é sempre a primeira a ser testada.
    if (best < 0) break
    order.splice(order.indexOf(best), 1)
    order.unshift(best)
    info = { ...info, score: bestScore, best: moves[best], line: completeLine(position, line) }
    if (aborted) break

    info = { ...info, depth, ...stats(start) }
    onInfo?.(info)
    // Vitória ou derrota provada: buscar mais fundo não muda nada.
    if (bestScore >= WIN_MIN || bestScore <= -WIN_MIN) break
  }

  const result: SearchResult = { ...info, ...stats(start), played: info.best }
  if (options.blunder && moves.length > 1 && Math.random() < options.blunder) {
    const others = moves.filter((move) => move !== result.best)
    result.played = others[Math.floor(Math.random() * others.length)]
  }
  return result
}
