import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GanhosPorDia } from './GanhosPorDia'
import { ultimosDias } from '@/lib/gestao/contatos'

describe('GanhosPorDia', () => {
  it('mostra +N nos dias com ganho, traço nos outros e o total dos últimos 7 e 14 dias', () => {
    const hoje = '2026-10-16'
    const serie = ultimosDias(hoje, 14).map(dia => ({ dia, entraram: dia === hoje ? 4 : 0, contatos: 0, ganhos: dia === hoje ? 2 : dia === '2026-10-15' ? 3 : 0, perdidos: 0, contas_abertas: 0 }))
    const html = renderToStaticMarkup(createElement(GanhosPorDia, { serie, hoje }))
    expect(html).toContain('Clientes ganhos por dia')
    expect(html).toContain('5 nos últimos 7 dias, 5 nos últimos 14')
    expect(html).toContain('+2')
    expect(html).toContain('+3')
    expect(html).toContain('4 leads')
    expect(html).toContain('>hoje<')
    expect(html).toContain('>ontem<')
    expect((html.match(/<li /g) ?? []).length).toBe(14)
  })
})
