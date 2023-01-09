'use strict'
const { runSpawn } = require('./runSpawn')

async function tagVersionInGit(version, signTag) {
  const run = runSpawn()

  await run('git', ['push', 'origin', `:refs/tags/${version}`])
  await run('git', [
    'tag',
    '-f',
    signTag ? '-s' : '',
    `"${version}"`,
    '-m',
    '""',
  ])
  await run('git', ['push', 'origin', `--tags`])
}

exports.tagVersionInGit = tagVersionInGit
