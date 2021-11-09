'use strict'

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./util')

module.exports = async function ({ github, context, inputs }) {
  const pr = context.payload.pull_request
  const owner = context.repo.owner
  const repo = context.repo.repo

  if (
    context.payload.action !== 'closed' ||
    pr.user.login !== 'github-actions[bot]' ||
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

  if (!pr.merged) {
    return github.rest.repos.deleteRelease({
      owner,
      repo,
      release_id: id,
    })
  }

  const run = runSpawn({ cwd: github.action_path })
  const opticToken = inputs['optic-token']
  const { opticUrl, npmTag, version, id } = releaseMeta

  if (opticToken) {
    console.log('Requesting OTP from Optic...')
    const otp = await run('curl', ['-s', `${opticUrl}${opticToken}`])
    await run('npm', ['publish', '--otp', otp, '--tag', npmTag])
  } else {
    await run('npm', ['publish', '--tag', npmTag])
  }

  console.log('Published to Npm')

  await github.rest.repos.updateRelease({
    owner,
    repo,
    tag_name: version,
    generate_release_notes: true,
    release_id: id,
    draft: false,
  })
}
