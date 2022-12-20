'use strict'

const fs = require('fs')
const path = require('path')
const _template = require('lodash.template')
const core = require('@actions/core')

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./utils/runSpawn')
const { callApi } = require('./utils/callApi')
const transformCommitMessage = require('./utils/commitMessage')
const { logInfo, logWarning } = require('./log')
const { attach } = require('./utils/artifact')
const { getPRBody } = require('./utils/releaseNotes')
const { fetchLatestRelease, generateReleaseNotes } = require('./utils/releases')

const tpl = fs.readFileSync(path.join(__dirname, 'pr.tpl'), 'utf8')

const addArtifact = async (inputs, releaseId) => {
  const artifactPath = inputs['artifact-path']
  const token = inputs['github-token']

  const artifact = await attach(artifactPath, releaseId, token)

  return artifact
}

const tryGetReleaseNotes = async (token, newVersion) => {
  try {
    const latestRelease = await fetchLatestRelease(token)
    if (!latestRelease) {
      return
    }
    const { tag_name: baseVersion } = latestRelease
    const releaseNotes = await generateReleaseNotes(
      token,
      newVersion,
      baseVersion
    )
    return releaseNotes?.body
  } catch (err) {
    logWarning(err.message)
  }
}

const createDraftRelease = async (inputs, newVersion, releaseNotes) => {
  try {
    const run = runSpawn()
    const releaseCommitHash = await run('git', ['rev-parse', 'HEAD'])

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

    logInfo(`Draft release created successfully`)

    return draftRelease
  } catch (err) {
    throw new Error(`Unable to create draft release: ${err.message}`)
  }
}

module.exports = async function ({ context, inputs, packageVersion }) {
  logInfo('** Starting Opening Release PR **')
  const run = runSpawn()

  if (!packageVersion) {
    throw new Error('packageVersion is missing!')
  }

  const newVersion = `${inputs['version-prefix']}${packageVersion}`

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

  const token = inputs['github-token']

  const releaseNotes = await tryGetReleaseNotes(token, newVersion)

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
    if (response?.status !== 201) {
      const errMessage = response?.message || 'PR creation failed'
      throw new Error(errMessage)
    }
  } catch (err) {
    let message = `Unable to create the pull request ${err.message}`
    try {
      await run('git', ['push', 'origin', '--delete', branchName])
    } catch (error) {
      message += `\n Unable to delete branch ${branchName}:  ${error.message}`
    }
    core.setFailed(message)
  }

  logInfo('** Finished! **')
}
