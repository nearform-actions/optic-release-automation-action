'use strict'

const { AUTO_INPUT } = require('./const')
const { execWithOutput } = require('./utils/execWithOutput')
const { logInfo } = require('./log')
const util = require('util')
const conventionalCommitsConfig = require('conventional-changelog-monorepo/conventional-changelog-conventionalcommits')
const conventionalRecommendedBump = require('conventional-changelog-monorepo/conventional-recommended-bump')
const conventionalRecommendedBumpAsync = util.promisify(
  conventionalRecommendedBump
)

async function bumpVersion({ inputs }) {
  const exec = execWithOutput()
  const newVersion =
    inputs.semver === AUTO_INPUT
      ? await getAutoBumpedVersion(inputs['base-tag'])
      : inputs.semver

  const preReleasePrefix = inputs['prerelease-prefix'] || ''

  await exec('npm', [
    'version',
    '--no-git-tag-version',
    `--preid=${preReleasePrefix}`,
    newVersion,
  ])
  return await exec('npm', ['pkg', 'get', 'version'])
}

async function getAutoBumpedVersion(baseTag) {
  const exec = execWithOutput()
  await exec('git', ['fetch', '--unshallow']) // by default optic does a shallow clone so we need to do this to get full commit history
  await exec('git', ['fetch', '--tags'])

  const tag =
    baseTag ||
    (await exec('git', ['tag', '--sort=-creatordate'])).split('\n')[0]

  logInfo(`Using ${tag} as base release tag for version bump`)

  const { releaseType = 'patch' } = await conventionalRecommendedBumpAsync({
    baseTag: tag,
    config: conventionalCommitsConfig,
  })
  logInfo(`Auto generated release type is ${JSON.stringify(releaseType)}`)
  return releaseType
}

module.exports = bumpVersion
