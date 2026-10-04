import { useState } from 'react'
import { rowOf, type Position } from '../../engine/board.ts'
import { evaluation, type Evaluation } from '../../engine/search.ts'
import { piecesOf } from '../../game.ts'
import { Board } from '../Board.tsx'
import { PRESETS, samePosition } from './study.ts'

interface Props {
  position: Position
  onEdit: (square: number) => void
  onPreset: (position: Position) => void
}

type Term = Exclude<keyof Evaluation, 'total'>

const TERMS: { key: Term; name: string; text: string }[] = [
  { key: 'material', name: 'Material', text: 'Pedra vale 1 e dama vale 3. Quem está na frente ganha um bônus maior quanto menos peças houver, para preferir as trocas.' },
  { key: 'advance', name: 'Avanço das pedras', text: '0,03 por linha que cada pedra já andou.' },
  { key: 'center', name: 'Controle do centro', text: '0,04 por peça nas oito casas centrais.' },
  { key: 'backRow', name: 'Última linha', text: '0,06 por pedra na própria primeira linha, onde ela impede o adversário de fazer dama.' },
  { key: 'mobility', name: 'Mobilidade', text: '0,02 por casa para onde uma peça pode andar.' },
] // prettier-ignore

const CENTER = [9, 10, 13, 14, 17, 18, 21, 22]

const TWO_DECIMALS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Centésimos de pedra → "+0,12" */
function signed(value: number): string {
  const text = TWO_DECIMALS.format(Math.abs(value) / 100)
  if (value === 0) return text
  return (value > 0 ? '+' : '−') + text
}

/** A nota de uma posição, termo a termo. */
export function EvaluationDiagram({ position, onEdit, onPreset }: Props) {
  const [hot, setHot] = useState<Term | null>(null)
  const terms = evaluation(position)

  // Mostra no tabuleiro as casas de que o termo em destaque está falando.
  const marks: Record<number, string> = {}
  if (hot === 'center') for (const square of CENTER) marks[square] = 'hot'
  if (hot === 'backRow') for (let square = 0; square < 32; square++) if (rowOf(square) === 0 || rowOf(square) === 7) marks[square] = 'hot'

  return (
    <figure className="figure split">
      <div className="figure-board">
        <Board pieces={piecesOf(position)} marks={marks} onSquareClick={onEdit} />
      </div>
      <div className="figure-body">
        <table className="terms">
          <thead>
            <tr>
              <th scope="col">Termo</th>
              <th scope="col">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {TERMS.map((term) => (
              <tr key={term.key} onPointerEnter={() => setHot(term.key)} onPointerLeave={() => setHot(null)}>
                <th scope="row">
                  {term.name}
                  <small>{term.text}</small>
                </th>
                <td>{signed(terms[term.key])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                Total
                <small>
                  {terms.total === 0 ? 'Equilíbrio.' : `Melhor para as ${terms.total > 0 ? 'brancas' : 'pretas'}.`}
                </small>
              </th>
              <td>{signed(terms.total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="presets" role="group" aria-label="Posições prontas">
          {PRESETS.map((preset) => (
            <button key={preset.name} aria-pressed={samePosition(preset.position, position)} onClick={() => onPreset(preset.position)}>
              {preset.name}
            </button>
          ))}
        </div>
        <figcaption>
          Em pedras, do ponto de vista das brancas: positivo é bom para elas. Clique nas casas para mudar a posição e
          ver a nota mudar.
        </figcaption>
      </div>
    </figure>
  )
}
