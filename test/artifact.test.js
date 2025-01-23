'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { ZIP_EXTENSION } = require('../src/const.js')

const DEFAULT_INPUT_DATA = {
  artifactPath: 'dist',
  releaseId: '1',
  token: 'token',
}

const setup = ({ t, throwsError }) => {
  const archiverMock = t.mock.module('../src/utils/archiver.js', {
    namedExports: {
      archiveItem: async () => null,
    },
  })

  const fsMock = t.mock.module('fs/promises', {
    namedExports: {
      stat: async () => 100,
      lstat: async () => ({ isDirectory: () => true }),
      readFile: async () => Buffer.from('hello world'),
    },
  })

  const githubMock = t.mock.module('@actions/github', {
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
  })

  const attachArtifactModule = require('../src/utils/artifact.js')
  return { attachArtifactModule, archiverMock, fsMock, githubMock }
}

test('artifact tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/artifact.js')]
  })

  await t.test(
    'attach artifact does not throw errors with proper inputs',
    async t => {
      const { attachArtifactModule, archiverMock, fsMock, githubMock } = setup({
        t,
        throwsError: false,
      })
      const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

      await assert.doesNotReject(
        attachArtifactModule.attach(artifactPath, releaseId, token)
      )
      archiverMock.restore()
      fsMock.restore()
      githubMock.restore()
    }
  )

  await t.test(
    'attach artifact does not throw errors with path ending with .zip',
    async t => {
      const { attachArtifactModule, archiverMock, fsMock, githubMock } = setup({
        t,
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
      archiverMock.restore()
      fsMock.restore()
      githubMock.restore()
    }
  )

  await t.test(
    'attach artifact throws an error if build folder not found',
    async t => {
      const archiverMock = t.mock.module('../src/utils/archiver.js', {
        default: {
          archiveItem: async () => {
            throw new Error('file not found')
          },
        },
      })

      const attachArtifactModule = require('../src/utils/artifact.js')
      const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

      await assert.rejects(
        attachArtifactModule.attach(artifactPath, releaseId, token)
      )
      archiverMock.restore()
    }
  )

  await t.test(
    'attach artifact throws an error if an error occurres during the asset upload',
    async t => {
      const { attachArtifactModule, archiverMock, fsMock, githubMock } = setup({
        t,
        throwsError: true,
      })
      const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

      await assert.rejects(
        attachArtifactModule.attach(artifactPath, releaseId, token)
      )
      archiverMock.restore()
      fsMock.restore()
      githubMock.restore()
    }
  )

  await t.test(
    'attach artifact throws an error if the upload asset state is not uploaded',
    async t => {
      const archiverMock = t.mock.module('../src/utils/archiver.js', {
        default: {
          archiveItem: async () => null,
        },
      })

      const fsMock = t.mock.module('fs/promises', {
        namedExports: {
          stat: async () => 100,
          lstat: async () => ({ isDirectory: () => true }),
          readFile: async () => Buffer.from('hello world'),
        },
      })

      const githubMock = t.mock.module('@actions/github', {
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
      })

      const attachArtifactModule = require('../src/utils/artifact.js')
      const { artifactPath, releaseId, token } = DEFAULT_INPUT_DATA

      await assert.rejects(
        attachArtifactModule.attach(artifactPath, releaseId, token)
      )
      archiverMock.restore()
      fsMock.restore()
      githubMock.restore()
    }
  )
})
