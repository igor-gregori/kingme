import { useEffect, useState, type MouseEvent } from 'react'

// Roteador mínimo: o site só tem duas páginas, "/" e "/como-funciona".

const listeners = new Set<() => void>()

export function navigate(path: string): void {
  if (path === location.pathname) return
  history.pushState(null, '', path)
  window.scrollTo(0, 0)
  listeners.forEach((listener) => listener())
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const update = () => setPath(location.pathname)
    listeners.add(update)
    window.addEventListener('popstate', update)
    return () => {
      listeners.delete(update)
      window.removeEventListener('popstate', update)
    }
  }, [])
  return path
}

/** Para pôr em um <a href>: navega sem recarregar, mas deixa o navegador cuidar de Ctrl+clique e afins. */
export function followLink(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(event.currentTarget.pathname)
}
