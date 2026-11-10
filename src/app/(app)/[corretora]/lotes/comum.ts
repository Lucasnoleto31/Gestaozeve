// Partes comuns às abas do Giro diário (Agora · Período · Dia a dia)
import { importacoesLista } from '@/lib/gestao/consultas'
import { diaSemanaCurto, horaBrasil, momentoDaSubida } from '@/lib/gestao/mensagens'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import type { Corretora } from '@/lib/corretoras'

// Receita por lote, sempre com duas casas ('0,20'); sem lotes, o traço
export const porLote = (receita: number, lotes: number) =>
  (lotes > 0 ? (receita / lotes).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–')

export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
// 'ter 10/11'
export const diaCurto = (iso: string) => `${diaSemanaCurto(iso)} ${ddmm(iso)}`

// Em que ponto do dia está o último dia lançado: 'parcial 13h40' ou 'parcial, subida às 14:02' enquanto o
// pregão corre (a equipe sobe a planilha várias vezes no dia), 'dia completo' depois das 18h30 e null
// quando o último dia lançado já passou (o giro dele está fechado).
export async function momentoDoUltimoDia(corretora: Corretora, ultima: string | null): Promise<string | null> {
  if (!ultima || ultima !== fmtDate(hojeBrasil())) return null
  const subida = (await importacoesLista(corretora, 'lotes', 5)).find(i => String(i.data_max ?? '').slice(0, 10) === ultima)
  if (subida) return momentoDaSubida(subida.nome_arquivo, ultima, ultima, new Date(subida.created_at))
  return horaBrasil(new Date()) >= '18:30' ? 'dia completo' : 'parcial'
}

// O dia ainda não fechou: comparações com dias inteiros ficam sem cor
export const ehParcial = (momento: string | null) => momento != null && momento !== 'dia completo'
