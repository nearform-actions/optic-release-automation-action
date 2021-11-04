'use strict'

const { PR_TITLE_PREFIX } = require('./const')
const { runSpawn } = require('./util')

module.exports = async function ({ github, context, inputs }) {
  const pr = context.payload.pull_request

  if (
    context.payload.action !== 'closed' ||
    !pr.merged ||
    pr.user.login !== 'github-actions[bot]' ||
    !pr.title.startsWith(PR_TITLE_PREFIX)
    // TODO: more checks to validate if it's the right PR?
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

  const run = runSpawn({ cwd: github.action_path })
  const owner = context.repo.owner
  const repo = context.repo.repo
  const opticToken = inputs['optic-token']
  const { opticUrl, npmTag, version } = releaseMeta

  if (opticToken) {
    console.log('Requesting OTP from Optic...')
    const otp = await run('curl', ['-s', `${opticUrl}${opticToken}`])
    await run('npm', ['publish', '--otp', otp, '--tag', npmTag])
  } else {
    await run('npm', ['publish', '--tag', npmTag])
  }

  console.log('Published to Npm')

  await github.rest.repos.createRelease({
    owner,
    repo,
    tag_name: version,
    generate_release_notes: true,
  })
}
