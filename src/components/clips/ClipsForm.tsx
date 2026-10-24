import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useClipsCountdown } from '@/components/clips/clipsMotion'
import { readClipsAttribution, trackClips } from '@/lib/clipsAnalytics'
import { CLIPS_CAL_URL, CLIPS_CONTACT_EMAIL, CLIPS_FINAL, isYouTubeUrl } from '@/lib/clipsContent'
import { requestClipsCut } from '@/services/clipsLeads'

type Field = 'name' | 'email' | 'show'

const COPY = CLIPS_FINAL.form

/** The three checks the function will make again. Run here so a blank form never burns a rate-limit slot. */
function localProblem(values: Record<Field, string>): { field: Field; message: string } | null {
  if (!values.name.trim()) return { field: 'name', message: COPY.errors.name }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email.trim())) return { field: 'email', message: COPY.errors.email }
  if (!isYouTubeUrl(values.show)) return { field: 'show', message: COPY.errors.show }
  return null
}

/** The success state: a clock from the moment they submitted, and where the clips will land. */
const Receipt = ({ email, startedAt }: { email: string; startedAt: number }) => {
  const clock = useClipsCountdown(startedAt)
  return (
    <div className="clips-form clips-form-done" role="status">
      <div className="clips-clock" role="timer" aria-label="72 hours remaining">{clock}</div>
      <h3 className="clips-done-title">{COPY.success.title}</h3>
      <p className="clips-done-body">{COPY.success.body(email)}</p>
      <a
        className="clips-done-link"
        href={CLIPS_CAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackClips('clips_book_call_click', { location: 'final' })}
      >
        {COPY.success.link}<span className="clips-sr"> (opens in a new tab)</span>
      </a>
    </div>
  )
}

/**
 * The free-cut form. Three fields, a hidden honeypot, and a clock that starts
 * when the page renders so a submission under three seconds can be dropped.
 */
const LeadForm = ({ onDone }: { onDone: (email: string, startedAt: number) => void }) => {
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', show: '' })
  const [honeypot, setHoneypot] = useState('')
  const [problem, setProblem] = useState<{ field: Field; message: string } | null>(null)
  const started = useRef(false)
  const renderedAt = useRef(Date.now())
  useEffect(() => { renderedAt.current = Date.now() }, [])

  const submit = useMutation({
    mutationFn: () => requestClipsCut({
      ...values,
      website: honeypot,
      elapsedMs: Date.now() - renderedAt.current,
      attribution: readClipsAttribution(),
    }),
    onSuccess: (receipt) => {
      trackClips('clips_form_submit')
      onDone(values.email.trim().toLowerCase(), Date.parse(receipt.startedAt) || Date.now())
    },
  })

  const onFocus = () => {
    if (started.current) return
    started.current = true
    trackClips('clips_form_start')
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submit.isPending) return
    const found = localProblem(values)
    setProblem(found)
    if (found) {
      trackClips('clips_form_error', { field: found.field })
      document.getElementById(`clips-${found.field}`)?.focus()
      return
    }
    submit.mutate()
  }

  const field = (name: Field, type: string, autoComplete: string, inputMode?: 'email' | 'url') => {
    const invalid = problem?.field === name
    return (
      <div className="clips-field">
        <label htmlFor={`clips-${name}`}>{COPY[name].label}</label>
        <input
          id={`clips-${name}`}
          name={name}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder={COPY[name].placeholder}
          required
          maxLength={name === 'show' ? 500 : name === 'email' ? 254 : 60}
          value={values[name]}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `clips-${name}-error` : undefined}
          onFocus={onFocus}
          onChange={(event) => { setValues((current) => ({ ...current, [name]: event.target.value })); if (invalid) setProblem(null) }}
        />
        {invalid ? <p id={`clips-${name}-error`} className="clips-field-error" role="alert">{problem.message}</p> : null}
      </div>
    )
  }

  return (
    <form className="clips-form" noValidate onSubmit={onSubmit}>
      <div className="clips-form-row">
        {field('name', 'text', 'given-name')}
        {field('email', 'email', 'email', 'email')}
      </div>
      {field('show', 'url', 'url', 'url')}
      {/* Honeypot: off-screen and out of the accessibility tree. People never see it; form-fillers fill it. */}
      <div className="clips-honeypot" aria-hidden="true">
        <label htmlFor="clips-website">Website</label>
        <input id="clips-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
      </div>
      <button type="submit" className="clips-btn" disabled={submit.isPending}>
        {submit.isPending ? 'Starting the clock…' : COPY.submit}
      </button>
      {submit.isError ? (
        <p className="clips-form-error" role="alert">
          Something broke on our side. Email <a href={`mailto:${CLIPS_CONTACT_EMAIL}`}>{CLIPS_CONTACT_EMAIL}</a> and we&apos;ll start the clock by hand.
        </p>
      ) : (
        <p className="clips-form-note">{COPY.note}</p>
      )}
    </form>
  )
}

/** The lime band at the bottom: the ask, the ghost clock, and the form. This is #cut. */
export const ClipsFinal = () => {
  const [receipt, setReceipt] = useState<{ email: string; startedAt: number } | null>(null)
  const [loadedAt] = useState(() => Date.now())
  const ghostClock = useClipsCountdown(loadedAt)

  return (
    <section id="cut" className="clips-final" aria-labelledby="clips-final-title">
      <div className="clips-ghost clips-ghost-clock" aria-hidden="true">{ghostClock}</div>
      <div className="clips-wrap clips-section clips-final-inner">
        <div className="clips-final-text">
          <div className="clips-final-eyebrow">{CLIPS_FINAL.eyebrow}</div>
          <h2 id="clips-final-title" className="clips-h2 clips-final-title">
            {CLIPS_FINAL.title[0]}<br />{CLIPS_FINAL.title[1]}<br />{CLIPS_FINAL.title[2]}
          </h2>
          <p className="clips-final-body">{CLIPS_FINAL.body}</p>
        </div>
        {receipt
          ? <Receipt email={receipt.email} startedAt={receipt.startedAt} />
          : <LeadForm onDone={(email, startedAt) => setReceipt({ email, startedAt })} />}
      </div>
    </section>
  )
}
