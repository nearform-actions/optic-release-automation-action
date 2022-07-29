'use strict'

const tap = require('tap')

const DEFAULT_INPUT_DATA = {
  buildDir: 'dist',
  releaseId: '1',
  token: 'token',
}

tap.test(
  'attachArtifact does not throw errors with proper inputs',
  async () => {
    const attachArtifactModule = tap.mock('../src/utils/attachArtifact.js', {
      'zip-a-folder': {
        zip: async () => null,
      },
      'fs/promises': {
        stat: () => 100,
        readFile: async () => Buffer.from([0x62, 0x75, 0x66, 0x66, 0x65, 0x72]),
      },
      '@actions/github': {
        context: {
          repo: {
            repo: 'repo',
            owner: 'owner',
          },
        },
        getOctokit: () => ({
          rest: {
            repos: {
              uploadReleaseAsset: async () => ({ status: 201 }),
            },
          },
        }),
      },
    })

    const { buildDir, releaseId, token } = DEFAULT_INPUT_DATA
    tap.doesNotThrow(async () => {
      await attachArtifactModule.attachArtifact(buildDir, releaseId, token)
    })
  }
)

tap.test(
  'attachArtifact throws an error if build folder not found',
  async () => {
    const error = new Error('file not found')
    const attachArtifactModule = tap.mock('../src/utils/attachArtifact.js', {
      'zip-a-folder': {
        zip: async () => {
          throw error
        },
      },
    })

    const { buildDir, releaseId, token } = DEFAULT_INPUT_DATA

    const expectedError = new Error(
      'An error occurred while zipping the build folder: file not found'
    )

    try {
      await attachArtifactModule.attachArtifact(buildDir, releaseId, token)
    } catch (err) {
      tap.equal(err.message, expectedError.message)
    }
  }
)

tap.test(
  'attachArtifact throws an error if an error occurres during asset upload',
  async () => {
    const error = new Error('Generic HTTP error')
    const attachArtifactModule = tap.mock('../src/utils/attachArtifact.js', {
      'zip-a-folder': {
        zip: async () => null,
      },
      'fs/promises': {
        stat: async () => 100,
        readFile: async () => Buffer.from([0x62, 0x75, 0x66, 0x66, 0x65, 0x72]),
      },
      '@actions/github': {
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
                throw error
              },
            },
          },
        }),
      },
    })

    const { buildDir, releaseId, token } = DEFAULT_INPUT_DATA
    const expectedError = new Error(
      'Unable to upload the asset to the release: Generic HTTP error'
    )
    try {
      await attachArtifactModule.attachArtifact(buildDir, releaseId, token)
    } catch (err) {
      tap.equal(err.message, expectedError.message)
    }
  }
)
