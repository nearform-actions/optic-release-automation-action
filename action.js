'use strict'

const fetch = require('node-fetch')

const bump = require('./bump')
const release = require('./release')
const { runSpawn } = require('./util')

const GITHUB_APP_URL = 'https://github.com/apps/optic-release-automation'

module.exports = async function ({ github, context, inputs }) {
  const run = runSpawn()

  // Github does not allow a new workflow run to be triggered as a result of an action using the same `GITHUB_TOKEN`.
  // Hence all write ops are being done via an external GitHub app.
  const callApi = async ({ method, endpoint, body }) => {
    const response = await fetch(`${inputs['api-url']}${endpoint}`, {
      method,
      headers: {
        authorization: `token ${inputs['github-token']}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.status !== 200) {
      console.warn(
        `Please ensure that Github App is installed ${GITHUB_APP_URL}`
      )
    }

    return response.json()
  }

  if (inputs['npm-token']) {
    await run('npm', [
      'config',
      'set',
      `//registry.npmjs.org/:_authToken=${inputs['npm-token']}`,
    ])
  }

  if (context.eventName === 'workflow_dispatch') {
    return bump({ context, inputs, callApi })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs, callApi })
  }

  console.error('Unsupported event')
}
