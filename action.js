'use strict'

const { runSpawn } = require('./util')

module.exports = async function ({ github, context, inputs }) {
  const run = runSpawn({ cwd: github.action_path })
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  const newVersion = await run('npm', ['version', '--no-git-tag-version', inputs.semver])
  const branchName = `refs/heads/release/${newVersion}`;

  await run('git', ['checkout', '-b', branchName])
  await run('git', ['commit', '-am', newVersion])

  if (inputs['optic-token']) {
    console.log("Requesting OTP from Optic...")
    const otp = await run('curl', ['-s', `${inputs['optic-url']}${inputs['optic-token']}`])
    await run('npm', ['publish', '--otp', otp, '--tag', inputs['npm-tag']])
  } else {
    await run('npm', ['publish', '--tag', inputs['npm-tag']])
  }

  await run('git', ['push', 'origin', branchName])

  await github.rest.pulls.create({
    owner,
    repo,
    head: branchName,
    base: 'refs/heads/main',
    title: branchName
  });

  await github.rest.repos.createRelease({
    owner,
    repo,
    tag_name: newVersion,
    generate_release_notes: true
  });
}
