interface Props {
  label: string
  value: number
  /** Casa em destaque, para ligar o bit ao tabuleiro. */
  hot?: number | null
  onHover?: (square: number | null) => void
}

/**
 * Um bitboard escrito em binário, do bit 31 ao 0. Cada grupo de quatro bits é uma linha do
 * tabuleiro, da fileira 8 à 1, e também um dígito do número em hexadecimal.
 */
export function Bits({ label, value, hot, onHover }: Props) {
  const rows = []
  for (let row = 7; row >= 0; row--) {
    const cells = []
    for (let k = 3; k >= 0; k--) {
      const square = row * 4 + k
      const on = (value & (1 << square)) !== 0
      cells.push(
        <span
          key={square}
          className={`bit${on ? ' on' : ''}${hot === square ? ' hot' : ''}`}
          onPointerEnter={() => onHover?.(square)}
          onPointerLeave={() => onHover?.(null)}
        >
          {on ? 1 : 0}
        </span>,
      )
    }
    rows.push(
      <span key={row} className="nibble">
        {cells}
      </span>,
    )
  }
  return (
    <div className="bits">
      <span className="bits-label">{label}</span>
      <span className="bits-row">{rows}</span>
      <code className="bits-hex">0x{(value >>> 0).toString(16).padStart(8, '0')}</code>
    </div>
  )
}
