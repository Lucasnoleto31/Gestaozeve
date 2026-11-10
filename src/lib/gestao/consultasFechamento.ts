// Leituras do fechamento mensal do BTG (só servidor): os fechamentos já aplicados pela tela, que são
// importações protegidas com o retrato do que mudou (para desfazer).
import type { Corretora } from '@/lib/corretoras'
import { equipe, falha, num, str } from './guard'

type Row = Record<string, unknown>

export type FechamentoAplicado = {
  id: string
  nome_arquivo: string
  created_at: string
  criado_por_nome: string | null
  mes: string                  // 'YYYY-MM-01'
  origem: string | null        // nome da planilha do fechamento
  ajustadas: number            // operações com corretagem manual gravada
  inseridas: number            // lançamentos que faltavam
  pct: number | null           // % de comissão do mês gravado em repasse_pct_mes
}

export async function fechamentosAplicados(corretora: Corretora, limite = 24): Promise<FechamentoAplicado[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('importacoes').select('id, nome_arquivo, created_at, criado_por_nome, detalhes')
    .eq('corretora', corretora).eq('tipo', 'lotes').eq('protegida', true).order('created_at', { ascending: false }).limit(limite)
  if (error) falha(error, 'importacoes')
  const out: FechamentoAplicado[] = []
  for (const r of (data ?? []) as Row[]) {
    const f = ((r.detalhes as Row | null)?.fechamento as Row | undefined)
    if (!f) continue
    out.push({
      id: String(r.id), nome_arquivo: String(r.nome_arquivo ?? ''), created_at: String(r.created_at), criado_por_nome: str(r.criado_por_nome),
      mes: String(f.mes ?? ''), origem: str(f.origem), ajustadas: num(f.ajustadas), inseridas: num(f.inseridas), pct: f.pct == null ? null : num(f.pct),
    })
  }
  return out
}
