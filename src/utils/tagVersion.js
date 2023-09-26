'use strict'

const { execWithOutput } = require('./execWithOutput')

async function tagVersionInGit(version) {
  // await execWithOutput('git', ['push', 'origin', `:refs/tags/${version}`])
  await execWithOutput('git', ['tag', '-f', `${version}`])
  await execWithOutput('git', ['push', 'origin', `--tags`])
}

exports.tagVersionInGit = tagVersionInGit
