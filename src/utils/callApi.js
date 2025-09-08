'use strict'

const fetch = require('node-fetch')
const { logWarning } = require('../log')

const GITHUB_APP_URL = 'https://github.com/apps/optic-release-automation'

// Github does not allow a new workflow run to be triggered as a result of an action using the same `GITHUB_TOKEN`.
// Hence all write ops are being done via an external GitHub app.
const callApi = async ({ method, endpoint, body }, inputs) => {
  const apiUrl = inputs['api-url'].endsWith('/')
    ? inputs['api-url']
    : `${inputs['api-url']}/`
  console.log('>>>>>>apiUrlapiUrl', apiUrl)
  console.log('>>>>>>body', body)

  const response = await fetch(`${apiUrl}${endpoint}`, {
    method,
    headers: {
      authorization: `token ${inputs['github-token']}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (response.status !== 200) {
    logWarning(`Please ensure that Github App is installed ${GITHUB_APP_URL}`)
  }

  return response.json()
}

exports.callApi = callApi
