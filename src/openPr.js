'use strict'

const fs = require('fs')
const path = require('path')
const _template = require('lodash.template')
const core = require('@actions/core')

const { PR_TITLE_PREFIX } = require('./const')
const { callApi } = require('./utils/callApi')
const transformCommitMessage = require('./utils/commitMessage')
const { logInfo, logWarning } = require('./log')
const { attach } = require('./utils/artifact')
const { getPRBody } = require('./utils/releaseNotes')
const { execWithOutput } = require('./utils/execWithOutput')
const {
  generateReleaseNotes,
  fetchReleaseByTag,
  fetchLatestRelease,
} = require('./utils/releases')

const tpl = fs.readFileSync(path.join(__dirname, 'pr.tpl'), 'utf8')

const addArtifact = async (inputs, releaseId) => {
  const artifactPath = inputs['artifact-path']
  const token = inputs['github-token']

  const artifact = await attach(artifactPath, releaseId, token)

  return artifact
}

const tryGetReleaseNotes = async (token, baseRelease, newVersion) => {
  try {
    if (!baseRelease) {
      return
    }

    const { tag_name: baseReleaseTag } = baseRelease

    const releaseNotes = await generateReleaseNotes(
      token,
      newVersion,
      baseReleaseTag
    )
    return releaseNotes?.body
  } catch (err) {
    logWarning(err.message)
  }
}

const createDraftRelease = async (inputs, newVersion, releaseNotes) => {
  try {
    const releaseCommitHash = await execWithOutput('git', ['rev-parse', 'HEAD'])

    logInfo(`Creating draft release from commit: ${releaseCommitHash}`)

    const { data: draftRelease } = await callApi(
      {
        method: 'POST',
        endpoint: 'release',
        body: {
          version: newVersion,
          target: releaseCommitHash,
          generateReleaseNotes: releaseNotes ? false : true,
          ...(releaseNotes && { releaseNotes }),
        },
      },
      inputs
    )

    if (!draftRelease?.id) {
      throw new Error(
        'API responded with a 200 status but no draft release returned.  Please clean up any artifacts (draft release, release branch, etc.) and try again'
      )
    }

    logInfo(`Draft release created successfully`)

    return draftRelease
  } catch (err) {
    throw new Error(`Unable to create draft release: ${err.message}`)
  }
}

module.exports = async function ({ context, inputs, packageVersion }) {
  logInfo('** Starting Opening Release PR **')

  if (!packageVersion) {
    throw new Error('packageVersion is missing!')
  }

  const token = inputs['github-token']

  const baseTag = inputs['base-tag']
  const baseRelease = baseTag
    ? await fetchReleaseByTag(token, baseTag)
    : await fetchLatestRelease(token)

  const newVersion = `${inputs['version-prefix']}${packageVersion}`

  const branchName = `release/${newVersion}`

  const messageTemplate = inputs['commit-message']

  // first, call ls-remote to see if the branch already exists. if it gives us anything
  // back (i.e. the matching branch), we should bail out and instruct user to clean up
  // the remote or use a different version, otherwise proceed
  const branches = await execWithOutput('git', [
    'ls-remote',
    '--heads',
    'origin',
    branchName,
  ])
  if (branches.length !== 0) {
    throw new Error(
      `Release branch ${branchName} already exists on the remote.  Please either delete it and run again, or select a different version`
    )
  }

  await execWithOutput('git', ['checkout', '-b', branchName])
  await execWithOutput('git', ['add', '-A'])
  await execWithOutput('git', [
    'commit',
    '-m',
    `${transformCommitMessage(messageTemplate, newVersion)}`,
  ])

  await execWithOutput('git', ['push', 'origin', branchName])

  const releaseNotes = await tryGetReleaseNotes(token, baseRelease, newVersion)

  const draftRelease = await createDraftRelease(
    inputs,
    newVersion,
    releaseNotes
  )

  logInfo(`New version ${newVersion}`)

  const artifact =
    inputs['artifact-path'] && (await addArtifact(inputs, draftRelease.id))
  if (artifact) {
    logInfo('Artifact attached!')
  }

  const prBody = getPRBody(_template(tpl), {
    newVersion,
    draftRelease,
    inputs,
    author: context.actor,
    artifact,
  })
  try {
    const response = await callApi(
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
    /* istanbul ignore else */
    if (response?.status !== 201) {
      const errMessage = response?.message || 'PR creation failed'
      throw new Error(errMessage)
    }
  } catch (err) {
    let message = `Unable to create the pull request ${err.message}`
    try {
      await execWithOutput('git', ['push', 'origin', '--delete', branchName])
    } catch (error) {
      message += `\n Unable to delete branch ${branchName}:  ${error.message}`
    }
    core.setFailed(message)
  }

  logInfo('** Finished! **')
}
