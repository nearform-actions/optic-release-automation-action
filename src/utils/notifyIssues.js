'use strict'

const md = require('markdown-it')()

function getLinkedIssueNumbers({ octokit, prNumber, repoOwner, repoName }) {
  return octokit
    .graphql(
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
    .then(queryResult => {
      const linkedIssues =
        queryResult?.repository?.pullRequest?.closingIssuesReferences?.nodes
      if (!linkedIssues) {
        return []
      }

      return linkedIssues.map(issue => issue.number)
    })
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
  const result = md.parse(releaseNotes.split('##')[1])

  const prTokens = result.filter(token => token.type === 'inline').slice(1)

  const potentialPrNumbers = prTokens.map(token =>
    token.content
      .match(/\bhttps?:\/\/\S+/gi)[0]
      .split('/')
      .pop()
  )

  // Filter out the full change log numbers such as v1.0.1...v1.0.2
  const prNumbers = potentialPrNumbers.filter(prNumber =>
    prNumber.match(/^\d+$/)
  )

  const issueNumbersToNotify = (
    await Promise.all(
      prNumbers.map(async prNumber =>
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
