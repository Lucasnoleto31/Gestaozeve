'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet, Users, BarChart3 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { lerArquivo } from '@/lib/gestao/lerArquivo'
import { lerClientes, lerLotes, resumoLotes, type ClienteImport, type LoteImport } from '@/lib/gestao/planilhas'
import { cancelarImportacaoLotes, concluirImportacaoLotes, enviarLotes, importarClientes, iniciarImportacaoLotes, prepararLotes } from '@/lib/gestao/acoes'
import { dataPt, n0 } from '@/components/gestao/Celulas'
import type { Corretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

type Tipo = 'clientes' | 'lotes'
type Estado =
  | { fase: 'vazio' }
  | { fase: 'lendo' }
  | { fase: 'erro'; erro: string }
  | { fase: 'clientes'; nome: string; linhas: ClienteImport[]; faltando: string[]; cabecalhos: string[] }
  | { fase: 'lotes'; nome: string; linhas: LoteImport[]; faltando: string[]; cabecalhos: string[]; resumo: ReturnType<typeof resumoLotes>; existentes: { linhas: number; importacoes: string[] } | null }
  | { fase: 'enviando'; progresso: number; total: number; texto: string }
  | { fase: 'pronto'; texto: string; detalhes: string[] }

const BLOCO = 2500

export function Importador({ corretora, label, modoZeragem }: { corretora: Corretora; label: string; modoZeragem: string }) {
  const router = useRouter()
  const { avisar } = useToast()
  const [tipo, setTipo] = useState<Tipo>('lotes')
  const [estado, setEstado] = useState<Estado>({ fase: 'vazio' })
  const [modo, setModo] = useState<'completar' | 'substituir' | 'acrescentar'>('completar')

  const escolher = async (file: File | null) => {
    if (!file) return
    setEstado({ fase: 'lendo' })
    try {
      const { dados } = await lerArquivo(file)
      if (tipo === 'clientes') {
        const r = lerClientes(dados)
        if (!r.ok) { setEstado({ fase: 'erro', erro: r.erro }); return }
        setEstado({ fase: 'clientes', nome: file.name, linhas: r.linhas, faltando: r.faltando, cabecalhos: r.cabecalhos })
      } else {
        const r = lerLotes(dados, modoZeragem)
        if (!r.ok) { setEstado({ fase: 'erro', erro: r.erro }); return }
        const resumo = resumoLotes(r.linhas, modoZeragem)
        setEstado({ fase: 'lotes', nome: file.name, linhas: r.linhas, faltando: r.faltando, cabecalhos: r.cabecalhos, resumo, existentes: null })
        if (resumo.dataMin) {
          const ex = await prepararLotes(corretora, resumo.dataMin, resumo.dataMax)
          if (ex.ok) {
            setEstado(e => (e.fase === 'lotes' ? { ...e, existentes: ex.dados } : e))
            setModo(ex.dados.linhas > 0 ? 'substituir' : 'acrescentar')
          }
        }
      }
    } catch (e) {
      setEstado({ fase: 'erro', erro: e instanceof Error ? e.message : 'Não consegui ler o arquivo' })
    }
  }

  const importarClientesAgora = async () => {
    if (estado.fase !== 'clientes') return
    const { nome, linhas } = estado
    setEstado({ fase: 'enviando', progresso: 0, total: linhas.length, texto: 'Enviando cadastro…' })
    const r = await importarClientes(corretora, nome, linhas)
    if (!r.ok) { setEstado({ fase: 'erro', erro: r.erro }); return }
    const d = r.dados
    setEstado({ fase: 'pronto', texto: `Cadastro importado: ${fmtNum(d.linhas)} linhas lidas.`, detalhes: [
      `Casados com clientes já cadastrados: ${fmtNum(d.porCpf)} por CPF/CNPJ · ${fmtNum(d.porConta)} pela conta · ${fmtNum(d.porTelefone)} pelo telefone · ${fmtNum(d.porNome)} pelo nome`,
      `${fmtNum(d.clientesNovos)} clientes novos · ${fmtNum(d.contasNovas)} contas novas · ${fmtNum(d.contasAtualizadas)} contas atualizadas${d.semConta ? ` · ${fmtNum(d.semConta)} linhas sem conta (só completaram o cadastro)` : ''}`,
      'Contas principais, vínculos dos lotes e leads foram recalculados.',
    ] })
    avisar({ titulo: 'Cadastro importado', detalhe: `${fmtNum(d.clientesNovos)} clientes novos · ${fmtNum(d.contasNovas)} contas novas`, tom: 'gain' })
    router.refresh()
  }

  const importarLotesAgora = async () => {
    if (estado.fase !== 'lotes') return
    const { nome, linhas, resumo } = estado
    setEstado({ fase: 'enviando', progresso: 0, total: linhas.length, texto: modo === 'substituir' ? 'Substituindo o período…' : modo === 'completar' ? 'Conferindo os dias já lançados…' : 'Preparando…' })
    const ini = await iniciarImportacaoLotes(corretora, nome, resumo.dataMin, resumo.dataMax, modo)
    if (!ini.ok) { setEstado({ fase: 'erro', erro: ini.erro }); return }
    const { importacaoId, removidas, diasExistentes, diasProtegidos } = ini.dados
    // completar: só os dias que ainda não têm lançamento entram; em qualquer modo, os dias com
    // ajuste de fechamento (importação protegida) ficam como estão
    const pular = new Set([...(modo === 'completar' ? diasExistentes : []), ...diasProtegidos])
    const envio = linhas.filter(l => !pular.has(l.data))
    const diasIgnorados = [...new Set(linhas.filter(l => pular.has(l.data)).map(l => l.data))].sort()
    const lista = (dias: string[]) => dias.map(dataPt).join(', ')
    if (envio.length === 0) {
      await cancelarImportacaoLotes(corretora, importacaoId)
      setEstado({ fase: 'pronto', texto: 'Nada a importar: todos os dias do arquivo já estavam lançados.', detalhes: [
        `Dias no arquivo: ${lista(diasIgnorados)}. Para refazer algum dia, use "Substituir o período".`,
      ] })
      return
    }
    const parcial = resumoLotes(envio, modoZeragem)
    let inseridas = 0
    for (let i = 0; i < envio.length; i += BLOCO) {
      setEstado({ fase: 'enviando', progresso: i, total: envio.length, texto: `Enviando lotes… ${fmtNum(Math.min(i + BLOCO, envio.length))} de ${fmtNum(envio.length)}` })
      const r = await enviarLotes(corretora, importacaoId, envio.slice(i, i + BLOCO))
      if (!r.ok) {
        await cancelarImportacaoLotes(corretora, importacaoId)
        setEstado({ fase: 'erro', erro: `${r.erro}. A importação foi desfeita; nada ficou pela metade.` })
        return
      }
      inseridas += r.dados.inseridas
    }
    setEstado({ fase: 'enviando', progresso: envio.length, total: envio.length, texto: 'Concluindo…' })
    const fim = await concluirImportacaoLotes(corretora, importacaoId, { linhas: linhas.length, inseridas, ignoradas: linhas.length - envio.length, operados: parcial.operados, zerados: parcial.zerados, diasIgnorados })
    if (!fim.ok) { setEstado({ fase: 'erro', erro: fim.erro }); return }
    const faltando = fim.dados.diasFaltando
    const diasNovos = [...new Set(envio.map(l => l.data))].sort()
    setEstado({ fase: 'pronto', texto: `Lotes importados: ${fmtNum(inseridas)} linhas de ${dataPt(parcial.dataMin)} a ${dataPt(parcial.dataMax)}.`, detalhes: [
      `${fmtNum(parcial.operados)} lotes operados · ${fmtNum(parcial.zerados)} contratos zerados`,
      modo === 'completar'
        ? `${fmtNum(diasNovos.length)} ${diasNovos.length === 1 ? 'dia novo gravado' : 'dias novos gravados'}: ${lista(diasNovos)}`
        : modo === 'substituir' ? `${fmtNum(removidas)} linhas antigas do período foram substituídas` : 'Linhas acrescentadas às já existentes',
      ...(diasIgnorados.length ? [`${fmtNum(diasIgnorados.length)} ${diasIgnorados.length === 1 ? 'dia já lançado ficou como estava' : 'dias já lançados ficaram como estavam'}: ${lista(diasIgnorados)}`] : []),
      ...(faltando.length ? [`Atenção: o arquivo não trouxe lançamentos em ${lista(faltando)}, que existiam antes e saíram com a substituição. Se esses dias tinham giro, importe-os de novo com "Completar".`] : []),
      'Vínculo com clientes, tarifas, zeragem e pontos recalculados.',
    ] })
    avisar({ titulo: 'Lotes importados', detalhe: `${fmtNum(inseridas)} linhas · ${fmtNum(parcial.operados)} lotes`, tom: 'gain' })
    router.refresh()
  }

  const ocupado = estado.fase === 'lendo' || estado.fase === 'enviando'

  return (
    <Panel variant="card" title="Nova importação" subtitle={`Escolha o tipo e o arquivo (.xlsx, .xls ou .csv exportado da ${label}).`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg">
          <button type="button" data-active={tipo === 'lotes'} disabled={ocupado} onClick={() => { setTipo('lotes'); setEstado({ fase: 'vazio' }) }}><BarChart3 className="h-4 w-4" aria-hidden />Lotes (export)</button>
          <button type="button" data-active={tipo === 'clientes'} disabled={ocupado} onClick={() => { setTipo('clientes'); setEstado({ fase: 'vazio' }) }}><Users className="h-4 w-4" aria-hidden />Clientes (cadastro)</button>
        </div>
        <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-line-strong px-4 text-body text-fg-muted hover:bg-surface-2 hover:text-fg', ocupado && 'pointer-events-none opacity-50')}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          Escolher arquivo…
          <input type="file" accept=".xlsx,.xls,.csv,.txt" className="sr-only" disabled={ocupado} onChange={e => { escolher(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </label>
      </div>
      <p className="mb-4 text-label text-fg-subtle">
        {tipo === 'lotes'
          ? 'Colunas aceitas: Sinacor/CD_CONTA_COM_DIGITO, Data/DATA_CONTRATO, Ativo, Qtd. Contratos, Modo, Plataforma, Assessor, ID_CLIENTE, NOME_CLIENTE…'
          : 'Export de clientes (DT_PARTITION … ID_ASSESSOR) ou a sua própria lista (Nome, CPF, Telefone, Conta…). Cada linha é casada por CPF → conta → telefone → nome; Parceiro, Data de Entrada, Observações e Motivo da Recusa também entram.'}
      </p>

      {estado.fase === 'lendo' && <Alert tone="neutral">Lendo o arquivo…</Alert>}
      {estado.fase === 'erro' && <Alert tone="loss" title="Não importado">{estado.erro}</Alert>}
      {estado.fase === 'pronto' && (
        <Alert tone="gain" title={estado.texto}>
          <ul className="list-disc pl-4">{estado.detalhes.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </Alert>
      )}
      {estado.fase === 'enviando' && (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-dense text-fg-muted">{estado.texto}</p>
          <div className="bar-track h-1.5"><div className="bar-fill" style={{ width: `${estado.total ? (estado.progresso / estado.total) * 100 : 0}%` }} /></div>
        </div>
      )}

      {estado.fase === 'clientes' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Resumo label="Arquivo" valor={estado.nome} />
            <Resumo label="Linhas" valor={fmtNum(estado.linhas.length)} />
            <Resumo label="Com conta" valor={fmtNum(estado.linhas.filter(l => l.conta).length)} sub={estado.linhas.some(l => !l.conta) ? `${fmtNum(estado.linhas.filter(l => !l.conta).length)} sem conta` : undefined} />
            <Resumo label="Com CPF/CNPJ" valor={fmtNum(estado.linhas.filter(l => l.documento).length)} />
            <Resumo label="Com telefone" valor={fmtNum(estado.linhas.filter(l => l.telefone).length)} />
            <Resumo label="Campos manuais" valor={estado.linhas.some(l => l.data_entrada || l.parceiro || l.observacoes || l.motivo_recusa) ? 'sim' : 'não vieram'} />
          </div>
          {estado.faltando.length > 0 && <Alert tone="warn" title="Colunas não encontradas (vão ficar em branco)">{estado.faltando.join(', ')}</Alert>}
          <Previa cabecalhos={['Conta', 'Nome', 'CPF/CNPJ', 'Assessor', 'Situação', 'Migração', 'Telefone']} linhas={estado.linhas.slice(0, 5).map(l => [l.conta, l.nome, l.documento, l.assessor, l.situacao_conta, dataPt(l.data_habilitacao), l.telefone])} />
          <p className="text-label text-fg-muted">Quem já existe é completado (campo vazio não apaga); quem não existe entra como cliente novo. Linhas com conta criam/atualizam a conta e ligam os lotes dela.</p>
          <div className="flex gap-2">
            <Button onClick={importarClientesAgora}>Importar {fmtNum(estado.linhas.length)} linhas</Button>
            <Button variant="ghost" onClick={() => setEstado({ fase: 'vazio' })}>Cancelar</Button>
          </div>
        </div>
      )}

      {estado.fase === 'lotes' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Resumo label="Arquivo" valor={estado.nome} />
            <Resumo label="Linhas" valor={fmtNum(estado.resumo.linhas)} />
            <Resumo label="Período" valor={`${dataPt(estado.resumo.dataMin)} a ${dataPt(estado.resumo.dataMax)}`} sub={`${estado.resumo.dias} dias com giro`} />
            <Resumo label="Lotes operados" valor={fmtNum(estado.resumo.operados)} />
            <Resumo label="Zerados" valor={fmtNum(estado.resumo.zerados)} sub={estado.cabecalhos.some(c => /zerados/i.test(c)) ? 'coluna "Lotes Zerados"' : `MODO contém "${modoZeragem}"`} />
            <Resumo label="Contas distintas" valor={fmtNum(estado.resumo.contas)} sub={estado.resumo.repetidas ? `${fmtNum(estado.resumo.repetidas)} linhas idênticas` : undefined} />
          </div>
          {estado.faltando.length > 0 && <Alert tone="warn" title="Colunas não encontradas">{estado.faltando.join(', ')}</Alert>}
          {estado.linhas.some(l => l.documento)
            ? <Previa cabecalhos={['Data', 'Conta', 'CPF/CNPJ', 'Cliente (relatório)', 'Ativo', 'Modo', 'Qtd', 'Plataforma']} linhas={estado.linhas.slice(0, 5).map(l => [dataPt(l.data), l.conta, l.documento, l.nome_cliente, l.ativo, l.modo, n0(l.qtd), l.plataforma])} />
            : <Previa cabecalhos={['Data', 'Conta', 'Cliente (relatório)', 'Assessor', 'Ativo', 'Modo', 'Qtd', 'Plataforma']} linhas={estado.linhas.slice(0, 5).map(l => [dataPt(l.data), l.conta, l.nome_cliente, l.assessor, l.ativo, l.modo, n0(l.qtd), l.plataforma])} />}

          {estado.existentes == null ? (
            <p className="text-label text-fg-subtle">Conferindo o que já existe nesse período…</p>
          ) : estado.existentes.linhas > 0 ? (
            <Alert tone="warn" title={`Já existem ${fmtNum(estado.existentes.linhas)} linhas lançadas entre ${dataPt(estado.resumo.dataMin)} e ${dataPt(estado.resumo.dataMax)}`}>
              {estado.existentes.importacoes.length > 0 && <p>Importações nesse período: {estado.existentes.importacoes.join(' · ')}</p>}
            </Alert>
          ) : (
            <Alert tone="gain">Nenhum lote lançado nesse período ainda.</Alert>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-dense', modo === 'completar' ? 'border-accent bg-accent-soft' : 'border-line')}>
              <input type="radio" className="mt-1" checked={modo === 'completar'} onChange={() => setModo('completar')} />
              <span><span className="font-medium">Completar</span> <span className="text-micro text-fg-subtle">(recomendado)</span><br /><span className="text-label text-fg-muted">Grava só os dias que ainda não têm lançamento; o que já existe fica como está. Serve para o relatório que chega sempre com os dias anteriores junto.</span></span>
            </label>
            <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-dense', modo === 'substituir' ? 'border-accent bg-accent-soft' : 'border-line')}>
              <input type="radio" className="mt-1" checked={modo === 'substituir'} onChange={() => setModo('substituir')} />
              <span><span className="font-medium">Substituir o período</span><br /><span className="text-label text-fg-muted">Apaga o que já existe entre {dataPt(estado.resumo.dataMin)} e {dataPt(estado.resumo.dataMax)} e grava o arquivo inteiro. É o jeito seguro de recolar um export atualizado.</span></span>
            </label>
            <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-dense', modo === 'acrescentar' ? 'border-accent bg-accent-soft' : 'border-line')}>
              <input type="radio" className="mt-1" checked={modo === 'acrescentar'} onChange={() => setModo('acrescentar')} />
              <span><span className="font-medium">Acrescentar</span><br /><span className="text-label text-fg-muted">Grava todas as linhas por cima do que já existe (use só quando o arquivo traz dias novos). Linhas repetidas viram lotes duplicados.</span></span>
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={importarLotesAgora} disabled={estado.existentes == null}>Importar {fmtNum(estado.resumo.linhas)} linhas</Button>
            <Button variant="ghost" onClick={() => setEstado({ fase: 'vazio' })}>Cancelar</Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Resumo({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <p className="label">{label}</p>
      <p className="truncate text-dense font-semibold text-fg" title={valor}>{valor}</p>
      {sub && <p className="text-micro text-fg-subtle">{sub}</p>}
    </div>
  )
}

function Previa({ cabecalhos, linhas }: { cabecalhos: string[]; linhas: (string | null)[][] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl tbl-dense">
        <thead><tr>{cabecalhos.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i}>{l.map((v, j) => <td key={j} className="max-w-[220px] truncate">{v || '—'}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
