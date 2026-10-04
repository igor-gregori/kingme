import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BLACK, WHITE, parseDiagram, squareFromName } from '../src/engine/board.ts'
import { applyMove, legalMoves, moveName, type Move } from '../src/engine/movegen.ts'
import { DRAW_PLIES, search } from '../src/engine/search.ts'
import { buildGame, restore, serialize } from '../src/game.ts'

/** Joga a lista de lances, em notação, a partir de `start`. */
function play(names: string[], start = buildGame([]).position): Move[] {
  const moves: Move[] = []
  for (const name of names) {
    const move = buildGame(moves, start).legal.find((legal) => moveName(legal) === name)
    assert.ok(move, `${name} não é legal depois de ${names.slice(0, moves.length).join(' ')}`)
    moves.push(move)
  }
  return moves
}

// Duas damas contra uma, sem captura à vista. As pretas jogam.
const KINGS = parseDiagram(
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

test('partida nova: brancas começam, 12 peças de cada lado', () => {
  const game = buildGame([])
  assert.equal(game.position.side, WHITE)
  assert.equal(game.pieces.filter((piece) => piece.side === WHITE).length, 12)
  assert.equal(game.pieces.filter((piece) => piece.side === BLACK).length, 12)
  assert.equal(game.legal.length, 7)
  assert.equal(game.outcome, null)
})

test('as peças mantêm a identidade e as capturadas ficam registradas na jogada', () => {
  const game = buildGame(play(['c3-d4', 'f6-e5', 'd4xf6', 'g7xe5']))
  assert.deepEqual(game.moves.map((move) => move.name), ['c3-d4', 'f6-e5', 'd4xf6', 'g7xe5'])
  assert.equal(game.pieces.length, 22)
  // A pedra que saiu de g7 agora está em e5.
  assert.equal(game.pieces.find((piece) => piece.id === squareFromName('g7'))!.square, squareFromName('e5'))
  const capture = game.moves[2]
  assert.equal(capture.side, WHITE)
  assert.deepEqual(capture.takenPieces.map((piece) => piece.id), [squareFromName('f6')])
  // As peças batem com os bitboards.
  for (const piece of game.pieces) {
    const board = piece.side === WHITE ? game.position.white : game.position.black
    assert.ok((board & (1 << piece.square)) !== 0)
    assert.equal((game.position.kings & (1 << piece.square)) !== 0, piece.king)
  }
})

test('a pedra que chega à última linha passa a ser dama na lista de peças', () => {
  const start = parseDiagram(
    `
    . . . . . . . .
    . . w . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . b . .
    . . . . . . . .
    `,
    WHITE,
  )
  const game = buildGame(play(['c7-d8', 'f2-g1'], start), start)
  assert.deepEqual(game.moves.map((move) => move.promotes), [true, true])
  assert.ok(game.pieces.every((piece) => piece.king))
})

test('vitória: o adversário fica sem peças ou sem jogada', () => {
  // Joga sozinho até o fim: brancas com a busca de 6 lances, pretas com a de 1.
  const moves: Move[] = []
  let game = buildGame(moves)
  while (!game.outcome && moves.length < 300) {
    const { best } = search(game.position, game.history, { maxDepth: moves.length % 2 === 0 ? 6 : 1, timeMs: 5000 })
    moves.push(game.legal.find((move) => move.from === best!.from && move.to === best!.to && move.captured === best!.captured)!)
    game = buildGame(moves)
  }
  assert.ok(game.outcome)
  assert.equal(game.outcome.winner, WHITE)
  assert.equal(legalMoves(game.position).length, 0)
  assert.deepEqual(game.legal, [])
  const left = game.pieces.filter((piece) => piece.side === BLACK).length
  assert.equal(game.outcome.reason, left === 0 ? 'sem-pecas' : 'sem-jogadas')
})

test('empate por posição repetida três vezes', () => {
  // Vai e volta dos dois lados: a posição inicial aparece de novo a cada quatro meios-lances.
  const loop = ['a7-b8', 'c1-b2', 'b8-a7', 'b2-c1']
  const moves = play([...loop, ...loop], KINGS)
  assert.equal(buildGame(moves.slice(0, 4), KINGS).outcome, null)
  assert.equal(buildGame(moves.slice(0, 7), KINGS).outcome, null)
  const game = buildGame(moves, KINGS)
  assert.deepEqual(game.outcome, { winner: null, reason: 'repeticao' })
  assert.deepEqual(game.legal, [])
})

test('empate por 20 lances seguidos só de damas, sem captura', () => {
  // Passeia com as damas sem nunca repetir posição nem oferecer captura.
  const moves: Move[] = []
  const seen = new Set<string>()
  let game = buildGame(moves, KINGS)
  while (!game.outcome) {
    seen.add(JSON.stringify(game.position))
    const move = game.legal.find((candidate) => {
      const next = applyMove(game.position, candidate)
      return !seen.has(JSON.stringify(next)) && legalMoves(next).every((reply) => reply.captured === 0)
    })
    assert.ok(move, `sem jogada segura depois de ${moves.length} meios-lances`)
    moves.push(move)
    game = buildGame(moves, KINGS)
  }
  assert.equal(moves.length, DRAW_PLIES)
  assert.deepEqual(game.outcome, { winner: null, reason: 'damas' })
  assert.equal(buildGame(moves.slice(0, DRAW_PLIES - 1), KINGS).outcome, null)
})

test('captura ou jogada de pedra zera a contagem dos 20 lances', () => {
  const start = parseDiagram(
    `
    . . . . . . . .
    B . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . W
    . . . . . . . .
    . . . w . . . .
    . . W . . . . .
    `,
    BLACK,
  )
  const kings = buildGame(play(['a7-b8', 'c1-b2', 'b8-a7'], start), start)
  assert.equal(kings.history.length, 3)
  const man = buildGame(play(['a7-b8', 'c1-b2', 'b8-a7', 'd2-c3'], start), start)
  assert.equal(man.history.length, 0)
})

test('partida salva: volta igual, e lista adulterada é recusada', () => {
  const moves = play(['c3-d4', 'f6-e5', 'd4xf6', 'g7xe5', 'e3-f4'])
  const saved = JSON.parse(JSON.stringify(serialize(moves)))
  assert.deepEqual(restore(saved), moves)
  assert.deepEqual(restore([]), [])
  saved[2] = [squareFromName('d4'), squareFromName('e5')]
  assert.equal(restore(saved), null)
  assert.equal(restore('lixo'), null)
  assert.equal(restore([[1, 2, 3], 'x']), null)
})
