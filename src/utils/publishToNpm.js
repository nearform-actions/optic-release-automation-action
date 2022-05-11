'use strict'

const { runSpawn } = require('./runSpawn')

async function allowNpmPublish(version) {
  const run = runSpawn()

  // We need to check if the package was already published. This can happen if
  // the action was already executed before, but it failed in its last step
  // (GH release).
  let packageName = null
  try {
    const packageInfo = await run('npm', ['view', '--json'])
    packageName = packageInfo ? JSON.parse(packageInfo).name : null
  } catch (error) {
    if (!error?.message?.match(/code E404/)) {
      throw error
    }
  }

  // Package has not been published before
  if (!packageName) {
    return true
  }

  // NPM only looks into the remote registry when we pass an explicit
  // package name & version, so we don't have to fear that it reads the
  // info from the "local" package.json file.
  const packageVersionInfo = await run('npm', [
    'view',
    `${packageName}@${version}`,
  ])

  return packageVersionInfo === ''
}

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

  if (await allowNpmPublish(version)) {
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
