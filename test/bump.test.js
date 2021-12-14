'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')

const runSpawnAction = require('../utils/runSpawn')
const callApiAction = require('../utils/callApi')
const { PR_TITLE_PREFIX } = require('../const')

const TEST_VERSION = 'v3.1.1'
const runSpawnStub = sinon.stub().returns(TEST_VERSION)

function setup(version = TEST_VERSION) {
  const coreStub = sinon.stub(core)
  const utilStub = sinon.stub(runSpawnAction, 'runSpawn').returns(runSpawnStub)
  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: {} })

  process.env.GITHUB_ACTION_PATH = './'
  process.env.NPM_VERSION = version.slice(1)

  const openPr = proxyquire('../openPr', {
    './utils/runSpawn': utilStub,
    '@actions/core': coreStub,
  })

  return {
    openPr,
    stubs: {
      utilStub,
      runSpawnStub,
      callApiStub,
      coreStub,
    },
  }
}

tap.afterEach(() => {
  sinon.restore()
})

const DEFAULT_ACTION_DATA = {
  inputs: {
    semver: 'patch',
    'commit-message': 'Release {version}',
  },
  context: {
    eventName: 'pull_request',
    repo: {
      repo: {},
      owner: {},
    },
    payload: {
      ref: 'ref',
      action: 'closed',
      pull_request: {
        user: { login: 'optic-release-automation[bot]' },
        title: PR_TITLE_PREFIX,
      },
    },
  },
}

tap.test('it trigger an error when the NPM_VERSION is missing', async t => {
  const { openPr } = setup()
  delete process.env.NPM_VERSION

  try {
    await openPr(DEFAULT_ACTION_DATA)
    t.fail('should have thrown an error')
  } catch (error) {
    t.ok(error)
    t.match(error.message, 'NPM_VERSION is missing')
  }
})

tap.test('should create a new git branch', async () => {
  const { openPr, stubs } = setup()
  await openPr(DEFAULT_ACTION_DATA)

  const branchName = `release/${TEST_VERSION}`

  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'git', [
    'checkout',
    '-b',
    branchName,
  ])
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'git', ['add', '-A'])
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'git', [
    'commit',
    '-m',
    `"Release ${TEST_VERSION}"`,
  ])
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'git', [
    'push',
    'origin',
    branchName,
  ])
})

tap.test('should handle custom commit messages', async () => {
  const { openPr, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.inputs['commit-message'] =
    '[{version}] The brand new {version} has been released'
  await openPr(data)

  const branchName = `release/${TEST_VERSION}`

  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'git', [
    'checkout',
    '-b',
    branchName,
  ])
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'git', [
    'commit',
    '-m',
    `"[${TEST_VERSION}] The brand new ${TEST_VERSION} has been released"`,
  ])
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'git', [
    'push',
    'origin',
    branchName,
  ])
})

tap.test('should call the release endpoint with a new version', async () => {
  const { openPr, stubs } = setup()
  await openPr(DEFAULT_ACTION_DATA)

  sinon.assert.calledWithExactly(
    stubs.callApiStub,
    {
      method: 'POST',
      endpoint: 'release',
      body: {
        version: TEST_VERSION,
      },
    },
    DEFAULT_ACTION_DATA.inputs
  )
})

tap.test('should call the PR endpoint with a new version', async () => {
  const { openPr, stubs } = setup()
  await openPr(DEFAULT_ACTION_DATA)

  const branchName = `release/${TEST_VERSION}`
  sinon.assert.calledWithExactly(
    stubs.callApiStub,
    {
      method: 'POST',
      endpoint: 'pr',
      body: {
        head: `refs/heads/${branchName}`,
        base: DEFAULT_ACTION_DATA.context.payload.ref,
        title: `${PR_TITLE_PREFIX} ${branchName}`,
        body:
          '## Optic Release Automation\n' +
          '\n' +
          'This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform/optic-release-automation-action).\n' +
          '\n' +
          `A new **draft** GitHub release [${TEST_VERSION}]() has been created.\n` +
          '\n' +
          '#### If you want to go ahead with the release, please merge this PR. When you merge:\n' +
          '\n' +
          '- The GitHub release will be published\n' +
          '\n' +
          '- No npm package will be published as configured\n' +
          '\n' +
          '\n' +
          '\n' +
          '- No major or minor tags will be updated as configured\n' +
          '\n' +
          '\n' +
          '#### If you close the PR\n' +
          '\n' +
          '- The new draft release will be deleted and nothing will change\n' +
          '\n' +
          '\n' +
          '\n' +
          '<!--\n' +
          `<release-meta>{"version":"${TEST_VERSION}"}</release-meta>\n` +
          '-->\n',
      },
    },
    DEFAULT_ACTION_DATA.inputs
  )
})

tap.test(
  'should create the correct release for a version with no minor',
  async () => {
    const localVersion = 'v2.0.0'
    const { openPr, stubs } = setup(localVersion)
    runSpawnStub.returns(localVersion)
    await openPr(DEFAULT_ACTION_DATA)
    const branchName = `release/${localVersion}`
    sinon.assert.calledWithExactly(
      stubs.callApiStub,
      {
        method: 'POST',
        endpoint: 'pr',
        body: {
          head: `refs/heads/${branchName}`,
          base: DEFAULT_ACTION_DATA.context.payload.ref,
          title: `${PR_TITLE_PREFIX} ${branchName}`,
          body:
            '## Optic Release Automation\n' +
            '\n' +
            'This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform/optic-release-automation-action).\n' +
            '\n' +
            `A new **draft** GitHub release [${localVersion}]() has been created.\n` +
            '\n' +
            '#### If you want to go ahead with the release, please merge this PR. When you merge:\n' +
            '\n' +
            '- The GitHub release will be published\n' +
            '\n' +
            '- No npm package will be published as configured\n' +
            '\n' +
            '\n' +
            '\n' +
            '- No major or minor tags will be updated as configured\n' +
            '\n' +
            '\n' +
            '#### If you close the PR\n' +
            '\n' +
            '- The new draft release will be deleted and nothing will change\n' +
            '\n' +
            '\n' +
            '\n' +
            '<!--\n' +
            `<release-meta>{"version":"${localVersion}"}</release-meta>\n` +
            '-->\n',
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
  }
)

tap.test(
  'should create the correct release for a version with no major',
  async () => {
    const localVersion = 'v0.0.5'
    const { openPr, stubs } = setup(localVersion)
    runSpawnStub.returns(localVersion)
    await openPr(DEFAULT_ACTION_DATA)
    const branchName = `release/${localVersion}`
    sinon.assert.calledWithExactly(
      stubs.callApiStub,
      {
        method: 'POST',
        endpoint: 'pr',
        body: {
          head: `refs/heads/${branchName}`,
          base: DEFAULT_ACTION_DATA.context.payload.ref,
          title: `${PR_TITLE_PREFIX} ${branchName}`,
          body:
            '## Optic Release Automation\n' +
            '\n' +
            'This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform/optic-release-automation-action).\n' +
            '\n' +
            `A new **draft** GitHub release [${localVersion}]() has been created.\n` +
            '\n' +
            '#### If you want to go ahead with the release, please merge this PR. When you merge:\n' +
            '\n' +
            '- The GitHub release will be published\n' +
            '\n' +
            '- No npm package will be published as configured\n' +
            '\n' +
            '\n' +
            '\n' +
            '- No major or minor tags will be updated as configured\n' +
            '\n' +
            '\n' +
            '#### If you close the PR\n' +
            '\n' +
            '- The new draft release will be deleted and nothing will change\n' +
            '\n' +
            '\n' +
            '\n' +
            '<!--\n' +
            `<release-meta>{"version":"${localVersion}"}</release-meta>\n` +
            '-->\n',
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
  }
)

tap.test('should delete branch in case of pr failure', async t => {
  const localVersion = 'v0.0.5'
  const { openPr, stubs } = setup(localVersion)
  const { inputs } = DEFAULT_ACTION_DATA
  await openPr({ inputs })

  const branchName = `release/${localVersion}`
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'git', [
    'push',
    'origin',
    '--delete',
    branchName,
  ])
  t.pass('branch deleted')
})

tap.test('Should call core.setFailed if it fails to create a PR', async t => {
  const { openPr, stubs } = setup()
  const { inputs } = DEFAULT_ACTION_DATA
  await openPr({ inputs })

  sinon.assert.calledOnce(stubs.coreStub.setFailed)
  t.pass('failed called')
})
