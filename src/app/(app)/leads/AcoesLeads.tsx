'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { LeadForm } from './LeadForm'
import { lerArquivo } from '@/lib/gestao/lerArquivo'
import { lerLeads, type LeadImport } from '@/lib/gestao/planilhas'
import { importarLeads } from '@/lib/gestao/acoes'
import type { StatusLead } from '@/lib/gestao/tipos'
import { fmtNum } from '@/lib/format'

export function AcoesLeads({ responsaveis, status, admin }: { responsaveis: string[]; status: StatusLead[]; admin: boolean }) {
  const router = useRouter()
  const [novo, setNovo] = useState(false)
  const [imp, setImp] = useState(false)
  const [lido, setLido] = useState<{ nome: string; linhas: LeadImport[]; faltando: string[]; equipe: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const escolher = async (file: File | null) => {
    if (!file) return
    setErro(null); setOk(null); setOcupado(true)
    try {
      const { dados } = await lerArquivo(file)
      const r = lerLeads(dados)
      if (!r.ok) { setErro(r.erro); setLido(null) } else setLido({ nome: file.name, linhas: r.linhas, faltando: r.faltando, equipe: r.linhas.some(l => l.responsavel || l.status || l.origem || l.ultimo_contato) })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ler o arquivo')
    }
    setOcupado(false)
  }
  const importar = async () => {
    if (!lido) return
    setOcupado(true); setErro(null)
    const r = await importarLeads(lido.nome, lido.linhas)
    setOcupado(false)
    if (!r.ok) { setErro(r.erro); return }
    setOk(`${fmtNum(r.dados.novos)} leads novos · ${fmtNum(r.dados.atualizados)} atualizados · ${fmtNum(r.dados.linhas - r.dados.novos - r.dados.atualizados)} já existiam sem mudança`)
    setLido(null)
    router.refresh()
  }

  return (
    <>
      {admin && <Button variant="secondary" onClick={() => { setImp(true); setOk(null); setErro(null) }}><Upload className="h-4 w-4" />Importar export</Button>}
      <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4" />Novo lead</Button>
      {novo && <LeadForm lead={null} aberto={novo} onClose={() => setNovo(false)} responsaveis={responsaveis} status={status} admin={admin} />}
      <Modal open={imp} onClose={() => setImp(false)} title="Importar export do formulário" subtitle="Cole o export (Data/Hora, Nome, WhatsApp, CPF, Email, Já opera?, Corretora). Leads que já existem não duplicam; se o arquivo trouxer as colunas da equipe (Origem, Responsável, Status…), elas completam o que estiver em branco."
        footer={<><Button variant="secondary" onClick={() => setImp(false)}>Fechar</Button><Button disabled={!lido} loading={ocupado} onClick={importar}>Importar {lido ? fmtNum(lido.linhas.length) : ''} leads</Button></>}>
        <div className="space-y-3">
          {erro && <Alert tone="danger">{erro}</Alert>}
          {ok && <Alert tone="success">{ok}</Alert>}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { escolher(e.target.files?.[0] ?? null); e.target.value = '' }} />
          {lido && (
            <div className="text-sm text-fg-muted">
              <p><b className="text-fg">{lido.nome}</b> · {fmtNum(lido.linhas.length)} leads lidos · colunas da equipe: {lido.equipe ? 'sim' : 'não'}</p>
              {lido.faltando.length > 0 && <p className="text-warning">Colunas não encontradas: {lido.faltando.join(', ')}</p>}
              <p className="mt-1 text-xs">Primeiro: {lido.linhas[0]?.nome} ({lido.linhas[0]?.data_hora.slice(0, 10)}) · último: {lido.linhas[lido.linhas.length - 1]?.nome}</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
