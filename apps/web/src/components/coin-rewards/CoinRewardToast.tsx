'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

export default function CoinRewardToast() {
  const totalCoinsRef = useRef(0)

  useEffect(() => {
    const handleCoinReward = (event: CustomEvent<{ amount: number; total?: number }>) => {
      const amount = event.detail?.amount || 1
      totalCoinsRef.current = event.detail?.total ?? totalCoinsRef.current + amount

      toast.custom(
        (t) => (
          <div className="relative min-w-[200px] overflow-hidden rounded-xl border bg-white p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="text-4xl block animate-bounce-slow">🪙</span>
                <div className="absolute -top-1 -right-1">
                  <span className="text-yellow-500 text-xl font-bold animate-ping">✨</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-yellow-600">+{amount}</span>
                  <span className="text-sm font-medium text-yellow-700">金币</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  累计: {totalCoinsRef.current} 金币
                </p>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 animate-shrink" />
          </div>
        ),
        {
          duration: 2500,
          position: 'top-right',
        }
      )

    }

    window.addEventListener('coin-reward', handleCoinReward as EventListener)

    return () => {
      window.removeEventListener('coin-reward', handleCoinReward as EventListener)
    }
  }, [])

  return null
}
