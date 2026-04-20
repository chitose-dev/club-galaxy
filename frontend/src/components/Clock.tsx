import { useEffect, useState } from 'react'

/** 1秒更新の HH:MM 時計 (TRUST のヘッダー時刻相当) */
export default function Clock() {
  const [time, setTime] = useState(() => formatTime(new Date()))

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="tabular-nums tracking-wider text-white text-base font-semibold">
      {time}
    </span>
  )
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}
