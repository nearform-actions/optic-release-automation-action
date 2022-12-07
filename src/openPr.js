'use strict'

const fs = require('fs')
const path = require('path')
const _template = require('lodash.template')
const core = require('@actions/core')

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./utils/runSpawn')
const { callApi } = require('./utils/callApi')
const transformCommitMessage = require('./utils/commitMessage')
const { logInfo } = require('./log')
const { attach } = require('./utils/artifact')
const { getPRBody } = require('./utils/releaseNotes')

const tpl = fs.readFileSync(path.join(__dirname, 'pr.tpl'), 'utf8')

const addArtifact = async ({ inputs, artifactPath, releaseId, filename }) => {
  const token = inputs['github-token']

  const artifact = await attach(artifactPath, releaseId, token, filename)

  return artifact
}

const createDraftRelease = async (inputs, newVersion) => {
  try {
    const run = runSpawn()
    const releaseCommitHash = await run('git', ['rev-parse', 'HEAD'])

    logInfo(`Creating draft release from commit: ${releaseCommitHash}`)

    const monorepoPackage = inputs['monorepo-package']

    const { data: draftRelease } = await callApi(
      {
        method: 'POST',
        endpoint: 'release',
        body: {
          version: newVersion,
          target: releaseCommitHash,
          ...(monorepoPackage && {
            name: `${monorepoPackage} - ${newVersion}`,
          }),
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

  const monorepoPackage = inputs['monorepo-package']

  const branchName = monorepoPackage
    ? `release/${monorepoPackage}-${newVersion}`
    : `release/${newVersion}`

  const messageTemplate = inputs['commit-message']
  await run('git', ['checkout', '-b', branchName])
  await run('git', ['add', '-A'])
  await run('git', [
    'commit',
    '-m',
    `"${transformCommitMessage(messageTemplate, newVersion, monorepoPackage)}"`,
  ])

  await run('git', ['push', 'origin', branchName])

  const draftRelease = await createDraftRelease(inputs, newVersion)

  logInfo(`New version ${newVersion}`)

  const artifactPath = inputs['artifact-path']
  const artifact =
    artifactPath &&
    (await addArtifact({ inputs, artifactPath, releaseId: draftRelease.id }))
  if (artifact) {
    logInfo('Artifact attached!')
  }

  if (monorepoPackage) {
    await addArtifact({
      inputs,
      artifactPath: `${inputs['monorepo-root']}/${monorepoPackage}`,
      filename: `${monorepoPackage}-${newVersion}.zip`,
      releaseId: draftRelease.id,
    })
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
  return draftRelease
}
