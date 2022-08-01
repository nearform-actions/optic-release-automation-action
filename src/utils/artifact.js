'use strict'

const { stat, readFile } = require('fs/promises')
const github = require('@actions/github')
const path = require('path')
const { archiveItem } = require('./archiver')

const attach = async (path, filename, releaseId, token) => {
  try {
    await archiveItem(path, filename)
  } catch (err) {
    throw new Error(err.message)
  }

  // determine content-length for header to upload asset
  const { size: contentLength } = await stat(filename)

  // setup headers fro the API call
  const headers = {
    'content-type': 'application/zip',
    'content-length': contentLength,
  }

  try {
    const data = await readFile(filename)

    const { owner, repo } = github.context.repo
    const octokit = github.getOctokit(token)
    const response = await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      data,
      name: filename,
      label: filename,
      headers,
    })

    if (response.data.state !== 'uploaded') {
      throw new Error('The asset has not been uploaded properly.')
    }

    const { browser_download_url: url, label: assetLabel } = response.data

    return {
      url,
      label: assetLabel,
    }
  } catch (err) {
    throw new Error(`Unable to upload the asset to the release: ${err.message}`)
  }
}

const deriveFilename = (filePath, extension) => {
  return `${path.basename(filePath)}.${extension}`
}

exports.attach = attach
exports.deriveFilename = deriveFilename
