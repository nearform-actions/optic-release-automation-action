'use strict'

const openPr = require('./openPr')
const release = require('./release')
const { runSpawn } = require('./utils/runSpawn')
const { logError, logInfo } = require('./log')
const core = require('@actions/core')
const util = require('util')
const conventionalCommitsConfig = require('conventional-changelog-monorepo/conventional-changelog-conventionalcommits')
const conventionalRecommendedBump = require('conventional-changelog-monorepo/conventional-recommended-bump')
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

async function bumpVersion({ inputs }) {
  const newVersion =
    inputs.semver === autoInput
      ? await getAutoBumpedVersion(inputs['base-tag'])
      : inputs.semver

  const preReleasePrefix = inputs['prerelease-prefix'] || ''

  const run = runSpawn()
  await run('npm', [
    'version',
    '--no-git-tag-version',
    `--preid=${preReleasePrefix}`,
    newVersion,
  ])
  return await run('npm', ['pkg', 'get', 'version'])
}

async function getAutoBumpedVersion(baseTag = null) {
  try {
    const run = runSpawn()
    await run('git', ['fetch', '--unshallow']) // by default optic does a shallow clone so we need to do this to get full commit history

    let latestTag = null
    if (!baseTag) {
      const allTags = await run('git', ['tag', '--sort=committerdate'])
      logInfo(`allTags is ${allTags}`)
      const tags = allTags.split('\n')
      logInfo(`tags is ${tags}`)
      latestTag = tags[0] || null
      logInfo(`latestTag is ${latestTag}`)
    }

    const tag = baseTag || latestTag

    logInfo(`Using ${tag} as base release tag for version bump`)

    const { releaseType = 'patch' } = await conventionalRecommendedBumpAsync({
      baseTag: tag,
      config: conventionalCommitsConfig,
    })
    logInfo(`Auto generated release type is ${JSON.stringify(releaseType)}`)
    return releaseType
  } catch (error) {
    core.setFailed(error.message)
    throw error
  }
}

module.exports = {
  runAction,
  bumpVersion,
}
