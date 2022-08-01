'use strict'

const { stat, readFile } = require('fs/promises')
const github = require('@actions/github')
const { ASSET_LABEL, ASSET_FILENAME } = require('../const')
const { archiveItem } = require('./archiver')

const attachArtifact = async (artifactPath, releaseId, token) => {
  const outFile = ASSET_FILENAME

  try {
    await archiveItem(artifactPath, outFile)
  } catch (err) {
    throw new Error(err.message)
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
    const postAssetResponse = await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      data,
      name: outFile,
      label: ASSET_LABEL,
      headers,
    })

    if (!postAssetResponse.data) {
      throw new Error('POST asset response data not available')
    }

    const { id: assetId, label } = postAssetResponse.data

    const getAssetResponse = await octokit.request(
      'GET /repos/{owner}/{repo}/releases/assets/{asset_id}',
      {
        owner,
        repo,
        asset_id: assetId,
      }
    )

    if (!getAssetResponse.data) {
      throw new Error('GET asset response data not available')
    }

    const { browser_download_url: url } = getAssetResponse.data

    return {
      artifact: {
        isPresent: true,
        url,
        label,
      },
    }
  } catch (err) {
    throw new Error(`Unable to upload the asset to the release: ${err.message}`)
  }
}

exports.attachArtifact = attachArtifact
