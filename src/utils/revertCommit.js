'use strict'

const { execWithOutput } = require('./execWithOutput')

async function revertCommit(baseRef) {
  const exec = execWithOutput()
  await exec('git', ['revert', 'HEAD'])
  await exec('git', ['push', 'origin', baseRef])
}

exports.revertCommit = revertCommit
