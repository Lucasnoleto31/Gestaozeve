import { describe, expect, it } from 'vitest'
import { seletorCorretora } from './seletorCorretora'

const PAGINAS = ['painel', 'clientes', 'lotes', 'receita']
const ehPagina = (id: string) => PAGINAS.includes(id)

describe('seletorCorretora', () => {
  it('na página de uma corretora, marca a da rota e troca mantendo a página', () => {
    const s = seletorCorretora('/genial/clientes', '', 'BTG', ehPagina)
    expect(s).toMatchObject({ filtro: false, marcada: 'GENIAL', atual: 'GENIAL' })
    expect(s.href('BTG')).toBe('/btg/clientes')
    expect(s.href('GENIAL')).toBe('/genial/clientes')
  })
  it('numa subpágina que a outra corretora não tem como página do menu (ficha do cliente), volta para a lista', () => {
    expect(seletorCorretora('/genial/clientes/abc-123', '', 'BTG', ehPagina).href('BTG')).toBe('/btg/clientes')
    expect(seletorCorretora('/genial/coisa-estranha', '', 'BTG', ehPagina).href('BTG')).toBe('/btg/painel')
    expect(seletorCorretora('/genial', '', 'BTG', ehPagina).href('XP')).toBe('/xp/painel')
  })
  it('em Comissões sem filtro, nenhuma corretora fica marcada e escolher uma filtra a própria tela', () => {
    const s = seletorCorretora('/comissoes', 'parceiro=Atual+Capital&mes=2026-11', 'GENIAL', ehPagina)
    expect(s).toMatchObject({ filtro: true, marcada: null, atual: 'GENIAL' })
    expect(s.href('BTG')).toBe('/comissoes?parceiro=Atual+Capital&mes=2026-11&corretora=BTG')
    expect(s.href(null)).toBe('/comissoes?parceiro=Atual+Capital&mes=2026-11')
  })
  it('em Comissões com filtro, marca a corretora filtrada, troca o filtro e "Todas" tira o filtro', () => {
    const s = seletorCorretora('/comissoes', 'parceiro=Atual+Capital&corretora=GENIAL&aba=extrato', 'XP', ehPagina)
    expect(s).toMatchObject({ filtro: true, marcada: 'GENIAL', atual: 'GENIAL' })
    expect(s.href('BTG')).toBe('/comissoes?parceiro=Atual+Capital&corretora=BTG&aba=extrato')
    expect(s.href(null)).toBe('/comissoes?parceiro=Atual+Capital&aba=extrato')
    expect(seletorCorretora('/comissoes', 'corretora=BTG', 'GENIAL', ehPagina).href(null)).toBe('/comissoes')
  })
  it('filtro inválido no endereço conta como todas', () => {
    expect(seletorCorretora('/comissoes', 'corretora=NUBANK', 'BTG', ehPagina)).toMatchObject({ filtro: true, marcada: null, atual: 'BTG' })
  })
  it('nas outras telas gerais, marca a última corretora aberta e leva ao Painel da escolhida', () => {
    for (const rota of ['/dashboard', '/leads', '/funil', '/fila', '/perfil']) {
      const s = seletorCorretora(rota, 'corretora=BTG', 'GENIAL', ehPagina)
      expect(s).toMatchObject({ filtro: false, marcada: 'GENIAL', atual: 'GENIAL' })
      expect(s.href('BTG')).toBe('/btg/painel')
    }
  })
  it('na aba Distribuir da Fila, marca a corretora do endereço e troca sem sair da aba, mantendo o grupo', () => {
    const s = seletorCorretora('/fila', 'aba=distribuir&corretora=BTG&grupo=reativar', 'GENIAL', ehPagina)
    expect(s).toMatchObject({ filtro: false, marcada: 'BTG', atual: 'BTG' })
    expect(s.href('GENIAL')).toBe('/fila?aba=distribuir&corretora=GENIAL&grupo=reativar')
    // sem corretora no endereço vale a última aberta; minúsculas também servem (endereço antigo redirecionado)
    expect(seletorCorretora('/fila', 'aba=distribuir', 'GENIAL', ehPagina)).toMatchObject({ marcada: 'GENIAL' })
    expect(seletorCorretora('/fila', 'aba=distribuir&corretora=btg', 'GENIAL', ehPagina)).toMatchObject({ marcada: 'BTG' })
  })
  it('uma rota que só começa com o mesmo texto não vira filtro', () => {
    expect(seletorCorretora('/comissoes-antigas', '', 'GENIAL', ehPagina).filtro).toBe(false)
  })
})
