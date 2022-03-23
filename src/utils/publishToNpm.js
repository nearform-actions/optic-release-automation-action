'use strict'

const { runSpawn } = require('./runSpawn')

async function publishToNpm({
  npmToken,
  opticToken,
  opticUrl,
  npmTag,
  version,
}) {
  const run = runSpawn()

  await run('npm', [
    'config',
    'set',
    `//registry.npmjs.org/:_authToken=${npmToken}`,
  ])

  // We need to check if the package was already published. This can happen if
  // the action was already executed before, but it failed in its last step
  // (GH release).
  const pkgInfo = JSON.parse(await run('npm', ['view', '--json']))

  // NPM only looks into the remote registry when we pass an explicit
  // package name & version, so we don't have to fear that it reads the
  // info from the "local" package.json file.
  const allowNpmPublish =
    '' === (await run('npm', ['view', `${pkgInfo.name}@${version}`]))

  if (allowNpmPublish) {
    await run('npm', ['pack', '--dry-run'])
    if (opticToken) {
      const otp = await run('curl', ['-s', `${opticUrl}${opticToken}`])
      await run('npm', ['publish', '--otp', otp, '--tag', npmTag])
    } else {
      await run('npm', ['publish', '--tag', npmTag])
    }
  }
}

exports.publishToNpm = publishToNpm
