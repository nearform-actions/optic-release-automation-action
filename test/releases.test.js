'use strict'

const tap = require('tap')
const sinon = require('sinon')
const actionLog = require('../src/log')

const TOKEN = 'GH-TOKEN'

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

tap.test(
  'generateReleaseNotes returns release notes excluding the Optic PR',
  async t => {
    const testReleaseNotes = `
    ## Whats Changed\n +
    * [OPTIC-RELEASE-AUTOMATION] release/v1.2.4 by @optic-release-automation in https://github.com/nearform/github-board-slack-notifications/pull/139
    * chore 15 by @people in https://github.com/owner/repo/pull/13\n
    * chore 18 by @people in https://github.com/owner/repo/pull/15\n
    * chore 19 by @people in https://github.com/owner/repo/pull/16\n
    * chore 21 by @people in https://github.com/owner/repo/pull/18\n
    * fix 26 by @people in https://github.com/owner/repo/pull/42\n
    * feature 30 by @people in https://github.com/owner/repo/pull/50\n
    * fix 27 by @people in https://github.com/owner/repo/pull/52\n
    * fix 32 by @people in https://github.com/owner/repo/pull/53\n
    \n
    \n
    ## New Contributors\n
    * @people made their first contribution in https://github.com/owner/repo/pull/13\n
    * @people made their first contribution in https://github.com/owner/repo/pull/16\n
    * @people made their first contribution in https://github.com/owner/repo/pull/42\n
    * @people made their first contribution in https://github.com/owner/repo/pull/53\n
    \n
    \n
    ## New documentation\n
    * Link: https://somewhere.com/on/the/internet
    \n
    \n
    **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
`

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
                return {
                  status: 200,
                  data: {},
                }
              },
              generateReleaseNotes: async () => {
                return {
                  status: 200,
                  data: testReleaseNotes,
                }
              },
            },
          },
        }),
      },
    })

    const releaseNotes = await releasesModule.generateReleaseNotes(
      TOKEN,
      '1.1.0',
      '1.0.0'
    )
    t.notOk(releaseNotes.includes('[OPTIC-RELEASE-AUTOMATION]'))
  }
)
