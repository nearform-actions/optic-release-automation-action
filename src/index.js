const core = require('@actions/core');
const github = require('@actions/github');

const { logInfo } = require('./log')
const { getInputs } = require('./util')

const { GITHUB_TOKEN, NPM_TOKEN, SEMVER } = getInputs()

async function run () {
  try {
    const octokit = github.getOctokit(GITHUB_TOKEN)
    const { repository, pull_request: pr } = github.context.payload
    const owner = repository.owner.login
    const repo = repository.name

    await octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name,
      generate_release_notes: true
    });


  } catch (error) {
    core.setFailed(error.message);
  }
}

run()
