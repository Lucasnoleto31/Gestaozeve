// Produtos fora de WIN/WDO que podem ter tarifa própria por lote (supabase-s16).
// A chave é o prefixo de 3 caracteres do ativo (contratos_produto): 'BITZ26' → 'BIT'.
export const PRODUTOS_OUTROS: { id: string; label: string }[] = [
  { id: 'IND', label: 'IND · Índice cheio' },
  { id: 'DOL', label: 'DOL · Dólar cheio' },
  { id: 'BIT', label: 'BIT · Bitcoin' },
  { id: 'WSP', label: 'WSP · S&P 500 mini' },
  { id: 'CCM', label: 'CCM · Milho' },
  { id: 'BGI', label: 'BGI · Boi gordo' },
  { id: 'SOL', label: 'SOL · Soja' },
  { id: 'ETR', label: 'ETR · Ethereum' },
  { id: 'DI1', label: 'DI1 · Juros' },
  { id: 'GLD', label: 'GLD · Ouro' },
  { id: 'OUTRO', label: 'Outros (sem prefixo reconhecido)' },
]
