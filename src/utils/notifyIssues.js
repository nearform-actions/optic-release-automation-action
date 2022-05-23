'use strict'

const md = require('markdown-it')()
const issueParser = require('issue-parser')
const parse = issueParser('github')

async function getPossibleLinkedIssuesNumbers(
  prNumber,
  githubClient,
  owner,
  repo
) {
  const pr = await githubClient.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  })

  let issueNumbers = []
  if (pr.data.body !== null) {
    const parsedPrBody = parse(pr.data.body)
    if (parsedPrBody.actions.close.length > 0) {
      parsedPrBody.actions.close.forEach(parsedAction => {
        issueNumbers.push(parsedAction.issue)
      })
    }
  }

  return issueNumbers
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

  const prNumbers = prTokens.map(token =>
    token.content
      .match(/\bhttps?:\/\/\S+/gi)[0]
      .split('/')
      .pop()
  )

  const unresolvedPromises = prNumbers.map(prNumber =>
    getPossibleLinkedIssuesNumbers(prNumber, githubClient, owner, repo)
  )
  const issueNumbersToNotify = (await Promise.all(unresolvedPromises))
    .filter(issues => issues.length > 0)
    .flat()

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
