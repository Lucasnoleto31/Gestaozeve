export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { dadosDaFila } from '@/lib/gestao/consultasFila'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { MinhaFila } from './MinhaFila'

export default async function FilaPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor' && profile.role !== 'atendente')) redirect('/dashboard')
  const dados = await dadosDaFila()

  return (
    <>
      <PageHeader
        eyebrow="Equipe"
        title="Minha fila"
        description={dados.restrito
          ? 'O que você tem para fazer hoje com os seus leads: retornos combinados, leads novos sem contato e leads parados.'
          : 'O que cada pessoa tem para fazer hoje: retornos combinados, leads novos e parados, clientes em risco sem contato e contas da campanha ainda não chamadas.'}
      />
      <PageBody>
        {dados.semS59 && (
          <Alert tone="warn" title="Próximo contato ainda não ativado no banco">
            Rode a S59 no Supabase para combinar retornos; até lá a fila mostra só leads sem contato, leads parados, clientes em risco e campanha.
          </Alert>
        )}
        <MinhaFila {...dados} />
      </PageBody>
    </>
  )
}
