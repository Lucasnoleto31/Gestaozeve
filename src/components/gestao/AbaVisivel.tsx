'use client'

import { useEffect, useRef } from 'react'

// No celular as abas rolam de lado: traz a aba aberta para o meio da fileira, sem mexer na rolagem da página
export function AbaVisivel({ valor }: { valor: string }) {
  const marca = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const fileira = marca.current?.parentElement
    const aberta = fileira?.querySelector<HTMLElement>('[aria-current="page"]')
    if (fileira && aberta) fileira.scrollLeft = aberta.offsetLeft - (fileira.clientWidth - aberta.offsetWidth) / 2
  }, [valor])
  return <span ref={marca} hidden />
}
