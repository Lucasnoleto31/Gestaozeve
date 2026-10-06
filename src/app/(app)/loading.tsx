import { PageSkeleton } from '@/components/ui/Skeleton'

// Esqueleto enquanto a página (Server Component) busca os dados
export default function Loading() {
  return <PageSkeleton kpis={6} linhas={8} />
}
