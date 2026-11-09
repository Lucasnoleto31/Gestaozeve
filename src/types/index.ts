// atendente = só a tela de Leads, com os leads em que ele é o responsável (sem comissões, funil nem clientes)
export type Role = 'admin' | 'vendedor' | 'atendente' | 'influenciador'

export interface Profile {
  id: string
  user_id: string
  nome: string
  email: string
  role: Role
  ativo: boolean
  created_at: string
  corretoras?: string[] | null   // corretoras que vê (NULL = todas)
}
