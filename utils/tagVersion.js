'use strict'
const { runSpawn } = require('./runSpawn')

async function tagVersionInGit(version) {
  const run = runSpawn()

  await run('git', ['push', 'origin', `:refs/tags/${version}`])
  await run('git', ['tag', '-f', `"${version}"`])
  await run('git', ['push', 'origin', `--tags`])
}

exports.tagVersionInGit = tagVersionInGit
