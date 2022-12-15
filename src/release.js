'use strict'

const core = require('@actions/core')
const semver = require('semver')

const { PR_TITLE_PREFIX } = require('./const')
const { callApi } = require('./utils/callApi')
const { tagVersionInGit } = require('./utils/tagVersion')
const { execWithOutput } = require('./utils/execWithOutput')
const { revertCommit } = require('./utils/revertCommit')
const { publishToNpm } = require('./utils/publishToNpm')
const { notifyIssues } = require('./utils/notifyIssues')
const { logError, logInfo, logWarning } = require('./log')

module.exports = async function ({ github, context, inputs }) {
  logInfo('** Starting Release **')

  const pr = context.payload.pull_request
  const owner = context.repo.owner
  const repo = context.repo.repo

  if (
    context.payload.action !== 'closed' ||
    pr.user.login !== inputs['app-name'] ||
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

  try {
    const { data: draftRelease } = await github.rest.repos.getRelease({
      owner,
      repo,
      release_id: id,
    })

    if (!draftRelease) {
      core.setFailed(`Couldn't find draft release to publish. Aborting.`)
      return
    }
  } catch (err) {
    core.setFailed(
      `Couldn't find draft release to publish. Aborting. Error: ${err.message}`
    )
    return
  }

  const branchName = `release/${version}`

  try {
    // We "always" delete the release branch, if anything fails, the whole
    // workflow has to be restarted from scratch.
    logInfo(`deleting ${branchName}`)
    await execWithOutput('git', ['push', 'origin', '--delete', branchName])
  } catch (err) {
    // That's not a big problem, so we don't want to mark the action as failed.
    logWarning('Unable to delete the release branch')
  }

  if (!pr.merged) {
    try {
      await github.rest.repos.deleteRelease({
        owner,
        repo,
        release_id: id,
      })
    } catch (reason) {
      // Verify any errors deleting the Release. Ignore minor issues deleting the branch
      core.setFailed(
        `Something went wrong while deleting the release. \n Errors: ${reason.message}`
      )
    }

    // Return early after an attempt at deleting the branch and release
    return
  }

  const shouldRevertCommit = /true/i.test(inputs['revert-commit-after-failure'])

  try {
    const opticToken = inputs['optic-token']
    const npmToken = inputs['npm-token']

    if (npmToken) {
      await publishToNpm({ npmToken, opticToken, opticUrl, npmTag, version })
    } else {
      logWarning('missing npm-token')
    }
  } catch (err) {
    if (pr.merged && shouldRevertCommit) {
      await revertCommit(pr.base.ref)
      logInfo('Release commit reverted.')
    }
    core.setFailed(`Unable to publish to npm: ${err.message}`)
    return
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

  try {
    const { data: release } = await callApi(
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

    const shouldNotifyLinkedIssues = /true/i.test(
      inputs['notify-linked-issues']
    )

    if (shouldNotifyLinkedIssues) {
      try {
        // post a comment about release on npm to any linked issues in the
        // any of the PRs in this release
        const shouldPostNpmLink = Boolean(inputs['npm-token'])

        await notifyIssues(github, shouldPostNpmLink, owner, repo, release)
      } catch (err) {
        logWarning('Failed to notify any/all issues')
        logError(err)
      }
    }

    logInfo('** Released! **')
  } catch (err) {
    if (pr.merged && shouldRevertCommit) {
      await revertCommit(pr.base.ref)
      logInfo('Release commit reverted.')
    }
    core.setFailed(`Unable to publish the release ${err.message}`)
  }
}
