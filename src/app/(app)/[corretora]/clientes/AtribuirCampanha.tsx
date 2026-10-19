'use client'

// Botão e modal "Atribuir à campanha" (S52): marca o atendente da campanha de ativação nos clientes
// selecionados na lista, em lote. Só mexe em cliente_corretora.ativador: responsável e comissão ficam.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { atribuirAtivador } from '@/lib/gestao/acoes'
import type { Corretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'

export function AtribuirCampanha({ corretora, clienteIds, atendentes, onFeito }: {
  corretora: Corretora
  clienteIds: string[]       // clientes selecionados na lista
  atendentes: string[]       // responsáveis que atendem clientes (Parâmetros › Responsáveis)
  onFeito: () => void        // a lista limpa a seleção
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const [aberto, setAberto] = useState(false)
  const [atendente, setAtendente] = useState(atendentes[0] ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const n = clienteIds.length

  const confirmar = async () => {
    setSalvando(true); setErro(null)
    const r = await atribuirAtivador(corretora, clienteIds, atendente || null)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({
      titulo: atendente ? `${fmtNum(n)} ${n === 1 ? 'conta atribuída' : 'contas atribuídas'} a ${atendente}` : `${fmtNum(n)} ${n === 1 ? 'conta tirada' : 'contas tiradas'} da campanha`,
      detalhe: r.dados.contas !== n ? `${fmtNum(r.dados.contas)} mudaram; as outras já estavam assim.` : 'O responsável e a comissão não mudam.',
      tom: 'gain',
    })
    setAberto(false)
    onFeito()
    router.refresh()
  }

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)} disabled={n === 0}><UserCheck className="h-4 w-4" aria-hidden />Atribuir à campanha</Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Atribuir à campanha de ativação" size="sm"
        subtitle={`${fmtNum(n)} ${n === 1 ? 'cliente selecionado' : 'clientes selecionados'}. Quem vai trabalhar essas contas? O responsável e a comissão não mudam.`}
        footer={<>
          <Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
          <Button onClick={confirmar} loading={salvando}>{atendente ? `Atribuir a ${atendente}` : 'Tirar da campanha'}</Button>
        </>}>
        {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
        <Select label="Atendente" value={atendente} onChange={e => setAtendente(e.target.value)} hint="Nomes de Parâmetros › Responsáveis que atendem clientes">
          {atendentes.map(a => <option key={a} value={a}>{a}</option>)}
          <option value="">Tirar da campanha</option>
        </Select>
        {atendentes.length === 0 && <p className="mt-2 text-label text-warn">Nenhum responsável que atende clientes em Parâmetros › Responsáveis: cadastre a pessoa antes.</p>}
      </Modal>
    </>
  )
}
