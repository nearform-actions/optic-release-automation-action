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
      '../src/utils/archiver.js': {
        archiveItem: () => null,
      },
      'fs/promises': {
        stat: () => 100,
        lstat: () => ({ isDirectory: () => true }),
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
              uploadReleaseAsset: async () => ({ status: 201, data: {} }),
            },
          },
          request: async () => ({
            data: { browser_download_url: 'https://example.com' },
          }),
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
      '../src/utils/archiver.js': {
        archiveItem: () => {
          throw error
        },
      },
    })

    const { buildDir, releaseId, token } = DEFAULT_INPUT_DATA

    const expectedError = new Error('file not found')

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
      '../src/utils/archiver.js': {
        archiveItem: () => null,
      },
      'fs/promises': {
        stat: async () => 100,
        lstat: () => ({ isDirectory: () => true }),
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
          request: async () => ({
            data: { browser_download_url: 'https://example.com' },
          }),
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

tap.test(
  'attachArtifact throws an error if response data for POST asset is not available',
  async () => {
    const attachArtifactModule = tap.mock('../src/utils/attachArtifact.js', {
      '../src/utils/archiver.js': {
        archiveItem: () => null,
      },
      'fs/promises': {
        stat: async () => 100,
        lstat: () => ({ isDirectory: () => true }),
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
              uploadReleaseAsset: async () => ({ status: 500 }),
            },
          },
          request: async () => ({
            data: { browser_download_url: 'https://example.com' },
          }),
        }),
      },
    })

    const { buildDir, releaseId, token } = DEFAULT_INPUT_DATA
    const expectedError = new Error(
      'Unable to upload the asset to the release: POST asset response data not available'
    )
    try {
      await attachArtifactModule.attachArtifact(buildDir, releaseId, token)
    } catch (err) {
      tap.equal(err.message, expectedError.message)
    }
  }
)

tap.test(
  'attachArtifact throws an error if response data for GET asset is not available',
  async () => {
    const attachArtifactModule = tap.mock('../src/utils/attachArtifact.js', {
      '../src/utils/archiver.js': {
        archiveItem: () => null,
      },
      'fs/promises': {
        stat: async () => 100,
        lstat: () => ({ isDirectory: () => true }),
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
              uploadReleaseAsset: async () => ({
                status: 201,
                data: { label: 'label', id: 1 },
              }),
            },
          },
          request: async () => ({
            data: null,
          }),
        }),
      },
    })

    const { buildDir, releaseId, token } = DEFAULT_INPUT_DATA
    const expectedError = new Error(
      'Unable to upload the asset to the release: GET asset response data not available'
    )
    try {
      await attachArtifactModule.attachArtifact(buildDir, releaseId, token)
    } catch (err) {
      tap.equal(err.message, expectedError.message)
    }
  }
)
