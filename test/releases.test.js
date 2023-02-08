'use strict'

const tap = require('tap')
const sinon = require('sinon')
const actionLog = require('../src/log')

const TOKEN = 'GH-TOKEN'
const TAG = 'v1.0.1'

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

  return { logStub, releasesModule }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('fetchLatestRelease return properly the latest release', async t => {
  const { releasesModule } = setup({ throwsError: false })

  await t.resolves(releasesModule.fetchLatestRelease(TOKEN))
})

tap.test(
  'fetchLatestRelease throws an error if an exception occurs while calling GitHub APIs',
  async t => {
    const { releasesModule } = setup({ throwsError: true })

    await t.rejects(releasesModule.fetchLatestRelease(TOKEN))
  }
)

tap.test(
  'generateReleaseNotes return properly the generated release notes',
  async t => {
    const { releasesModule } = setup({ throwsError: false })

    await t.resolves(
      releasesModule.generateReleaseNotes(TOKEN, '1.1.0', '1.0.0')
    )
  }
)

tap.test(
  'generateReleaseNotes throws an error if an exception occurs while calling GitHub APIs',
  async t => {
    const { releasesModule } = setup({ throwsError: true })

    await t.rejects(releasesModule.generateReleaseNotes(TOKEN))
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

    await t.resolves(releasesModule.fetchLatestRelease(TOKEN))
  }
)

tap.test('fetchReleaseByTag return properly the specified release', async t => {
  const { releasesModule } = setup({ throwsError: false })

  await t.resolves(releasesModule.fetchReleaseByTag(TOKEN, TAG))
})

tap.test(
  'fetchReleaseByTag throws an error if an exception occurs while calling GitHub APIs',
  async t => {
    const { releasesModule } = setup({ throwsError: true })

    await t.rejects(releasesModule.fetchReleaseByTag(TOKEN, TAG))
  }
)

tap.test('fetchReleaseByTag throws an error if Not Found', async t => {
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
            getReleaseByTag: async () => {
              throw new Error('Not Found')
            },
          },
        },
      }),
    },
  })

  await t.rejects(releasesModule.fetchReleaseByTag(TOKEN, TAG))
})
