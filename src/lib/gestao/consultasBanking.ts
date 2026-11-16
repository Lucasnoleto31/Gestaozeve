// Receitas do BTG fora dos lotes já gravadas (só servidor): o Banking (planilha "DW" da Delta) e os
// produtos fora do giro do fechamento principal. Cada mês de cada fonte é uma importação protegida da
// corretora, sem lotes, com detalhes.banking ou detalhes.fora_giro (grupos, totais e as linhas da planilha).
import type { Corretora } from '@/lib/corretoras'
import { equipe, falha, str } from './guard'
import { bankingPorMes, lerExtraGravado, type BankingDoMes, type FonteExtra } from './banking'

type Row = Record<string, unknown>

export type ExtraAplicado = { id: string; nome_arquivo: string; created_at: string; criado_por_nome: string | null; fonte: FonteExtra; dados: BankingDoMes }

// Os meses gravados das duas fontes, do lançamento mais recente para o mais antigo
export async function extrasAplicados(corretora: Corretora, limite = 240): Promise<ExtraAplicado[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('importacoes').select('id, nome_arquivo, created_at, criado_por_nome, detalhes')
    .eq('corretora', corretora).eq('tipo', 'lotes').eq('protegida', true).or('detalhes->banking.not.is.null,detalhes->fora_giro.not.is.null')
    .order('created_at', { ascending: false }).limit(limite)
  if (error) falha(error, 'importacoes')
  const out: ExtraAplicado[] = []
  for (const r of (data ?? []) as Row[]) {
    const extra = lerExtraGravado(r.detalhes)
    if (extra) out.push({ id: String(r.id), nome_arquivo: String(r.nome_arquivo ?? ''), created_at: String(r.created_at), criado_por_nome: str(r.criado_por_nome), ...extra })
  }
  return out
}

// Um mês por fonte: 'AAAA-MM-01' → o registro mais recente daquela fonte
export const extrasPorMes = (extras: ExtraAplicado[], fonte: FonteExtra): Map<string, BankingDoMes> =>
  bankingPorMes(extras.filter(e => e.fonte === fonte).map(e => e.dados))
