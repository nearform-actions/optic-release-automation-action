'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const actionLog = require('../src/log.js')

const TOKEN = 'GH-TOKEN'
const TAG = 'v1.0.1'

const setup = ({ t, throwsError }) => {
  const logStub = sinon.stub(actionLog)

  const logMock = t.mock.module('../src/log.js', {
    defaultExport: logStub,
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
            getLatestRelease: async () => {
              if (throwsError) {
                throw new Error()
              }
              return {
                status: 200,
                data: {},
              }
            },
            generateReleaseNotes: async () => {
              if (throwsError) {
                throw new Error()
              }
              return {
                status: 200,
                data: {},
              }
            },
            getReleaseByTag: async () => {
              if (throwsError) {
                throw new Error()
              }
              return {
                status: 200,
                data: {},
              }
            },
          },
        },
      }),
    },
  })

  const releasesModule = require('../src/utils/releases.js')
  return { logStub, releasesModule, mocks: { logMock, githubMock } }
}

test('releases tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/releases.js')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test(
    'fetchLatestRelease return properly the latest release',
    async t => {
      const { releasesModule, mocks } = setup({ t, throwsError: false })
      await assert.doesNotReject(releasesModule.fetchLatestRelease(TOKEN))
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'fetchLatestRelease throws an error if an exception occurs while calling GitHub APIs',
    async t => {
      const { releasesModule, mocks } = setup({ t, throwsError: true })
      await assert.rejects(releasesModule.fetchLatestRelease(TOKEN))
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'generateReleaseNotes return properly the generated release notes',
    async t => {
      const { releasesModule, mocks } = setup({ t, throwsError: false })
      await assert.doesNotReject(
        releasesModule.generateReleaseNotes(TOKEN, '1.1.0', '1.0.0')
      )
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'generateReleaseNotes throws an error if an exception occurs while calling GitHub APIs',
    async t => {
      const { releasesModule, mocks } = setup({ t, throwsError: true })
      await assert.rejects(releasesModule.generateReleaseNotes(TOKEN))
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'fetchLatestRelease returns null if no previous releases are found',
    async t => {
      const logStub = sinon.stub(actionLog)

      const logMock = t.mock.module('../src/log.js', {
        defaultExport: logStub,
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
                getLatestRelease: async () => {
                  throw new Error('Not Found')
                },
              },
            },
          }),
        },
      })

      const releasesModule = require('../src/utils/releases.js')
      await assert.doesNotReject(releasesModule.fetchLatestRelease(TOKEN))

      logMock.restore()
      githubMock.restore()
    }
  )

  await t.test(
    'fetchReleaseByTag return properly the specified release',
    async t => {
      const { releasesModule, mocks } = setup({ t, throwsError: false })
      await assert.doesNotReject(releasesModule.fetchReleaseByTag(TOKEN, TAG))
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'fetchReleaseByTag throws an error if an exception occurs while calling GitHub APIs',
    async t => {
      const { releasesModule, mocks } = setup({ t, throwsError: true })
      await assert.rejects(releasesModule.fetchReleaseByTag(TOKEN, TAG))
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test('fetchReleaseByTag throws an error if Not Found', async t => {
    const logStub = sinon.stub(actionLog)

    const logMock = t.mock.module('../src/log.js', {
      namedExports: {
        logInfo: logStub.logInfo,
        logError: logStub.logError, // Add logError stub
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
              getReleaseByTag: async () => {
                const error = new Error('Not Found')
                throw error
              },
            },
          },
        }),
      },
    })

    const releasesModule = require('../src/utils/releases.js')
    await assert.rejects(
      releasesModule.fetchReleaseByTag(TOKEN, TAG),
      /Not Found/
    )

    sinon.assert.calledWithExactly(
      logStub.logError,
      `Release with tag ${TAG} not found.`
    )

    logMock.restore()
    githubMock.restore()
  })
})
