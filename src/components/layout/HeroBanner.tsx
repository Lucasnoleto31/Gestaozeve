interface HeroBannerProps {
  children: React.ReactNode
}

export function HeroBanner({ children }: HeroBannerProps) {
  return (
    <div
      className="relative overflow-hidden"
      style={{ background: 'linear-gradient(140deg, #0A1628 0%, #0F2550 50%, #1764F4 100%)' }}
    >
      {/* Grid texture */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      {/* Radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 80% 40%, rgba(23,100,244,0.4) 0%, transparent 70%)',
        }}
      />
      <div className="relative z-10 px-6 py-8">{children}</div>
    </div>
  )
}

/** Glass KPI card for use inside HeroBanner */
export function BannerKpi({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1 leading-tight">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-blue-200/50 mt-1">{sub}</p>}
    </div>
  )
}

/** Glass action button for use inside HeroBanner */
export function BannerButton({
  children,
  onClick,
  href,
  as: Tag = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  as?: 'button' | 'a'
}) {
  const cls =
    'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer'
  const style = {
    background: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.22)',
  }
  if (Tag === 'a') {
    return (
      <a href={href} className={cls} style={style}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls} style={style}>
      {children}
    </button>
  )
}
