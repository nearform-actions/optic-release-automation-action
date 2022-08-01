'use strict'

const tap = require('tap')

const DEFAULT_INPUT_DATA = {
  artifactPath: 'dist',
  artifactFilename: 'filename.zip',
  releaseId: '1',
  token: 'token',
}

tap.test(
  'attach artifact does not throw errors with proper inputs',
  async () => {
    const attachArtifactModule = tap.mock('../src/utils/artifact.js', {
      '../src/utils/archiver.js': {
        archiveItem: async () => null,
      },
      'fs/promises': {
        stat: async () => 100,
        lstat: async () => ({ isDirectory: () => true }),
        readFile: async () => Buffer.from('hello world'),
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
                data: { state: 'uploaded' },
              }),
            },
          },
        }),
      },
    })

    const { artifactPath, artifactFilename, releaseId, token } =
      DEFAULT_INPUT_DATA

    tap.resolves(
      attachArtifactModule.attach(
        artifactPath,
        artifactFilename,
        releaseId,
        token
      )
    )
  }
)

tap.test(
  'attach artifact throws an error if build folder not found',
  async () => {
    const artifactModule = tap.mock('../src/utils/artifact.js', {
      '../src/utils/archiver.js': {
        archiveItem: async () => {
          throw new Error('file not found')
        },
      },
    })

    const { artifactPath, artifactFilename, releaseId, token } =
      DEFAULT_INPUT_DATA

    tap.rejects(
      artifactModule.attach(artifactPath, artifactFilename, releaseId, token)
    )
  }
)

tap.test(
  'attach artifact throws an error if an error occurres during the asset upload',
  async () => {
    const artifactModule = tap.mock('../src/utils/artifact.js', {
      '../src/utils/archiver.js': {
        archiveItem: async () => null,
      },
      'fs/promises': {
        stat: async () => 100,
        lstat: async () => ({ isDirectory: () => true }),
        readFile: async () => Buffer.from('hello world'),
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
                throw new Error('Generic HTTP error')
              },
            },
          },
        }),
      },
    })

    const { artifactPath, artifactFilename, releaseId, token } =
      DEFAULT_INPUT_DATA

    tap.rejects(
      artifactModule.attach(artifactPath, artifactFilename, releaseId, token)
    )
  }
)

tap.test(
  'attach artifact throws an error if the upload asset state is not uploaded',
  async () => {
    const artifactModule = tap.mock('../src/utils/artifact.js', {
      '../src/utils/archiver.js': {
        archiveItem: async () => null,
      },
      'fs/promises': {
        stat: async () => 100,
        lstat: async () => ({ isDirectory: () => true }),
        readFile: async () => Buffer.from('hello world'),
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
                data: { state: 'not_uploaded' },
              }),
            },
          },
        }),
      },
    })

    const { artifactPath, artifactFilename, releaseId, token } =
      DEFAULT_INPUT_DATA

    tap.rejects(
      artifactModule.attach(artifactPath, artifactFilename, releaseId, token)
    )
  }
)
