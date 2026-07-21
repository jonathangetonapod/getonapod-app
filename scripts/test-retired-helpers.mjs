import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const helpers = [
  {
    command: 'bash',
    args: ['scripts/deploy-edge-functions.sh'],
    marker: 'legacy blog-only deployment helper is retired',
  },
  {
    command: process.execPath,
    args: ['scripts/run-migration.cjs'],
    marker: 'generic migration helper is retired',
  },
]

for (const helper of helpers) {
  const result = spawnSync(helper.command, helper.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  })
  assert.notEqual(result.status, 0, `${helper.args[0]} must refuse execution`)
  assert.match(
    `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    new RegExp(helper.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'),
    `${helper.args[0]} must explain its retirement`,
  )
}

process.stdout.write(`Retired helper refusal checks passed; helpers=${helpers.length}\n`)
