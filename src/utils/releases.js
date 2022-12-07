'use strict'

const github = require('@actions/github')
const { logInfo } = require('../log')

async function fetchLatestRelease(inputs) {
  try {
    logInfo('Fetching latest release')

    const token = inputs['github-token']

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
    throw new Error(
      `An error occurred while fetching the latest release: ${err.message}`
    )
  }
}

async function generateReleaseNotes(inputs, newVersion, latestVersion) {
  try {
    logInfo(`Generating release notes: [${latestVersion} -> ${newVersion}]`)

    const token = inputs['github-token']

    const { owner, repo } = github.context.repo
    const octokit = github.getOctokit(token)

    const { data: releaseNotes } =
      await octokit.rest.repos.generateReleaseNotes({
        owner,
        repo,
        tag_name: newVersion,
        ...(latestVersion && { previous_tag_name: latestVersion }),
      })

    logInfo(`Release notes generated: ${newVersion}`)

    return releaseNotes
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
