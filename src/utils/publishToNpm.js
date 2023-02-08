'use strict'

const { execWithOutput } = require('./execWithOutput')

async function allowNpmPublish(version, cwd) {
  // We need to check if the package was already published. This can happen if
  // the action was already executed before, but it failed in its last step
  // (GH release).

  const exec = execWithOutput({ cwd })

  let packageName = null

  try {
    const packageInfo = await exec('npm', ['view', '--json'])
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
  let packageVersionInfo

  try {
    // npm < v8.13.0 returns empty output, newer versions throw a E404
    // We handle both and consider them as package version not existing
    packageVersionInfo = await exec('npm', [
      'view',
      `${packageName}@${version}`,
    ])
  } catch (error) {
    if (!error?.message?.match(/code E404/)) {
      throw error
    }
  }

  return !packageVersionInfo
}

async function publishToNpm({
  npmToken,
  opticToken,
  opticUrl,
  npmTag,
  version,
  cwd,
}) {
  const exec = execWithOutput({ cwd })

  await exec('npm', [
    'config',
    'set',
    `//registry.npmjs.org/:_authToken=${npmToken}`,
  ])

  if (!(await allowNpmPublish(version, cwd))) {
    return
  }

  await exec('npm', ['pack', '--dry-run'])

  if (opticToken) {
    const otp = await exec('curl', ['-s', `${opticUrl}${opticToken}`])
    await exec('npm', ['publish', '--otp', otp, '--tag', npmTag])
  } else {
    await exec('npm', ['publish', '--tag', npmTag])
  }
}

exports.publishToNpm = publishToNpm
