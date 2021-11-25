'use strict'

const fs = require('fs')
const path = require('path')
const _template = require('lodash.template')

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./util')

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

module.exports = async function ({ context, inputs, callApi }) {
  const run = runSpawn()

  const newVersion = await run('npm', [
    'version',
    '--no-git-tag-version',
    inputs.semver,
  ])
  const branchName = `release/${newVersion}`

  await run('git', ['checkout', '-b', branchName])
  await run('git', ['commit', '-am', newVersion])
  await run('git', ['push', 'origin', branchName])

  const { data: draftRelease } = await callApi({
    method: 'POST',
    endpoint: 'release',
    body: {
      version: newVersion,
    },
  })

  const prBody = getPRBody(_template(tpl), { newVersion, draftRelease, inputs })

  await callApi({
    method: 'POST',
    endpoint: 'pr',
    body: {
      head: `refs/heads/${branchName}`,
      base: context.payload.ref,
      title: `${PR_TITLE_PREFIX} ${branchName}`,
      body: prBody,
    },
  })
}
