import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BLACK, INITIAL, WHITE, parseDiagram, squareFromName, type Position } from '../src/engine/board.ts'
import { applyMove, captureSequences, legalMoves, moveName, promotes } from '../src/engine/movegen.ts'

// Posições montadas à mão, uma para cada regra delicada.

const names = (position: Position) => legalMoves(position).map(moveName).sort()
const bit = (square: string) => 1 << squareFromName(square)

test('posição inicial: sete jogadas para cada lado', () => {
  assert.deepEqual(names(INITIAL), ['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4'])
  assert.equal(legalMoves({ ...INITIAL, side: BLACK }).length, 7)
})

test('pedra anda só para a frente, mas captura para frente e para trás', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . w . . . .
    . . b . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  // A captura é para trás; a jogada simples d4-c5 ou d4-e5 deixa de valer.
  assert.deepEqual(names(position), ['d4xb2'])
  assert.deepEqual(names({ ...position, side: BLACK }), ['c3xe5'])
})

test('captura é obrigatória', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . b . . .
    . . . w . . . .
    . . . . . . . .
    . w . . . . . w
    . . . . . . . .
    `,
    WHITE,
  )
  assert.deepEqual(names(position), ['d4xf6'])
})

test('lei da maioria: só vale a sequência que captura mais peças', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . b . .
    . . . . . . . .
    . b . b . . . .
    . . w . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  // c3xa5 captura uma peça; c3xe5xg7 captura duas.
  assert.deepEqual(names(position), ['c3xe5xg7'])
})

test('lei da maioria: conta peças, não importa se são pedras ou damas', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . b . .
    . . . . . . . .
    . B . b . . . .
    . . w . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  // Capturar a dama em b4 seria uma peça só; as duas pedras valem mais.
  assert.deepEqual(names(position), ['c3xe5xg7'])
})

test('lei da maioria vale entre peças diferentes', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . b . . . b . .
    w . . . . . . .
    . . . b . . . .
    . . w . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  // a5xc7 captura uma peça; quem tem que jogar é a pedra de c3, que captura duas.
  assert.deepEqual(names(position), ['c3xe5xg7'])
})

test('nenhuma peça pode ser pulada duas vezes', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . b . b . . . .
    . . . . . . . .
    . b . b . . . .
    . . w . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  // A pedra dá a volta e para na casa de onde saiu. Dali ela teria d4 ao lado de novo,
  // mas d4 já foi pulada: a jogada acaba com quatro capturas.
  const moves = legalMoves(position)
  assert.deepEqual(moves.map(moveName).sort(), ['c3xa5xc7xe5xc3', 'c3xe5xc7xa5xc3'])
  for (const move of moves) {
    assert.equal(move.from, move.to)
    assert.equal(move.taken.length, 4)
    const next = applyMove(position, move)
    assert.equal(next.white, bit('c3'))
    assert.equal(next.black, 0)
  }
})

test('peça capturada só sai do tabuleiro no fim: até lá, bloqueia a passagem', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . b . b . . .
    . . . . . . . .
    . . . . . . . .
    . . . b . . . .
    . . b . . . . .
    . . . . . . . .
    . . . . . . W .
    `,
    WHITE,
  )
  // A dama captura d4, c7 e e7 e para em f6, g5 ou h4. De f6 ela teria c3 na mesma
  // diagonal, mas d4, já capturada, ainda está no caminho.
  const moves = legalMoves(position)
  assert.deepEqual(moves.map(moveName).sort(), ['g1xb6xd8xf6', 'g1xb6xd8xg5', 'g1xb6xd8xh4'])
  for (const move of moves) {
    assert.equal(move.captured, bit('d4') | bit('c7') | bit('e7'))
    assert.equal(applyMove(position, move).black, bit('c3'))
  }
})

test('pedra que só passa pela última linha no meio da captura continua pedra', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . b . b .
    . . . w . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  const moves = legalMoves(position)
  assert.deepEqual(moves.map(moveName), ['d6xf8xh6'])
  assert.equal(promotes(position, moves[0]), false)
  const next = applyMove(position, moves[0])
  assert.equal(next.white, bit('h6'))
  assert.equal(next.kings, 0)
  assert.equal(next.black, 0)
})

test('pedra que chega à última linha capturando não continua a jogada como dama', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . b . . . . .
    . w . . . b . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  // De d8 uma dama capturaria f6 à distância. A pedra não: a jogada acaba em d8, e só aí ela vira dama.
  const moves = legalMoves(position)
  assert.deepEqual(moves.map(moveName), ['b6xd8'])
  assert.equal(promotes(position, moves[0]), true)
  const next = applyMove(position, moves[0])
  assert.equal(next.kings, bit('d8'))
  assert.equal(next.black, bit('f6'))
})

test('pedra vira dama ao terminar a jogada na última linha, com ou sem captura', () => {
  const white = parseDiagram(
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
  assert.deepEqual(names(white), ['c7-b8', 'c7-d8'])
  assert.equal(applyMove(white, legalMoves(white)[0]).kings, bit('d8'))
  const black = { ...white, side: BLACK } as Position
  assert.deepEqual(names(black), ['f2-e1', 'f2-g1'])
  for (const move of legalMoves(black)) assert.equal(applyMove(black, move).kings, 1 << move.to)
})

test('dama anda quantas casas quiser e para em qualquer peça', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . w . .
    . . . . . . . .
    . . . W . . . .
    . . . . . . . .
    . b . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  const king = names(position).filter((name) => name.startsWith('d4'))
  // Para cima e à direita só até e5 (f6 é dela); para baixo e à esquerda só até c3
  // (b2 é adversária, mas a1 atrás dela está livre: isso é captura, e é obrigatória).
  assert.deepEqual(king, ['d4xa1'])
  const quiet = names({ ...position, black: 0 })
  assert.deepEqual(
    quiet.filter((name) => name.startsWith('d4')),
    ['d4-a1', 'd4-a7', 'd4-b2', 'd4-b6', 'd4-c3', 'd4-c5', 'd4-e3', 'd4-e5', 'd4-f2', 'd4-g1'],
  )
})

test('dama captura à distância e escolhe onde pousar', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . b . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    W . . . . . . .
    `,
    WHITE,
  )
  assert.deepEqual(names(position), ['a1xf6', 'a1xg7', 'a1xh8'])
})

test('dama não pula duas peças seguidas nem peça encostada na borda', () => {
  const blocked = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . b . .
    . . . . b . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    W . . . . . . .
    `,
    WHITE,
  )
  assert.deepEqual(names(blocked), ['a1-b2', 'a1-c3', 'a1-d4'])
  const edge = parseDiagram(
    `
    . . . . . . . b
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    W . . . . . . .
    `,
    WHITE,
  )
  assert.deepEqual(names(edge), ['a1-b2', 'a1-c3', 'a1-d4', 'a1-e5', 'a1-f6', 'a1-g7'])
})

test('dama precisa pousar na casa de onde a captura continua', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . b . . .
    . . . . . . . .
    . . . . . . . .
    . . . b . . . .
    . . . . . . . .
    . . . . . . . .
    W . . . . . . .
    `,
    WHITE,
  )
  // Depois de pular d4 a dama poderia parar em e5, f6, g7 ou h8, mas só de f6 ela alcança e7.
  assert.deepEqual(names(position), ['a1xf6xd8'])
})

test('dama captura duas peças na mesma diagonal, se houver casa livre entre elas', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . b . . . . .
    . . . . . . . .
    . . . . b . . .
    . . . . . . . .
    . . . . . . W .
    `,
    WHITE,
  )
  assert.deepEqual(names(position), ['g1xd4xa7', 'g1xd4xb6'])
})

test('sem peças ou sem jogada possível: não há jogadas legais', () => {
  const blocked = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . . . . . . .
    . . b . . . . .
    . b . . . . . .
    w . . . . . . .
    `,
    WHITE,
  )
  // b2 está ao lado, mas a casa atrás dela (c3) está ocupada: a1 não tem para onde ir.
  assert.deepEqual(names(blocked), [])
  assert.deepEqual(names({ white: 0, black: bit('c3'), kings: 0, side: WHITE }), [])
})

test('captureSequences mostra também o que a lei da maioria descarta', () => {
  const position = parseDiagram(
    `
    . . . . . . . .
    . . . . . . . .
    . . . . . b . .
    . . . . . . . .
    . b . b . . . .
    . . w . . . . .
    . . . . . . . .
    . . . . . . . .
    `,
    WHITE,
  )
  assert.deepEqual(captureSequences(position).map(moveName).sort(), ['c3xa5', 'c3xe5xg7'])
  assert.deepEqual(names(position), ['c3xe5xg7'])
  assert.deepEqual(captureSequences(INITIAL), [])
})
