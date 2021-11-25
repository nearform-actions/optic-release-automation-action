'use strict'

const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const _template = require('lodash.template')

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./util')

const GITHUB_APP_URL = 'https://github.com/apps/optic-release-automation'

const actionPath = process.env.GITHUB_ACTION_PATH
const tpl = fs.readFileSync(path.join(actionPath, 'pr.tpl'), 'utf8')

const getPRBody = (template, { newVersion, draftRelease, inputs }) => {
  // Should strictly contain only non-sensitive data
  const releaseMeta = {
    id: draftRelease.id,
    version: newVersion,
    npmTag: inputs['npm-tag'],
    opticUrl: inputs['optic-url'],
  }

  return template({
    releaseMeta,
    draftRelease,
    npmPublish: !!inputs['npm-token'],
  })
}

module.exports = async function ({ github, context, inputs }) {
  const run = runSpawn()
  const owner = context.repo.owner
  const repo = context.repo.repo

  const newVersion = await run('npm', [
    'version',
    '--no-git-tag-version',
    inputs.semver,
  ])
  const branchName = `release/${newVersion}`

  await run('git', ['checkout', '-b', branchName])
  await run('git', ['commit', '-am', newVersion])
  await run('git', ['push', 'origin', branchName])

  const { data: draftRelease } = await github.rest.repos.createRelease({
    owner,
    repo,
    tag_name: newVersion,
    generate_release_notes: true,
    draft: true,
  })

  const prBody = getPRBody(_template(tpl), { newVersion, draftRelease, inputs })

  // Github does not allow a new workflow run to be triggered as a result of an action using the same `GITHUB_TOKEN`.
  // Hence creating PR via an external GitHub app.
  const response = await fetch(`${inputs['api-url']}pr`, {
    method: 'POST',
    headers: {
      authorization: `token ${inputs['github-token']}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      head: `refs/heads/${branchName}`,
      base: context.payload.ref,
      title: `${PR_TITLE_PREFIX} ${branchName}`,
      body: prBody,
    }),
  })

  const responseText = await response.text()

  console.log(responseText)

  if (response.status === 404) {
    console.warn(`Please ensure that Github App is installed ${GITHUB_APP_URL}`)
  }
}
