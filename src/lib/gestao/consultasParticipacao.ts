// Participação de parceiros na receita (parâmetro parceiros_receita): as leituras do banco.
// Só servidor (páginas). O cálculo e o formato da regra ficam em participacao.ts.
//
// Não há função no banco para isto: os lançamentos dos códigos do parceiro saem direto da tabela lotes
// (poucas centenas de linhas por mês) e são medidos com a mesma conta do resumo mensal; o incentivo de
// cada cliente vem de incentivo_mes, a mesma função da tela Incentivo, uma chamada por mês com lançamento.
import type { Corretora } from '@/lib/corretoras'
import { normTexto } from '@/lib/texto'
import { equipe, falha, num, str } from './guard'
import { incentivoMes, todasAsLinhas, ultimaData } from './consultas'
import {
  CHAVE_PARCEIROS_RECEITA, lerParceirosReceita, medirLote, receitaDoMes, regraDoMes, regrasDoParceiro,
  type LoteMedido, type MesReceita, type RegraReceita,
} from './participacao'

type Row = Record<string, unknown>

export type RegrasCorretora = { corretora: Corretora; regras: RegraReceita[] }

// As regras de participação na receita das corretoras pedidas (só as corretoras que têm alguma)
export async function regrasReceita(corretoras: Corretora[]): Promise<RegrasCorretora[]> {
  if (!corretoras.length) return []
  const { db } = await equipe()
  const { data, error } = await db.from('parametros').select('corretora, valor').eq('chave', CHAVE_PARCEIROS_RECEITA).in('corretora', corretoras)
  if (error) falha(error, 'parametros')
  const linhas = (data ?? []) as Row[]
  return corretoras
    .map(c => ({ corretora: c, regras: lerParceirosReceita(str(linhas.find(r => r.corretora === c)?.valor)) }))
    .filter(x => x.regras.length > 0)
}

// As regras de um parceiro, por corretora (só as corretoras em que ele tem regra)
export const regrasDoParceiroPorCorretora = (regras: RegrasCorretora[], parceiro: string): RegrasCorretora[] =>
  regras.map(r => ({ corretora: r.corretora, regras: regrasDoParceiro(r.regras, parceiro) })).filter(r => r.regras.length > 0)

export type ParticipacaoReceita = {
  parceiro: string
  corretora: Corretora
  regras: RegraReceita[]      // as do parceiro nesta corretora, da mais antiga para a mais nova
  assessores: string[]        // códigos de assessor ligados ao parceiro (Parâmetros › Assessores)
  clientes: number            // clientes cadastrados nesses códigos
  meses: MesReceita[]         // um por mês com lançamento desde o início da regra, em ordem
  ultimaData: string | null   // último dia lançado na corretora
}

const COLUNAS_LOTE = 'data, chave_incentivo, cliente_id, conta, nome_cliente, qtd, tarifa, zeragem_rs, multiplicador, zeragem, posicao, acoes'

// Tudo o que o parceiro gerou numa corretora desde o início da regra dele, mês a mês e cliente a cliente
export async function participacaoReceita(corretora: Corretora, regrasDaCorretora: RegraReceita[], parceiro: string): Promise<ParticipacaoReceita> {
  const { db } = await equipe()
  const regras = regrasDoParceiro(regrasDaCorretora, parceiro)
  const base: ParticipacaoReceita = { parceiro, corretora, regras, assessores: [], clientes: 0, meses: [], ultimaData: null }
  if (!regras.length) return base

  const ultimaP = ultimaData(corretora)
  const { data: ass, error } = await db.from('assessores').select('nome, nome_norm, parceiro').eq('corretora', corretora).not('parceiro', 'is', null)
  if (error) falha(error, 'assessores')
  const meus = ((ass ?? []) as Row[]).filter(a => normTexto(String(a.parceiro ?? '')) === normTexto(parceiro))
  if (!meus.length) return { ...base, ultimaData: await ultimaP }
  const codigos = meus.map(a => String(a.nome_norm))

  const [brutos, contas, ultima] = await Promise.all([
    todasAsLinhas<Row>((de, ate) => db.from('lotes').select(COLUNAS_LOTE).eq('corretora', corretora).in('assessor_norm', codigos)
      .eq('conta_para_receita', true).gte('data', regras[0].desde).order('id').range(de, ate), 'lotes'),
    db.from('contas').select('cliente_id').eq('corretora', corretora).in('assessor_norm', codigos).range(0, 9999),
    ultimaP,
  ])
  if (contas.error) falha(contas.error, 'contas')

  const porMes = new Map<string, LoteMedido[]>()
  for (const r of brutos) {
    const l = medirLote({
      data: String(r.data), chave_incentivo: str(r.chave_incentivo), cliente_id: str(r.cliente_id), conta: str(r.conta), nome_cliente: str(r.nome_cliente),
      qtd: num(r.qtd), tarifa: num(r.tarifa), zeragem_rs: num(r.zeragem_rs), multiplicador: num(r.multiplicador),
      zeragem: r.zeragem === true, posicao: r.posicao === true, acoes: r.acoes === true,
    })
    const lista = porMes.get(l.mes)
    if (lista) lista.push(l); else porMes.set(l.mes, [l])
  }
  const meses = await Promise.all([...porMes.keys()].sort().map(async mes => {
    const regra = regraDoMes(regras, mes)
    return regra ? receitaDoMes(mes, porMes.get(mes) ?? [], await incentivoMes(corretora, mes), regra) : null
  }))

  return {
    ...base, assessores: meus.map(a => String(a.nome)).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    clientes: new Set(((contas.data ?? []) as Row[]).map(c => str(c.cliente_id)).filter(Boolean)).size,
    meses: meses.filter((m): m is MesReceita => m != null), ultimaData: ultima,
  }
}
