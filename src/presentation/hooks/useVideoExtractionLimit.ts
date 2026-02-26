import { useState, useCallback } from 'react'
import { getVideoExtractionCounts, incrementVideoExtraction, type VideoPlatform } from '@infrastructure/usage/videoExtractionStore.ts'

const FREE_VIDEO_LIMIT = 3

export function useVideoExtractionLimit(isPaid: boolean) {
  const [counts, setCounts] = useState(getVideoExtractionCounts)

  const canExtract = useCallback((platform: VideoPlatform): boolean => {
    return isPaid || counts[platform] < FREE_VIDEO_LIMIT
  }, [isPaid, counts])

  const remaining = useCallback((platform: VideoPlatform): number => {
    return Math.max(0, FREE_VIDEO_LIMIT - counts[platform])
  }, [counts])

  const recordExtraction = useCallback((platform: VideoPlatform): void => {
    incrementVideoExtraction(platform)
    setCounts(getVideoExtractionCounts())
  }, [])

  return { canExtract, remaining, recordExtraction }
}
