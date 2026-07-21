'use strict'

process.stderr.write(
  [
    'Refused: this generic migration helper is retired.',
    'It is not bound to a reviewed commit, target denylist, backup, or evidence path.',
    'Use the phased staging procedure and scripts/staging-database-verifier.sh documented in README.md.',
    '',
  ].join('\n'),
)
process.exitCode = 1
