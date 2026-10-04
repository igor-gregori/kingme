import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BLACK, INITIAL, WHITE, squareName, type Position, type Side } from '../src/engine/board.ts'
import { MAX_MOVES, MOVE_CAPTURED, MOVE_SQUARES, applyMove, generate, legalMoves } from '../src/engine/movegen.ts'
import { bitboardKey, distinctOutcomes, outcomeKey, referenceMoves, referencePerft, toGrid } from './reference.ts'

// Gerador determinístico, para os testes sempre sortearem as mesmas posições.
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 2 ** 32
  }
}

/** Conta as posições alcançáveis em `depth` lances com o gerador de bitboards. */
function perft(position: Position, depth: number, ply = 0): number {
  const base = ply * MAX_MOVES
  const count = generate(position.white, position.black, position.kings, position.side, base)
  if (depth === 1) return count
  let total = 0
  for (let i = base; i < base + count; i++) {
    const move = { from: MOVE_SQUARES[i] & 31, to: MOVE_SQUARES[i] >> 5, captured: MOVE_CAPTURED[i] }
    total += perft(applyMove(position, move), depth - 1, ply + 1)
  }
  return total
}

/** Confere as jogadas de uma posição contra o gerador de referência, caminho a caminho. */
function assertSameMoves(position: Position): number {
  const expected = referenceMoves(toGrid(position), position.side)

  const paths = legalMoves(position).map(
    (move) => `${[move.from, ...move.path].map(squareName).join('-')}:${move.taken.map(squareName).join(',')}`,
  )
  const expectedPaths = expected.map((move) => `${move.squares.join('-')}:${move.taken.join(',')}`)
  assert.deepEqual(paths.sort(), expectedPaths.sort())

  // A versão sem caminho, usada na busca, junta as jogadas que dão no mesmo resultado.
  const count = generate(position.white, position.black, position.kings, position.side, 0)
  const outcomes: string[] = []
  for (let i = 0; i < count; i++) {
    outcomes.push(bitboardKey(MOVE_SQUARES[i] & 31, MOVE_SQUARES[i] >> 5, MOVE_CAPTURED[i]))
  }
  assert.equal(new Set(outcomes).size, outcomes.length)
  assert.deepEqual(outcomes.sort(), distinctOutcomes(expected).map(outcomeKey).sort())
  return expected.length
}

// Valores do gerador de bitboards. Até a profundidade 8 o teste abaixo confere cada um
// deles com o gerador de referência; daí em diante são só um alarme contra regressões.
const PERFT = [7, 49, 302, 1469, 7473, 37628, 187302, 907830, 4431766, 21560022]

test('perft: os dois geradores contam as mesmas posições a partir da posição inicial', () => {
  for (let depth = 1; depth <= 8; depth++) {
    const expected = referencePerft(toGrid(INITIAL), WHITE, depth)
    assert.equal(perft(INITIAL, depth), expected, `profundidade ${depth}`)
    assert.equal(expected, PERFT[depth - 1], `profundidade ${depth}`)
  }
})

test('perft: profundidades maiores continuam dando o mesmo número', () => {
  assert.equal(perft(INITIAL, 9), PERFT[8])
  assert.equal(perft(INITIAL, 10), PERFT[9])
})

// Números publicados no World Draughts Forum para damas brasileiras ("Perft for all
// recognized draughts variants", damforum.nl/viewtopic.php?t=2822). Lá, duas capturas das
// mesmas peças em ordem diferente contam como duas jogadas, então a partir da profundidade 8
// os valores passam os de PERFT: é quando aparece a pedra que captura quatro peças em
// círculo e volta para a casa de origem, no sentido horário ou no anti-horário.
const PUBLISHED = [7, 49, 302, 1469, 7473, 37628, 187302, 907836, 4431847, 21566606]

function publishedPerft(position: Position, depth: number): number {
  const seen = new Set<string>()
  const moves = legalMoves(position).filter((move) => {
    const key = `${move.from}>${move.to}:${move.taken.join(',')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (depth === 1) return moves.length
  let total = 0
  for (const move of moves) total += publishedPerft(applyMove(position, move), depth - 1)
  return total
}

test('perft: bate com os números publicados para damas brasileiras', () => {
  for (let depth = 1; depth <= PUBLISHED.length; depth++) {
    assert.equal(publishedPerft(INITIAL, depth), PUBLISHED[depth - 1], `profundidade ${depth}`)
  }
})

test('partidas aleatórias: mesmas jogadas nos dois geradores em todas as posições', () => {
  const random = rng(1)
  let positions = 0
  let withKings = 0
  let withCaptures = 0
  for (let game = 0; game < 300; game++) {
    let position = INITIAL
    for (let ply = 0; ply < 200; ply++) {
      if (assertSameMoves(position) === 0) break
      const moves = legalMoves(position)
      positions++
      if (position.kings !== 0) withKings++
      if (moves[0].captured !== 0) withCaptures++
      position = applyMove(position, moves[Math.floor(random() * moves.length)])
    }
  }
  assert.ok(positions > 10_000)
  assert.ok(withKings > 2_000)
  assert.ok(withCaptures > 1_000)
})

test('posições sorteadas, cheias de damas: mesmas jogadas nos dois geradores', () => {
  const random = rng(2)
  let multiple = 0
  for (let n = 0; n < 20_000; n++) {
    const density = 0.1 + random() * 0.5
    const kingRate = random()
    const position: Position = { white: 0, black: 0, kings: 0, side: random() < 0.5 ? WHITE : BLACK }
    for (let square = 0; square < 32; square++) {
      if (random() > density) continue
      const side: Side = random() < 0.5 ? WHITE : BLACK
      const bit = 1 << square
      // Uma pedra nunca está parada na linha em que viraria dama.
      const lastRow = side === WHITE ? square >= 28 : square <= 3
      if (side === WHITE) position.white |= bit
      else position.black |= bit
      if (lastRow || random() < kingRate) position.kings |= bit
    }
    assertSameMoves(position)
    const moves = legalMoves(position)
    if (moves.length > 0 && moves[0].taken.length >= 3) multiple++
  }
  // O sorteio precisa ter produzido bastante captura em série, que é a parte difícil.
  assert.ok(multiple > 1_000)
})
