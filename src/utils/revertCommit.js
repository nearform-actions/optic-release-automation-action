'use strict'

const { execWithOutput } = require('./execWithOutput')

async function revertCommit(baseRef) {
  await execWithOutput('git', ['revert', 'HEAD'])
  await execWithOutput('git', ['push', 'origin', baseRef])
}

exports.revertCommit = revertCommit
