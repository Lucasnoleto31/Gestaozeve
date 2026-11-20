// Custos fixos do escritório: a leitura para o Painel. Só servidor. O formato e a conta ficam em custos.ts.
// Os custos mensais vêm do parâmetro custos_fixos, lido sozinho (parametroCustosFixos, uma linha) para não
// esperar a economia do Painel; o valor de cada pessoa da equipe vem da remuneração de Comissões, lida só quando alguma
// pessoa está em vigor num dos meses pedidos. Se a remuneração falhar, ou a pessoa não estiver lá, o valor
// fica null: a conta segue sem ele e a tela avisa (nunca quebra o Painel).
import { cache } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { normTexto } from '@/lib/texto'
import type { Corretora } from '@/lib/corretoras'
import { equipe } from './guard'
import { CHAVE_CUSTOS_FIXOS, custosDoMes, emVigor, lerCustosFixos, type CustoFixo, type CustosDoMes } from './custos'
import { contasDe, remuneracaoDaEquipe, type Remuneracao } from './consultasRemuneracao'
import type { Parametro } from './tipos'

const dia1 = (mes: string) => `${mes.slice(0, 7)}-01`

// Os itens do parâmetro custos_fixos (vazio quando não há ou o texto é inválido)
export function custosFixosDe(parametros: Parametro[]): CustoFixo[] {
  return lerCustosFixos(parametros.find(p => p.chave === CHAVE_CUSTOS_FIXOS)?.valor)
}

// Só a chave custos_fixos da corretora (uma linha), com cache por requisição: o Painel começa a ler os custos
// junto com a economia, sem esperar os parâmetros completos, e a remuneração da equipe corre em paralelo.
// Erro de leitura vira lista vazia (o Painel segue sem custos, como hoje).
export const parametroCustosFixos = cache(async (corretora: Corretora): Promise<Parametro[]> => {
  try {
    const { db } = await equipe()
    const { data, error } = await db.from('parametros').select('chave, valor, descricao').eq('corretora', corretora).eq('chave', CHAVE_CUSTOS_FIXOS)
    if (error) return []
    return (data ?? []) as Parametro[]
  } catch (e) { unstable_rethrow(e); return [] }
})

// Sem consulta nenhuma: há algum custo lançado (em vigor em algum dos meses, quando eles são dados)?
export function haCustosFixos(parametros: Parametro[], meses?: string[]): boolean {
  const lista = custosFixosDe(parametros)
  return meses ? lista.some(c => meses.some(m => emVigor(c, m))) : lista.length > 0
}

// O nome como está na remuneração (pessoa no modelo, comissionado ou quem tem evento), ou null
function nomeNaRemuneracao(r: Remuneracao, nome: string): string | null {
  const n = normTexto(nome)
  const nomes = [...r.config.pessoas.map(p => p.nome), ...r.config.comissionados, ...r.dados.eventos.map(e => e.pessoa)]
  return nomes.find(x => normTexto(x) === n) ?? null
}

// Os custos de cada mês pedido ('AAAA-MM-01' → custosDoMes). Meses sem item em vigor vêm com temCusto false.
export async function custosDoPainel(parametros: Parametro[], meses: string[]): Promise<Map<string, CustosDoMes>> {
  const lista = custosFixosDe(parametros)
  const pedidos = [...new Set(meses.map(dia1))]
  // quanto cada pessoa da equipe gerou em cada mês: chave `${tipo}|${NOME}|${mes}`
  const valores = new Map<string, number | null>()
  const precisa = new Map<string, { nome: string; meses: Set<string> }>()   // NOME → meses em vigor
  for (const c of lista) {
    if (c.tipo === 'valor') continue
    for (const m of pedidos) {
      if (!emVigor(c, m)) continue
      const k = normTexto(c.nome)
      const p = precisa.get(k) ?? { nome: c.nome, meses: new Set<string>() }
      p.meses.add(m)
      precisa.set(k, p)
    }
  }
  if (precisa.size) {
    let r: Remuneracao | null = null
    // os erros internos do Next (cookies durante a renderização estática, redirect) seguem; o resto vira valor null
    try { r = await remuneracaoDaEquipe() } catch (e) { unstable_rethrow(e); r = null }
    if (r) {
      for (const [k, p] of precisa) {
        const nome = nomeNaRemuneracao(r, p.nome)
        if (!nome) continue
        try {
          for (const conta of contasDe(r, nome, [...p.meses])) {
            const m = dia1(conta.mes)
            valores.set(`equipe|${k}|${m}`, conta.valor.total)
            valores.set(`equipe-btg|${k}|${m}`, conta.valor.porCorretora.BTG?.total ?? 0)
          }
        } catch { /* a pessoa fica sem valor */ }
      }
    }
  }
  const out = new Map<string, CustosDoMes>()
  for (const m of pedidos) out.set(m, custosDoMes(lista, m, (nome, tipo, mes) => valores.get(`${tipo}|${normTexto(nome)}|${mes}`) ?? null))
  return out
}
