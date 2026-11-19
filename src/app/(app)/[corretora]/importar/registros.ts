import type { Importacao } from '@/lib/gestao/tipos'

// O fechamento do BTG, o Banking e o fora do giro são gravados como importação do tipo "lotes" (protegida),
// com o retrato em detalhes.fechamento, detalhes.banking ou detalhes.fora_giro. Não são arquivos de lotes:
// a frase do topo pula esses registros e, no celular, o Histórico manda desfazê-los no lugar próprio.
export const ehRegistroDoFechamento = (i: Importacao) =>
  i.tipo === 'lotes' && !!i.detalhes && (i.detalhes.fechamento != null || i.detalhes.banking != null || i.detalhes.fora_giro != null)
