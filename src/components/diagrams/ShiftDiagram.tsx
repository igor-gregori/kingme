import { useState } from 'react'
import {
  BLACK,
  NE,
  NW,
  RAY,
  SE,
  SW,
  WHITE,
  northEast,
  northWest,
  southEast,
  southWest,
  type Position,
  type Side,
} from '../../engine/board.ts'
import { piecesOf } from '../../game.ts'
import { Board } from '../Board.tsx'
import { Bits } from './Bits.tsx'

interface Props {
  position: Position
  onEdit: (square: number) => void
}

// Para cada cor, as duas diagonais em que a pedra anda: a função do motor, a direção
// contrária (para achar de onde cada pedra veio) e o código, com os nomes em português.
const STEPS = [
  [
    { arrow: '↖', shift: northWest, back: SE, code: ['((pedras & ÍMPARES) << 4)', '((pedras & PARES_SEM_A) << 3)'], even: 3, odd: 4, edge: 'a' },
    { arrow: '↗', shift: northEast, back: SW, code: ['((pedras & PARES) << 4)', '((pedras & ÍMPARES_SEM_H) << 5)'], even: 4, odd: 5, edge: 'h' },
  ],
  [
    { arrow: '↙', shift: southWest, back: NE, code: ['((pedras & ÍMPARES) >>> 4)', '((pedras & PARES_SEM_A) >>> 5)'], even: 5, odd: 4, edge: 'a' },
    { arrow: '↘', shift: southEast, back: NW, code: ['((pedras & PARES) >>> 4)', '((pedras & ÍMPARES_SEM_H) >>> 3)'], even: 4, odd: 3, edge: 'h' },
  ],
] // prettier-ignore

/** Todas as pedras de uma cor andando uma casa na mesma diagonal, com um deslocamento de bits. */
export function ShiftDiagram({ position, onEdit }: Props) {
  const [side, setSide] = useState<Side>(WHITE)
  const [right, setRight] = useState(1)
  const [hot, setHot] = useState<number | null>(null)

  const step = STEPS[side][right]
  const men = (side === WHITE ? position.white : position.black) & ~position.kings
  const empty = ~(position.white | position.black)
  const shifted = step.shift(men)
  const targets = shifted & empty

  const marks: Record<number, string> = {}
  const arrows: number[][] = []
  for (let square = 0; square < 32; square++) {
    if ((targets & (1 << square)) === 0) continue
    marks[square] = 'target'
    arrows.push([RAY[(square * 4 + step.back) * 8], square])
  }
  if (hot !== null) marks[hot] = `${marks[hot] ?? ''} hot`

  return (
    <figure className="figure split">
      <div className="figure-board">
        <Board
          pieces={piecesOf(position)}
          marks={marks}
          arrows={arrows}
          label={(square) => <span className="index">{square}</span>}
          onSquareClick={onEdit}
          onSquareHover={setHot}
        />
      </div>
      <div className="figure-body">
        <div className="controls">
          <div className="segmented" role="group" aria-label="Cor das pedras">
            <button aria-pressed={side === WHITE} onClick={() => setSide(WHITE)}>
              Brancas
            </button>
            <button aria-pressed={side === BLACK} onClick={() => setSide(BLACK)}>
              Pretas
            </button>
          </div>
          <div className="segmented" role="group" aria-label="Direção">
            {STEPS[side].map((option, i) => (
              <button key={option.arrow} aria-pressed={right === i} aria-label={i ? 'Para a direita' : 'Para a esquerda'} onClick={() => setRight(i)}>
                {option.arrow}
              </button>
            ))}
          </div>
        </div>
        <pre className="code">
          <code>
            deslocadas = {step.code[0]}
            {'\n'}           | {step.code[1]}
            {'\n'}destinos   = deslocadas &amp; vazias
          </code>
        </pre>
        <Bits label="pedras" value={men} hot={hot} onHover={setHot} />
        <Bits label="deslocadas" value={shifted} hot={hot} onHover={setHot} />
        <Bits label="destinos" value={targets} hot={hot} onHover={setHot} />
        <figcaption>
          Nas linhas pares (fileiras 1, 3, 5, 7) o passo vale {step.even} bits; nas ímpares, {step.odd}. A máscara tira
          as pedras da coluna {step.edge}, que nessa direção não têm para onde ir. O tabuleiro é o mesmo do diagrama
          anterior: clique para mudar as peças.
        </figcaption>
      </div>
    </figure>
  )
}
