// Receita de Banking gravada (só servidor): cada mês é uma importação protegida da corretora com
// detalhes.banking (grupos, totais e as linhas da planilha da Delta). Não tem lotes: fica fora do giro.
import type { Corretora } from '@/lib/corretoras'
import { equipe, falha, str } from './guard'
import { lerBankingGravado, type BankingDoMes } from './banking'

type Row = Record<string, unknown>

export type BankingAplicado = { id: string; nome_arquivo: string; created_at: string; criado_por_nome: string | null; banking: BankingDoMes }

// Os meses de Banking gravados, do lançamento mais recente para o mais antigo
export async function bankingAplicados(corretora: Corretora, limite = 120): Promise<BankingAplicado[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('importacoes').select('id, nome_arquivo, created_at, criado_por_nome, detalhes')
    .eq('corretora', corretora).eq('tipo', 'lotes').eq('protegida', true).not('detalhes->banking', 'is', null)
    .order('created_at', { ascending: false }).limit(limite)
  if (error) falha(error, 'importacoes')
  const out: BankingAplicado[] = []
  for (const r of (data ?? []) as Row[]) {
    const banking = lerBankingGravado((r.detalhes as Row | null)?.banking)
    if (banking) out.push({ id: String(r.id), nome_arquivo: String(r.nome_arquivo ?? ''), created_at: String(r.created_at), criado_por_nome: str(r.criado_por_nome), banking })
  }
  return out
}
