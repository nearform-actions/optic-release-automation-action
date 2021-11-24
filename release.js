'use strict'

const fetch = require('node-fetch')

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./util')

const GITHUB_APP_URL = 'https://github.com/apps/optic-release-automation'

module.exports = async function ({ github, context, inputs }) {
  const pr = context.payload.pull_request
  const owner = context.repo.owner
  const repo = context.repo.repo

  if (
    context.payload.action !== 'closed' ||
    pr.user.login !== 'optic-release-automation[bot]' ||
    !pr.title.startsWith(PR_TITLE_PREFIX)
  ) {
    return
  }

  let releaseMeta
  try {
    releaseMeta = JSON.parse(
      pr.body.substring(
        pr.body.indexOf('<release-meta>') + 14,
        pr.body.lastIndexOf('</release-meta>')
      )
    )
  } catch (err) {
    return console.error('Unable to parse PR meta', err.message)
  }

  const { opticUrl, npmTag, version, id } = releaseMeta

  if (!pr.merged) {
    return github.rest.repos.deleteRelease({
      owner,
      repo,
      release_id: id,
    })
  }

  const run = runSpawn({ cwd: github.action_path })
  const opticToken = inputs['optic-token']

  if (inputs['npm-token']) {
    if (opticToken) {
      console.log('Requesting OTP from Optic...')
      const otp = await run('curl', ['-s', `${opticUrl}${opticToken}`])
      await run('npm', ['publish', '--otp', otp, '--tag', npmTag])
    } else {
      await run('npm', ['publish', '--tag', npmTag])
    }

    console.log('Published to Npm')
  }

  // TODO: What if PR was closed, reopened and then merged. The draft release would have been deleted!

  // Github does not allow a new workflow run to be triggered as a result of an action using the same `GITHUB_TOKEN`.
  // Hence creating PR via an external GitHub app.
  const response = await fetch(`${inputs['api-url']}release`, {
    method: 'POST',
    headers: {
      authorization: `token ${inputs['github-token']}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      version: version,
      releaseId: id,
    }),
  })

  const responseText = await response.text()

  console.log(responseText)

  if (response.status === 404) {
    console.warn(`Please ensure that Github App is installed ${GITHUB_APP_URL}`)
  }
}
