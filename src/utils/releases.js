'use strict'

const github = require('@actions/github')
const { logInfo, logWarning } = require('../log')

const opticLabelText = '* [OPTIC-RELEASE-AUTOMATION]'

async function fetchLatestRelease(token) {
  try {
    logInfo('Fetching the latest release')

    const { owner, repo } = github.context.repo
    const octokit = github.getOctokit(token)
    const { data: latestRelease } = await octokit.rest.repos.getLatestRelease({
      owner,
      repo,
    })

    logInfo(
      `Latest release fetched successfully with tag: ${latestRelease.tag_name}`
    )

    return latestRelease
  } catch (err) {
    if (err.message === 'Not Found') {
      logInfo(`No previous releases found`)
      return
    }

    throw new Error(
      `An error occurred while fetching the latest release: ${err.message}`
    )
  }
}

function excludeUnwantedReleaseNotes(releaseNotes = '') {
  try {
    const splitLines = releaseNotes.split('\n')

    return splitLines.filter(line => !line.includes(opticLabelText)).join('\n')
  } catch (error) {
    logWarning(
      `Error excluding unwanted release notes. Error - ${error.message}`
    )
  }
  return releaseNotes
}

async function generateReleaseNotes(token, newVersion, baseVersion) {
  try {
    logInfo(`Generating release notes: [${baseVersion} -> ${newVersion}]`)

    const { owner, repo } = github.context.repo
    const octokit = github.getOctokit(token)

    const { data: releaseNotes } =
      await octokit.rest.repos.generateReleaseNotes({
        owner,
        repo,
        tag_name: newVersion,
        ...(baseVersion && { previous_tag_name: baseVersion }),
      })

    logInfo(`Release notes generated: [${baseVersion} -> ${newVersion}]`)

    return excludeUnwantedReleaseNotes(releaseNotes)
  } catch (err) {
    throw new Error(
      `An error occurred while generating the release notes: ${err.message}`
    )
  }
}

module.exports = {
  fetchLatestRelease,
  generateReleaseNotes,
}
