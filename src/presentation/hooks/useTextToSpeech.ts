import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseTextToSpeechResult {
  speak: (text: string) => void
  stop: () => void
  isSupported: boolean
  isSpeaking: boolean
}

export function useTextToSpeech(): UseTextToSpeechResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.cancel()
    utteranceRef.current = null
    setIsSpeaking(false)
  }, [isSupported])

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) return

      // Cancel any in-progress speech
      window.speechSynthesis.cancel()

      // Chrome bug: cancel() + immediate speak() silently fails.
      // A short delay lets the engine reset before queuing new speech.
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.95
        utterance.onstart = () => setIsSpeaking(true)
        utterance.onend = () => setIsSpeaking(false)
        utterance.onerror = () => setIsSpeaking(false)

        utteranceRef.current = utterance
        window.speechSynthesis.speak(utterance)
      }, 50)
    },
    [isSupported],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel()
      }
    }
  }, [isSupported])

  return { speak, stop, isSupported, isSpeaking }
}
