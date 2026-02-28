import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync } from 'fs'
import path from 'path'
// @ts-expect-error -- ffmpeg-static exports a string path
import ffmpegPath from 'ffmpeg-static'

/**
 * Converts a video buffer to a 16kHz mono WAV suitable for Whisper.
 * Caller must provide a tmpFiles array; this function pushes its temp paths
 * so the caller can clean them up.
 */
export function extractWavFromVideo(
  videoBuffer: Buffer,
  tmpFiles: string[]
): Buffer {
  const ts = Date.now()
  const tmpVideo = path.join('/tmp', `video-${ts}`)
  const tmpWav = path.join('/tmp', `audio-${ts}.wav`)
  tmpFiles.push(tmpVideo, tmpWav)

  writeFileSync(tmpVideo, videoBuffer)

  execFileSync(ffmpegPath as string, [
    '-y', '-i', tmpVideo,
    '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav',
    tmpWav,
  ], { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] })

  return readFileSync(tmpWav)
}
