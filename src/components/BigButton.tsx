import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  variant?: 'primary' | 'secondary' | 'in' | 'out' | 'danger' | 'plain' | 'choice'
  size?: 'md' | 'xl'
  selected?: boolean
}

export default function BigButton({ icon, variant = 'primary', size = 'md', selected, className = '', children, ...rest }: Props) {
  const cls = ['btn', `btn-${variant}`, size === 'xl' ? 'btn-xl' : '', selected ? 'selected' : '', 'w-full', className].join(' ')
  return (
    <button type="button" className={cls} {...rest}>
      {icon && <span className="text-3xl leading-none">{icon}</span>}
      <span>{children}</span>
    </button>
  )
}
