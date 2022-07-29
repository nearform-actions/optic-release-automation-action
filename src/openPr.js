'use strict'

const fs = require('fs')
const { zip } = require('zip-a-folder')
const path = require('path')
const _template = require('lodash.template')
const semver = require('semver')
const core = require('@actions/core')
const { Octokit } = require('@octokit/rest')

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./utils/runSpawn')
const { callApi } = require('./utils/callApi')
const transformCommitMessage = require('./utils/commitMessage')
const { logInfo } = require('./log')

const tpl = fs.readFileSync(path.join(__dirname, 'pr.tpl'), 'utf8')

const getPRBody = (template, { newVersion, draftRelease, inputs, author }) => {
  const tagsToBeUpdated = []
  const { major, minor } = semver.parse(newVersion)

  if (major !== 0) tagsToBeUpdated.push(`v${major}`)
  if (minor !== 0) tagsToBeUpdated.push(`v${major}.${minor}`)

  // Should strictly contain only non-sensitive data
  const releaseMeta = {
    id: draftRelease.id,
    version: newVersion,
    npmTag: inputs['npm-tag'],
    opticUrl: inputs['optic-url'],
  }

  return template({
    releaseMeta,
    draftRelease,
    tagsToUpdate: tagsToBeUpdated.join(', '),
    npmPublish: !!inputs['npm-token'],
    syncTags: /true/i.test(inputs['sync-semver-tags']),
    author,
  })
}

module.exports = async function ({ context, inputs, packageVersion }) {
  logInfo('** Starting Opening Release PR **')
  const run = runSpawn()

  logInfo('HELLO WORLD!')

  if (!packageVersion) {
    throw new Error('packageVersion is missing!')
  }
  const newVersion = `v${packageVersion}`

  const branchName = `release/${newVersion}`

  const messageTemplate = inputs['commit-message']
  await run('git', ['checkout', '-b', branchName])
  await run('git', ['add', '-A'])
  await run('git', [
    'commit',
    '-m',
    `"${transformCommitMessage(messageTemplate, newVersion)}"`,
  ])
  await run('git', ['push', 'origin', branchName])

  const { data: draftRelease } = await callApi(
    {
      method: 'POST',
      endpoint: 'release',
      body: {
        version: newVersion,
      },
    },
    inputs
  )

  logInfo(`New version ${newVersion}`)

  const prBody = getPRBody(_template(tpl), {
    newVersion,
    draftRelease,
    inputs,
    author: context.actor,
  })
  try {
    await callApi(
      {
        method: 'POST',
        endpoint: 'pr',
        body: {
          head: `refs/heads/${branchName}`,
          base: context.payload.ref,
          title: `${PR_TITLE_PREFIX} ${branchName}`,
          body: prBody,
        },
      },
      inputs
    )
    logInfo('** Finished! **')
  } catch (err) {
    let message = `Unable to create the pull request ${err.message}`
    try {
      await run('git', ['push', 'origin', '--delete', branchName])
    } catch (error) {
      message += `\n Unable to delete branch ${branchName}:  ${error.message}`
    }
    core.setFailed(message)
  }
  logInfo('end first part')

  // manage Release Artifact
  const artifactBuildFolder = inputs['release-artifact-build-folder']
  logInfo('artifact build folder: ', artifactBuildFolder)

  if (artifactBuildFolder) {
    const archiveFileName = 'asset.zip'
    const archivePath = __dirname + `/${archiveFileName}`
    logInfo('archive path: ', archivePath)
    try {
      await zip(__dirname + `/${artifactBuildFolder}`, archivePath)
    } catch (err) {
      logInfo('An error occurred while zipping the build folder')
      core.setFailed(`Unable to zip the build folder: ${err.message}`)
      return
    }

    // determine content-length for header to upload asset
    const contentLength = filePath => fs.statSync(filePath).size

    // setup headers fro the API call
    const headers = {
      'content-type': 'application/zip',
      'content-length': contentLength(archivePath),
    }

    const owner = context.repo.owner
    const repo = context.repo.repo

    logInfo('here')

    const octokit = new Octokit({ auth: inputs['github-token'] })
    const uploadAssetResponse = await octokit.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: draftRelease.id,
      data: fs.readFileSync(archivePath),
      name: archiveFileName,
      label: 'Release asset',
      headers,
    })
    logInfo('uploadAssetResponse: ', uploadAssetResponse)
  }
}
