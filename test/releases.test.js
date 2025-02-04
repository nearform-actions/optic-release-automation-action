'use strict'

const { describe, it, mock } = require('node:test')
const assert = require('node:assert/strict')
const actionLog = require('../src/log.js')
const { mockModule } = require('./mockModule.js')

const TOKEN = 'GH-TOKEN'
const TAG = 'v1.0.1'

const setup = ({ throwsError }) => {
  const logStub = mock.fn()
  const releasesModule = mockModule('../src/utils/releases.js', {
    '../src/log.js': {
      defaultExport: { ...actionLog, info: logStub, error: logStub },
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
    },
  })

  return { logStub, releasesModule }
}

describe('releases tests', async () => {
  it('fetchLatestRelease return properly the latest release', async () => {
    const { releasesModule } = setup({ throwsError: false })
    await assert.doesNotReject(releasesModule.fetchLatestRelease(TOKEN))
  })

  it('fetchLatestRelease throws an error if an exception occurs while calling GitHub APIs', async () => {
    const { releasesModule } = setup({ throwsError: true })
    await assert.rejects(releasesModule.fetchLatestRelease(TOKEN))
  })

  it('generateReleaseNotes return properly the generated release notes', async () => {
    const { releasesModule } = setup({ throwsError: false })
    await assert.doesNotReject(
      releasesModule.generateReleaseNotes(TOKEN, '1.1.0', '1.0.0')
    )
  })

  it('generateReleaseNotes throws an error if an exception occurs while calling GitHub APIs', async () => {
    const { releasesModule } = setup({ throwsError: true })
    await assert.rejects(releasesModule.generateReleaseNotes(TOKEN))
  })

  it('fetchLatestRelease returns null if no previous releases are found', async () => {
    const logStub = mock.fn()

    const releasesModule = mockModule('../src/utils/releases.js', {
      '../src/log.js': {
        defaultExport: { ...actionLog, info: logStub, error: logStub },
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
                getLatestRelease: async () => {
                  throw new Error('Not Found')
                },
              },
            },
          }),
        },
      },
    })
    await assert.doesNotReject(releasesModule.fetchLatestRelease(TOKEN))
  })

  it('fetchReleaseByTag return properly the specified release', async () => {
    const { releasesModule } = setup({ throwsError: false })
    await assert.doesNotReject(releasesModule.fetchReleaseByTag(TOKEN, TAG))
  })

  it('fetchReleaseByTag throws an error if an exception occurs while calling GitHub APIs', async () => {
    const { releasesModule } = setup({ throwsError: true })
    await assert.rejects(releasesModule.fetchReleaseByTag(TOKEN, TAG))
  })

  it('fetchReleaseByTag throws an error if Not Found', async () => {
    const logStub = mock.fn()

    const releasesModule = mockModule('../src/utils/releases.js', {
      '../src/log.js': {
        defaultExport: { ...actionLog, info: logStub, error: logStub },
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
                getReleaseByTag: async () => {
                  throw new Error('Not Found')
                },
              },
            },
          }),
        },
      },
    })

    await assert.rejects(
      releasesModule.fetchReleaseByTag(TOKEN, TAG),
      /Not Found/
    )
  })
})
