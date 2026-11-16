import { notFound, redirect } from 'next/navigation'
import { corretoraDoSlug } from '@/lib/corretoras'
import { GRUPOS_DISTRIBUIR, hrefDistribuir, type TipoOportunidade } from '@/lib/gestao/oportunidades'

// Oportunidades virou a aba "Distribuir" da Fila (redesenho de nov/26: uma tela só para o trabalho do dia).
// O endereço antigo continua abrindo: /btg/oportunidades?aba=reativar leva a /fila?aba=distribuir&corretora=BTG&grupo=reativar.
// As permissões são as da Fila (o atendente não vê a aba Distribuir e cai na fila dele).
export default async function OportunidadesPage({ params, searchParams }: { params: Promise<{ corretora: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const corretora = corretoraDoSlug((await params).corretora)
  if (!corretora) notFound()
  const aba = (await searchParams).aba
  const grupo: TipoOportunidade = typeof aba === 'string' && GRUPOS_DISTRIBUIR.includes(aba as TipoOportunidade) ? (aba as TipoOportunidade) : 'risco'
  redirect(hrefDistribuir(corretora, grupo))
}
