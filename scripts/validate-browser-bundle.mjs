import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { findingsFor } from './scan-release-secrets.mjs'

function bundleFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...bundleFiles(target))
    else if (entry.isFile()) files.push(target)
  }
  return files
}

export function validateBrowserBundle(directory) {
  const target = path.resolve(directory)
  if (!existsSync(target)) throw new Error('Browser bundle validation failed: build output is missing')

  const failures = []
  const files = bundleFiles(target).sort()
  for (const file of files) {
    const contents = readFileSync(file)
    if (contents.includes(0)) continue
    const categories = findingsFor(contents.toString('utf8'))
    if (categories.length > 0) {
      failures.push(`${path.relative(target, file)}: ${categories.join(',')}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`Browser bundle contains forbidden credentials (values suppressed):\n${failures.join('\n')}`)
  }
  return files.length
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) {
  try {
    const count = validateBrowserBundle(process.argv[2] || 'dist')
    process.stdout.write(`Browser bundle credential scan passed; files=${count}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Browser bundle validation failed'}\n`)
    process.exitCode = 1
  }
}
