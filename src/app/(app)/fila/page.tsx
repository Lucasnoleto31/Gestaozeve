export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getProfile } from '@/lib/auth/getProfile'
import { dadosDaFila } from '@/lib/gestao/consultasFila'
import { CORRETORA_COOKIE, corretoraDoSlug, corretorasDoPerfil, isCorretora, type Corretora } from '@/lib/corretoras'
import { GRUPOS_DISTRIBUIR, type TipoOportunidade } from '@/lib/gestao/oportunidades'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Abas } from '@/components/gestao/Abas'
import { MeusPontos } from '@/components/gestao/MeusPontos'
import { MinhaFila } from './MinhaFila'
import { Distribuir } from './Distribuir'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'

// A Fila: uma tela só para o trabalho do dia. Antes eram duas (Minha fila e Oportunidades, uma por
// corretora) que "pareciam fazer a mesma coisa" (Lucas, nov/26).
//  - Hoje: o que fazer agora, em ordem de prioridade; cada tarefa com o motivo numa frase e os botões.
//  - Distribuir (?aba=distribuir&corretora=BTG&grupo=reativar): os grupos que eram as abas de Oportunidades,
//    para mandar contas a um atendente. Só administrador e vendedor; o atendente vê só a fila dele.
// As rotas /btg/oportunidades e /genial/oportunidades redirecionam para a aba Distribuir.
export default async function FilaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor' && profile.role !== 'atendente')) redirect('/dashboard')
  const sp = await searchParams
  const q = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const corretoras = corretorasDoPerfil(profile)
  const podeDistribuir = profile.role !== 'atendente' && corretoras.length > 0
  const aba = podeDistribuir && q('aba') === 'distribuir' ? 'distribuir' : 'hoje'
  const abas = podeDistribuir
    ? <Abas caminho="/fila" query={{}} valor={aba} padrao="hoje" rotulo="Seções da fila" opcoes={[{ valor: 'hoje', label: 'Hoje' }, { valor: 'distribuir', label: 'Distribuir' }]} />
    : null

  if (aba === 'distribuir') {
    // a corretora vem do endereço (BTG ou btg); sem ela, vale a última aberta, se a pessoa pode vê-la
    const pedida = q('corretora')
    const doEndereco: Corretora | null = isCorretora(pedida.toUpperCase()) ? (pedida.toUpperCase() as Corretora) : corretoraDoSlug(pedida)
    const ultima = (await cookies()).get(CORRETORA_COOKIE)?.value ?? ''
    const corretora = [doEndereco, isCorretora(ultima) ? ultima : null].find((c): c is Corretora => !!c && corretoras.includes(c)) ?? corretoras[0]
    const grupo: TipoOportunidade = GRUPOS_DISTRIBUIR.includes(q('grupo') as TipoOportunidade) ? (q('grupo') as TipoOportunidade) : 'risco'
    return (
      <>
        <PageHeader eyebrow="Equipe" title="Minha fila">{abas}</PageHeader>
        <PageBody><Distribuir corretora={corretora} corretoras={corretoras} grupo={grupo} /></PageBody>
      </>
    )
  }

  const dados = await dadosDaFila()
  return (
    <>
      <PageHeader eyebrow="Equipe" title="Minha fila">{abas}</PageHeader>
      {/* No celular a tela abre pela frase da fila (em MinhaFila, que sobe pela ordem): os blocos viram
          uma coluna para a ordem poder mudar sem mexer no computador */}
      <PageBody className="max-md:flex max-md:flex-col">
        {dados.semS59 && (
          <Alert tone="warn" title="Próximo contato ainda não ativado no banco" className="max-md:-order-2">
            Rode a S59 no Supabase para combinar retornos; até lá a fila mostra só leads sem contato, leads parados, clientes em risco e campanha.
          </Alert>
        )}
        {/* remuneração por níveis: só aparece para quem está no modelo, sem segurar a fila. No celular
            fica logo abaixo da frase, numa linha que abre no toque: a primeira tela é das tarefas */}
        {/* o bloco chega depois (Suspense) e não vem para quem não está no modelo: enquanto não houver a
            seção dentro, nada aparece e nada ocupa lugar, nem no computador */}
        <div className="hidden has-[section]:block max-md:-mt-3">
          <RecolheNoCelular tamanho="linha" titulo="Meus pontos">
            <Suspense fallback={null}><MeusPontos comLink={profile.role !== 'atendente'} /></Suspense>
          </RecolheNoCelular>
        </div>
        <MinhaFila {...dados} />
      </PageBody>
    </>
  )
}
