'use client'

import { useEffect, useRef } from 'react'

// No celular as abas rolam de lado: traz a aba aberta para o meio da fileira, sem mexer na rolagem da página,
// e marca a fileira enquanto sobra aba fora da vista à direita (o CSS esfuma a borda: sinal de que há mais).
export function AbaVisivel({ valor }: { valor: string }) {
  const marca = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const fileira = marca.current?.parentElement
    if (!fileira) return
    const aberta = fileira.querySelector<HTMLElement>('[aria-current="page"]')
    if (aberta) fileira.scrollLeft = aberta.offsetLeft - (fileira.clientWidth - aberta.offsetWidth) / 2
    const marcar = () => { fileira.dataset.mais = String(fileira.scrollWidth - fileira.clientWidth - fileira.scrollLeft > 6) }
    marcar()
    fileira.addEventListener('scroll', marcar, { passive: true })
    window.addEventListener('resize', marcar)
    return () => { fileira.removeEventListener('scroll', marcar); window.removeEventListener('resize', marcar) }
  }, [valor])
  return <span ref={marca} hidden />
}
