'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MessageCircle, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage, Participant } from '@eduverse/shared'

interface ChatSidebarProps {
  messages: ChatMessage[]
  onSend: (content: string) => void
  currentUser: Participant
  className?: string
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function formatTime(ts?: Date | string | number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function getInitials(name: string): string {
  return name.slice(0, 1).toUpperCase()
}

export default function ChatSidebar({
  messages,
  onSend,
  currentUser,
  className,
  mobileOpen = false,
  onMobileClose,
}: ChatSidebarProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const content = input.trim()
    if (!content) return
    onSend(content)
    setInput('')
  }

  const content = (
    <div
      className={cn(
        'light-ui w-full md:w-80 h-full flex flex-col bg-white text-slate-900 border-l border-slate-200',
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <span className="font-semibold">课堂聊天</span>
        </div>
        {onMobileClose && (
          <Button variant="ghost" size="icon" onClick={onMobileClose} className="md:hidden">
            <span className="sr-only">关闭课堂聊天</span>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-8">
            暂无消息，发送第一条吧！
          </div>
        )}

        {messages.map((msg, idx) => {
          const isSystem = msg.role === 'system'
          const isSelf = msg.role === 'assistant' ? false : msg.role === 'user'

          if (isSystem) {
            return (
              <div key={idx} className="flex justify-center">
                <Badge variant="secondary" className="px-3 py-1 text-xs">
                  {msg.content}
                </Badge>
              </div>
            )
          }

          const displayName = msg.userName || (msg.role === 'assistant' ? '教师' : isSelf ? currentUser.name : '同学')

          return (
            <div
              key={idx}
              className={cn(
                'flex gap-2',
                isSelf ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  'max-w-[75%] flex flex-col gap-1',
                  isSelf ? 'items-end' : 'items-start'
                )}
              >
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium">{displayName}</span>
                  <span>{formatTime(msg.timestamp)}</span>
                </div>
                <div
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm',
                    isSelf
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-slate-100 text-slate-800 rounded-tl-none'
                  )}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            rows={2}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 md:hidden',
          mobileOpen ? 'block' : 'hidden'
        )}
        onClick={onMobileClose}
      />
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 md:static md:z-0 transform transition-transform md:transform-none',
          mobileOpen ? 'translate-x-0' : 'translate-x-full',
          'md:translate-x-0'
        )}
      >
        {content}
      </div>
    </>
  )
}
