// Leituras do calendário do Funil (aba Calendário). Só servidor. As contas ficam em calendario.ts.
import type { Corretora } from '@/lib/corretoras'
import { equipe, falha, str } from './guard'
import { clientesLista, giroDiario } from './consultas'
import { somarMeses, type MesRef } from './meses'
import { quemParou, type FechadoDia, type ParouDia } from './calendario'

type Row = Record<string, unknown>
const PAGINA = 10000

// Leads fechados (Ganho e Perdido) com a data de fechamento do mês `desde` até o fim do mês `ate`. É o
// mesmo critério dos cartões "Ganhos" e "Perdidos" da aba Mês, então os totais do calendário batem com eles.
// Lead fechado sem data de fechamento não aparece em nenhum dia (já não entrava nos cartões).
export async function leadsFechados(desde: MesRef, ate: MesRef): Promise<{ ganhos: FechadoDia[]; perdidos: FechadoDia[] }> {
  const { db } = await equipe()
  const { data, error } = await db.from('leads').select('id, nome, whatsapp, responsavel, status, motivo_perda, data_fechamento')
    .in('status', ['Ganho', 'Perdido']).gte('data_fechamento', desde).lt('data_fechamento', somarMeses(ate, 1)).order('nome').range(0, PAGINA - 1)
  if (error) falha(error, 'leads')
  const ganhos: FechadoDia[] = [], perdidos: FechadoDia[] = []
  for (const r of (data ?? []) as Row[]) {
    const item: FechadoDia = { id: String(r.id), dia: String(r.data_fechamento).slice(0, 10), nome: String(r.nome ?? ''), whatsapp: str(r.whatsapp), responsavel: str(r.responsavel), motivo: str(r.motivo_perda) }
    if (r.status === 'Ganho') ganhos.push(item); else perdidos.push(item)
  }
  return { ganhos, perdidos }
}

export type ClientesParados = {
  parados: ParouDia[]
  ultimas: { corretora: Corretora; dia: string | null }[]   // até que dia há lote lançado em cada corretora
}

// Clientes que pararam de girar desde `desde`, nas corretoras pedidas: o último dia com lote de cada um
// (clientes_lista com o mês de referência atual, para valer o último giro de verdade, não o de um mês
// passado) e os pregões da corretora desde então (giro_diario), para medir há quantos pregões está parado.
export async function clientesQuePararam(corretoras: Corretora[], desde: string, hoje: string, minimo: number): Promise<ClientesParados> {
  const partes = await Promise.all(corretoras.map(async corretora => {
    const [clientes, giro] = await Promise.all([clientesLista(corretora, null), giroDiario(corretora, desde, hoje)])
    const pregoes = giro.filter(g => g.lotes > 0).map(g => g.dia.slice(0, 10)).sort()
    return { corretora, parados: quemParou(clientes, corretora, pregoes, desde, minimo), ultima: pregoes.at(-1) ?? null }
  }))
  return {
    parados: partes.flatMap(p => p.parados).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    ultimas: partes.map(p => ({ corretora: p.corretora, dia: p.ultima })),
  }
}
