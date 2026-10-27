import { useCallback, useEffect, useRef, useState } from 'react'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveFieldOptions {
  /** What the server holds now. */
  serverValue: string
  save: (value: string) => Promise<void>
  /** A message when the value cannot be saved as it stands, or null. */
  validate?: (value: string) => string | null
  /** The form the value is saved and compared in (trimmed, a link out of embed code). */
  normalize?: (value: string) => string
  /** How long typing has to pause before saving without a blur. */
  debounceMs?: number
}

const SAVED_SHOWN_MS = 2500
const identity = (value: string) => value

/**
 * One field that saves itself: when it loses focus, or once typing pauses.
 *
 * Settings saved four different ways, and the single fields each had their
 * own button, which was easy to leave unpressed. A value the field cannot
 * save (an empty workspace name, half an email address) is never sent; it
 * waits for the blur to say why, rather than complaining mid-keystroke.
 */
export function useAutoSaveField({
  serverValue,
  save,
  validate,
  normalize = identity,
  debounceMs = 1200,
}: UseAutoSaveFieldOptions) {
  const [value, setValueState] = useState(serverValue)
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const valueRef = useRef(serverValue)
  // The last value known to be on the server: seeded from it, and moved on by
  // each save that lands, so a field is clean the moment its save returns
  // rather than when the refetch after it does.
  const savedRef = useRef(normalize(serverValue))
  const lastServerRef = useRef(serverValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)
  const latest = useRef({ save, validate, normalize })
  latest.current = { save, validate, normalize }

  /*
   * A change on the server reaches the field only while nobody is editing it:
   * the staff view refetches on focus and after unrelated mutations, and
   * re-seeding on every one of those wiped a half-typed value.
   */
  useEffect(() => {
    if (serverValue === lastServerRef.current) return
    const edited = valueRef.current !== lastServerRef.current
      && latest.current.normalize(valueRef.current) !== savedRef.current
    lastServerRef.current = serverValue
    savedRef.current = latest.current.normalize(serverValue)
    if (!edited) {
      valueRef.current = serverValue
      setValueState(serverValue)
    }
  }, [serverValue])

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const commit = useCallback(async (): Promise<void> => {
    clearTimer()
    // One save at a time: a second waits for the first, then saves whatever
    // the field holds by then.
    if (inFlightRef.current) {
      await inFlightRef.current
    }
    const { save: saveValue, validate: check, normalize: norm } = latest.current
    const next = norm(valueRef.current)
    if (next === savedRef.current) {
      setError(null)
      setStatus((current) => (current === 'error' ? 'idle' : current))
      return
    }
    const problem = check?.(next) ?? null
    if (problem) {
      setError(problem)
      setStatus('error')
      return
    }
    setError(null)
    setStatus('saving')
    const run = (async () => {
      try {
        await saveValue(next)
        savedRef.current = next
        // Show the saved form (a link taken out of embed code, a trimmed
        // name) unless the person has typed on since.
        if (norm(valueRef.current) === next && valueRef.current !== next) {
          valueRef.current = next
          setValueState(next)
        }
        setStatus('saved')
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setStatus((current) => (current === 'saved' ? 'idle' : current)), SAVED_SHOWN_MS)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'This could not be saved.')
        setStatus('error')
      }
    })()
    inFlightRef.current = run
    await run
    inFlightRef.current = null
  }, [])

  const setValue = useCallback((next: string) => {
    valueRef.current = next
    setValueState(next)
    clearTimer()
    if (status === 'error') {
      setError(null)
      setStatus('idle')
    }
    const { validate: check, normalize: norm } = latest.current
    if (!check?.(norm(next))) {
      timerRef.current = setTimeout(() => void commit(), debounceMs)
    }
  }, [commit, debounceMs, status])

  /** Sets the value and saves it straight away, for a one-click fill. */
  const setAndSave = useCallback((next: string) => {
    valueRef.current = next
    setValueState(next)
    void commit()
  }, [commit])

  // Leaving the page mid-pause still saves what was typed.
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      void commit()
    }
  }, [commit])

  const normalized = normalize(value)
  return {
    value,
    setValue,
    setAndSave,
    onBlur: () => void commit(),
    status,
    error,
    /** Differs from the server and cannot be saved yet, so leaving would lose it. */
    unsaved: normalized !== savedRef.current && (status === 'error' || Boolean(validate?.(normalized))),
  }
}
