'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  id: string
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

interface TabsProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const id = React.useId()
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue || '')
  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue! : uncontrolledValue

  const handleValueChange = (newValue: string) => {
    if (!isControlled) {
      setUncontrolledValue(newValue)
    }
    onValueChange?.(newValue)
  }

  return (
    <TabsContext.Provider value={{ id, value, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) {
    throw new Error('Tabs components must be used within <Tabs>')
  }
  return ctx
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
        className
      )}
      {...props}
    />
  )
)
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, ...props }, ref) => {
    const { id, value: selectedValue, onValueChange } = useTabs()
    const isActive = selectedValue === value
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        id={`${id}-tab-${value}`}
        aria-controls={`${id}-panel-${value}`}
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        onClick={() => onValueChange(value)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]') || [])
          const currentIndex = tabs.indexOf(event.currentTarget)
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
          event.preventDefault()
          tabs[nextIndex]?.focus()
          tabs[nextIndex]?.click()
        }}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          isActive
            ? 'bg-background text-foreground shadow-sm'
            : 'hover:text-foreground',
          className
        )}
        {...props}
      />
    )
  }
)
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const { id, value: selectedValue } = useTabs()
    if (selectedValue !== value) return null
    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${id}-panel-${value}`}
        aria-labelledby={`${id}-tab-${value}`}
        className={cn(
          'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-fade-in',
          className
        )}
        {...props}
      />
    )
  }
)
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
