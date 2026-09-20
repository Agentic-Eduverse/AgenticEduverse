'use client'

import { useEffect } from 'react'

export default function PagePerformanceController() {
  useEffect(() => {
    const update = () => document.documentElement.classList.toggle('page-hidden', document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      document.documentElement.classList.remove('page-hidden')
    }
  }, [])
  return null
}
