'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const core = require('@actions/core')

const runSpawnAction = require('../utils/runSpawn')
const callApiAction = require('../utils/callApi')
const { PR_TITLE_PREFIX } = require('../const')

const TEST_VERSION = 'v3.1.1'
const runSpawnStub = sinon.stub().returns(TEST_VERSION)

function setup() {
  const coreStub = sinon.stub(core)
  const utilStub = sinon.stub(runSpawnAction, 'runSpawn').returns(runSpawnStub)
  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: {} })

  process.env.GITHUB_ACTION_PATH = './'

  const bump = proxyquire('../bump', {
    './utils/runSpawn': utilStub,
    '@actions/core': coreStub,
  })

  return {
    bump,
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

tap.test('npm should called with semver', async t => {
  const { bump, stubs } = setup()
  await bump(DEFAULT_ACTION_DATA)

  t.ok(
    stubs.runSpawnStub.calledWith('npm', [
      'version',
      '--no-git-tag-version',
      DEFAULT_ACTION_DATA.inputs.semver,
    ])
  )
})

tap.test('should create a new git branch', async t => {
  const { bump, stubs } = setup()
  await bump(DEFAULT_ACTION_DATA)

  const branchName = `release/${TEST_VERSION}`

  t.ok(stubs.runSpawnStub.calledWith('git', ['checkout', '-b', branchName]))
  t.ok(stubs.runSpawnStub.calledWith('git', ['commit', '-am', TEST_VERSION]))
  t.ok(stubs.runSpawnStub.calledWith('git', ['push', 'origin', branchName]))
})

tap.test('should call the release endpoint with a new version', async t => {
  const { bump, stubs } = setup()
  await bump(DEFAULT_ACTION_DATA)

  t.ok(
    stubs.callApiStub.calledWith(
      {
        method: 'POST',
        endpoint: 'release',
        body: {
          version: TEST_VERSION,
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
  )
})

tap.test('should call the PR endpoint with a new version', async t => {
  const { bump, stubs } = setup()
  await bump(DEFAULT_ACTION_DATA)

  const branchName = `release/${TEST_VERSION}`
  t.ok(
    stubs.callApiStub.calledWith(
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
  )
})

tap.test(
  'should create the correct release for a version with no minor',
  async t => {
    const { bump, stubs } = setup()
    const localVersion = 'v2.0.0'
    runSpawnStub.returns(localVersion)
    await bump(DEFAULT_ACTION_DATA)
    const branchName = `release/${localVersion}`
    t.ok(
      stubs.callApiStub.calledWith(
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
    )
  }
)

tap.test(
  'should create the correct release for a version with no major',
  async t => {
    const { bump, stubs } = setup()
    const localVersion = 'v0.0.5'
    runSpawnStub.returns(localVersion)
    await bump(DEFAULT_ACTION_DATA)
    const branchName = `release/${localVersion}`
    t.ok(
      stubs.callApiStub.calledWith(
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
    )
  }
)

tap.test('should delete branch in case of pr failure', async t => {
  const { bump, stubs } = setup()
  const localVersion = 'v0.0.5'
  const { inputs } = DEFAULT_ACTION_DATA
  await bump({ inputs })

  const branchName = `release/${localVersion}`
  sinon.assert.calledWith(stubs.runSpawnStub, 'git', [
    'push',
    'origin',
    '--delete',
    branchName,
  ])
})

tap.test('Should call core.setFailed if it fails to create a PR', async t => {
  const { bump, stubs } = setup()
  const { inputs } = DEFAULT_ACTION_DATA
  await bump({ inputs })

  sinon.assert.calledOnce(stubs.coreStub.setFailed)
})
