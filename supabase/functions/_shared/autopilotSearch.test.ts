import { HttpError } from './httpError.ts'
import { podscanSearchFailureKind, PodscanSearchError, searchAcrossQueries } from './autopilotSearch.ts'

function assertEquals(actual: unknown, expected: unknown, note = ''): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`${note} expected ${right}, received ${left}`)
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

/** A search that answers or fails per query, recording what it was asked. */
function scripted(answers: Record<string, string[] | PodscanSearchError>) {
  const asked: string[] = []
  const search = (query: string) => {
    asked.push(query)
    const answer = answers[query]
    return answer instanceof PodscanSearchError ? Promise.reject(answer) : Promise.resolve(answer ?? [])
  }
  return { search, asked }
}

const unavailable = () => new PodscanSearchError('unavailable')

Deno.test('names the failure kind from the shared client error', () => {
  assertEquals(podscanSearchFailureKind(new HttpError(502, 'PODSCAN_UPSTREAM_403', 'x')), 'refused')
  assertEquals(podscanSearchFailureKind(new HttpError(500, 'PODSCAN_NOT_CONFIGURED', 'x')), 'refused')
  assertEquals(podscanSearchFailureKind(new HttpError(429, 'PODSCAN_DAILY_LIMIT', 'x')), 'quota')
  assertEquals(podscanSearchFailureKind(new HttpError(504, 'PODSCAN_DEADLINE_EXCEEDED', 'x')), 'unavailable')
  assertEquals(podscanSearchFailureKind(new HttpError(502, 'PODSCAN_UPSTREAM_503', 'x')), 'unavailable')
})

Deno.test('a refused key ends the run on the first query', async () => {
  const { search, asked } = scripted({ a: new PodscanSearchError('refused'), b: ['show'] })
  const error = await rejection(searchAcrossQueries(['a', 'b'], search))
  assertEquals(error instanceof PodscanSearchError && error.kind, 'refused')
  assertEquals(asked, ['a'])
})

Deno.test('a spent quota ends the run on the first query', async () => {
  const { search, asked } = scripted({ a: ['show'], b: new PodscanSearchError('quota'), c: ['other'] })
  const error = await rejection(searchAcrossQueries(['a', 'b', 'c'], search))
  assertEquals(error instanceof PodscanSearchError && error.kind, 'quota')
  assertEquals(asked, ['a', 'b'])
})

Deno.test('one unavailable query still leaves the others', async () => {
  const { search, asked } = scripted({ a: unavailable(), b: ['show-b'], c: ['show-c'] })
  const outcome = await searchAcrossQueries(['a', 'b', 'c'], search)
  assertEquals(asked, ['a', 'b', 'c'])
  assertEquals(outcome, { results: [['show-b'], ['show-c']], successful: 2 })
})

Deno.test('an answered query with nothing new is still an answer, not a failed run', async () => {
  // The others found only shows already on the list (empty after filtering
  // upstream of this) and one failed: the run did search.
  const { search } = scripted({ a: [], b: unavailable() })
  const outcome = await searchAcrossQueries(['a', 'b'], search)
  assertEquals(outcome, { results: [[]], successful: 1 })
})

Deno.test('the run fails only when no query was answered', async () => {
  const { search } = scripted({ a: unavailable(), b: unavailable() })
  const error = await rejection(searchAcrossQueries(['a', 'b'], search))
  assertEquals(error instanceof PodscanSearchError && error.kind, 'unavailable')
})

Deno.test('an unexpected error is not mistaken for an index failure', async () => {
  const search = () => Promise.reject(new TypeError('bug'))
  const error = await rejection(searchAcrossQueries(['a'], search))
  assertEquals(error instanceof TypeError, true)
})

Deno.test('queries are spaced, with no wait after the last', async () => {
  const waits: number[] = []
  const { search } = scripted({ a: ['x'], b: ['y'], c: ['z'] })
  await searchAcrossQueries(['a', 'b', 'c'], search, {
    spacingMs: 600,
    sleep: (ms) => {
      waits.push(ms)
      return Promise.resolve()
    },
  })
  assertEquals(waits, [600, 600])
})
