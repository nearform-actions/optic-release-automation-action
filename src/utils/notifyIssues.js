'use strict'

const fs = require('fs')
const pMap = require('p-map')

const { logError, logWarning } = require('../log')
const { getPrNumbersFromReleaseNotes } = require('./releaseNotes')

async function getLinkedIssueNumbers(github, prNumber, repoOwner, repoName) {
  const data = await github.graphql(
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

  console.log({ m: 'notifyIssues - file read', packageName, packageVersion })

  const { body: releaseNotes, html_url: releaseUrl } = release

  const prNumbers = getPrNumbersFromReleaseNotes(releaseNotes)

  const issueNumbersToNotify = (
    await pMap(prNumbers, prNumber =>
      getLinkedIssueNumbers(githubClient, parseInt(prNumber, 10), owner, repo)
    )
  ).flat()

  const npmUrl = `https://www.npmjs.com/package/${packageName}/v/${packageVersion}`

  const body = `🎉 This issue has been resolved in version ${packageVersion} 🎉 \n\n
  The release is available on: \n * [npm package](${npmUrl}) \n
  * [GitHub release](${releaseUrl}) \n\n Your **[optic](https://github.com/nearform/optic)** bot 📦🚀`

  await pMap(
    issueNumbersToNotify,
    issueNumber => {
      githubClient.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      })
    },
    { concurrency: 10 }
  )
}

exports.notifyIssues = notifyIssues
