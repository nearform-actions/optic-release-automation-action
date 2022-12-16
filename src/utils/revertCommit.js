'use strict'
const { runSpawn } = require('./runSpawn')

async function revertCommit(baseRef) {
  const run = runSpawn()

  await run('git', ['revert', 'HEAD'])
  await run('git', ['push', 'origin', baseRef])
}

exports.revertCommit = revertCommit
