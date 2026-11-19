'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { Resumo } from '@/components/gestao/Resumo'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import {
  excluirAssessor, excluirConsolidado, excluirFaixa, excluirMultiplicador, excluirResponsavel, excluirStatusConta, excluirStatusLead,
  recalcularTudo, salvarAssessor, salvarConsolidado, salvarFaixa, salvarMultiplicador, salvarParametro, salvarResponsavel, salvarStatusConta, salvarStatusLead,
} from '@/lib/gestao/acoes'
import { salvarParceirosReceita } from '@/lib/gestao/acoesParticipacao'
import { CHAVE_PARCEIROS_RECEITA, lerParceirosReceita, nomesComRegra, textoDaRegra } from '@/lib/gestao/participacao'
import { mesLongo } from '@/lib/gestao/meses'
import { normTexto } from '@/lib/texto'
import type { parametrosDaCorretora } from '@/lib/gestao/consultas'
import type { AssessorParam, Resultado } from '@/lib/gestao/tipos'
import type { Corretora } from '@/lib/corretoras'
import { numeroBR } from '@/lib/gestao/planilhas'
import { n0, n2, r0, TRACO } from '@/components/gestao/Celulas'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

type Dados = Awaited<ReturnType<typeof parametrosDaCorretora>>

// Executa uma ação, avisa o resultado e recarrega a página
function useAcao() {
  const router = useRouter()
  const { avisar } = useToast()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const rodar = async (fn: () => Promise<Resultado<unknown>>, depois?: () => void, aviso = 'Salvo') => {
    setOcupado(true); setErro(null)
    const r = await fn()
    setOcupado(false)
    if (!r.ok) { setErro(r.erro); return false }
    depois?.()
    avisar({ titulo: aviso, tom: 'gain' })
    router.refresh()
    return true
  }
  return { erro, ocupado, rodar, limpar: () => setErro(null) }
}

// ── Celular (DESIGN.md §8) ─────────────────────────────────────────────────
// No celular a página tinha dez telas de altura: cada seção fica recolhida atrás do próprio título, com o
// que está valendo ao lado (o índice da página), e a explicação vai para o "i". No computador tudo aparece
// aberto, como sempre: o grid repassa a altura da linha ao cartão, para os pares lado a lado continuarem
// com a mesma altura.
function NoCelular({ titulo, resumo, dica, children }: { titulo: string; resumo?: ReactNode; dica?: string; children: ReactNode }) {
  return <RecolheNoCelular titulo={titulo} resumo={resumo} dica={dica} className="md:grid md:[&>div:last-child]:grid">{children}</RecolheNoCelular>
}
// o cartão dentro da seção recolhida: no celular a linha de toque já diz o nome, então o cabeçalho sai
const CARTAO_NO_CELULAR = { className: 'max-md:[&>header]:hidden', bodyClassName: 'max-md:pt-5' }
// tabela pequena que vira lista com só a lixeira à direita
const LISTA_LIXEIRA = { '--lista-direita': '3.5rem' } as CSSProperties
// "1 assessor", "2 assessores"
const qtd = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`
// a pendência em âmbar na linha do índice
const pendente = (texto: string) => <span className="text-warn">{texto}</span>

export function Parametros({ corretora, label, dados }: { corretora: Corretora; label: string; dados: Dados }) {
  // Quem pode ser o parceiro de um assessor: os comissionados e quem tem participação na receita desta corretora
  const regrasReceita = dados.parametros.find(p => p.chave === CHAVE_PARCEIROS_RECEITA)?.valor ?? ''
  const comissionados = dados.responsaveis.filter(r => r.ativo && r.comissionado).map(r => r.nome)
  const comReceita = nomesComRegra(lerParceirosReceita(regrasReceita)).filter(n => !comissionados.some(c => normTexto(c) === normTexto(n)))
  // a frase do celular: o aviso que a descrição da página dava ("toda mudança recalcula") e as pendências
  const semCadastro = dados.assessoresNaoCadastrados.length
  const semMapa = dados.situacoesNaoMapeadas.length
  const pendencias = [
    semCadastro ? `${qtd(semCadastro, 'assessor sem cadastro', 'assessores sem cadastro')}, em Assessores` : null,
    semMapa ? `${qtd(semMapa, 'situação sem mapa', 'situações sem mapa')}, em Status da conta` : null,
  ].filter((p): p is string => !!p)
  return (
    <div className="space-y-8 max-md:space-y-0">
      <div className="pb-3 md:hidden">
        {/* com pendência, ela é a conclusão (o que pede ação) e o aviso de recálculo desce para o apoio */}
        {pendencias.length
          ? <Resumo frase={`Pendente: ${pendencias.join('; ')}.`} apoio={`Regras de cálculo da ${label}. Toda mudança recalcula os lotes na hora.`} />
          : <Resumo frase={`Regras de cálculo da ${label}. Toda mudança recalcula os lotes na hora.`} />}
      </div>
      <div className="grid gap-5 xl:grid-cols-2 max-md:gap-0">
        <SecaoGerais corretora={corretora} label={label} parametros={dados.parametros} gerais={dados.gerais} />
        {corretora === 'BTG' ? <SecaoManutencao corretora={corretora} /> : (
          // no BTG a participação de parceiro segue a cadeia do repasse (cartão Repasse, mais abaixo)
          <div className="space-y-5 max-md:space-y-0">
            <SecaoManutencao corretora={corretora} />
            <SecaoParceirosReceita key={regrasReceita} corretora={corretora} label={label} valor={regrasReceita} />
          </div>
        )}
        {corretora === 'BTG' && <SecaoBtg corretora={corretora} label={label} parametros={dados.parametros} />}
      </div>
      <SecaoAssessores corretora={corretora} assessores={dados.assessores} naoCadastrados={dados.assessoresNaoCadastrados} responsaveis={dados.responsaveis.filter(r => r.ativo && r.atende_clientes).map(r => r.nome)} parceiros={[...comissionados, ...comReceita]} />
      <div className="grid gap-5 xl:grid-cols-2 max-md:gap-0">
        <SecaoStatusConta corretora={corretora} mapa={dados.statusConta} naoMapeadas={dados.situacoesNaoMapeadas} />
        <SecaoConsolidados corretora={corretora} itens={dados.consolidados} />
        <SecaoMultiplicadores corretora={corretora} itens={dados.multiplicadores} />
        <SecaoFaixas corretora={corretora} itens={dados.faixas} />
        <SecaoStatusLead itens={dados.statusLead} />
        <SecaoResponsaveis itens={dados.responsaveis} />
      </div>
    </div>
  )
}

// ── Gerais ─────────────────────────────────────────────────────────────────
function SecaoGerais({ corretora, label, parametros, gerais }: { corretora: Corretora; label: string; parametros: Dados['parametros']; gerais: Dados['gerais'] }) {
  const { erro, rodar } = useAcao()
  const campos = [
    { corr: corretora as string, chave: 'zeragem_padrao', label: 'ZeragemRS — R$ por contrato zerado (assessores com zeragem padrão, quando não há tabela regressiva)', tipo: 'numero' },
    { corr: corretora as string, chave: 'zeragem_faixas', label: 'Zeragem regressiva — "contratos operados no mês:R$ por contrato zerado; …" pelo maior volume do cliente entre o mês anterior e o vigente (vazio = usa ZeragemRS)', tipo: 'texto' },
    { corr: corretora as string, chave: 'zeragem_faixas_desde', label: 'Zeragem regressiva — vale a partir de (dd/mm/aaaa; vazio = todo o histórico)', tipo: 'texto' },
    { corr: corretora as string, chave: 'receita_desde_migracao', label: 'Receita só a partir da data de migração do cliente (SIM/NAO) — o BTG paga desde o dia em que a conta passou para o escritório', tipo: 'texto' },
    { corr: corretora as string, chave: 'lotes_apenas_futuros', label: 'Só contratos futuros contam como lotes (SIM/NAO) — com SIM, day trade em ações e cripto vira "operação de ações" com a corretagem fixa abaixo', tipo: 'texto' },
    { corr: corretora as string, chave: 'tarifa_acoes_daytrade', label: 'Corretagem por operação de day trade em ações e cripto (R$ por linha do relatório; não conta como lote e pode ser ajustada por operação em Giro diário → dia)', tipo: 'numero' },
    { corr: corretora as string, chave: 'meses_inativo', label: 'MesesInativo — meses sem giro para o cliente virar inativo', tipo: 'numero' },
    { corr: corretora as string, chave: 'risco_dias_parado', label: 'Risco "parou" — dias sem giro (contados até o último dia lançado) para um cliente que girou nos últimos 3 meses entrar em risco', tipo: 'numero' },
    { corr: corretora as string, chave: 'risco_queda_pct', label: 'Risco "em queda" — queda (%) dos lotes do mês, no ritmo atual, contra a média dos 3 meses anteriores', tipo: 'numero' },
    { corr: corretora as string, chave: 'risco_minimo_lotes', label: 'Risco "em queda" — média mínima de lotes/mês nos 3 meses anteriores para avaliar a queda', tipo: 'numero' },
    { corr: corretora as string, chave: 'nivel_alto_lotes', label: 'Nível alto — média de lotes/mês nos 3 meses anteriores a partir deste valor', tipo: 'numero' },
    { corr: corretora as string, chave: 'nivel_medio_lotes', label: 'Nível médio — média de lotes/mês nos 3 meses anteriores a partir deste valor (abaixo é nível baixo)', tipo: 'numero' },
    { corr: corretora as string, chave: 'modo_zeragem', label: 'ModoZeragem — texto no campo MODO que marca a linha como zeragem', tipo: 'texto' },
    { corr: corretora as string, chave: 'modo_daytrade', label: 'ModoDayTrade — texto no campo MODO que marca day trade; o resto vira posição, fora dos lotes e da receita (vazio = tudo conta como lote)', tipo: 'texto' },
    { corr: corretora as string, chave: 'modelo_incentivo', label: 'Modelo do incentivo — PONTOS (faixas por pontos) ou ATP (metas de comissão acumulada, BTG)', tipo: 'modelo' },
    { corr: 'GERAL', chave: 'dias_alerta_lead', label: 'Dias sem contato para alertar um lead em aberto (todas as corretoras)', tipo: 'numero' },
  ]
  const valorDe = (corr: string, chave: string) => (corr === 'GERAL' ? gerais : parametros).find(p => p.chave === chave)?.valor ?? ''
  return (
    <NoCelular titulo={`Premissas · ${label}`} dica="Os mesmos nomes da aba Premissas da planilha."
      // espaço inseparável entre o nome e o valor: o número não fica sozinho na linha de baixo
      resumo={`${fmtNum(campos.length)} campos · ZeragemRS ${valorDe(corretora, 'zeragem_padrao') || TRACO} · MesesInativo ${valorDe(corretora, 'meses_inativo') || TRACO}`}>
    <Panel variant="card" title={`Premissas · ${label}`} subtitle="Os mesmos nomes da aba Premissas da planilha." {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <div className="space-y-4">
        {campos.map(c => <CampoParametro key={c.chave} label={c.label} valor={valorDe(c.corr, c.chave)} tipo={c.tipo} onSalvar={v => rodar(() => salvarParametro(c.corr, c.chave, v), undefined, 'Parâmetro salvo')} />)}
      </div>
    </Panel>
    </NoCelular>
  )
}

function CampoParametro({ label, valor, tipo, onSalvar }: { label: string; valor: string; tipo: string; onSalvar: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(valor)
  const [salvando, setSalvando] = useState(false)
  const mudou = v !== valor
  // No celular o campo de uma linha corta a regra longa ("1000:15; 5000:10; …"): o valor gravado aparece
  // inteiro embaixo, uma regra por linha, só para leitura (o campo continua de uma linha: a regra é gravada
  // como foi digitada e uma quebra de linha entraria nela)
  const regras = tipo === 'texto' && valor.length > 24 ? valor.split(';').map(s => s.trim()).filter(Boolean) : []
  return (
    <div>
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="label block">{label}</span>
          {/* sem maiúscula e correção do teclado do celular: "NAO", "PONTOS" e "liquida" têm de ir como estão */}
          <input className="field-sm mt-1 w-full" value={v} inputMode={tipo === 'numero' ? 'decimal' : undefined} autoCapitalize="none" autoCorrect="off" onChange={e => setV(e.target.value)} />
        </label>
        <Button size="sm" variant={mudou ? 'primary' : 'secondary'} disabled={!mudou} loading={salvando} onClick={async () => { setSalvando(true); await onSalvar(v); setSalvando(false) }}>Salvar</Button>
      </div>
      {regras.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 break-words text-label text-fg-muted md:hidden">
          {regras.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  )
}

// ── Parceiros com participação na receita (corretagem, zeragem e incentivo) ──
// Depois de salvar, o campo mostra o texto como ficou gravado (a ação devolve a forma canônica); o cartão
// também remonta quando o valor gravado muda (key no pai)
function SecaoParceirosReceita({ corretora, label, valor }: { corretora: Corretora; label: string; valor: string }) {
  const { erro, rodar } = useAcao()
  const [v, setV] = useState(valor)
  const [salvando, setSalvando] = useState(false)
  const regras = lerParceirosReceita(valor)
  const mudou = v !== valor
  const salvar = async () => {
    setSalvando(true)
    await rodar(async () => { const r = await salvarParceirosReceita(corretora, v); if (r.ok) setV(r.dados.valor); return r }, undefined, 'Regra salva')
    setSalvando(false)
  }
  const ajuda = 'Parceiro que recebe uma parte da corretagem, da zeragem e do incentivo dos clientes dele. O valor de cada mês aparece em Comissões.'
  return (
    <NoCelular titulo={`Parceiros com participação na receita · ${label}`} dica={ajuda}
      resumo={regras.length ? [...new Set(regras.map(r => r.nome))].join(', ') : 'ninguém'}>
    <Panel variant="card" title={`Parceiros com participação na receita · ${label}`} subtitle={ajuda} {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="label block">Regras — &quot;nome:% da corretagem:% da zeragem:% do incentivo:desde AAAA-MM&quot; separadas por ; (ex.: Fabio Ferron:50:50:50:2026-11). Vazio = ninguém</span>
          <input className="field-sm mt-1 w-full" value={v} autoCapitalize="none" autoCorrect="off" onChange={e => setV(e.target.value)} />
        </label>
        <Button size="sm" variant={mudou ? 'primary' : 'secondary'} disabled={!mudou} loading={salvando} onClick={salvar}>Salvar</Button>
      </div>
      {regras.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-label text-fg-muted">
          {regras.map(r => <li key={`${r.nome}:${r.desde}`}><span className="text-fg">{r.nome}</span>, desde {mesLongo(r.desde)}: {textoDaRegra(r)}.</li>)}
        </ul>
      )}
      <p className="mt-3 text-label text-fg-subtle">
        Os clientes do parceiro são os dos assessores com o nome dele na coluna Parceiro (seção Assessores, abaixo). Corretagem e zeragem são as do sistema,
        antes do repasse da corretora e de impostos: para repassar só uma parte, use um percentual menor. Para mudar os percentuais a partir de um mês, acrescente outra regra do mesmo parceiro com o novo início.
      </p>
    </Panel>
    </NoCelular>
  )
}

// ── Economia do BTG: repasse, impostos, sócios e ATP Turbo ─────────────────
function SecaoBtg({ corretora, label, parametros }: { corretora: Corretora; label: string; parametros: Dados['parametros'] }) {
  const { erro, rodar } = useAcao()
  const valorDe = (chave: string) => parametros.find(p => p.chave === chave)?.valor ?? ''
  const repasse = [
    { chave: 'impostos_embutidos_pct', label: 'Impostos embutidos no preço cobrado do cliente (%) — receita bruta do BTG = lotes × tarifa ÷ (1 − isso)', tipo: 'numero' },
    { chave: 'imposto_btg_pct', label: 'Impostos que o BTG desconta da receita bruta (%) — sobra a receita líquida', tipo: 'numero' },
    { chave: 'repasse_faixas', label: 'Comissão do BTG sobre a receita líquida — faixas progressivas "a partir de R$:%" separadas por ;', tipo: 'texto' },
    { chave: 'repasse_pct_mes', label: 'Comissão que o BTG pagou em cada mês já fechado — "AAAA-MM:%" separados por ; (nesses meses vale no lugar das faixas)', tipo: 'texto' },
    { chave: 'repasse_parceiros', label: 'Parceiros com participação na comissão — "nome:% do parceiro:% do escritório sobre o restante" separados por ; (a comissão dos clientes dele paga o imposto, o parceiro leva a parte dele e o escritório fica com a sua parte do que sobra)', tipo: 'texto' },
    { chave: 'delta_pct', label: 'Delta sobre a comissão (%)', tipo: 'numero' },
    { chave: 'imposto_pct', label: 'Imposto do escritório sobre a comissão depois da Delta (%)', tipo: 'numero' },
    { chave: 'participacoes', label: 'Divisão da comissão líquida — "nome:%" separados por ;', tipo: 'texto' },
    { chave: 'atp_base', label: 'Base das metas do ATP: receita (lotes × tarifa), bruta, liquida ou comissao (valores do BTG)', tipo: 'texto' },
  ]
  const atp = [
    { chave: 'atp_assinatura', label: 'Data de assinatura do termo (vazio = primeiro mês com lotes)', tipo: 'data' },
    { chave: 'atp_metas', label: 'Metas — "prazo em meses:comissão acumulada:prêmio:observação" separadas por ;', tipo: 'texto' },
  ]
  const salvar = (chave: string) => (v: string) => rodar(() => salvarParametro(corretora, chave, v), undefined, 'Parâmetro salvo')
  const ajudaRepasse = 'Faturamento bruto → repasse → (–) imposto → (–) Delta → receita líquida dividida entre os sócios. Aparece nos Indicadores mensais do Painel.'
  const ajudaAtp = 'Prêmios por comissão acumulada dentro do prazo, contado da assinatura. A tela Incentivo acompanha cada meta.'
  const metas = valorDe('atp_metas').split(';').filter(s => s.trim()).length
  // no resumo do índice o percentual gravado ("16.5") sai como se lê: "16,5%"
  const pct = (v: string) => (v.trim() ? `${v.trim().replace('.', ',')}%` : TRACO)
  return (
    <>
      <NoCelular titulo={`Repasse · ${label}`} dica={ajudaRepasse} resumo={`${fmtNum(repasse.length)} campos · Delta ${pct(valorDe('delta_pct'))} · imposto ${pct(valorDe('imposto_pct'))}`}>
      <Panel variant="card" title={`Repasse · ${label}`} subtitle={ajudaRepasse} {...CARTAO_NO_CELULAR}>
        {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
        <div className="space-y-4">
          {repasse.map(c => <CampoParametro key={c.chave} label={c.label} valor={valorDe(c.chave)} tipo={c.tipo} onSalvar={salvar(c.chave)} />)}
        </div>
      </Panel>
      </NoCelular>
      <NoCelular titulo="ATP Turbo Receita" dica={ajudaAtp} resumo={metas ? qtd(metas, 'meta', 'metas') : 'nenhuma meta'}>
      <Panel variant="card" title="ATP Turbo Receita" subtitle={ajudaAtp} {...CARTAO_NO_CELULAR}>
        <div className="space-y-4">
          {atp.map(c => <CampoParametro key={c.chave} label={c.label} valor={valorDe(c.chave)} tipo={c.tipo} onSalvar={salvar(c.chave)} />)}
        </div>
      </Panel>
      </NoCelular>
    </>
  )
}

// ── Manutenção ─────────────────────────────────────────────────────────────
function SecaoManutencao({ corretora }: { corretora: Corretora }) {
  const { erro, ocupado, rodar } = useAcao()
  const [res, setRes] = useState<Record<string, number> | null>(null)
  const ajuda = 'Refaz a conta principal de cada cliente, o vínculo dos lotes com o cadastro, os valores derivados e o cruzamento de leads.'
  return (
    <NoCelular titulo="Manutenção" dica={ajuda} resumo="Recalcular tudo">
    <Panel variant="card" title="Manutenção" subtitle={ajuda} {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <Button variant="secondary" loading={ocupado} onClick={() => rodar(async () => { const r = await recalcularTudo(corretora); if (r.ok) setRes(r.dados); return r }, undefined, 'Recalculado')}>
        <RefreshCw className="h-4 w-4" aria-hidden />Recalcular tudo
      </Button>
      {res && (
        <p className="mt-3 text-label text-fg-muted">
          Contas principais ajustadas: {fmtNum(res.marcar_contas_principais ?? 0)} · lotes vinculados: {fmtNum(res.vincular_lotes ?? 0)} · lotes recalculados: {fmtNum(res.recalcular_lotes ?? 0)} · leads cruzados: {fmtNum(res.vincular_leads ?? 0)}
        </p>
      )}
    </Panel>
    </NoCelular>
  )
}

// ── Assessores ─────────────────────────────────────────────────────────────
type FormAssessor = { id: string | null; nome: string; id_assessor: string; corretagem: string; tipo_zeragem: 'PADRAO' | 'FIXA'; zeragem_fixa: string; responsavel: string; parceiro: string; ativo: boolean }
const formVazio = (nome = ''): FormAssessor => ({ id: null, nome, id_assessor: '', corretagem: '0,25', tipo_zeragem: 'PADRAO', zeragem_fixa: '0', responsavel: '', parceiro: '', ativo: true })

function SecaoAssessores({ corretora, assessores, naoCadastrados, responsaveis, parceiros }: { corretora: Corretora; assessores: AssessorParam[]; naoCadastrados: Dados['assessoresNaoCadastrados']; responsaveis: string[]; parceiros: string[] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [form, setForm] = useState<FormAssessor | null>(null)

  const salvar = () => form && rodar(() => salvarAssessor(corretora, {
    id: form.id, nome: form.nome, id_assessor: form.id_assessor || null, corretagem: numeroBR(form.corretagem), tipo_zeragem: form.tipo_zeragem,
    zeragem_fixa: numeroBR(form.zeragem_fixa), responsavel: form.responsavel || null, parceiro: form.parceiro || null, ativo: form.ativo,
  }), () => setForm(null), 'Assessor salvo')
  const editar = (a: AssessorParam) => setForm({ id: a.id, nome: a.nome, id_assessor: a.id_assessor ?? '', corretagem: String(a.corretagem).replace('.', ','), tipo_zeragem: a.tipo_zeragem, zeragem_fixa: String(a.zeragem_fixa).replace('.', ','), responsavel: a.responsavel ?? '', parceiro: a.parceiro ?? '', ativo: a.ativo })
  const excluir = (a: AssessorParam) => confirm(`Excluir ${a.nome}? Os lotes dele passam a usar tarifa 0 até ser cadastrado de novo.`) && rodar(() => excluirAssessor(corretora, a.id), undefined, 'Assessor excluído')

  // No celular a linha de edição vira um formulário no lugar da linha (cel-bloco): os oito campos um embaixo
  // do outro, cada um com o nome em cima (antes seis dos oito sumiam junto com as colunas). No computador o
  // rótulo some e o <label> não desenha caixa (md:contents): a linha fica como sempre foi.
  const campo = (rotulo: string, controle: ReactNode) => (
    <label className="block md:contents"><span className="label mb-1 block md:hidden">{rotulo}</span>{controle}</label>
  )
  const linhaForm = (
    <tr className="bg-accent-soft">
      <td className="cel-bloco">{campo('Nome como vem no export', <input className="field-sm w-full min-w-[200px] max-md:min-w-0" placeholder="Nome como vem no export" value={form?.nome ?? ''} onChange={e => form && setForm({ ...form, nome: e.target.value })} aria-label="Nome" />)}</td>
      <td className="col-p3 cel-bloco">{campo('ID', <input className="field-sm w-24 max-md:w-full" placeholder="ID" value={form?.id_assessor ?? ''} onChange={e => form && setForm({ ...form, id_assessor: e.target.value })} aria-label="ID do assessor" />)}</td>
      <td className="cel-bloco">{campo('R$/lote', <input className="field-sm w-20 text-right max-md:w-full max-md:text-left" inputMode="decimal" value={form?.corretagem ?? ''} onChange={e => form && setForm({ ...form, corretagem: e.target.value })} aria-label="Corretagem" />)}</td>
      <td className="col-p2 cel-bloco">
        {campo('Zeragem', <select className="field-sm max-md:w-full" value={form?.tipo_zeragem ?? 'PADRAO'} onChange={e => form && setForm({ ...form, tipo_zeragem: e.target.value as 'PADRAO' | 'FIXA' })} aria-label="Tipo de zeragem">
          <option value="PADRAO">PADRAO</option><option value="FIXA">FIXA</option>
        </select>)}
      </td>
      <td className="col-p2 cel-bloco">{campo('Zeragem fixa', <input className="field-sm w-20 text-right max-md:w-full max-md:text-left" inputMode="decimal" disabled={form?.tipo_zeragem !== 'FIXA'} value={form?.zeragem_fixa ?? ''} onChange={e => form && setForm({ ...form, zeragem_fixa: e.target.value })} aria-label="Zeragem fixa" />)}</td>
      <td className="col-p2 cel-bloco">
        {campo('Responsável', <select className="field-sm max-md:w-full" value={form?.responsavel ?? ''} onChange={e => form && setForm({ ...form, responsavel: e.target.value })} aria-label="Responsável">
          <option value="">—</option>{responsaveis.map(r => <option key={r}>{r}</option>)}
        </select>)}
      </td>
      <td className="col-p2 cel-bloco">
        {campo('Parceiro', <select className="field-sm max-md:w-full" value={form?.parceiro ?? ''} onChange={e => form && setForm({ ...form, parceiro: e.target.value })} aria-label="Parceiro" title="Os clientes deste assessor contam na comissão ou na participação na receita do parceiro">
          <option value="">—</option>{parceiros.map(p => <option key={p}>{p}</option>)}
          {/* parceiro já gravado que saiu da lista: continua escolhido até alguém trocar */}
          {form?.parceiro && !parceiros.includes(form.parceiro) && <option>{form.parceiro}</option>}
        </select>)}
        {/* o que o title do campo explica, à vista no celular (no toque o title não existe) */}
        <span className="mt-1 block text-label text-fg-muted md:hidden">Os clientes deste assessor contam na comissão ou na participação na receita do parceiro.</span>
      </td>
      <td className="col-p3 cel-bloco">
        <label className="flex items-center gap-2 md:contents">
          <input type="checkbox" checked={form?.ativo ?? true} onChange={e => form && setForm({ ...form, ativo: e.target.checked })} aria-label="Ativo" />
          <span className="text-dense md:hidden">Ativo</span>
        </label>
      </td>
      <td className="whitespace-nowrap text-right cel-bloco">
        <IconButton tone="success" aria-label="Salvar" disabled={ocupado} onClick={salvar}><Check className="h-4 w-4" aria-hidden /></IconButton>
        <IconButton aria-label="Cancelar" onClick={() => setForm(null)}><X className="h-4 w-4" aria-hidden /></IconButton>
      </td>
    </tr>
  )

  const ajuda = 'Corretagem em R$ por lote operado. Zeragem padrão usa o ZeragemRS; fixa usa o valor do assessor. O responsável é herdado pelos clientes do assessor; o parceiro recebe a comissão de abertura e ativação dos clientes dele ou, se tiver participação na receita, a parte dele no que esses clientes geram.'
  return (
    <NoCelular titulo="Assessores" dica={ajuda}
      resumo={<>{qtd(assessores.length, 'cadastrado', 'cadastrados')}{naoCadastrados.length > 0 && <> · {pendente(qtd(naoCadastrados.length, 'sem cadastro', 'sem cadastro'))}</>}</>}>
    {/* no celular o título e a explicação saem (a linha de toque já diz o nome; a explicação está no "i") e
        sobra só o botão "+ Assessor" no cabeçalho */}
    <Panel title={<span className="max-md:hidden">Assessores</span>} subtitle={<span className="max-md:hidden">{ajuda}</span>}
      action={<Button size="sm" onClick={() => setForm(formVazio())} disabled={!!form}><Plus className="h-4 w-4" aria-hidden />Assessor</Button>}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      {naoCadastrados.length > 0 && (
        <Alert tone="warn" className="mb-3" title={`${naoCadastrados.length} assessor(es) aparecem nos exports sem cadastro (tarifa 0 e sem responsável)`}>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {naoCadastrados.map(a => (
              <button key={a.assessor_nome} type="button" className="chip" onClick={() => setForm(formVazio(a.assessor_nome))} title={`${fmtNum(a.contas)} contas · ${fmtNum(a.lotes)} lotes`}>
                <Plus className="h-3 w-3" aria-hidden />{a.assessor_nome} <span className="text-fg-subtle">({fmtNum(a.contas)} contas<span className="md:hidden"> · {fmtNum(a.lotes)} lotes</span>)</span>
              </button>
            ))}
          </div>
        </Alert>
      )}
      <div className="tbl-wrap">
        {/* No celular (DESIGN.md §8.6) cada assessor vira um item: o nome inteiro em cima e, embaixo, ID, R$ por
            lote, zeragem, responsável e parceiro; "Editar" e a lixeira à direita */}
        <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '8rem' } as CSSProperties}>
          <thead><tr><th>Assessor</th><th className="col-p3">ID</th><th className="num">R$/lote</th><th className="col-p2">Zeragem</th><th className="num col-p2">Zeragem fixa</th><th className="col-p2">Responsável</th><th className="col-p2">Parceiro</th><th className="col-p3">Ativo</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {form && !form.id && linhaForm}
            {assessores.map(a => form?.id === a.id ? <FragmentRow key={a.id}>{linhaForm}</FragmentRow> : (
              <tr key={a.id} className={cn(!a.ativo && 'opacity-50')}>
                <td className="font-medium cel-titulo">{a.nome}</td>
                <td className={cn('muted col-p3 cel-sub', !a.id_assessor && 'vazio')} data-rotulo="ID">{a.id_assessor ?? TRACO}</td>
                <td className="num cel-sub" data-rotulo="R$/lote">{n2(a.corretagem)}</td>
                <td className="col-p2 cel-sub" data-rotulo="zeragem">{a.tipo_zeragem === 'FIXA' ? <Badge variant="accent">fixa</Badge> : <span className="muted">padrão</span>}</td>
                <td className={cn('num col-p2 cel-sub', a.tipo_zeragem !== 'FIXA' && 'subtle vazio')} data-rotulo="zeragem fixa">{a.tipo_zeragem === 'FIXA' ? n2(a.zeragem_fixa) : TRACO}</td>
                <td className={cn('col-p2 cel-sub', !a.responsavel && 'vazio')} data-rotulo="resp.">{a.responsavel ?? TRACO}</td>
                <td className={cn('col-p2 cel-sub', !a.parceiro && 'vazio')} data-rotulo="parceiro">{a.parceiro ?? TRACO}</td>
                <td className={cn('col-p3 cel-sub', a.ativo && 'vazio')}>{a.ativo ? 'sim' : 'não'}<span className="md:hidden"> ativo</span></td>
                <td className="whitespace-nowrap text-right cel-acoes">
                  <Button variant="ghost" size="xs" onClick={() => editar(a)}>Editar</Button>
                  <IconButton tone="danger" aria-label={`Excluir ${a.nome}`} onClick={() => excluir(a)}><Trash2 className="h-4 w-4" aria-hidden /></IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
    </NoCelular>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</> }

// ── Status da conta ────────────────────────────────────────────────────────
function SecaoStatusConta({ corretora, mapa, naoMapeadas }: { corretora: Corretora; mapa: Dados['statusConta']; naoMapeadas: Dados['situacoesNaoMapeadas'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [sit, setSit] = useState('')
  const [st, setSt] = useState<'Migrado' | 'Em processamento' | 'Recusou'>('Migrado')
  const ajuda = 'Situação do export → status do controle. Sem mapa conta como Em processamento.'
  return (
    <NoCelular titulo="Status da conta" dica={ajuda}
      resumo={<>{qtd(mapa.length, 'situação mapeada', 'situações mapeadas')}{naoMapeadas.length > 0 && <> · {pendente(qtd(naoMapeadas.length, 'sem mapa', 'sem mapa'))}</>}</>}>
    <Panel variant="card" title="Status da conta" subtitle={ajuda} {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      {naoMapeadas.length > 0 && (
        <Alert tone="warn" className="mb-3" title="Situações sem mapa">
          <div className="mt-2 flex flex-wrap gap-1.5">{naoMapeadas.map(s => <button key={s.situacao} type="button" className="chip" onClick={() => setSit(s.situacao)}>{s.situacao} <span className="text-fg-subtle">({fmtNum(s.contas)})</span></button>)}</div>
        </Alert>
      )}
      <div className="tbl-wrap">
      {/* no celular: cada situação vira um item (o status em palavras embaixo, a lixeira à direita) e a linha de
          incluir vira os campos um embaixo do outro, com "Mapear" na largura toda (antes ficava fora da tela) */}
      <table className="tbl tbl-dense w-full tbl-lista" style={LISTA_LIXEIRA}>
        <thead><tr><th>Situação (export)</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {mapa.map(m => (
            <tr key={m.situacao}>
              <td className="font-medium cel-titulo">{m.situacao}</td>
              <td className="cel-sub"><Badge variant={m.status === 'Migrado' ? 'gain' : m.status === 'Recusou' ? 'loss' : 'neutral'}>{m.status}</Badge></td>
              <td className="text-right cel-acoes"><IconButton tone="danger" aria-label={`Excluir ${m.situacao}`} onClick={() => rodar(() => excluirStatusConta(corretora, m.situacao), undefined, 'Mapa removido')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td className="cel-bloco"><input className="field-sm w-full" placeholder="ATIVA, INATIVA, BLOQUEADA…" value={sit} onChange={e => setSit(e.target.value.toUpperCase())} aria-label="Situação" /></td>
            <td className="cel-bloco">
              <select className="field-sm max-md:w-full" value={st} onChange={e => setSt(e.target.value as typeof st)} aria-label="Status">
                <option>Migrado</option><option>Em processamento</option><option>Recusou</option>
              </select>
            </td>
            <td className="text-right cel-bloco"><Button size="xs" className="max-md:w-full" disabled={!sit || ocupado} onClick={() => rodar(() => salvarStatusConta(corretora, sit, st), () => setSit(''), 'Mapa salvo')}><Plus className="h-3.5 w-3.5" aria-hidden />Mapear</Button></td>
          </tr>
        </tbody>
      </table>
      </div>
    </Panel>
    </NoCelular>
  )
}

// ── Multiplicadores ────────────────────────────────────────────────────────
// Nas tabelas pequenas, no celular: cada item vira uma linha (nome, valor embaixo, lixeira à direita) e a linha
// de incluir vira os campos um embaixo do outro, com o botão na largura toda (antes ela alargava a tabela e
// o botão ficava fora da tela). No computador continuam como tabela.
function SecaoMultiplicadores({ corretora, itens }: { corretora: Corretora; itens: Dados['multiplicadores'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [produto, setProduto] = useState('')
  const [pontos, setPontos] = useState('1')
  const ajuda = 'Pontos por lote operado, pelas 3 primeiras letras do ativo (WINV26 → WIN).'
  return (
    <NoCelular titulo="Multiplicadores do incentivo" dica={ajuda} resumo={itens.length ? qtd(itens.length, 'produto', 'produtos') : 'nenhum cadastrado'}>
    <Panel variant="card" title="Multiplicadores do incentivo" subtitle={ajuda} {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <div className="tbl-wrap">
      <table className="tbl tbl-dense w-full tbl-lista" style={LISTA_LIXEIRA}>
        <thead><tr><th>Produto</th><th className="num">Pontos por lote</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.map(m => (
            <tr key={m.produto}>
              <td className="font-medium cel-titulo">{m.produto}</td>
              <td className="num cel-sub" data-sufixo="pontos por lote">{n2(m.pontos)}</td>
              <td className="text-right cel-acoes"><IconButton tone="danger" aria-label={`Excluir ${m.produto}`} onClick={() => rodar(() => excluirMultiplicador(corretora, m.produto), undefined, 'Multiplicador removido')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td className="cel-bloco"><input className="field-sm w-28 max-md:w-full" placeholder="WIN" value={produto} onChange={e => setProduto(e.target.value.toUpperCase())} aria-label="Produto" /></td>
            <td className="text-right cel-bloco"><input className="field-sm w-20 text-right max-md:w-full max-md:text-left" inputMode="decimal" value={pontos} onChange={e => setPontos(e.target.value)} aria-label="Pontos" /></td>
            <td className="text-right cel-bloco"><Button size="xs" className="max-md:w-full" disabled={!produto || ocupado} onClick={() => rodar(() => salvarMultiplicador(corretora, produto, numeroBR(pontos)), () => setProduto(''), 'Multiplicador salvo')}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
      </div>
    </Panel>
    </NoCelular>
  )
}

// ── Faixas ─────────────────────────────────────────────────────────────────
function SecaoFaixas({ corretora, itens }: { corretora: Corretora; itens: Dados['faixas'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [min, setMin] = useState('')
  const [valor, setValor] = useState('')
  const ajuda = 'O cliente entra na maior faixa cujo mínimo ultrapassou. Pago uma vez por cliente por mês.'
  return (
    <NoCelular titulo="Faixas do incentivo" dica={ajuda} resumo={itens.length ? qtd(itens.length, 'faixa', 'faixas') : 'nenhuma cadastrada'}>
    <Panel variant="card" title="Faixas do incentivo" subtitle={ajuda} {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <div className="tbl-wrap">
      <table className="tbl tbl-dense w-full tbl-lista" style={LISTA_LIXEIRA}>
        <thead><tr><th>Mais de (pontos)</th><th className="num">Incentivo</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.map(f => (
            <tr key={f.pontos_min}>
              {/* no celular sem o cabeçalho da coluna: a linha diz "Mais de 1.000 pontos" */}
              <td className="num font-medium cel-titulo"><span className="md:hidden">Mais de </span>{n0(f.pontos_min)}<span className="md:hidden"> pontos</span></td>
              <td className="num cel-sub" data-rotulo="incentivo">{r0(f.valor)}</td>
              <td className="text-right cel-acoes"><IconButton tone="danger" aria-label={`Excluir faixa ${f.pontos_min}`} onClick={() => rodar(() => excluirFaixa(corretora, f.pontos_min), undefined, 'Faixa removida')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td className="cel-bloco"><input className="field-sm w-28 max-md:w-full" inputMode="decimal" placeholder="1000" value={min} onChange={e => setMin(e.target.value)} aria-label="Mínimo de pontos" /></td>
            <td className="text-right cel-bloco"><input className="field-sm w-24 text-right max-md:w-full max-md:text-left" inputMode="decimal" placeholder="200" value={valor} onChange={e => setValor(e.target.value)} aria-label="Valor" /></td>
            <td className="text-right cel-bloco"><Button size="xs" className="max-md:w-full" disabled={!min || !valor || ocupado} onClick={() => rodar(() => salvarFaixa(corretora, numeroBR(min), numeroBR(valor)), () => { setMin(''); setValor('') }, 'Faixa salva')}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
      </div>
    </Panel>
    </NoCelular>
  )
}

// ── Consolidados ───────────────────────────────────────────────────────────
function SecaoConsolidados({ corretora, itens }: { corretora: Corretora; itens: Dados['consolidados'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [nome, setNome] = useState('')
  const ajuda = 'Clientes cujas contas somam juntas no incentivo pelo nome, mesmo sem CPF no export.'
  return (
    <NoCelular titulo="Consolidados" dica={ajuda} resumo={itens.length ? qtd(itens.length, 'consolidado', 'consolidados') : 'Nenhum consolidado.'}>
    <Panel variant="card" title="Consolidados" subtitle={ajuda} {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <ul className="mb-3 flex flex-wrap gap-1.5">
        {itens.length === 0 && <li className="text-label text-fg-subtle">Nenhum consolidado.</li>}
        {itens.map(c => (
          <li key={c.nome} className="chip">
            {c.nome}
            <button type="button" aria-label={`Excluir ${c.nome}`} className="text-fg-subtle hover:text-loss" onClick={() => rodar(() => excluirConsolidado(corretora, c.nome), undefined, 'Consolidado removido')}><X className="h-3 w-3" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="field-sm flex-1" placeholder="Nome do cliente como aparece no relatório" value={nome} onChange={e => setNome(e.target.value)} aria-label="Nome do consolidado" />
        <Button size="sm" disabled={!nome.trim() || ocupado} onClick={() => rodar(() => salvarConsolidado(corretora, nome), () => setNome(''), 'Consolidado salvo')}><Plus className="h-4 w-4" aria-hidden />Adicionar</Button>
      </div>
    </Panel>
    </NoCelular>
  )
}

// ── Status de lead ─────────────────────────────────────────────────────────
function SecaoStatusLead({ itens }: { itens: Dados['statusLead'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [status, setStatus] = useState('')
  const [tipo, setTipo] = useState<'Aberto' | 'Fechado'>('Aberto')
  const ajuda = 'Aberto conta como em andamento; Fechado sai do funil (Ganho / Perdido). Vale para todas.'
  return (
    <NoCelular titulo="Status de lead" dica={ajuda} resumo={qtd(itens.length, 'status', 'status')}>
    <Panel variant="card" title="Status de lead" subtitle={ajuda} {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <div className="tbl-wrap">
      <table className="tbl tbl-dense w-full tbl-lista" style={LISTA_LIXEIRA}>
        <thead><tr><th>Status</th><th>Tipo</th><th className="num">Ordem</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.map(s => (
            <tr key={s.status}>
              <td className="font-medium cel-titulo">{s.status}</td>
              <td className="muted cel-sub">{s.tipo}</td>
              <td className="num cel-sub" data-rotulo="ordem">{s.ordem}</td>
              <td className="text-right cel-acoes">{!['Novo', 'Ganho', 'Perdido'].includes(s.status) && <IconButton tone="danger" aria-label={`Excluir ${s.status}`} onClick={() => rodar(() => excluirStatusLead(s.status), undefined, 'Status removido')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton>}</td>
            </tr>
          ))}
          <tr>
            <td className="cel-bloco"><input className="field-sm w-full" placeholder="Ex.: Reunião marcada" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status" /></td>
            <td className="cel-bloco"><select className="field-sm max-md:w-full" value={tipo} onChange={e => setTipo(e.target.value as 'Aberto' | 'Fechado')} aria-label="Tipo"><option>Aberto</option><option>Fechado</option></select></td>
            <td />
            <td className="text-right cel-bloco"><Button size="xs" className="max-md:w-full" disabled={!status.trim() || ocupado} onClick={() => rodar(() => salvarStatusLead(status, tipo, itens.length + 1), () => setStatus(''), 'Status salvo')}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
      </div>
    </Panel>
    </NoCelular>
  )
}

// ── Responsáveis ───────────────────────────────────────────────────────────
// No celular cada pessoa vira um item: o nome em cima e, embaixo, as quatro caixas com o nome de cada uma ao
// lado (as quatro colunas de caixas não cabiam na largura); a lixeira à direita
function SecaoResponsaveis({ itens }: { itens: Dados['responsaveis'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [nome, setNome] = useState('')
  const ajuda = 'Quem atende clientes (herdado via assessor), quem trabalha leads e quem é comissionado por abertura e ativação de conta (tela Comissões). Vale para todas.'
  // a caixa com o nome dela ao lado, só no celular; no computador o <label> não desenha caixa (md:contents)
  const caixa = (rotulo: string, controle: ReactNode) => (
    <label className="inline-flex min-h-[40px] items-center gap-1.5 align-middle md:contents">{controle}<span className="md:hidden">{rotulo}</span></label>
  )
  return (
    <NoCelular titulo="Responsáveis" dica={ajuda} resumo={`${qtd(itens.filter(r => r.ativo).length, 'ativo', 'ativos')} de ${fmtNum(itens.length)}`}>
    <Panel variant="card" title="Responsáveis" subtitle={ajuda} {...CARTAO_NO_CELULAR}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <div className="tbl-wrap">
      <table className="tbl tbl-dense w-full tbl-lista" style={LISTA_LIXEIRA}>
        <thead><tr><th>Nome</th><th>Clientes</th><th>Leads</th><th>Comissão</th><th>Ativo</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.map(r => (
            <tr key={r.nome} className={cn(!r.ativo && 'opacity-50')}>
              <td className="font-medium cel-titulo">{r.nome}</td>
              <td className="cel-sub">{caixa('Clientes', <input type="checkbox" checked={r.atende_clientes} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, atende_clientes: e.target.checked }))} aria-label={`${r.nome} atende clientes`} />)}</td>
              <td className="cel-sub">{caixa('Leads', <input type="checkbox" checked={r.atende_leads} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, atende_leads: e.target.checked }))} aria-label={`${r.nome} atende leads`} />)}</td>
              <td className="cel-sub">{caixa('Comissão', <input type="checkbox" checked={r.comissionado} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, comissionado: e.target.checked }))} aria-label={`${r.nome} comissionado por abertura e ativação`} />)}</td>
              <td className="cel-sub">{caixa('Ativo', <input type="checkbox" checked={r.ativo} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, ativo: e.target.checked }))} aria-label={`${r.nome} ativo`} />)}</td>
              <td className="text-right cel-acoes"><IconButton tone="danger" aria-label={`Excluir ${r.nome}`} onClick={() => confirm(`Excluir ${r.nome}?`) && rodar(() => excluirResponsavel(r.nome), undefined, 'Responsável removido')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td colSpan={5}><input className="field-sm w-full" placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} aria-label="Nome do responsável" /></td>
            <td className="text-right cel-bloco"><Button size="xs" className="max-md:w-full" disabled={!nome.trim() || ocupado} onClick={() => rodar(() => salvarResponsavel({ nome, atende_clientes: true, atende_leads: true, ativo: true, comissionado: false }), () => setNome(''), 'Responsável salvo')}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
      </div>
    </Panel>
    </NoCelular>
  )
}
