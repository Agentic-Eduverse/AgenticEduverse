import * as React from 'react'
import { cn } from '@/lib/utils'

interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'default' | 'lg'
}

export function Loader({ className, size = 'default', ...props }: LoaderProps) {
  const sizeClass =
    size === 'sm' ? 'h-4 w-4 border-2' :
    size === 'lg' ? 'h-8 w-8 border-4' :
    'h-6 w-6 border-2'

  return (
    <div
      role="status"
      aria-label="加载中"
      className={cn('animate-spin rounded-full border-solid border-muted border-t-primary', sizeClass, className)}
      {...props}
    />
  )
}
