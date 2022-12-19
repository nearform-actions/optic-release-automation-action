'use strict'

const tap = require('tap')
const sinon = require('sinon')
const actionLog = require('../src/log')

const inputs = {
  'github-token': 'GH-TOKEN',
}

const setup = ({ throwsError }) => {
  const logStub = sinon.stub(actionLog)
  const releasesModule = tap.mock('../src/utils/releases.js', {
    '../src/log.js': logStub,
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
          },
        },
      }),
    },
  })

  return { logStub, releasesModule }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('fetchLatestRelease return properly the latest release', async t => {
  const { logStub, releasesModule } = setup({ throwsError: false })

  await t.resolves(releasesModule.fetchLatestRelease(inputs))

  sinon.assert.calledTwice(logStub.logInfo)
  sinon.assert.notCalled(logStub.logError)
})

tap.test(
  'fetchLatestRelease throws an error if an exception occurs while calling GitHub APIs',
  async t => {
    const { logStub, releasesModule } = setup({ throwsError: true })

    await t.rejects(releasesModule.fetchLatestRelease(inputs))

    sinon.assert.calledOnce(logStub.logInfo)
    sinon.assert.calledOnce(logStub.logError)
  }
)

tap.test(
  'generateReleaseNotes return properly the generated release notes',
  async t => {
    const { logStub, releasesModule } = setup({ throwsError: false })

    await t.resolves(
      releasesModule.generateReleaseNotes(inputs, '1.1.0', '1.0.0')
    )

    sinon.assert.calledTwice(logStub.logInfo)
    sinon.assert.notCalled(logStub.logError)
  }
)

tap.test(
  'generateReleaseNotes throws an error if an exception occurs while calling GitHub APIs',
  async t => {
    const { logStub, releasesModule } = setup({ throwsError: true })

    await t.rejects(releasesModule.generateReleaseNotes(inputs))

    sinon.assert.calledOnce(logStub.logInfo)
    sinon.assert.calledOnce(logStub.logError)
  }
)

tap.test(
  'fetchLatestRelease returns null if no previous releases are found',
  async t => {
    const logStub = sinon.stub(actionLog)
    const releasesModule = tap.mock('../src/utils/releases.js', {
      '../src/log.js': logStub,
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
              getLatestRelease: async () => {
                throw new Error('Not Found')
              },
            },
          },
        }),
      },
    })

    await t.resolves(releasesModule.fetchLatestRelease(inputs))

    sinon.assert.calledTwice(logStub.logInfo)
  }
)
