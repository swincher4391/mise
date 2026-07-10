/**
 * Regenerates bookmarklet-url.txt from bookmarklet.js.
 *
 * Run: node extension/build-bookmarklet.mjs
 *
 * Deliberately does NOT minify. The previous artifact was produced by stripping
 * `//` line comments and joining lines, which ate the `//mise.swinch.dev'` inside
 * the MISE_URL string literal — leaving `var MISE_URL = 'https:` and a bookmarklet
 * that didn't parse. Percent-encoding the source verbatim is a few KB larger and
 * cannot corrupt string contents.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'bookmarklet.js'), 'utf8')

// Drop the leading block comment; keep the IIFE exactly as written.
const iife = source.slice(source.indexOf('(function ('))

// Fail loudly rather than shipping a broken bookmarklet again. `new Script`
// parses without executing.
const assertParses = (code) => new Script(code)

assertParses(iife)
if (!iife.includes('mise.swinch.dev')) {
  throw new Error('bookmarklet lost its target URL')
}

const url = 'javascript:' + encodeURIComponent(iife)

// Round-trip check: what a browser will actually execute must still parse.
const decoded = decodeURIComponent(url.replace(/^javascript:/, ''))
assertParses(decoded)
if (!decoded.includes('mise.swinch.dev')) {
  throw new Error('encoding corrupted the target URL')
}

writeFileSync(join(here, 'bookmarklet-url.txt'), url + '\n', 'utf8')
console.log(`wrote bookmarklet-url.txt (${url.length} chars)`)
