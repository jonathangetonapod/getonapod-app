import { describe, expect, it } from 'vitest'
import { decodeFeedText, withDecodedPodcastName, withDecodedPodcastNames, withDecodedPodcastNamesIn } from '@/lib/feedText'

describe('decodeFeedText', () => {
  it('decodes the entities feeds publish in show names', () => {
    expect(decodeFeedText('The Good, Bad, &amp; the Ugly of Self Storage'))
      .toBe('The Good, Bad, & the Ugly of Self Storage')
    expect(decodeFeedText('It&#8217;s Storage &#8212; Weekly')).toBe('It’s Storage — Weekly')
    expect(decodeFeedText('Peter&#39;s show')).toBe("Peter's show")
  })

  // The old decoder replaced entities in sequence, so it turned "&amp;" into
  // "&" and then re-read its own output. Text that escaped an entity on
  // purpose came out as the character it had escaped.
  it('decodes an escaped entity once, never twice', () => {
    expect(decodeFeedText('Tags &amp;lt;p&amp;gt; explained')).toBe('Tags &lt;p&gt; explained')
  })

  it('strips tags, keeping paragraphs apart', () => {
    expect(decodeFeedText('<p>One.</p><p>Two.</p>')).toBe('One.\n\nTwo.')
    expect(decodeFeedText('One.<br>Two.')).toBe('One.\nTwo.')
    expect(decodeFeedText('<p><strong>Bold</strong> lead.</p>')).toBe('Bold lead.')
  })

  it('leaves clean text alone and reduces empty markup to nothing', () => {
    expect(decodeFeedText('Operator Weekly')).toBe('Operator Weekly')
    expect(decodeFeedText('<p></p>')).toBe('')
    expect(decodeFeedText('')).toBe('')
  })
})

describe('withDecodedPodcastName', () => {
  it('decodes podcast_name on a row, a list, or the named keys of a payload', () => {
    const row = { id: 'a', podcast_name: 'Angels, Exits, &amp; Acquisitions' }
    expect(withDecodedPodcastName(row)).toEqual({ id: 'a', podcast_name: 'Angels, Exits, & Acquisitions' })
    expect(withDecodedPodcastNames([row])[0].podcast_name).toBe('Angels, Exits, & Acquisitions')
    expect(withDecodedPodcastNames(null)).toEqual([])

    const payload = { campaign: { podcast_name: 'Left &amp; alone' }, targets: [row], target: row }
    const decoded = withDecodedPodcastNamesIn(payload, ['targets', 'target'])
    expect(decoded.targets[0].podcast_name).toBe('Angels, Exits, & Acquisitions')
    expect(decoded.target.podcast_name).toBe('Angels, Exits, & Acquisitions')
    expect(decoded.campaign.podcast_name).toBe('Left &amp; alone')
  })

  it('passes through anything that is not a named row', () => {
    expect(withDecodedPodcastName({ podcast_name: null })).toEqual({ podcast_name: null })
    expect(withDecodedPodcastNamesIn(null, ['targets'])).toBeNull()
    const untouched = { other: 1 }
    expect(withDecodedPodcastNamesIn(untouched, ['targets'])).toBe(untouched)
  })
})
