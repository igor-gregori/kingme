import { useEffect, useRef } from 'react'
import { BLACK, WHITE, type Side } from '../engine/board.ts'
import { CloseIcon } from './icons.tsx'

interface Props {
  open: boolean
  onClose: () => void
  onStart: (human: Side) => void
}

export function NewGameDialog({ open, onClose, onStart }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Foca o próprio modal para não destacar o primeiro botão ao abrir.
      dialog.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="new-game-title"
      tabIndex={-1}
      onClose={onClose}
      onClick={(e) => {
        // Clique no fundo escurecido fecha o modal.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <h3 id="new-game-title">Novo jogo</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </div>
        <p className="sheet-text">Com que cor você quer jogar?</p>
        <div className="colors">
          <button className="color" onClick={() => onStart(WHITE)}>
            <span className="chip white" />
            <b>Brancas</b>
            <small>Você começa</small>
          </button>
          <button className="color" onClick={() => onStart(BLACK)}>
            <span className="chip black" />
            <b>Pretas</b>
            <small>A IA começa</small>
          </button>
        </div>
      </div>
    </dialog>
  )
}
