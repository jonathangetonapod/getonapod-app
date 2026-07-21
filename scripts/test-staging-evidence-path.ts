import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

import { validateEvidencePath } from './staging-acceptance.js'

const privateDirectory = mkdtempSync(join(tmpdir(), 'goap-http-evidence-'))
assert.ok(isAbsolute(privateDirectory))

try {
  chmodSync(privateDirectory, 0o700)
  const validPath = join(realpathSync(privateDirectory), 'http-acceptance.ndjson')
  assert.equal(validateEvidencePath(validPath), validPath)

  assert.throws(() => validateEvidencePath('relative.ndjson'))
  assert.throws(() => validateEvidencePath(join(privateDirectory, 'invalid name.ndjson')))

  const existingPath = join(privateDirectory, 'existing.ndjson')
  writeFileSync(existingPath, '', { mode: 0o600, flag: 'wx' })
  assert.throws(() => validateEvidencePath(existingPath))

  chmodSync(privateDirectory, 0o770)
  assert.throws(() => validateEvidencePath(join(privateDirectory, 'writable-parent.ndjson')))
  chmodSync(privateDirectory, 0o700)

  const repositoryRoot = realpathSync(resolve('.'))
  assert.throws(() => validateEvidencePath(join(repositoryRoot, 'worktree-output.ndjson')))

  const worktreeInventory = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  for (const line of worktreeInventory.split(/\r?\n/u)) {
    if (!line.startsWith('worktree ')) continue
    const worktree = realpathSync(line.slice('worktree '.length))
    assert.throws(() => validateEvidencePath(join(worktree, 'acceptance-output.ndjson')))
  }

  const gitCommonDirectory = realpathSync(execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).trim())
  assert.throws(() => validateEvidencePath(join(gitCommonDirectory, 'acceptance-output.ndjson')))

  process.stdout.write('Staging HTTP evidence-path containment checks passed\n')
} finally {
  chmodSync(privateDirectory, 0o700)
  rmSync(privateDirectory, { recursive: true })
}
