'use strict'

const { PR_TITLE_PREFIX } = require('./const')
const semver = require('semver')
const core = require('@actions/core')

const { callApi } = require('./utils/callApi')
const { tagVersionInGit } = require('./utils/tagVersion')
const { runSpawn } = require('./utils/runSpawn')
const { logError, logInfo, logWarning } = require('./log')

module.exports = async function ({ github, context, inputs }) {
  logInfo('** Starting Release **')
  const pr = context.payload.pull_request
  const owner = context.repo.owner
  const repo = context.repo.repo

  if (
    context.payload.action !== 'closed' ||
    pr.user.login !== 'optic-release-automation[bot]' ||
    !pr.title.startsWith(PR_TITLE_PREFIX)
  ) {
    logWarning('skipping release.')
    return
  }

  let releaseMeta
  try {
    releaseMeta = JSON.parse(
      pr.body.substring(
        pr.body.indexOf('<release-meta>') + 14,
        pr.body.lastIndexOf('</release-meta>')
      )
    )
  } catch (err) {
    return logError(err)
  }

  const { opticUrl, npmTag, version, id } = releaseMeta

  const run = runSpawn()
  if (!pr.merged) {
    const branchName = `release/${version}`

    logInfo(`deleting ${branchName}`)

    const [, deleteRelease] = await Promise.allSettled([
      run('git', ['push', 'origin', '--delete', branchName]),
      github.rest.repos.deleteRelease({
        owner,
        repo,
        release_id: id,
      }),
    ])

    // Verify any errors deleting the Release. Ignore minor issues deleting the branch
    if (deleteRelease.reason) {
      core.setFailed(
        `Something went wrong while deleting the release. \n Errors: ${deleteRelease.reason.message}`
      )
    }

    // Return early after an attempt at deleting the branch and release
    return
  }

  const opticToken = inputs['optic-token']

  if (inputs['npm-token']) {
    await run('npm', [
      'config',
      'set',
      `//registry.npmjs.org/:_authToken=${inputs['npm-token']}`,
    ])

    await run('npm', ['pack', '--dry-run'])
    if (opticToken) {
      const otp = await run('curl', ['-s', `${opticUrl}${opticToken}`])
      await run('npm', ['publish', '--otp', otp, '--tag', npmTag])
    } else {
      await run('npm', ['publish', '--tag', npmTag])
    }
  } else {
    logWarning('missing npm-token')
  }

  try {
    const syncVersions = /true/i.test(inputs['sync-semver-tags'])

    if (syncVersions) {
      const { major, minor, patch } = semver.parse(version)

      await tagVersionInGit(`v${major}`)
      await tagVersionInGit(`v${major}.${minor}`)
      await tagVersionInGit(`v${major}.${minor}.${patch}`)
    }
  } catch (err) {
    core.setFailed(`Unable to update the semver tags ${err.message}`)
  }

  // TODO: What if PR was closed, reopened and then merged. The draft release would have been deleted!
  try {
    await callApi(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {
          version: version,
          releaseId: id,
        },
      },
      inputs
    )

    logInfo('** Released! **')
  } catch (err) {
    core.setFailed(`Unable to publish the release ${err.message}`)
  }
}
