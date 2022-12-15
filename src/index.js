'use strict'

const openPr = require('./openPr')
const release = require('./release')
const { getAutoBumpedVersion } = require('./utils/bump')
const { runSpawn } = require('./utils/runSpawn')
const { logError } = require('./log')

async function runAction({ github, context, inputs, packageVersion }) {
  if (context.eventName === 'workflow_dispatch') {
    return openPr({ context, inputs, packageVersion })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs })
  }

  logError('Unsupported event')
}

async function getBumpedVersionNumber({ github, context, inputs }) {
  const newVersion =
    inputs.semver === 'auto'
      ? await getAutoBumpedVersion({ github, context })
      : inputs.semver

  const run = runSpawn()
  await run('npm', ['version', '--no-git-tag-version', newVersion])
  return await run('npm', ['pkg', 'get', 'version'])
}

module.exports = {
  runAction,
  getBumpedVersionNumber,
}
