import { WIN, WIN_MIN } from './engine/search.ts'

const ONE_DECIMAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const INTEGER = new Intl.NumberFormat('pt-BR')

/** 950 → "950", 2 100 000 → "2,1 M" */
export function formatCount(n: number): string {
  if (n >= 1e6) return `${ONE_DECIMAL.format(n / 1e6)} M`
  if (n >= 1e4) return `${INTEGER.format(Math.round(n / 1e3))} mil`
  return INTEGER.format(Math.round(n))
}

export function formatInteger(n: number): string {
  return INTEGER.format(n)
}

const PERCENT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

/** 0,26 → "26%" */
export function formatPercent(fraction: number): string {
  return PERCENT.format(fraction)
}

/** 8 → "8 ms", 620 → "0,6 s", 3000 → "3 s" */
export function formatSeconds(ms: number): string {
  if (ms < 100) return `${Math.round(ms)} ms`
  const seconds = Math.round(ms / 100) / 10
  return `${Number.isInteger(seconds) ? seconds : ONE_DECIMAL.format(seconds)} s`
}

/** A pontuação é uma vitória ou derrota provada, e não um palpite da avaliação? */
export function isDecided(score: number): boolean {
  return score >= WIN_MIN || score <= -WIN_MIN
}

/** Em quantos lances de quem vence a partida acaba, dada uma pontuação provada. */
export function movesToWin(score: number): number {
  return Math.ceil((WIN - Math.abs(score)) / 2)
}

/** A pontuação em pedras, com sinal: 40 → "+0,4". */
export function formatScore(score: number): string {
  if (isDecided(score)) return `${score > 0 ? '+' : '−'}V${movesToWin(score)}`
  const pawns = ONE_DECIMAL.format(Math.abs(score) / 100)
  if (pawns === '0,0') return '0,0'
  return `${score > 0 ? '+' : '−'}${pawns}`
}

/**
 * Fração da barra de avaliação que fica com as brancas, de 0 a 1. Uma curva em S: meia pedra
 * de vantagem já aparece bem, e de três pedras em diante a barra quase não muda.
 */
export function whiteShare(score: number): number {
  if (isDecided(score)) return score > 0 ? 1 : 0
  return 1 / (1 + Math.exp(-score / 120))
}
