import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PodcastArtwork } from './PodcastArtwork'

const podcast = { podcast_name: 'Founder Stories', podcast_image_url: 'https://img.example/cover.jpg' }
const placeholder = (container: HTMLElement) => container.querySelector('[aria-hidden="true"]') as HTMLElement
const loadWithWidth = (img: HTMLElement, width: number) => {
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true })
  fireEvent.load(img)
}

describe('PodcastArtwork', () => {
  it('shows the placeholder until the cover has loaded, then fades the cover in', () => {
    const { container } = render(<PodcastArtwork podcast={podcast} />)
    const img = screen.getByRole('img', { name: 'Founder Stories cover' })
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(placeholder(container)).not.toHaveClass('opacity-0')
    loadWithWidth(img, 600)
    expect(img).toHaveClass('opacity-100')
    expect(placeholder(container)).toHaveClass('opacity-0')
  })

  it('treats an empty or broken image as no cover', () => {
    const { container, rerender } = render(<PodcastArtwork podcast={podcast} />)
    loadWithWidth(screen.getByRole('img'), 1)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(placeholder(container)).not.toHaveClass('opacity-0')

    rerender(<PodcastArtwork podcast={{ ...podcast, podcast_image_url: 'https://img.example/other.jpg' }} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
