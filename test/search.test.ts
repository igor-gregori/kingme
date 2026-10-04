import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BLACK, INITIAL, WHITE, parseDiagram, type Position, type Side } from '../src/engine/board.ts'
import { applyMove, legalMoves, moveName, type Move } from '../src/engine/movegen.ts'
import { DRAW_PLIES, WIN, WIN_MIN, evaluation, search, type SearchOptions } from '../src/engine/search.ts'

// Gerador determinístico, para os testes sempre sortearem as mesmas posições.
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 2 ** 32
  }
}

/** Posição depois de `plies` jogadas sorteadas a partir da posição inicial. */
function randomPosition(random: () => number, plies: number): Position {
  let position = INITIAL
  for (let ply = 0; ply < plies; ply++) {
    const moves = legalMoves(position)
    if (moves.length === 0) break
    position = applyMove(position, moves[Math.floor(random() * moves.length)])
  }
  return position
}

const same = (a: Position, b: Position) => a.white === b.white && a.black === b.black && a.kings === b.kings

const isReversible = (position: Position, move: Move) => move.captured === 0 && (position.kings & (1 << move.from)) !== 0

/** Tira as jogadas que só diferem no caminho. */
function outcomes(position: Position): Move[] {
  const seen = new Set<string>()
  return legalMoves(position).filter((move) => {
    const key = `${move.from}>${move.to}:${move.captured}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Implementação de referência: minimax sem poda nenhuma, com as mesmas regras de parada da
// busca, escrito direto sobre `legalMoves` e `applyMove`. `path` são as posições desde a
// última jogada irreversível.
function reference(position: Position, depth: number, ply: number, path: Position[]): number {
  for (let back = 4; back <= path.length; back += 2) {
    if (same(path[path.length - back], position)) return 0
  }
  const moves = outcomes(position)
  if (moves.length === 0) return ply - WIN
  if (path.length >= DRAW_PLIES) return 0
  if (depth <= 0 && moves[0].captured === 0) {
    const { total } = evaluation(position)
    return position.side === WHITE ? total : -total
  }
  let best = -Infinity
  for (const move of moves) {
    const next = isReversible(position, move) ? [...path, position] : []
    best = Math.max(best, -reference(applyMove(position, move), depth - 1, ply + 1, next))
  }
  return best
}

const fixed = (maxDepth: number, extra: Partial<SearchOptions> = {}): SearchOptions => ({ maxDepth, timeMs: 60_000, ...extra })

test('poda alfa-beta e ordenação não mudam o resultado: mesma pontuação do minimax de referência', () => {
  const random = rng(11)
  let withKings = 0
  for (let n = 0; n < 80; n++) {
    const position = randomPosition(random, 4 + Math.floor(random() * 110))
    const moves = outcomes(position)
    if (moves.length === 0) continue
    if (position.kings !== 0) withKings++
    for (const depth of [1, 2, 4]) {
      const expected = Math.max(
        ...moves.map((move) => -reference(applyMove(position, move), depth - 1, 1, isReversible(position, move) ? [position] : [])),
      )
      const result = search(position, [], fixed(depth, { table: false }))
      assert.equal(result.score, expected, `posição ${n}, profundidade ${depth}`)
      assert.equal(result.depth, expected >= WIN_MIN || expected <= -WIN_MIN ? result.depth : depth)
      // A jogada escolhida precisa valer o que a busca diz que ela vale.
      const best = moves.find((move) => move.from === result.best!.from && move.to === result.best!.to && move.captured === result.best!.captured)!
      const value = -reference(applyMove(position, best), result.depth - 1, 1, isReversible(position, best) ? [position] : [])
      assert.equal(value, result.score, `posição ${n}, profundidade ${depth}`)
    }
  }
  assert.ok(withKings > 10)
})

test('tabela de transposição não muda o resultado', () => {
  const random = rng(12)
  let plainNodes = 0
  let fullNodes = 0
  for (let n = 0; n < 40; n++) {
    // Começo de partida: sem damas não há repetição, e o resultado não depende do caminho.
    const position = randomPosition(random, 2 + Math.floor(random() * 10))
    for (const depth of [5, 7]) {
      const plain = search(position, [], fixed(depth, { table: false }))
      const full = search(position, [], fixed(depth))
      assert.equal(full.score, plain.score, `posição ${n}, profundidade ${depth}`)
      plainNodes += plain.nodes
      fullNodes += full.nodes
    }
  }
  assert.ok(fullNodes < plainNodes)
})

test('desligar a poda não muda o resultado, só o trabalho', () => {
  const random = rng(13)
  for (let n = 0; n < 15; n++) {
    const position = randomPosition(random, 2 + Math.floor(random() * 10))
    const minimax = search(position, [], fixed(5, { alphaBeta: false, ordering: false, table: false }))
    const pruned = search(position, [], fixed(5, { ordering: false, table: false }))
    const ordered = search(position, [], fixed(5, { table: false }))
    assert.equal(pruned.score, minimax.score)
    assert.equal(ordered.score, minimax.score)
    assert.ok(pruned.nodes < minimax.nodes)
  }
})

/** A mesma posição vista do outro lado: tabuleiro girado e cores trocadas. */
function mirror(position: Position): Position {
  const flip = (board: number) => {
    let flipped = 0
    for (let square = 0; square < 32; square++) if ((board & (1 << square)) !== 0) flipped |= 1 << (31 - square)
    return flipped
  }
  return { white: flip(position.black), black: flip(position.white), kings: flip(position.kings), side: (position.side ^ 1) as Side }
}

test('a avaliação e a busca são simétricas: trocar as cores não muda a pontuação', () => {
  const random = rng(14)
  for (let n = 0; n < 60; n++) {
    const position = randomPosition(random, Math.floor(random() * 80))
    const mirrored = mirror(position)
    assert.equal(evaluation(mirrored).total + evaluation(position).total, 0)
    if (legalMoves(position).length === 0) continue
    assert.equal(search(mirrored, [], fixed(5)).score, search(position, [], fixed(5)).score, `posição ${n}`)
  }
})

test('acha a vitória forçada e conta em quantos lances', () => {
  const capture = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . b . . .
    . . . w . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  // Captura a última peça: o adversário fica sem jogada no lance 1.
  const result = search(capture, [], fixed(8))
  assert.equal(result.score, WIN - 1)
  assert.equal(result.depth, 1)

  const trap = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    b . . . . . . .
    . . . . . . . .
    . . w . w . . .
    `,
    WHITE,
  )
  // A pedra preta só tem a casa b2 para andar, e as brancas conseguem capturá-la ali.
  const won = search(trap, [], fixed(12))
  assert.ok(won.score >= WIN_MIN, `pontuação ${won.score}`)
  // E do outro lado a mesma posição é uma derrota provada.
  const played = legalMoves(trap).find((move) => move.from === won.best!.from && move.to === won.best!.to)!
  const lost = search(applyMove(trap, played), [], fixed(12))
  assert.equal(lost.score, -(won.score + 1))
})

test('sem jogada possível: derrota imediata', () => {
  const result = search({ white: 0, black: 1 << 20, kings: 0, side: WHITE }, [], fixed(4))
  assert.equal(result.best, null)
  assert.equal(result.score, -WIN)
})

test('enxerga o empate por 20 lances só de damas', () => {
  const position = parseDiagram(
    `
    . . . . . . . B
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    W . W . . . . .
    `,
    WHITE,
  )
  assert.ok(search(position, [], fixed(4)).score > 100)
  // Com 39 meios-lances só de damas já jogados, qualquer jogada de dama empata a partida.
  const history: Position[] = []
  for (let i = 0; i < DRAW_PLIES - 1; i++) history.push({ ...position, white: (1 << 7) | (1 << (8 + (i % 16))), side: (i & 1) as Side })
  assert.equal(search(position, history, fixed(4)).score, 0)
})

test('enxerga o empate por repetição', () => {
  // Uma dama contra duas, sem captura à vista: as pretas estão em desvantagem.
  const position = parseDiagram(
    `
    . . . . . . . .
    B . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . W
    . . . . . . . .
    . . . . . . . .
    . . W . . . . .
    `,
    BLACK,
  )
  // Vai e volta dos dois lados: depois de quatro meios-lances a posição se repete.
  const history: Position[] = []
  let current = position
  for (const name of ['a7-b8', 'c1-b2', 'b8-a7', 'b2-c1']) {
    history.push(current)
    current = applyMove(current, legalMoves(current).find((move) => moveName(move) === name)!)
  }
  assert.ok(same(current, position))
  assert.ok(search(current, [], fixed(1)).score < -100)
  // Com o histórico, as pretas podem repetir a7-b8, que vale 0, em vez de aceitar a desvantagem.
  const result = search(current, history, fixed(1))
  assert.equal(result.score, 0)
  assert.deepEqual([result.best!.from, result.best!.to], [history[0], history[1]].map((p) => 31 - Math.clz32(p.black)))
})

test('respeita o limite de tempo e ainda devolve uma jogada válida', () => {
  const result = search(INITIAL, [], { maxDepth: 99, timeMs: 200 })
  assert.ok(result.ms < 400, `${result.ms} ms`)
  assert.ok(result.depth >= 8, `profundidade ${result.depth}`)
  assert.ok(legalMoves(INITIAL).some((move) => move.from === result.best!.from && move.to === result.best!.to))
})

test('avisa cada profundidade concluída, em ordem', () => {
  const depths: number[] = []
  const result = search(INITIAL, [], fixed(6), (info) => depths.push(info.depth))
  assert.deepEqual(depths, [1, 2, 3, 4, 5, 6])
  assert.equal(result.depth, 6)
  assert.deepEqual(result.played, result.best)
})

test('o erro de propósito troca a jogada, mas não a avaliação', () => {
  for (let n = 0; n < 20; n++) {
    const result = search(INITIAL, [], fixed(2, { blunder: 1 }))
    assert.notDeepEqual(result.played, result.best)
    assert.ok(legalMoves(INITIAL).some((move) => move.from === result.played!.from && move.to === result.played!.to))
  }
})

test('o ruído varia a jogada sem escolher nada muito pior', () => {
  const exact = search(INITIAL, [], fixed(6))
  const seen = new Set<string>()
  for (let n = 0; n < 30; n++) {
    const result = search(INITIAL, [], fixed(6, { noise: 8 }))
    seen.add(`${result.best!.from}-${result.best!.to}`)
    assert.ok(result.score >= exact.score - 8)
  }
  assert.ok(seen.size > 1)
})

test('linha principal: começa pelo melhor lance e é uma sequência de jogadas legais', () => {
  const random = rng(15)
  for (let n = 0; n < 30; n++) {
    const position = randomPosition(random, Math.floor(random() * 60))
    if (legalMoves(position).length === 0) continue
    const result = search(position, [], fixed(6))
    assert.deepEqual(result.line[0], result.best)
    let current = position
    for (const step of result.line) {
      const move = legalMoves(current).find((legal) => legal.from === step.from && legal.to === step.to && legal.captured === step.captured)
      assert.ok(move, `posição ${n}: a linha tem uma jogada ilegal`)
      current = applyMove(current, move)
    }
  }
  // Na posição inicial, a 8 lances de profundidade, a linha tem pelo menos os 8 lances.
  assert.ok(search(INITIAL, [], fixed(8)).line.length >= 8)
  // Sem a tabela a linha vem só do que a busca anotou, e continua legal.
  assert.ok(search(INITIAL, [], fixed(6, { table: false })).line.length >= 6)
})

test('linha principal: jogá-la até o fim leva à pontuação que a busca informou', () => {
  const random = rng(16)
  for (let n = 0; n < 30; n++) {
    // Começo de partida, sem tabela: a linha é exatamente o caminho que deu a pontuação.
    const position = randomPosition(random, 2 + Math.floor(random() * 10))
    const result = search(position, [], fixed(5, { table: false }))
    let current = position
    for (const step of result.line) current = applyMove(current, step)
    const quiet = legalMoves(current).every((move) => move.captured === 0)
    assert.ok(quiet, `posição ${n}: a linha parou no meio de uma troca`)
    const { total } = evaluation(current)
    assert.equal(position.side === WHITE ? total : -total, result.score, `posição ${n}`)
  }
})

test('contadores da busca fazem sentido entre si', () => {
  const messages: number[] = []
  const result = search(INITIAL, [], fixed(10), (info) => messages.push(info.nodes))
  assert.ok(result.reach >= result.depth)
  assert.ok(result.extensions > 0 && result.extensions < result.nodes)
  assert.ok(result.evaluations > 0 && result.evaluations < result.nodes)
  assert.ok(result.tableHits > 0 && result.tableHits <= result.tableProbes)
  assert.ok(result.tableCuts > 0 && result.tableCuts <= result.tableHits)
  assert.ok(result.tableFill > 0 && result.tableFill <= 1)
  assert.ok(result.firstCutoffs > 0 && result.firstCutoffs <= result.cutoffs)
  // Os contadores só crescem de uma profundidade para a outra, e o resultado final fecha a conta.
  assert.deepEqual(messages, [...messages].sort((a, b) => a - b))
  assert.equal(result.nodes, messages.at(-1))

  const plain = search(INITIAL, [], fixed(8, { table: false }))
  assert.equal(plain.tableProbes, 0)
  assert.equal(plain.tableFill, 0)
})

test('a ordenação faz o corte acontecer mais vezes logo na primeira jogada', () => {
  const ordered = search(INITIAL, [], fixed(8, { table: false }))
  const natural = search(INITIAL, [], fixed(8, { table: false, ordering: false }))
  assert.ok(ordered.firstCutoffs / ordered.cutoffs > natural.firstCutoffs / natural.cutoffs)
})
