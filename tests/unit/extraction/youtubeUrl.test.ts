import { describe, expect, it } from 'vitest'
import { isYouTubeUrl, isYouTubeShortsUrl } from '@application/extraction/extractInstagramCaption.ts'

describe('isYouTubeUrl', () => {
  // Every YouTube link must be recognized so it routes through the video
  // pipeline (captions → whisper) instead of the generic webpage extractor.
  it.each([
    'https://www.youtube.com/watch?v=wIC4GzVSAgI',
    'https://youtube.com/watch?v=wIC4GzVSAgI&t=10s',
    'https://m.youtube.com/watch?v=wIC4GzVSAgI',
    'https://www.youtube.com/shorts/wIC4GzVSAgI',
    'https://youtu.be/wIC4GzVSAgI',
    'https://www.youtube.com/live/wIC4GzVSAgI',
    'https://www.youtube.com/embed/wIC4GzVSAgI',
  ])('recognizes %s', (url) => {
    expect(isYouTubeUrl(url)).toBe(true)
  })

  it.each([
    'https://example.com/recipe',
    'https://www.tiktok.com/@user/video/123',
    'https://www.instagram.com/p/abc/',
    'https://vimeo.com/123456',
  ])('rejects non-YouTube %s', (url) => {
    expect(isYouTubeUrl(url)).toBe(false)
  })
})

describe('isYouTubeShortsUrl', () => {
  it('still matches only shorts and youtu.be', () => {
    expect(isYouTubeShortsUrl('https://www.youtube.com/shorts/wIC4GzVSAgI')).toBe(true)
    expect(isYouTubeShortsUrl('https://youtu.be/wIC4GzVSAgI')).toBe(true)
    expect(isYouTubeShortsUrl('https://www.youtube.com/watch?v=wIC4GzVSAgI')).toBe(false)
  })
})
