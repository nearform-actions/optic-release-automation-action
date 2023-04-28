'use strict'

const github = require('@actions/github')
const semver = require('semver')
const { logInfo, logError } = require('../log')
const { execWithOutput } = require('./execWithOutput')

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

    return releaseNotes
  } catch (err) {
    throw new Error(
      `An error occurred while generating the release notes: ${err.message}`
    )
  }
}

async function fetchReleaseByTag(token, tag) {
  try {
    logInfo(`Fetching release with tag: ${tag}`)

    const { owner, repo } = github.context.repo
    const octokit = github.getOctokit(token)
    const { data: release } = await octokit.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag: tag,
    })

    logInfo(`Release fetched successfully with tag: ${release.tag_name}`)

    return release
  } catch (err) {
    if (err.message === 'Not Found') {
      logError(`Release with tag ${tag} not found.`)
      throw err
    }

    throw new Error(
      `An error occurred while fetching the release with tag ${tag}: ${err.message}`
    )
  }
}

/**
 * Fail fast with a meaningful error if NPM Provenance will fail.
 *
 * @see https://docs.npmjs.com/generating-provenance-statements
 */
async function checkProvenanceViability() {
  const npmVersion = await execWithOutput('npm', ['-v'])

  const validNpmVersion = '>=9.5.0'
  const correctNpmErrorVersion = '>=9.6.1'

  // Abort if the user specified they want NPM provenance, but their CI's NPM version doesn't support it.
  // If we continued, the release will go ahead with no warnings, and no provenance will be generated.
  if (!semver.satisfies(npmVersion, validNpmVersion)) {
    throw new Error(
      `Provenance requires NPM ${validNpmVersion}, but this action is using v${npmVersion}.
Either remove provenance from your release action's inputs, or update your release CI's NPM version.`
    )
  }

  // Abort with a meaningful error if the user will get a misleading error message from NPM.
  // As of April 2023 this affects anyone whose CI is set to use Node 18 (defaults to NPM 9.5.1).
  if (
    !process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
    // In NPM versions after https://github.com/npm/cli/pull/6226 landed, we can let NPM handle it.
    !semver.satisfies(correctNpmErrorVersion)
  ) {
    throw new Error(
      // Throw the same error message that updated versions of NPM will throw.
      `Provenance generation in GitHub Actions requires "write" access to the "id-token" permission`
    )
  }

  // There are various other provenance requirements, such as specific package.json properties, but these
  // may change with future versions, and do fail with meaningful errors, so we can let NPM handle those.
  return true
}

module.exports = {
  fetchLatestRelease,
  generateReleaseNotes,
  fetchReleaseByTag,
  checkProvenanceViability,
}
