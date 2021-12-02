'use strict'

const { PR_TITLE_PREFIX } = require('./const')
const semver = require('semver')
const core = require('@actions/core')

const { callApi } = require('./utils/callApi')
const { tagVersionInGit } = require('./utils/tagVersion')
const { runSpawn } = require('./utils/runSpawn')

module.exports = async function ({ github, context, inputs }) {
  const pr = context.payload.pull_request
  const owner = context.repo.owner
  const repo = context.repo.repo

  if (
    context.payload.action !== 'closed' ||
    pr.user.login !== 'optic-release-automation[bot]' ||
    !pr.title.startsWith(PR_TITLE_PREFIX)
  ) {
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
    return console.error('Unable to parse PR meta', err.message)
  }

  const { opticUrl, npmTag, version, id } = releaseMeta

  if (!pr.merged) {
    return github.rest.repos.deleteRelease({
      owner,
      repo,
      release_id: id,
    })
  }

  const run = runSpawn()
  const opticToken = inputs['optic-token']

  if (inputs['npm-token']) {
    if (opticToken) {
      console.log('Requesting OTP from Optic...')
      const otp = await run('curl', ['-s', `${opticUrl}${opticToken}`])
      await run('npm', ['publish', '--otp', otp, '--tag', npmTag])
    } else {
      await run('npm', ['publish', '--tag', npmTag])
    }

    console.log('Published to Npm')
  }

  try {
    const syncVersions = /true/i.test(inputs['sync-semver-tags'])

    if (syncVersions) {
      const { major, minor } = semver.parse(version)

      if (major !== 0) await tagVersionInGit(`v${major}`)
      if (minor !== 0) await tagVersionInGit(`v${major}.${minor}`)
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
  } catch (err) {
    core.setFailed(`Unable to publish the release ${err.message}`)
  }
}
