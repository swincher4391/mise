const KEYS = {
  tiktok: 'mise_video_extract_tiktok',
  youtube: 'mise_video_extract_youtube',
  instagram: 'mise_video_extract_instagram',
} as const

export type VideoPlatform = keyof typeof KEYS

export interface VideoExtractionCounts {
  tiktok: number
  youtube: number
  instagram: number
}

export function getVideoExtractionCounts(): VideoExtractionCounts {
  return {
    tiktok: parseInt(localStorage.getItem(KEYS.tiktok) || '0', 10),
    youtube: parseInt(localStorage.getItem(KEYS.youtube) || '0', 10),
    instagram: parseInt(localStorage.getItem(KEYS.instagram) || '0', 10),
  }
}

export function incrementVideoExtraction(platform: VideoPlatform): void {
  const key = KEYS[platform]
  const current = parseInt(localStorage.getItem(key) || '0', 10)
  localStorage.setItem(key, String(current + 1))
}
