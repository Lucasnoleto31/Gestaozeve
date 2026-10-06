export type Role = 'admin' | 'vendedor' | 'influenciador'

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
