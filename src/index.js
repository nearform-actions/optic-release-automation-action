'use strict'

const openPr = require('./openPr')
const release = require('./release')
const { AUTO_INPUT } = require('./const')
const { execWithOutput } = require('./utils/execWithOutput')
const { logError, logInfo } = require('./log')
const util = require('util')
const conventionalCommitsConfig = require('conventional-changelog-monorepo/conventional-changelog-conventionalcommits')
const conventionalRecommendedBump = require('conventional-changelog-monorepo/conventional-recommended-bump')
const conventionalRecommendedBumpAsync = util.promisify(
  conventionalRecommendedBump
)

async function runAction({ github, context, inputs, packageVersion }) {
  if (context.eventName === 'workflow_dispatch') {
    return openPr({ context, inputs, packageVersion })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs })
  }

  logError('Unsupported event')
}

async function bumpVersion({ inputs }) {
  const newVersion =
    inputs.semver === AUTO_INPUT
      ? await getAutoBumpedVersion(inputs['base-tag'])
      : inputs.semver

  const preReleasePrefix = inputs['prerelease-prefix'] || ''

  await execWithOutput('npm', [
    'version',
    '--no-git-tag-version',
    `--preid=${preReleasePrefix}`,
    newVersion,
  ])
  return await execWithOutput('npm', ['pkg', 'get', 'version'])
}

async function getAutoBumpedVersion(baseTag) {
  await execWithOutput('git', ['fetch', '--unshallow']) // by default optic does a shallow clone so we need to do this to get full commit history
  await execWithOutput('git', ['fetch', '--tags'])

  const tag =
    baseTag ||
    (await execWithOutput('git', ['tag', '--sort=-creatordate'])).split('\n')[0]

  logInfo(`Using ${tag} as base release tag for version bump`)

  const { releaseType = 'patch' } = await conventionalRecommendedBumpAsync({
    baseTag: tag,
    config: conventionalCommitsConfig,
  })
  logInfo(`Auto generated release type is ${JSON.stringify(releaseType)}`)
  return releaseType
}

module.exports = {
  runAction,
  bumpVersion,
}
