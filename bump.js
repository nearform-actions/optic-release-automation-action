'use strict'

const fetch = require('node-fetch')

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./util')

const GITHUB_APP_URL = 'https://github.com/apps/optic-release-automation'

const getPRBody = (releaseMeta, notes, url) => `
## Optic Release Automation

This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform/optic-release-automation-action).

A new **draft** release [${releaseMeta.version}](${url}) has been created.

#### If you want to go ahead with the release, please mark this draft PR as ready and merge it. When you merge:

- The release will be published
- The npm package with tag \`${
  releaseMeta.npmTag
}\` will be published according to the publishing rules you have configured

#### If you close the PR

- The new draft release will be deleted and nothing will change

${notes}

<!--
<release-meta>${JSON.stringify(releaseMeta)}</release-meta>
-->`

module.exports = async function ({ github, context, inputs }) {
  const run = runSpawn({ cwd: github.action_path })
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

  const { data } = await github.rest.repos.createRelease({
    owner,
    repo,
    tag_name: newVersion,
    generate_release_notes: true,
    draft: true,
  })

  // Should strictly only non-sensitive data
  const releaseMeta = {
    id: data.id,
    version: newVersion,
    npmTag: inputs['npm-tag'],
    opticUrl: inputs['optic-url'],
  }

  // Github does not allow a workflow to directly or indirectly result in another workflow run.
  // Henc creating PR via an external github app.
  const response = await fetch(inputs['api-url'], {
    method: 'POST',
    headers: {
      authorization: `token ${inputs['github-token']}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      head: `refs/heads/${branchName}`,
      base: context.payload.ref,
      title: `${PR_TITLE_PREFIX} ${branchName}`,
      body: getPRBody(releaseMeta, data.body, data.html_url),
    }),
  })

  const responseText = await response.text()

  console.log(responseText)

  if (response.status === 400) {
    console.warn(`Please ensure that Github App is installed ${GITHUB_APP_URL}`)
  }
}
