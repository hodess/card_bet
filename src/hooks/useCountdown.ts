import { useEffect, useState } from 'react'

export function useCountdown(deadline: number | null, offset: number): number {
  const [remaining, setRemaining] = useState(Infinity)
  useEffect(() => {
    if (deadline === null) return
    const tick = () => setRemaining(deadline - (Date.now() + offset))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [deadline, offset])
  return remaining
}
