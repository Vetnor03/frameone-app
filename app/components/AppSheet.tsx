'use client'

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Portaled sheets must respect the visibility of a cached but hidden tab.
export const AppSheetVisibilityContext = createContext(true)

type Viewport = { top: number; left: number; width: number; height: number; keyboardOpen: boolean }

function visibleViewport(): Viewport {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  return {
    top: viewport?.offsetTop ?? 0,
    left: viewport?.offsetLeft ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height,
    keyboardOpen: window.innerHeight - height > 140,
  }
}

/**
 * Mobile-first dialog for the fixed RE:MIND app shell.
 * Rendered at document.body so parent scrollers/transforms cannot clip it.
 * iOS changes the visual viewport when the keyboard appears; 100vh/100dvh
 * alone are not reliable in installed web apps and Safari.
 */
export default function AppSheet({
  children,
  footer,
  onClose,
  dismissible = true,
  title,
  className = '',
}: {
  children: ReactNode
  footer?: ReactNode
  onClose?: () => void
  dismissible?: boolean
  title: string
  className?: string
}) {
  const labelId = useId()
  const parentTabVisible = useContext(AppSheetVisibilityContext)
  const [viewport, setViewport] = useState<Viewport | null>(null)

  useEffect(() => {
    const update = () => setViewport(visibleViewport())
    update()
    const visual = window.visualViewport
    window.addEventListener('resize', update)
    visual?.addEventListener('resize', update)
    visual?.addEventListener('scroll', update)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible && onClose) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', update)
      visual?.removeEventListener('resize', update)
      visual?.removeEventListener('scroll', update)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [dismissible, onClose])

  if (!viewport || !parentTabVisible) return null

  return createPortal(
    <div
      className="remind-app fixed z-[200] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      style={{
        top: viewport.top,
        left: viewport.left,
        width: viewport.width,
        height: viewport.height,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose?.()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`flex min-h-0 w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] border border-[color:var(--bd-10)] bg-[color:var(--sheet-bg)] shadow-2xl sm:rounded-3xl ${className}`}
        style={{ maxHeight: 'calc(100% - 8px)' }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-5 [-webkit-overflow-scrolling:touch]">
          <h2 id={labelId} className="sr-only">{title}</h2>
          {children}
        </div>
        {footer && (
          <div
            className="shrink-0 border-t border-[color:var(--bd-10)] bg-[color:var(--sheet-bg)] px-5 pt-3"
            style={{ paddingBottom: viewport.keyboardOpen ? 12 : 'max(16px, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
        {!footer && <div style={{ height: viewport.keyboardOpen ? 8 : 'max(12px, env(safe-area-inset-bottom))' }} />}
      </section>
    </div>,
    document.body,
  )
}
