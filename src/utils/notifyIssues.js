'use strict'

const fs = require('fs')
const pMap = require('p-map')

const { logError, logWarning } = require('../log')
const { getPrNumbersFromReleaseNotes } = require('./releaseNotes')

function getLinkedIssueNumbers({ octokit, prNumber, repoOwner, repoName }) {
  const data = octokit.graphql(
    `
    query getLinkedIssues($repoOwner: String!, $repoName: String!, $prNumber: Int!) {
      repository(owner: $repoOwner, name: $repoName) {
        pullRequest(number: $prNumber) {
          id
          closingIssuesReferences(first: 100) {
            nodes {
              id
              number
            }
          }
        }
      }
    }
    `,
    {
      repoOwner,
      repoName,
      prNumber,
    }
  )

  const linkedIssues =
    data?.repository?.pullRequest?.closingIssuesReferences?.nodes

  if (!linkedIssues) {
    return []
  }

  return linkedIssues.map(issue => issue.number)
}

async function notifyIssues(githubClient, owner, repo, release) {
  let packageName
  let packageVersion

  try {
    const packageJsonFile = fs.readFileSync('./package.json', 'utf8')
    const packageJson = JSON.parse(packageJsonFile)

    packageName = packageJson.name
    packageVersion = packageJson.version
  } catch (err) {
    logWarning('Failed to get package info')
    logError(err)
  }

  const { body: releaseNotes, html_url: releaseUrl } = release

  const prNumbers = getPrNumbersFromReleaseNotes(releaseNotes)

  const issueNumbersToNotify = (
    await Promise.all(
      prNumbers.map(prNumber =>
        getLinkedIssueNumbers({
          octokit: githubClient,
          prNumber: parseInt(prNumber, 10),
          repoOwner: owner,
          repoName: repo,
        })
      )
    )
  ).flat()

  const npmUrl = `https://www.npmjs.com/package/${packageName}/v/${packageVersion}`

  const body = `🎉 This issue has been resolved in version ${packageVersion} 🎉 \n\n 
  The release is available on: \n * [npm package (@latest dist-tag)](${npmUrl}) \n 
  * [GitHub release](${releaseUrl}) \n\n Your **[optic](https://github.com/nearform/optic)** bot 📦🚀`

  const mapper = async issueNumber => {
    await githubClient.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    })
  }

  await pMap(issueNumbersToNotify, mapper, { concurrency: 20 })
}

exports.notifyIssues = notifyIssues
