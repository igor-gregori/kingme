import { useState } from 'react'
import type { Position } from '../../engine/board.ts'
import { piecesOf } from '../../game.ts'
import { Board } from '../Board.tsx'
import { Bits } from './Bits.tsx'
import { PRESETS, samePosition } from './study.ts'

interface Props {
  position: Position
  onEdit: (square: number) => void
  onPreset: (position: Position) => void
}

/** O tabuleiro e os três inteiros que o representam, lado a lado. */
export function BitboardDiagram({ position, onEdit, onPreset }: Props) {
  const [hot, setHot] = useState<number | null>(null)
  return (
    <figure className="figure split">
      <div className="figure-board">
        <Board
          pieces={piecesOf(position)}
          marks={hot === null ? undefined : { [hot]: 'hot' }}
          label={(square) => <span className="index">{square}</span>}
          onSquareClick={onEdit}
          onSquareHover={setHot}
        />
      </div>
      <div className="figure-body">
        <Bits label="brancas" value={position.white} hot={hot} onHover={setHot} />
        <Bits label="pretas" value={position.black} hot={hot} onHover={setHot} />
        <Bits label="damas" value={position.kings} hot={hot} onHover={setHot} />
        <div className="presets" role="group" aria-label="Posições prontas">
          {PRESETS.map((preset) => (
            <button key={preset.name} aria-pressed={samePosition(preset.position, position)} onClick={() => onPreset(preset.position)}>
              {preset.name}
            </button>
          ))}
        </div>
        <figcaption>
          Clique em uma casa para trocar a peça: vazia, pedra branca, dama branca, pedra preta, dama preta. Passe o
          ponteiro sobre uma casa, ou sobre um bit, para ver o par.
        </figcaption>
      </div>
    </figure>
  )
}
