import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync } from 'fs'
import path from 'path'
// @ts-expect-error -- ffmpeg-static exports a string path
import ffmpegPath from 'ffmpeg-static'

const FRAMES_PER_GRID = 9 // 3x3 tile per image
const NUM_GRIDS = 4 // Qwen max 4 images per request
const TOTAL_FRAMES = FRAMES_PER_GRID * NUM_GRIDS // 36 frames across the video

export async function uploadFrameToTempHost(buffer: Buffer, index: number): Promise<string> {
  const boundary = '----MiseBoundary' + Date.now() + index
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="frame-${index}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`

  const body = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    buffer,
    Buffer.from(footer, 'utf-8'),
  ])

  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })

  if (!response.ok) {
    throw new Error(`Frame upload failed (${response.status})`)
  }

  const data: any = await response.json()
  const pageUrl: string = data?.data?.url
  if (!pageUrl) throw new Error('No URL returned from image host')

  return pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
}

/**
 * Extracts evenly-spaced frame grids from a video buffer using ffmpeg.
 * Returns an array of JPEG grid buffers (up to NUM_GRIDS).
 * Caller must provide a tmpFiles array for cleanup.
 */
export function extractFrameGrids(
  videoBuffer: Buffer,
  tmpFiles: string[]
): Buffer[] {
  const ts = Date.now()
  const tmpVideo = path.join('/tmp', `ocr-video-${ts}`)
  tmpFiles.push(tmpVideo)
  writeFileSync(tmpVideo, videoBuffer)

  // Probe total frame count
  let totalFrames = 300
  try {
    execFileSync(ffmpegPath as string, [
      '-i', tmpVideo,
      '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-',
    ], { timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (probeErr: any) {
    const stderr = probeErr?.stderr?.toString?.() ?? ''
    const frameMatch = stderr.match(/frame=\s*(\d+)/)
    if (frameMatch) totalFrames = parseInt(frameMatch[1], 10)
  }

  // Generate 3x3 grid collages
  const interval = Math.max(1, Math.floor(totalFrames / TOTAL_FRAMES))
  const gridPattern = path.join('/tmp', `ocr-grid-${ts}-%03d.jpg`)

  execFileSync(ffmpegPath as string, [
    '-y', '-i', tmpVideo,
    '-vf', `select='not(mod(n\\,${interval}))',setpts=N/FRAME_RATE/TB,tile=3x3`,
    '-frames:v', String(NUM_GRIDS),
    '-q:v', '3',
    gridPattern,
  ], { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] })

  // Read grid files
  const grids: Buffer[] = []
  for (let i = 1; i <= NUM_GRIDS; i++) {
    const gridPath = gridPattern.replace('%03d', String(i).padStart(3, '0'))
    tmpFiles.push(gridPath)
    try {
      grids.push(readFileSync(gridPath))
    } catch {
      // Grid may not exist if video was shorter than expected
      break
    }
  }

  return grids
}

/**
 * Uploads an array of grid buffers to tmpfiles.org in parallel.
 */
export async function uploadFramesInParallel(buffers: Buffer[]): Promise<string[]> {
  const results = await Promise.all(
    buffers.map((buf, i) => uploadFrameToTempHost(buf, i + 1))
  )
  return results
}
