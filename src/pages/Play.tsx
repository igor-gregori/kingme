import { useEffect, useMemo, useState } from 'react'
import { Board, type BoardPiece } from '../components/Board.tsx'
import { EnginePanel } from '../components/EnginePanel.tsx'
import { EvalBar } from '../components/EvalBar.tsx'
import { GameStats } from '../components/GameStats.tsx'
import { Header } from '../components/Header.tsx'
import { BookIcon, PlusIcon, UndoIcon } from '../components/icons.tsx'
import { MoveList } from '../components/MoveList.tsx'
import { NewGameDialog } from '../components/NewGameDialog.tsx'
import { BLACK, WHITE, type Side } from '../engine/board.ts'
import { startSearch, stopSearch } from '../engine/client.ts'
import { applyMove, legalMoves, moveName, type Move } from '../engine/movegen.ts'
import type { EngineMove, SearchInfo, SearchOptions } from '../engine/search.ts'
import { formatScore, whiteShare } from '../format.ts'
import { buildGame, restore, serialize, type Outcome } from '../game.ts'
import { useLocalStorage } from '../hooks/useLocalStorage.ts'
import { followLink } from '../hooks/usePath.ts'
import type { useTheme } from '../hooks/useTheme.ts'
import { loadLog, saveLog, type EngineReport, type Iteration } from '../report.ts'

type Level = 'easy' | 'medium' | 'hard' | 'master'

const LEVELS: Record<Level, { label: string; options: SearchOptions }> = {
  easy: { label: 'Fácil', options: { maxDepth: 2, timeMs: 1000, blunder: 0.25 } },
  medium: { label: 'Médio', options: { maxDepth: 6, timeMs: 1000 } },
  hard: { label: 'Difícil', options: { maxDepth: 99, timeMs: 1000 } },
  master: { label: 'Mestre', options: { maxDepth: 99, timeMs: 3000 } },
}

// A análise da sua vez usa sempre uma busca forte, seja qual for o nível da IA.
const ANALYSIS: SearchOptions = { maxDepth: 99, timeMs: 1500 }

// Nos primeiros lances a IA sorteia entre jogadas quase iguais, para as partidas não saírem sempre idênticas.
const OPENING_PLIES = 8
const OPENING_NOISE = 6

// Tempo mínimo antes da IA jogar, para a resposta não parecer um teletransporte.
const MIN_THINK_MS = 500
/** Duração de cada salto da peça na animação de um lance. */
const STEP_MS = 260

const SIDE_NAMES = ['brancas', 'pretas']
const GAME_KEY = 'kingme:game'

/** A peça escolhida e, numa captura em série, as casas em que ela já pousou. */
interface Selection {
  from: number
  prefix: number[]
}

function loadMoves(): Move[] {
  try {
    return restore(JSON.parse(localStorage.getItem(GAME_KEY) ?? 'null')) ?? []
  } catch {
    return []
  }
}

const sideAt = (ply: number): Side => (ply % 2 === 0 ? WHITE : BLACK)

function resultLine(outcome: Outcome): string {
  if (outcome.winner === null) return '½–½ · empate'
  return outcome.winner === WHITE ? '1–0 · vitória das brancas' : '0–1 · vitória das pretas'
}

function statusText(outcome: Outcome | null, human: Side, humanTurn: boolean, mustCapture: boolean): [string, string] {
  if (!outcome) {
    if (!humanTurn) return ['A IA está pensando…', `Ela joga com as ${SIDE_NAMES[human ^ 1]}.`]
    return [mustCapture ? 'Sua vez: captura obrigatória' : 'Sua vez', `Você joga com as ${SIDE_NAMES[human]}.`]
  }
  if (outcome.winner === null) {
    return ['Empate', outcome.reason === 'repeticao' ? 'A mesma posição se repetiu três vezes.' : 'Foram 20 lances seguidos só de damas, sem captura.']
  }
  const loser = outcome.winner === human ? 'A IA' : 'Você'
  return [
    outcome.winner === human ? 'Você venceu!' : 'A IA venceu.',
    outcome.reason === 'sem-pecas' ? `${loser} ficou sem peças.` : `${loser} ficou sem jogada possível.`,
  ]
}

export function Play({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const [moves, setMoves] = useState<Move[]>(loadMoves)
  // O que vem do navegador pode estar adulterado ou ser de outra versão: cada valor é conferido.
  const [storedSide, setHuman] = useLocalStorage<Side>('kingme:side', WHITE)
  const human: Side = storedSide === BLACK ? BLACK : WHITE
  const [storedLevel, setLevel] = useLocalStorage<Level>('kingme:level', 'medium')
  const level = Object.hasOwn(LEVELS, storedLevel) ? storedLevel : 'medium'
  const [storedAnalysis, setAnalysis] = useLocalStorage('kingme:analysis', false)
  const analysis = storedAnalysis === true
  const [selection, setSelection] = useState<Selection | null>(null)
  // Qual lance está sendo animado (pelo número de lances da partida) e em que salto ele está.
  const [anim, setAnim] = useState({ ply: -1, step: 0 })
  // As buscas já concluídas nesta partida, em ordem, e a que está no painel (em andamento ou a última).
  const [log, setLog] = useState<EngineReport[]>(() => loadLog().filter((saved) => saved.ply <= moves.length))
  const [report, setReport] = useState<EngineReport | null>(() => log.at(-1) ?? null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const game = useMemo(() => buildGame(moves), [moves])
  const over = game.outcome !== null
  const humanTurn = !over && game.position.side === human
  const last = game.moves.at(-1)
  const animating = last !== undefined && anim.ply === moves.length && anim.step < last.path.length
  const mustCapture = humanTurn && game.legal[0].captured !== 0

  useEffect(() => {
    try {
      localStorage.setItem(GAME_KEY, JSON.stringify(serialize(moves)))
    } catch {
      // Armazenamento indisponível (ex.: aba anônima); segue só em memória.
    }
  }, [moves])

  useEffect(() => saveLog(log), [log])

  useEffect(() => {
    if (!animating) return
    const timer = setTimeout(() => setAnim((current) => ({ ...current, step: current.step + 1 })), STEP_MS)
    return () => clearTimeout(timer)
  }, [animating, anim])

  function play(move: Move, step = 0) {
    setMoves([...moves, move])
    setSelection(null)
    setAnim({ ply: moves.length + 1, step })
  }

  // A busca: para a IA escolher o lance dela ou, com a análise ligada, para comentar a sua vez.
  // Mexer na análise durante a vez da IA, ou no nível durante a sua, não reinicia a busca em curso.
  const analyzing = humanTurn && analysis
  const aiLevel = humanTurn ? null : level
  useEffect(() => {
    if (over) return
    if (humanTurn && !analyzing) return
    const ply = moves.length
    const byHuman = humanTurn
    const options = aiLevel ? { ...LEVELS[aiLevel].options, noise: ply < OPENING_PLIES ? OPENING_NOISE : 0 } : ANALYSIS
    const find = (move: EngineMove) =>
      game.legal.find((legal) => legal.from === move.from && legal.to === move.to && legal.captured === move.captured)!
    const whiteScore = (score: number) => (game.position.side === WHITE ? score : -score)
    const iterations: Iteration[] = []
    const describe = (info: SearchInfo, done: boolean): EngineReport => {
      const best = find(info.best!)
      // A linha principal em notação: joga cada lance dela para saber o nome do seguinte.
      const line: string[] = []
      let position = game.position
      for (const step of info.line) {
        const move = legalMoves(position).find((legal) => legal.from === step.from && legal.to === step.to && legal.captured === step.captured)
        if (!move) break
        line.push(moveName(move))
        position = applyMove(position, move)
      }
      const { best: _best, line: _line, score, ...numbers } = info
      return {
        ...numbers,
        ply,
        byHuman,
        done,
        score: whiteScore(score),
        best: moveName(best),
        bestPath: [best.from, ...best.path],
        played: null,
        line,
        iterations: [...iterations],
        timeMs: options.timeMs,
        maxDepth: options.maxDepth,
      }
    }

    const started = performance.now()
    // O lance que acabou de ser feito ainda está sendo animado: a resposta espera ele terminar.
    const settle = last && anim.ply === ply ? (last.path.length - anim.step) * STEP_MS + 80 : 0
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    startSearch(game.position, game.history, options, (info) => {
      if (cancelled) return
      iterations.push({ depth: info.depth, best: moveName(find(info.best!)), score: whiteScore(info.score), nodes: info.nodes, ms: info.ms })
      setReport(describe(info, false))
    }).then((result) => {
      if (cancelled) return
      const played = find(result.played!)
      const final = describe(result, true)
      if (moveName(played) !== final.best) final.played = moveName(played)
      setReport(final)
      setLog((current) => [...current.filter((past) => past.ply < ply), final])
      if (byHuman) return
      const wait = Math.max(MIN_THINK_MS, settle) - (performance.now() - started)
      timer = setTimeout(() => play(played), Math.max(0, wait))
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
      stopSearch()
    }
    // `game` e `last` saem de `moves`; a animação em curso só importa no momento em que a busca começa.
  }, [moves, over, humanTurn, analyzing, aiLevel]) // oxlint-disable-line react/exhaustive-deps

  // Esc desiste da peça escolhida.
  useEffect(() => {
    if (!selection) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection])

  /* Jogadas */

  // As jogadas legais que começam pela peça escolhida e passam pelas casas já clicadas.
  const candidates = selection
    ? game.legal.filter((move) => move.from === selection.from && selection.prefix.every((square, i) => move.path[i] === square))
    : []
  const targets = new Set(candidates.map((move) => move.path[selection!.prefix.length]))

  function clickSquare(square: number) {
    if (!humanTurn || animating) return
    if (selection && targets.has(square)) {
      const prefix = [...selection.prefix, square]
      const next = candidates.filter((move) => move.path[selection.prefix.length] === square)
      // Sobrou uma jogada só: ela é feita, e o resto do caminho segue sozinho.
      if (next.length === 1) play(next[0], prefix.length - 1)
      else setSelection({ from: selection.from, prefix })
      return
    }
    const reselect = selection !== null && selection.prefix.length === 0 && selection.from === square
    if (!reselect && game.legal.some((move) => move.from === square)) setSelection({ from: square, prefix: [] })
    else setSelection(null)
  }

  function newGame(side: Side) {
    setHuman(side)
    setMoves([])
    setSelection(null)
    setReport(null)
    setLog([])
    setAnim({ ply: -1, step: 0 })
    setDialogOpen(false)
  }

  // Volta até a última vez em que era a sua vez de jogar.
  const undoLength = moves.length - (moves.length > 0 && sideAt(moves.length - 1) === human ? 1 : 2)
  function undo() {
    if (undoLength < 0) return
    setMoves(moves.slice(0, undoLength))
    setSelection(null)
    // As buscas dos lances desfeitos saem das estatísticas; o painel volta para a última que sobrou.
    const kept = log.filter((past) => past.ply < undoLength)
    setLog(kept)
    setReport(kept.at(-1) ?? null)
  }

  /* O que aparece no tabuleiro */

  const pieces = useMemo(() => {
    const partial = selection !== null && selection.prefix.length > 0
    const forced = mustCapture && !animating && !partial ? new Set(game.legal.map((move) => move.from)) : null
    const list: BoardPiece[] = game.pieces.map((piece) => ({ ...piece, forced: forced?.has(piece.square) }))
    if (animating) {
      // A peça vai de casa em casa; as capturadas continuam no tabuleiro até o fim da jogada.
      const mover = list.find((piece) => piece.id === last.piece)!
      mover.square = last.path[anim.step]
      mover.moving = true
      if (last.promotes) mover.king = false
      last.takenPieces.forEach((piece, i) => list.push({ ...piece, jumped: i <= anim.step }))
    } else if (partial) {
      const mover = list.find((piece) => piece.square === selection.from)!
      const taken = candidates[0].taken.slice(0, selection.prefix.length)
      for (const piece of list) if (taken.includes(piece.square)) piece.jumped = true
      mover.square = selection.prefix.at(-1)!
      mover.moving = true
    }
    return list
    // `candidates` sai de `game` e `selection`.
  }, [game, selection, animating, anim.step, mustCapture, last]) // oxlint-disable-line react/exhaustive-deps

  const marks: Record<number, string> = {}
  if (last) for (const square of [last.from, ...last.path]) marks[square] = 'last'
  if (selection) marks[selection.prefix.at(-1) ?? selection.from] = 'selected'
  for (const square of targets) marks[square] = `${marks[square] ?? ''} target`

  const movable = new Set(humanTurn && !animating ? game.legal.map((move) => move.from) : [])
  const fresh = report !== null && report.ply === moves.length && report.byHuman === humanTurn
  const hint = analysis && humanTurn && fresh && !animating && !selection ? [report.bestPath] : undefined
  const thinking = !over && (!humanTurn || analysis) && !(fresh && report.done)
  const budget = over ? null : aiLevel ? LEVELS[aiLevel].options : analyzing ? ANALYSIS : null

  const [headline, detail] = statusText(game.outcome, human, humanTurn, mustCapture)
  const score = report?.score ?? 0
  const count = (side: Side) => game.pieces.filter((piece) => piece.side === side).length

  return (
    <div className="app">
      <Header themePref={theme.pref} onCycleTheme={theme.cycle}>
        <label className="level">
          <span>Nível</span>
          <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            {(Object.keys(LEVELS) as Level[]).map((id) => (
              <option key={id} value={id}>
                {LEVELS[id].label}
              </option>
            ))}
          </select>
        </label>
        <button className="tool" onClick={() => setDialogOpen(true)}>
          <PlusIcon />
          <span>Novo jogo</span>
        </button>
        <button className="tool" onClick={undo} disabled={undoLength < 0}>
          <UndoIcon />
          <span>Desfazer</span>
        </button>
        <a className="tool" href="/como-funciona" onClick={followLink}>
          <BookIcon />
          <span>Como funciona</span>
        </a>
      </Header>

      <main className="table">
        <EvalBar white={whiteShare(score)} label={formatScore(score)} flipped={human === BLACK} />
        <Board
          pieces={pieces}
          flipped={human === BLACK}
          marks={marks}
          arrows={hint}
          active={(square) => movable.has(square) || targets.has(square)}
          onSquareClick={clickSquare}
        />
        <aside className="side">
          <div className={`status${over ? ' over' : ''}`} aria-live="polite">
            <span className={`chip ${(over ? game.outcome!.winner : game.position.side) === BLACK ? 'black' : 'white'}${game.outcome?.winner === null ? ' split' : ''}`} />
            <p>
              <strong>{headline}</strong>
              <span>{detail}</span>
            </p>
            <p className="tally" aria-label={`Brancas ${count(WHITE)} peças, pretas ${count(BLACK)}`}>
              <span className="chip white" />
              {count(WHITE)}
              <span className="chip black" />
              {count(BLACK)}
            </p>
          </div>
          <MoveList moves={game.moves} result={game.outcome && resultLine(game.outcome)} />
          <EnginePanel
            report={report}
            thinking={thinking}
            budget={budget}
            searchKey={`${moves.length}-${humanTurn}`}
            analysis={analysis}
            onToggleAnalysis={() => setAnalysis(!analysis)}
          />
        </aside>
        <GameStats log={log} current={report} moves={game.moves} />
      </main>

      <NewGameDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onStart={newGame} />
    </div>
  )
}
