'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { ZIP_EXTENSION } = require('../src/const.js')
const { mockModule } = require('./mockModule.js')
const DEFAULT_INPUT_DATA = {
  artifactPath: 'dist',
  releaseId: '1',
  token: 'token',
}

const setup = ({ throwsError }) => {
  const attachArtifactModule = mockModule('../src/utils/artifact.js', {
    '../src/utils/archiver.js': {
      namedExports: {
        archiveItem: async () => null,
      },
    },
    'fs/promises': {
      namedExports: {
        stat: async () => 100,
        lstat: async () => ({ isDirectory: () => true }),
        readFile: async () => Buffer.from('hello world'),
      },
    },
    '@actions/github': {
      namedExports: {
        context: {
          repo: {
            repo: 'repo',
            owner: 'owner',
          },
        },
        getOctokit: () => ({
          rest: {
            repos: {
              uploadReleaseAsset: async () => {
                if (throwsError) {
                  throw new Error()
                }
                return {
                  status: 201,
                  data: { state: 'uploaded' },
                }
              },
            },
          },
        }),
      },
    },
  })
  return { attachArtifactModule }
}

describe('artifact tests', async () => {
  it('does not throw errors with proper inputs', async () => {
    const { attachArtifactModule } = setup({
      throwsError: false,
    })
    const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

    await assert.doesNotReject(
      attachArtifactModule.attach(artifactPath, releaseId, token)
    )
  })

  it('does not throw errors with path ending with .zip', async () => {
    const { attachArtifactModule } = setup({
      throwsError: false,
    })
    const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

    await assert.doesNotReject(
      attachArtifactModule.attach(
        artifactPath + ZIP_EXTENSION,
        releaseId,
        token
      )
    )
  })

  it('throws an error if build folder not found', async () => {
    const attachArtifactModule = mockModule('../src/utils/artifact.js', {
      '../src/utils/archiver.js': {
        namedExports: {
          archiveItem: async () => {
            throw new Error('file not found')
          },
        },
      },
    })

    const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

    await assert.rejects(
      attachArtifactModule.attach(artifactPath, releaseId, token)
    )
  })

  it('throws an error if an error occurs during the asset upload', async () => {
    const { attachArtifactModule } = setup({
      throwsError: true,
    })
    const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

    await assert.rejects(
      attachArtifactModule.attach(artifactPath, releaseId, token)
    )
  })

  it('throws an error if the upload asset state is not uploaded', async () => {
    const attachArtifactModule = mockModule('../src/utils/artifact.js', {
      '../src/utils/archiver.js': {
        namedExports: {
          archiveItem: async () => null,
        },
      },
      'fs/promises': {
        namedExports: {
          stat: async () => 100,
          lstat: async () => ({ isDirectory: () => true }),
          readFile: async () => Buffer.from('hello world'),
        },
      },
      '@actions/github': {
        namedExports: {
          context: {
            repo: {
              repo: 'repo',
              owner: 'owner',
            },
          },
          getOctokit: () => ({
            rest: {
              repos: {
                uploadReleaseAsset: async () => ({
                  status: 201,
                  data: { state: 'not_uploaded' },
                }),
              },
            },
          }),
        },
      },
    })

    const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

    await assert.rejects(
      attachArtifactModule.attach(artifactPath, releaseId, token)
    )
  })
})
