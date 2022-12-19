'use strict'

const openPr = require('./openPr')
const release = require('./release')
const { runSpawn } = require('./utils/runSpawn')
const { logError } = require('./log')
const core = require('@actions/core')
const util = require('util')
const config = require('conventional-changelog-conventionalcommits')
const conventionalRecommendedBump = require('conventional-recommended-bump')
const conventionalRecommendedBumpAsync = util.promisify(
  conventionalRecommendedBump
)

const autoInput = 'auto'

async function runAction({ github, context, inputs, packageVersion }) {
  if (context.eventName === 'workflow_dispatch') {
    return openPr({ context, inputs, packageVersion })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs })
  }

  logError('Unsupported event')
}

async function getBumpedVersionNumber({ inputs }) {
  const newVersion =
    inputs.semver === autoInput ? await getAutoBumpedVersion() : inputs.semver

  const run = runSpawn()
  await run('npm', ['version', '--no-git-tag-version', newVersion])
  return await run('npm', ['pkg', 'get', 'version'])
}

async function getAutoBumpedVersion() {
  try {
    const { releaseType } = await conventionalRecommendedBumpAsync({ config })
    return releaseType
  } catch (error) {
    core.setFailed(error.message)
    throw error
  }
}

module.exports = {
  runAction,
  getBumpedVersionNumber,
}
