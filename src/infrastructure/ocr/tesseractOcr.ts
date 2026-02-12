export async function extractTextFromImage(imageBase64: string): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')

  try {
    const { data } = await worker.recognize(imageBase64)
    return data.text
  } finally {
    await worker.terminate()
  }
}
