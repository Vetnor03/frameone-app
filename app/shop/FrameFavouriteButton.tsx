'use client'

import { useEffect, useState, type MouseEvent } from 'react'

const STORAGE_KEY = 'remind-frame-favourites-v1'
const VISITOR_KEY = 'remind-frame-interest-visitor-v1'

function storedFavourites() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function visitorId() {
  let id = window.localStorage.getItem(VISITOR_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}

export default function FrameFavouriteButton({ frameId, frameName, className = '' }: { frameId: string; frameName: string; className?: string }) {
  const [favourite, setFavourite] = useState(false)

  useEffect(() => setFavourite(storedFavourites().includes(frameId)), [frameId])

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const next = !favourite
    const favourites = new Set(storedFavourites())
    if (next) favourites.add(frameId)
    else favourites.delete(frameId)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...favourites]))
    setFavourite(next)

    void fetch('/api/shop/frame-interest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ frameId, visitorId: visitorId(), favourite: next }),
      keepalive: true,
    }).catch(() => undefined)
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={favourite} aria-label={favourite ? `Remove ${frameName} from favourites` : `Favourite ${frameName}`} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[24px] leading-none text-black/70 transition-colors hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${className}`}>
      <span aria-hidden="true">{favourite ? '♥' : '♡'}</span>
    </button>
  )
}
