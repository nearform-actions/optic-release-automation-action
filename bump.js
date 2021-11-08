'use strict'

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./util')

const getPRBody = (releaseMeta, notes) => `
## Optic Release Automation

This PR is opened by Github action [optic-release-automation](https://github.com/nearform/optic-release-automation).

A new release will be created in Npm and Github when this PR gets merged.
Package version: ${releaseMeta.version}
Npm tag: ${releaseMeta.npmTag}

You can close the PR if you do not wish to go ahead with this release.

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

  await github.rest.pulls.create({
    owner,
    repo,
    head: `refs/heads/${branchName}`,
    base: context.payload.ref,
    title: `${PR_TITLE_PREFIX} ${branchName}`,
    body: getPRBody(releaseMeta, data.body),
  })
}
