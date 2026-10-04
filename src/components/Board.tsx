import { useId, type ReactNode } from 'react'
import { colOf, rowOf, squareAt, squareName, WHITE, type Side } from '../engine/board.ts'
import { Crown } from './icons.tsx'

export interface BoardPiece {
  id: number | string
  square: number
  side: Side
  king: boolean
  /** Já foi pulada na captura em andamento: fica apagada até sair do tabuleiro. */
  jumped?: boolean
  /** É obrigada a capturar. */
  forced?: boolean
  /** Está no meio de uma jogada: desenhada por cima das outras. */
  moving?: boolean
}

interface Props {
  pieces: BoardPiece[]
  /** Pretas embaixo. */
  flipped?: boolean
  /** Classes de destaque por casa: `last`, `selected`, `target`… */
  marks?: Record<number, string>
  /** Caminhos desenhados como setas, cada um uma lista de casas. */
  arrows?: number[][]
  /** Conteúdo extra dentro de cada casa escura (os diagramas usam para numerar os bits). */
  label?: (square: number) => ReactNode
  /** Casas que respondem a clique. Sem `onSquareClick` o tabuleiro é só um desenho. */
  active?: (square: number) => boolean
  onSquareClick?: (square: number) => void
  /** Avisa qual casa escura está sob o ponteiro (null ao sair). */
  onSquareHover?: (square: number | null) => void
  coordinates?: boolean
}

const FILES = 'abcdefgh'

export function Board({ pieces, flipped = false, marks, arrows, label, active, onSquareClick, onSquareHover, coordinates = true }: Props) {
  const arrowHead = useId()
  // Posição na tela, em casas, a partir do canto de cima à esquerda.
  const x = (square: number) => (flipped ? 7 - colOf(square) : colOf(square))
  const y = (square: number) => (flipped ? rowOf(square) : 7 - rowOf(square))
  const pieceAt = new Map(pieces.filter((piece) => !piece.jumped).map((piece) => [piece.square, piece]))

  const squares: ReactNode[] = []
  for (let screenRow = 0; screenRow < 8; screenRow++) {
    for (let screenCol = 0; screenCol < 8; screenCol++) {
      const row = flipped ? screenRow : 7 - screenRow
      const col = flipped ? 7 - screenCol : screenCol
      const square = squareAt(row, col)
      const coords = coordinates && (
        <>
          {screenCol === 0 && <span className="rank">{row + 1}</span>}
          {screenRow === 7 && <span className="file">{FILES[col]}</span>}
        </>
      )
      if (square < 0) {
        squares.push(
          <div key={`${row}-${col}`} className="sq light">
            {coords}
          </div>,
        )
        continue
      }
      const piece = pieceAt.get(square)
      const name = squareName(square)
      const description = piece
        ? `${name}, ${piece.king ? 'dama' : 'pedra'} ${piece.side === WHITE ? 'branca' : 'preta'}`
        : `${name}, vazia`
      const className = `sq dark ${marks?.[square] ?? ''}`
      const hover = onSquareHover && {
        onPointerEnter: () => onSquareHover(square),
        onPointerLeave: () => onSquareHover(null),
      }
      if (!onSquareClick) {
        squares.push(
          <div key={name} className={className} {...hover}>
            {coords}
            {label?.(square)}
          </div>,
        )
        continue
      }
      const enabled = active?.(square) ?? true
      squares.push(
        <button
          key={name}
          className={className + (enabled ? ' active' : '')}
          aria-label={description}
          tabIndex={enabled ? 0 : -1}
          onClick={() => onSquareClick(square)}
          {...hover}
        >
          {coords}
          {label?.(square)}
        </button>,
      )
    }
  }

  return (
    <div className="board">
      {squares}
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className={
            `piece ${piece.side === WHITE ? 'white' : 'black'}` +
            (piece.king ? ' king' : '') +
            (piece.jumped ? ' jumped' : '') +
            (piece.forced ? ' forced' : '') +
            (piece.moving ? ' moving' : '')
          }
          style={{ transform: `translate(${x(piece.square) * 100}%, ${y(piece.square) * 100}%)` }}
        >
          <span className="disc">{piece.king && <Crown />}</span>
        </div>
      ))}
      {arrows && arrows.length > 0 && (
        <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true">
          <defs>
            <marker id={arrowHead} viewBox="0 0 10 10" refX="6.5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
              <path d="M0 0 10 5 0 10z" />
            </marker>
          </defs>
          {arrows.map((path) => (
            <polyline
              key={path.join('-')}
              points={path.map((square) => `${x(square) + 0.5},${y(square) + 0.5}`).join(' ')}
              markerEnd={`url(#${arrowHead})`}
            />
          ))}
        </svg>
      )}
    </div>
  )
}
