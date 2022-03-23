'use strict'
const { runSpawn } = require('./runSpawn')

async function revertCommit(baseRef, version) {
  const run = runSpawn()

  await run('git', ['revert', 'HEAD'])
  await run('git', ['commit', '-m', `Revert commit ${version}`])
  await run('git', ['push', 'origin', baseRef])
}

exports.revertCommit = revertCommit
