'use strict'

const { stat, readFile } = require('fs/promises')
const { zip } = require('zip-a-folder')
const github = require('@actions/github')
const { ASSET_LABEL, ASSET_FILENAME } = require('../const')

const attachArtifact = async (artifactPath, releaseId, token) => {
  const outFile = ASSET_FILENAME
  try {
    await zip(artifactPath, outFile)
  } catch (err) {
    throw new Error(
      'An error occurred while zipping the build folder: ' + err.message
    )
  }

  // determine content-length for header to upload asset
  const { size: contentLength } = await stat(outFile)

  // setup headers fro the API call
  const headers = {
    'content-type': 'application/zip',
    'content-length': contentLength,
  }

  try {
    const data = await readFile(outFile)

    const { owner, repo } = github.context.repo
    const octokit = github.getOctokit(token)
    await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      data,
      name: outFile,
      label: ASSET_LABEL,
      headers,
    })
  } catch (err) {
    throw new Error(`Unable to upload the asset to the release: ${err.message}`)
  }
}

exports.attachArtifact = attachArtifact
