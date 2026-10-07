export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexto } from '@/lib/gestao/pagina'
import { equipe } from '@/lib/gestao/guard'
import { operacoesDoDia } from '@/lib/gestao/consultas'
import { ehIso } from '@/lib/gestao/meses'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { dataPt } from '@/components/gestao/Celulas'
import { DiaPicker, OperacoesDia } from './OperacoesDia'

type ParamsDia = Promise<{ corretora: string; dia: string }>
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Chave curta pra remontar o editor quando os valores gravados mudam (depois de salvar)
function versaoDe(partes: string[]): string {
  let h = 0
  for (const p of partes) for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) | 0
  return `${partes.length}-${h}`
}

export default async function OperacoesDoDiaPage({ params }: { params: ParamsDia }) {
  const ctx = await contexto(params)
  const { dia } = await params
  if (!ehIso(dia)) notFound()
  const { profile } = await equipe()
  const linhas = await operacoesDoDia(ctx.corretora, dia)
  const versao = versaoDe(linhas.map(o => `${o.id}:${o.tarifa}:${o.tarifa_manual ?? ''}`))
  const diaSemana = DIAS[new Date(dia + 'T12:00:00').getDay()]

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title={`Operações de ${dataPt(dia)}`}
        description={
          <>
            {diaSemana} · cada linha do relatório desse dia com a corretagem em uso. Ajuste a corretagem de uma operação quando o cliente foi cobrado diferente do cadastro.{' '}
            <Link href={`${ctx.base}/lotes`} className="text-accent hover:underline">Voltar ao giro diário</Link>
          </>
        }
        actions={<DiaPicker base={ctx.base} dia={dia} />}
      />
      <PageBody>
        <OperacoesDia key={versao} corretora={ctx.corretora} dia={dia} linhas={linhas} admin={profile.role === 'admin'} />
      </PageBody>
    </>
  )
}
