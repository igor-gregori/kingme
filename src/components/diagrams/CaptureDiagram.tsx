import { useState } from 'react'
import { parseDiagram, WHITE } from '../../engine/board.ts'
import { captureSequences, moveName, promotes } from '../../engine/movegen.ts'
import { piecesOf } from '../../game.ts'
import { Board } from '../Board.tsx'

// As mesmas posições dos testes de regras.
const CASES = [
  {
    name: 'Lei da maioria',
    text: 'A pedra de c3 pode capturar uma peça para a esquerda ou duas para a direita. Só a sequência maior é legal.',
    position: parseDiagram(
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
    ),
  },
  {
    name: 'Não pular duas vezes',
    text: 'A pedra dá a volta e para na casa de onde saiu. Dali ela teria d4 ao lado de novo, mas d4 já foi pulada: a jogada acaba com quatro capturas. São dois caminhos, um em cada sentido.',
    position: parseDiagram(
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
    ),
  },
  {
    name: 'Peça capturada bloqueia',
    text: 'A dama captura d4, c7 e e7. Se parar em f6, ela fica na mesma diagonal de c3, mas d4 ainda está no tabuleiro, porque as capturadas só saem no fim, e fecha a passagem.',
    position: parseDiagram(
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
    ),
  },
  {
    name: 'Coroação no meio',
    text: 'A pedra passa por f8, na última linha, e continua capturando. Como não termina a jogada ali, continua pedra.',
    position: parseDiagram(
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
    ),
  },
]

/** Todas as sequências de captura que a busca em profundidade encontra, e quais a lei da maioria deixa valer. */
export function CaptureDiagram() {
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState(0)
  const { position, text } = CASES[index]

  const sequences = captureSequences(position).sort((a, b) => b.taken.length - a.taken.length)
  const most = sequences[0].taken.length
  const shown = sequences[Math.min(chosen, sequences.length - 1)]

  const marks: Record<number, string> = {}
  for (const square of shown.taken) marks[square] = 'taken'

  return (
    <figure className="figure split">
      <div className="figure-board">
        <Board pieces={piecesOf(position)} marks={marks} arrows={[[shown.from, ...shown.path]]} />
      </div>
      <div className="figure-body">
        <div className="presets" role="group" aria-label="Regra">
          {CASES.map((item, i) => (
            <button
              key={item.name}
              aria-pressed={i === index}
              onClick={() => {
                setIndex(i)
                setChosen(0)
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
        <p className="figure-text">{text}</p>
        <ul className="sequences">
          {sequences.map((move, i) => {
            const legal = move.taken.length === most
            return (
              <li key={moveName(move)}>
                <button aria-pressed={move === shown} onClick={() => setChosen(i)} onPointerEnter={() => setChosen(i)}>
                  <span className="sequence-name">{moveName(move)}</span>
                  <span className="sequence-count">
                    {move.taken.length} {move.taken.length === 1 ? 'peça' : 'peças'}
                    {legal && promotes(position, move) ? ' · vira dama' : ''}
                  </span>
                  <span className={`verdict ${legal ? 'legal' : 'dropped'}`}>{legal ? 'legal' : 'descartada'}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <figcaption>As brancas jogam. Passe o ponteiro ou toque em uma sequência para ver o caminho no tabuleiro.</figcaption>
      </div>
    </figure>
  )
}
