'use strict'

const { execWithOutput } = require('./execWithOutput')

async function tagVersionInGit(version) {
  const exec = execWithOutput()
  await exec('git', ['push', 'origin', `:refs/tags/${version}`])
  await exec('git', ['tag', '-f', `${version}`])
  await exec('git', ['push', 'origin', `--tags`])
}

exports.tagVersionInGit = tagVersionInGit
