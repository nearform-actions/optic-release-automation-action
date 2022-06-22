'use strict'

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

async function notifyIssues(
  githubClient,
  releaseNotes,
  npmVersion,
  owner,
  repo,
  releaseUrl,
  packageName
) {
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

  const npmUrl = `https://www.npmjs.com/package/${packageName}/v/${npmVersion}`

  const body = `🎉 This issue has been resolved in version ${npmVersion} 🎉 \n\n 
  The release is available on: \n * [npm package (@latest dist-tag)](${npmUrl}) \n 
  * [GitHub release](${releaseUrl}) \n\n Your **[optic](https://github.com/nearform/optic)** bot 📦🚀`

  issueNumbersToNotify.forEach(async issueNumber => {
    await githubClient.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    })
  })
}

exports.notifyIssues = notifyIssues
