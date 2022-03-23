'use strict'
const { runSpawn } = require('./runSpawn')

async function publishToNpm({ npmToken, opticToken, opticUrl, npmTag }) {
  const run = runSpawn()

  await run('npm', [
    'config',
    'set',
    `//registry.npmjs.org/:_authToken=${npmToken}`,
  ])

  await run('npm', ['pack', '--dry-run'])
  if (opticToken) {
    const otp = await run('curl', ['-s', `${opticUrl}${opticToken}`])
    await run('npm', ['publish', '--otp', otp, '--tag', npmTag])
  } else {
    await run('npm', ['publish', '--tag', npmTag])
  }
}

exports.publishToNpm = publishToNpm
