'use client'

import Link from 'next/link'
import { useState } from 'react'

const links = [
  { href: '#frames', label: 'Frames' },
  { href: '#mattes', label: 'Mattes' },
  { href: '#accessories', label: 'Accessories' },
  { href: '#about', label: 'About' },
]

export default function ShopNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label="Toggle shop navigation"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-white/60 text-black/75 md:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      <nav className="hidden items-center gap-8 text-sm text-black/70 md:flex">
        {links.map((item) => (
          <a key={item.href} href={item.href}>{item.label}</a>
        ))}
      </nav>

      {open && (
        <div className="absolute left-0 right-0 top-14 z-20 rounded-2xl border border-black/10 bg-[#fdfbf6] p-3 shadow-[0_20px_44px_rgba(0,0,0,0.12)] md:hidden">
          <nav className="flex flex-col">
            {links.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm text-black/75 transition hover:bg-black/[0.04]">{item.label}</a>
            ))}
            <Link href="/login?next=/?nosplash=1" onClick={() => setOpen(false)} className="mt-1 rounded-xl px-3 py-2.5 text-sm font-medium text-black/85 transition hover:bg-black/[0.04]">Open app</Link>
          </nav>
        </div>
      )}
    </>
  )
}
