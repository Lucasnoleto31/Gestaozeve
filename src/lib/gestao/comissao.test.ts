import { describe, expect, it } from 'vitest'
import { faixasValidas, lerFaixasComissao, resumirComissao, valorDaFaixa } from './comissao'
import type { ComissaoItem, ComissaoMensalRow } from './tipos'

describe('faixas de comissão', () => {
  it('lê o formato mínimo:valor e ordena', () => {
    expect(lerFaixasComissao('10:30;0:20;5:25')).toEqual([{ minimo: 0, valor: 20 }, { minimo: 5, valor: 25 }, { minimo: 10, valor: 30 }])
    expect(lerFaixasComissao('0:80,50')).toEqual([{ minimo: 0, valor: 80.5 }])
    expect(lerFaixasComissao('')).toEqual([])
  })
  it('a faixa alcançada vale para todas as contas do mês', () => {
    const f = lerFaixasComissao('0:20;5:25;10:30;15:35')
    expect(valorDaFaixa(f, 1)).toBe(20)
    expect(valorDaFaixa(f, 5)).toBe(25)
    expect(valorDaFaixa(f, 12)).toBe(30)
    expect(valorDaFaixa(f, 40)).toBe(35)
    expect(valorDaFaixa([], 3)).toBe(0)
  })
  it('valida o texto antes de salvar', () => {
    expect(faixasValidas('0:100;3:120')).toBe(true)
    expect(faixasValidas('0:80')).toBe(true)
    expect(faixasValidas('abc')).toBe(false)
    expect(faixasValidas('0:100;x')).toBe(false)
    expect(faixasValidas('')).toBe(false)
  })
})

const item = (p: Partial<ComissaoItem>): ComissaoItem => ({
  cliente_id: 'c', nome: 'Cliente', corretora: 'GENIAL', origem: 'assessor', data_lead: null, assessor_nome: 'ZEVE 18', status: 'Migrado',
  data_abertura: '2026-09-10', data_ativacao: '2026-09-12', prazo_dias: 60, limite_ativacao: '2026-11-09', ativou_no_prazo: true,
  mes_abertura: '2026-09-01', mes_ativacao: '2026-09-01', valor_abertura: 20, valor_ativacao: 80, situacao: 'Ativado', reativacoes: 0, ultima_reativacao: null, ...p,
})
const mes = (p: Partial<ComissaoMensalRow>): ComissaoMensalRow => ({ mes_ref: '2026-09-01', parceiro: 'Aikon', corretora: 'GENIAL', aberturas: 0, ativacoes: 0, reativacoes: 0, valor_abertura: 0, valor_ativacao: 0, contas_mes: 0, receita_contas: 0, receita_carteira: 0, ...p })

describe('resumo da comissao', () => {
  it('reativacao conta como ativacao no mes e no total', () => {
    const itens = [
      item({ cliente_id: 'a' }),
      // cliente antigo (maio) que parou e voltou em setembro: a volta vale a faixa da ativacao
      item({ cliente_id: 'b', data_abertura: '2026-05-02', data_ativacao: '2026-05-03', mes_abertura: '2026-05-01', mes_ativacao: '2026-05-01', valor_abertura: 0, valor_ativacao: 160, reativacoes: 1, ultima_reativacao: '2026-09-20' }),
      item({ cliente_id: 'c', data_ativacao: null, ativou_no_prazo: false, mes_ativacao: null, valor_ativacao: 0, situacao: 'Aberto, no prazo' }),
    ]
    const mensal = [
      mes({ aberturas: 2, ativacoes: 1, reativacoes: 1, valor_abertura: 40, valor_ativacao: 160, contas_mes: 3, receita_contas: 1500.5, receita_carteira: 9000 }),
      mes({ mes_ref: '2026-05-01', aberturas: 1, ativacoes: 1, valor_ativacao: 80 }),
    ]
    const pagos = [{ id: 'p', parceiro: 'Aikon', corretora: null, mes_ref: '2026-09-01', valor: 100, data_pagamento: '2026-10-05', observacao: null, criado_por_nome: null }]
    const r = resumirComissao(itens, mensal, pagos, '2026-09-01', () => 80)
    expect(r.abertasMes).toBe(2)
    expect(r.ativadasMes).toBe(2)        // 1 ativacao + 1 reativacao
    expect(r.ativacoesMes).toBe(1)
    expect(r.reativadasMes).toBe(1)
    expect(r.comissaoMes).toBe(200)
    expect(r.contasMes).toBe(3)
    expect(r.receitaMes).toBe(1500.5)
    expect(r.receitaCarteiraMes).toBe(9000)
    expect(r.liquidoMes).toBe(1300.5)    // receita bruta das contas do mes menos a comissao
    expect(r.abertasTotal).toBe(3)
    expect(r.ativadasTotal).toBe(3)      // a, b e a volta de b
    expect(r.reativadasTotal).toBe(1)
    expect(r.geradoTotal).toBe(280)
    expect(r.pendentes).toBe(1)
    expect(r.previsao).toBe(80)
    expect(r.saldo).toBe(180)
  })
})
