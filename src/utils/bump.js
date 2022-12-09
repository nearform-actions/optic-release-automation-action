'use strict'
const github = require('@actions/github')
const { logDebug, logInfo } = require('../log')

async function getBumpedVersion({ versionPrefix, token }) {
  const { owner, repo } = github.context.repo
  const data = await github.graphql(
    `
    query {
      repository(owner: $repoOwner, name: $repoName) {
        latestRelease{
          tagName
          tagCommit {
            oid
          }
        }
      }
    }
    `,
    {
      owner,
      repo,
    }
  )

  logInfo(`response from get latest release query ${JSON.stringify(data)}`)

  const latestReleaseCommitSha = data?.repository?.latestRelease?.tagCommit?.oid
  const latestReleaseTagName = data?.repository?.latestRelease?.tagName

  if (!latestReleaseCommitSha || !latestReleaseTagName) {
    logDebug(`response from get latest release query ${JSON.stringify(data)}`)
    throw new Error(`Couldn't find latest release`)
  }

  const octokit = github.getOctokit(token)

  const allCommits = await octokit.rest.repos.listCommits({
    owner,
    repo,
    sha: latestReleaseCommitSha,
    per_page: 100,
    page: 1,
  })
  logInfo(`=-LOG-= ---> allCommits`, allCommits)

  const isTagVersionPrefixed = latestReleaseTagName.includes(versionPrefix)

  const currentVersion = isTagVersionPrefixed
    ? latestReleaseTagName.replace(versionPrefix, '')
    : latestReleaseTagName.replace(versionPrefix, 'v.') // default prefix

  logInfo(`=-LOG-= ---> currentVersion`, currentVersion)

  if (!currentVersion) {
    logDebug(`response from get latest release query ${JSON.stringify(data)}`)
    throw new Error(`Couldn't find latest version`)
  }

  return getVerionFromCommits(currentVersion, allCommits)
}

function getVerionFromCommits(currentVersion, commits = []) {
  // Define a regular expression to match Conventional Commits messages
  const commitRegex = /^(feat|fix|BREAKING CHANGE)(\(.+\))?:\s(.+)$/

  // Define a mapping of commit types to version bump types
  var versionBumpMap = {
    'BREAKING CHANGE': 'major',
    feat: 'minor',
    fix: 'patch',
  }

  let [major, minor, patch] = currentVersion.split('.')
  let isBreaking = false
  let isMinor = false

  for (const commit of commits) {
    const match = commitRegex.exec(commit)
    if (!match) continue

    const type = match[1]

    // Determine the version bump type based on the commit type
    const bumpType = versionBumpMap[type]
    if (!bumpType) continue

    if (bumpType === 'major') {
      isBreaking = true
      break
    } else if (bumpType === 'minor') {
      isMinor = true
    }
  }

  if (isBreaking) {
    return `${major++}.0.0`
  } else if (isMinor) {
    return `${major}.${minor++}.0`
  } else {
    return `${major}.${minor}.${patch++}`
  }
}

exports.getBumpedVersion = getBumpedVersion
