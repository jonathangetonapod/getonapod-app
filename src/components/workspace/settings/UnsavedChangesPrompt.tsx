import { useContext, useEffect, useRef, useState } from 'react'
import { createPath, UNSAFE_NavigationContext, useLocation, type To } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface HistoryNavigator {
  push: (to: To, state?: unknown, options?: unknown) => void
  replace: (to: To, state?: unknown, options?: unknown) => void
}

/**
 * Asks before leaving the page with edits that have not been saved.
 *
 * Closing or reloading the tab gets the browser's own prompt. Moving to
 * another page in the app is caught where the router changes the address:
 * the app uses BrowserRouter, which has no blocker of its own (useBlocker
 * needs a data router), so the navigator's push and replace are wrapped
 * while there is something to lose. Moving within this page (the section
 * menu, a link to one of its fields) changes only the hash and passes.
 *
 * The browser's back button is not caught: popstate cannot be cancelled, and
 * undoing it afterwards fights the browser.
 */
export const UnsavedChangesPrompt = ({ when }: { when: boolean }) => {
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const [pending, setPending] = useState<(() => void) | null>(null)
  // The router's location, not the window's: they agree in the browser, but
  // only the router's is right under a MemoryRouter.
  const location = useLocation()
  const pathnameRef = useRef(location.pathname)
  pathnameRef.current = location.pathname

  useEffect(() => {
    if (!when) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [when])

  useEffect(() => {
    if (!when) return
    const history = navigator as unknown as HistoryNavigator
    const { push, replace } = history
    const guard = (go: HistoryNavigator['push']): HistoryNavigator['push'] => (to, state, options) => {
      // The router resolves relative links before they reach the navigator.
      const target = new URL(typeof to === 'string' ? to : createPath(to), `http://app${pathnameRef.current}`)
      if (target.pathname === pathnameRef.current) {
        go.call(history, to, state, options)
        return
      }
      setPending(() => () => go.call(history, to, state, options))
    }
    history.push = guard(push)
    history.replace = guard(replace)
    return () => {
      history.push = push
      history.replace = replace
    }
  }, [navigator, when])

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>
            You have changes on this page that have not been saved. If you leave now, they are lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay on this page</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const go = pending
              setPending(null)
              go?.()
            }}
          >
            Leave without saving
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
