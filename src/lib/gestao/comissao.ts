// Comissão de parceiros por abertura e ativação de conta (S39).
// As faixas vêm do banco como "mínimo no mês:R$ por conta;…" (mesmo formato de comissao_faixa).
import type { ComissaoItem, ComissaoMensalRow, ComissaoPagamento } from './tipos'

export type FaixaComissao = { minimo: number; valor: number }

const numero = (s: string) => Number(String(s).trim().replace(',', '.'))

// "0:20;5:25;10:30" → [{ minimo: 0, valor: 20 }, …], em ordem de mínimo
export function lerFaixasComissao(texto: string | null | undefined): FaixaComissao[] {
  if (!texto) return []
  return texto.split(';').map(p => p.trim()).filter(p => p.includes(':'))
    .map(p => { const [m, v] = p.split(':'); return { minimo: numero(m), valor: numero(v) } })
    .filter(f => Number.isFinite(f.minimo) && Number.isFinite(f.valor))
    .sort((a, b) => a.minimo - b.minimo)
}

// Valor da maior faixa alcançada por uma quantidade no mês (0 quando não há faixa)
export function valorDaFaixa(faixas: FaixaComissao[], quantidade: number): number {
  let valor = 0
  for (const f of faixas) if (f.minimo <= quantidade) valor = f.valor
  return valor
}

export function faixasValidas(texto: string): boolean {
  const t = texto.trim()
  if (!t) return false
  return t.split(';').every(p => /^\s*\d+(?:[.,]\d+)?\s*:\s*\d+(?:[.,]\d+)?\s*$/.test(p))
}

// Resumo de um parceiro a partir dos itens, do mensal e dos pagamentos
export function resumirComissao(itens: ComissaoItem[], mensal: ComissaoMensalRow[], pagamentos: ComissaoPagamento[], mesRef: string, valorAtivacaoBase: (corretora: string) => number) {
  const doMes = mensal.filter(m => m.mes_ref === mesRef)
  const abertasMes = doMes.reduce((s, m) => s + m.aberturas, 0)
  const ativadasMes = doMes.reduce((s, m) => s + m.ativacoes, 0)
  const comissaoMes = doMes.reduce((s, m) => s + m.valor_abertura + m.valor_ativacao, 0)
  const abertasTotal = itens.filter(i => i.data_abertura).length
  const ativadasTotal = itens.filter(i => i.ativou_no_prazo).length
  const geradoTotal = itens.reduce((s, i) => s + i.valor_abertura + i.valor_ativacao, 0)
  const pendentes = itens.filter(i => i.situacao === 'Aberto, no prazo')
  const previsao = pendentes.reduce((s, i) => s + valorAtivacaoBase(i.corretora), 0)
  const pago = pagamentos.reduce((s, p) => s + p.valor, 0)
  return { abertasMes, ativadasMes, comissaoMes, abertasTotal, ativadasTotal, geradoTotal, pendentes: pendentes.length, previsao, pago, saldo: geradoTotal - pago }
}
