import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Recipe } from '@domain/models/Recipe.ts'
import { useExtensionImport } from '@presentation/hooks/useExtensionImport.ts'

interface HarnessProps {
  onRecipeReceived: (recipe: Recipe) => void
}

function Harness({ onRecipeReceived }: HarnessProps) {
  useExtensionImport(onRecipeReceived)
  return null
}

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64')
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function runWithHash(hash: string) {
  const onRecipeReceived = vi.fn()
  window.history.replaceState(null, '', '/')
  window.location.hash = hash

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  root.render(createElement(Harness, { onRecipeReceived }))
  await flushEffects()

  root.unmount()
  await flushEffects()

  container.remove()
  return onRecipeReceived
}

afterEach(() => {
  window.history.replaceState(null, '', '/')
  document.body.innerHTML = ''
})

describe('extension import hash validation', () => {
  it('rejects payloads larger than 1MB when decoded', async () => {
    const tooLargeJson = JSON.stringify({
      title: 'Big Recipe',
      data: 'a'.repeat(1_000_001),
    })

    const onRecipeReceived = await runWithHash(`#import=${encodeBase64(tooLargeJson)}`)

    expect(onRecipeReceived).not.toHaveBeenCalled()
  })

  it('rejects non-object JSON payloads', async () => {
    const nonObject = JSON.stringify('not-an-object')
    const onRecipeReceived = await runWithHash(`#import=${encodeBase64(nonObject)}`)

    expect(onRecipeReceived).not.toHaveBeenCalled()
  })

  it('rejects objects missing title, name, and @type', async () => {
    const missingRequiredFields = JSON.stringify({ description: 'missing required fields' })
    const onRecipeReceived = await runWithHash(`#import=${encodeBase64(missingRequiredFields)}`)

    expect(onRecipeReceived).not.toHaveBeenCalled()
  })

  it('accepts valid payload objects', async () => {
    const validPayload = JSON.stringify({
      title: 'Simple Toast',
      rawIngredients: ['1 slice bread'],
      rawSteps: ['Toast bread until golden brown'],
      sourceUrl: 'https://example.com/toast',
    })

    const onRecipeReceived = await runWithHash(`#import=${encodeBase64(validPayload)}`)

    expect(onRecipeReceived).toHaveBeenCalledTimes(1)
    expect(onRecipeReceived.mock.calls[0][0]).toMatchObject({ title: 'Simple Toast' })
  })
})
