'use strict'

const fs = require('fs')
const { zip } = require('zip-a-folder')
const github = require('@actions/github')
const { ASSET_LABEL, ASSET_FILENAME } = require('../const')

const attachArtifact = async (buildDir, releaseId, token) => {
  const outFile = ASSET_FILENAME
  try {
    await zip(buildDir, outFile)
  } catch (err) {
    throw new Error(
      'An error occurred while zipping the build folder: ' + err.message
    )
  }

  // determine content-length for header to upload asset
  const contentLength = filePath => fs.statSync(filePath).size

  // setup headers fro the API call
  const headers = {
    'content-type': 'application/zip',
    'content-length': contentLength(outFile),
  }

  try {
    const { owner, repo } = github.context
    const octokit = github.getOctokit(token)
    await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      data: fs.readFileSync(outFile),
      name: outFile,
      label: ASSET_LABEL,
      headers,
    })
    return
  } catch (err) {
    console.log('error: ', err)
    throw new Error(`Unable to upload the asset to the release: ${err.message}`)
  }
}

exports.attachArtifact = attachArtifact
