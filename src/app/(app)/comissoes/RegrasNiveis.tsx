'use client'

// Pagamentos e regras de quem está na remuneração por níveis (S62): a tabela de níveis, a régua de pontos (com o
// que fica para o escritório de cada R$ 1 da Genial) e desde quando a pessoa está no modelo. Todos veem; só o
// admin muda. Uma tabela ou régua nova vale a partir do mês escolhido; os meses de antes seguem a de antes.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { fmtBRL2 } from '@/lib/format'
import { mesCurto, mesInput, parseMes, somarMeses } from '@/lib/gestao/meses'
import { salvarPessoaNoModelo, salvarRegua, salvarTabelaNiveis, type NivelForm, type ReguaForm } from '@/lib/gestao/acoesRemuneracao'
import { fatorGenial, vigente, type PessoaModelo, type Regua, type TabelaNiveis } from '@/lib/gestao/remuneracao'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'

const pct = (f: number) => `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} %`
// R$ sem centavos quando o valor é inteiro (a tabela cabe no celular)
const reaisNivel = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })
// "1.500" e "1500" = 1500; "12,5" e "12.5" = 12,5; "0,021" e "0.021" = 0,021
const numero = (s: string) => {
  const t = String(s).trim().replace(/\s/g, '')
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  return Number(t)
}
const campo = (v: number) => String(v).replace('.', ',')

export function RegrasNiveis({ tabelas, reguas, pessoa, admin, instalado, mesAtual }: {
  tabelas: TabelaNiveis[]; reguas: Regua[]; pessoa: PessoaModelo | null; admin: boolean; instalado: boolean; mesAtual: string
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const tabela = vigente(tabelas, mesAtual)
  const regua = vigente(reguas, mesAtual)
  const futuras = tabelas.filter(t => t.vigencia > mesAtual).sort((a, b) => a.vigencia.localeCompare(b.vigencia))
  const anteriores = tabelas.filter(t => t.vigencia < (tabela?.vigencia ?? '')).map(t => mesCurto(t.vigencia))
  const [editando, setEditando] = useState<null | 'tabela' | 'regua' | 'pessoa'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [vigencia, setVigencia] = useState(mesInput(somarMeses(mesAtual, 1)))
  const [niveis, setNiveis] = useState<Record<string, string>[]>([])
  const [rg, setRg] = useState<Record<string, string>>({})
  const [datas, setDatas] = useState({ nivelDesde: pessoa ? mesInput(pessoa.nivelDesde) : '', trabalhaDesde: pessoa?.trabalhaDesde ? mesInput(pessoa.trabalhaDesde) : '' })

  const abrirTabela = () => {
    setErro(null); setVigencia(mesInput(somarMeses(mesAtual, 1)))
    setNiveis((tabela?.niveis ?? []).map(n => ({
      pontosMin: campo(n.pontosMin), fixo: campo(n.fixo), abertura: campo(n.abertura), ativacao: campo(n.ativacao), reativacaoVolta: campo(n.reativacaoVolta),
      reativacao3Meses: campo(n.reativacao3Meses), bonus1AnoPct: campo(Math.round(n.bonus1Ano * 10000) / 100), bonusDepoisPct: campo(Math.round(n.bonusDepois * 10000) / 100),
    })))
    setEditando('tabela')
  }
  const abrirRegua = () => {
    if (!regua) return
    setErro(null); setVigencia(mesInput(somarMeses(mesAtual, 1)))
    setRg({
      pontosAtivacaoGenial: campo(regua.pontosAtivacao.GENIAL ?? 1), pontosAtivacaoBtg: campo(regua.pontosAtivacao.BTG ?? 1), pontosReativacao: campo(regua.pontosReativacao),
      reaisPorPonto: campo(regua.reaisPorPonto), genialRetencaoPct: campo(regua.genialRetencaoPct), genialPisCofinsPct: campo(regua.genialPisCofinsPct),
      genialIrPct: campo(regua.genialIrPct), genialPlataformaLote: campo(regua.genialPlataformaLote),
    })
    setEditando('regua')
  }
  const depois = (titulo: string) => { setEditando(null); avisar({ titulo, tom: 'gain' }); router.refresh() }

  const gravarTabela = async () => {
    setSalvando(true); setErro(null)
    const form: NivelForm[] = niveis.map((n, i) => ({
      nivel: i + 1, pontosMin: numero(n.pontosMin), fixo: numero(n.fixo), abertura: numero(n.abertura), ativacao: numero(n.ativacao),
      reativacaoVolta: numero(n.reativacaoVolta), reativacao3Meses: numero(n.reativacao3Meses), bonus1AnoPct: numero(n.bonus1AnoPct), bonusDepoisPct: numero(n.bonusDepoisPct),
    }))
    const r = await salvarTabelaNiveis(vigencia, form)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    depois(`Tabela salva: vale a partir de ${mesCurto(r.dados.vigencia)}`)
  }
  const gravarRegua = async () => {
    setSalvando(true); setErro(null)
    const f: ReguaForm = {
      pontosAtivacaoGenial: numero(rg.pontosAtivacaoGenial), pontosAtivacaoBtg: numero(rg.pontosAtivacaoBtg), pontosReativacao: numero(rg.pontosReativacao),
      reaisPorPonto: numero(rg.reaisPorPonto), genialRetencaoPct: numero(rg.genialRetencaoPct), genialPisCofinsPct: numero(rg.genialPisCofinsPct),
      genialIrPct: numero(rg.genialIrPct), genialPlataformaLote: numero(rg.genialPlataformaLote),
    }
    const r = await salvarRegua(vigencia, f)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    depois(`Régua salva: vale a partir de ${mesCurto(r.dados.vigencia)}`)
  }
  const gravarPessoa = async (tirar = false) => {
    if (!pessoa) return
    if (tirar && !confirm(`Tirar ${pessoa.nome} da remuneração por níveis? A conta dela volta a ser a comissão por conta, pelas regras cadastradas.`)) return
    setSalvando(true); setErro(null)
    const r = await salvarPessoaNoModelo(pessoa.nome, tirar ? '' : datas.nivelDesde, datas.trabalhaDesde)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    depois(tirar ? `${pessoa.nome} saiu da remuneração por níveis` : 'Datas salvas')
  }
  const mudar = (i: number, k: string, v: string) => setNiveis(ns => ns.map((n, j) => (j === i ? { ...n, [k]: v } : n)))

  const botaoMudar = (alvo: 'tabela' | 'regua' | 'pessoa', abrir: () => void) =>
    admin && instalado && editando !== alvo ? <Button variant="secondary" size="sm" onClick={abrir}><Pencil className="h-4 w-4" aria-hidden />Mudar</Button> : undefined
  const rodape = (gravar: () => void) => (
    <div className="flex flex-wrap items-end gap-2">
      <Input label="Vale a partir de" type="month" value={vigencia} onChange={e => setVigencia(e.target.value)} className="w-44" />
      <Button size="sm" onClick={gravar} loading={salvando}>Salvar</Button>
      <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
    </div>
  )

  // No celular cada bloco de regra fica recolhido atrás do título (RecolheNoCelular): a aba abre pelos pagamentos
  // e as regras, que são texto, ficam a um toque. O erro ao salvar aparece fora dos blocos, sempre à vista; o
  // bloco em edição já está aberto (o botão "Mudar" fica dentro dele). No computador tudo segue aberto.
  return (
    <div className="grid gap-8 max-md:gap-6">
      {erro && <Alert tone="loss">{erro}</Alert>}
      {!instalado && <Alert tone="warn" title="A tabela de níveis ainda não está no banco">Rode a S62 (supabase-s62-remuneracao-niveis.sql) no Supabase para poder mudar a tabela, a régua e as datas.</Alert>}

      <RecolheNoCelular titulo="Tabela de níveis" resumo="a mesma para toda a equipe">
      <Panel title={<span className="max-md:hidden">Tabela de níveis</span>} subtitle={`A mesma para toda a equipe, na Genial e no BTG${tabela ? `, desde ${mesCurto(tabela.vigencia)}` : ''}.${anteriores.length ? ` Antes valeu a de ${anteriores.join(', ')}.` : ''}${futuras.length ? ` Já gravada para ${futuras.map(t => mesCurto(t.vigencia)).join(', ')}.` : ''}`}
        action={botaoMudar('tabela', abrirTabela)}>
        {editando === 'tabela' ? (
          <div className="grid gap-4">
            {niveis.map((n, i) => (
              <fieldset key={i} className="grid gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-4">
                <legend className="mb-1 text-label font-medium text-fg">Nível {i + 1}</legend>
                <Input label="Pontos por mês a partir de" inputMode="decimal" value={n.pontosMin} onChange={e => mudar(i, 'pontosMin', e.target.value)} disabled={i === 0} />
                <Input label="Fixo (R$)" inputMode="decimal" value={n.fixo} onChange={e => mudar(i, 'fixo', e.target.value)} />
                <Input label="Abertura (R$)" inputMode="decimal" value={n.abertura} onChange={e => mudar(i, 'abertura', e.target.value)} />
                <Input label="Ativação (R$)" inputMode="decimal" value={n.ativacao} onChange={e => mudar(i, 'ativacao', e.target.value)} />
                <Input label="Reativação: quando volta (R$)" inputMode="decimal" value={n.reativacaoVolta} onChange={e => mudar(i, 'reativacaoVolta', e.target.value)} />
                <Input label="Reativação: 3 meses depois (R$)" inputMode="decimal" value={n.reativacao3Meses} onChange={e => mudar(i, 'reativacao3Meses', e.target.value)} />
                <Input label="Bônus 1º ano (%)" inputMode="decimal" value={n.bonus1AnoPct} onChange={e => mudar(i, 'bonus1AnoPct', e.target.value)} />
                <Input label="Bônus depois (%)" inputMode="decimal" value={n.bonusDepoisPct} onChange={e => mudar(i, 'bonusDepoisPct', e.target.value)} />
              </fieldset>
            ))}
            {rodape(gravarTabela)}
          </div>
        ) : (
          <div className="tbl-wrap">
            {/* No celular cada nível é uma linha (tbl-lista) com todos os valores escritos: o fixo à direita; pontos,
                abertura, ativação, as duas metades da reativação e o bônus do 1º ano e de depois na linha de apoio
                (no computador os dois últimos detalhes ficam na dica da célula) */}
            <table className="tbl tbl-dense tbl-lista">
              <thead>
                <tr>
                  <th scope="col">Nível</th><th scope="col" className="num"><span className="md:hidden">Pontos</span><span className="hidden md:inline">Pontos a partir de</span></th><th scope="col" className="num">Fixo</th><th scope="col" className="num col-p2">Abertura</th>
                  <th scope="col" className="num">Ativação</th><th scope="col" className="num col-p2">Reativação</th><th scope="col" className="num col-p2">Bônus da base</th>
                </tr>
              </thead>
              <tbody>
                {(tabela?.niveis ?? []).map(n => (
                  <tr key={n.nivel}>
                    <td className="cel-titulo font-medium">Nível {n.nivel}</td>
                    <td className="num cel-sub" data-rotulo={'a\u00a0partir\u00a0de'}>{n.pontosMin.toLocaleString('pt-BR')}<span className="md:hidden"> {n.pontosMin === 1 ? 'ponto' : 'pontos'} por mês</span></td>
                    <td className="num cel-valor" data-rotulo="fixo">{reaisNivel(n.fixo)}</td>
                    <td className="num col-p2 cel-sub" data-rotulo="abertura">{reaisNivel(n.abertura)}</td>
                    <td className="num cel-sub" data-rotulo="ativação">{reaisNivel(n.ativacao)}</td>
                    <td className="num col-p2 cel-sub" data-rotulo="reativação" title={`${fmtBRL2(n.reativacaoVolta)} quando volta + ${fmtBRL2(n.reativacao3Meses)} se ainda gira 3 meses depois`}>
                      <span className="max-md:hidden">{reaisNivel(n.reativacaoVolta + n.reativacao3Meses)}</span>
                      <span className="md:hidden">{fmtBRL2(n.reativacaoVolta)} quando volta + {fmtBRL2(n.reativacao3Meses)} se ainda gira 3 meses depois</span>
                    </td>
                    <td className="num col-p2 cel-sub" data-rotulo={'bônus\u00a0da\u00a0base'} title={`${pct(n.bonus1Ano)} no 1º ano depois do movimento, ${pct(n.bonusDepois)} depois`}>
                      {pct(n.bonus1Ano)}<span className="md:hidden"> no 1º ano, {pct(n.bonusDepois)} depois</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-label text-fg-subtle max-md:text-fg-muted">Reativação: metade quando o cliente volta a girar e metade se ainda gira 3 meses depois. Bônus: sobre o líquido da base ativa, cheio no 1º ano depois do último movimento com o cliente e metade depois.</p>
          </div>
        )}
      </Panel>
      </RecolheNoCelular>

      {regua && (
        <RecolheNoCelular titulo="Régua de pontos">
        <Panel title={<span className="max-md:hidden">Régua de pontos</span>} subtitle={`Desde ${mesCurto(regua.vigencia)}. Os pontos do mês decidem o nível; o líquido do cliente paga o bônus.`} action={botaoMudar('regua', abrirRegua)}>
          {editando === 'regua' ? (
            <div className="grid gap-4">
              <div className="grid gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-4">
                <Input label="Cliente novo girando na Genial (pontos)" inputMode="decimal" value={rg.pontosAtivacaoGenial} onChange={e => setRg({ ...rg, pontosAtivacaoGenial: e.target.value })} />
                <Input label="Cliente novo girando no BTG (pontos)" inputMode="decimal" value={rg.pontosAtivacaoBtg} onChange={e => setRg({ ...rg, pontosAtivacaoBtg: e.target.value })} />
                <Input label="Reativação (pontos)" inputMode="decimal" value={rg.pontosReativacao} onChange={e => setRg({ ...rg, pontosReativacao: e.target.value })} />
                <Input label="Líquido da base que vale 1 ponto (R$)" inputMode="decimal" value={rg.reaisPorPonto} onChange={e => setRg({ ...rg, reaisPorPonto: e.target.value })} />
                <Input label="Genial fica com (%)" inputMode="decimal" value={rg.genialRetencaoPct} onChange={e => setRg({ ...rg, genialRetencaoPct: e.target.value })} />
                <Input label="PIS/COFINS (%)" inputMode="decimal" value={rg.genialPisCofinsPct} onChange={e => setRg({ ...rg, genialPisCofinsPct: e.target.value })} />
                <Input label="IR (%)" inputMode="decimal" value={rg.genialIrPct} onChange={e => setRg({ ...rg, genialIrPct: e.target.value })} />
                <Input label="Plataforma por lote (R$)" inputMode="decimal" value={rg.genialPlataformaLote} onChange={e => setRg({ ...rg, genialPlataformaLote: e.target.value })} />
              </div>
              {rodape(gravarRegua)}
            </div>
          ) : (
            <ul className="max-w-3xl list-disc space-y-1 pl-5 text-dense text-fg-muted">
              <li><span className="text-fg">Cliente novo girando</span>: {regua.pontosAtivacao.GENIAL ?? 1} ponto na Genial e {regua.pontosAtivacao.BTG ?? 1} no BTG.</li>
              <li><span className="text-fg">Cliente parado que volta a girar</span>: {regua.pontosReativacao} ponto.</li>
              <li><span className="text-fg">Base ativa</span>: 1 ponto a cada {fmtBRL2(regua.reaisPorPonto)} que os clientes da base deixam para o escritório no mês. Abertura não conta ponto.</li>
              <li><span className="text-fg">Líquido da Genial</span>: a Genial fica com {regua.genialRetencaoPct.toLocaleString('pt-BR')} %, PIS/COFINS {regua.genialPisCofinsPct.toLocaleString('pt-BR')} % e IR {regua.genialIrPct.toLocaleString('pt-BR')} % (R$ {fatorGenial(regua).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} de cada R$ 1), mais o incentivo, menos R$ {regua.genialPlataformaLote.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} de plataforma por lote e a parte de parceiro com participação.</li>
              <li><span className="text-fg">Líquido do BTG</span>: a mesma cadeia do Painel do BTG (percentual do fechamento ou faixas, Delta, imposto e parceiros).</li>
            </ul>
          )}
        </Panel>
        </RecolheNoCelular>
      )}

      {pessoa && (
        <RecolheNoCelular titulo={`${pessoa.nome} no modelo`} resumo={`desde ${mesCurto(pessoa.nivelDesde)}`}>
        <Panel title={<span className="max-md:hidden">{pessoa.nome} no modelo</span>} subtitle="O nível é revisto a cada 3 meses desde a entrada, pela média dos 3 meses anteriores; os meses antes do início do trabalho não entram na média."
          action={botaoMudar('pessoa', () => { setErro(null); setEditando('pessoa') })}>
          {editando === 'pessoa' ? (
            <div className="flex flex-wrap items-end gap-2">
              <Input label="Na remuneração por níveis desde" type="month" value={datas.nivelDesde} onChange={e => setDatas({ ...datas, nivelDesde: e.target.value })} className="w-52" />
              <Input label="Trabalha desde" type="month" value={datas.trabalhaDesde} onChange={e => setDatas({ ...datas, trabalhaDesde: e.target.value })} className="w-44" />
              <Button size="sm" onClick={() => gravarPessoa()} loading={salvando}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button size="sm" variant="ghost" className="text-loss" onClick={() => gravarPessoa(true)}>Tirar do modelo</Button>
            </div>
          ) : (
            <p className="text-dense text-fg-muted">
              Desde <span className="text-fg">{mesCurto(pessoa.nivelDesde)}</span>{pessoa.trabalhaDesde ? <> · trabalha desde <span className="text-fg">{mesCurto(parseMes(pessoa.trabalhaDesde) ?? pessoa.trabalhaDesde)}</span></> : null}. Antes da entrada vale a comissão por conta, pelas regras de antes.
            </p>
          )}
        </Panel>
        </RecolheNoCelular>
      )}
    </div>
  )
}
