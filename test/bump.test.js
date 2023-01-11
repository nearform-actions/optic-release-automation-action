'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')

const callApiAction = require('../src/utils/callApi')
const artifactAction = require('../src/utils/artifact')
const releasesAction = require('../src/utils/releases')
const { PR_TITLE_PREFIX } = require('../src/const')

const TEST_RELEASE_NOTES = 'Release Notes'
const TEST_BASE_TAG_VERSION = 'v1.0.0'
const TEST_LATEST_VERSION = '3.1.0'
const TEST_VERSION = '3.1.1'
const TEST_COMMIT_HASH = 'c86b0a35014a7036b245f81ff9de9bd738a5fe95'
const execWithOutputStub = sinon.stub()

execWithOutputStub.resolves(TEST_VERSION)
execWithOutputStub
  .withArgs('git', ['rev-parse', 'HEAD'])
  .resolves(TEST_COMMIT_HASH)

function setup() {
  const coreStub = sinon.stub(core)
  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: {} })
  const attachArtifactStub = sinon.stub(artifactAction, 'attach').returns({
    artifact: {
      isPresent: true,
      url: 'https://example.com',
      label: 'label',
    },
  })
  const releasesFetchReleaseByTagStub = sinon
    .stub(releasesAction, 'fetchReleaseByTag')
    .returns({
      tag_name: TEST_BASE_TAG_VERSION,
    })
  const releasesFetchLatestReleaseStub = sinon
    .stub(releasesAction, 'fetchLatestRelease')
    .returns({
      tag_name: TEST_LATEST_VERSION,
    })
  const releasesGenerateReleaseNotesStub = sinon
    .stub(releasesAction, 'generateReleaseNotes')
    .returns({
      body: TEST_RELEASE_NOTES,
    })

  const openPr = proxyquire('../src/openPr', {
    './utils/execWithOutput': { execWithOutput: execWithOutputStub },
    './utils/artifact': attachArtifactStub,
    '@actions/core': coreStub,
  })

  return {
    openPr,
    stubs: {
      execWithOutputStub,
      callApiStub,
      coreStub,
      attachArtifactStub,
      releasesFetchReleaseByTagStub,
      releasesFetchLatestReleaseStub,
      releasesGenerateReleaseNotesStub,
    },
  }
}

tap.afterEach(() => {
  sinon.restore()
})

const DEFAULT_ACTION_DATA = {
  packageVersion: TEST_VERSION,
  inputs: {
    semver: 'patch',
    'commit-message': 'Release {version}',
    'version-prefix': 'v',
  },
  context: {
    actor: 'John',
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

tap.test('it triggers an error when the packageVersion is missing', async t => {
  const { openPr } = setup()

  try {
    await openPr({
      ...DEFAULT_ACTION_DATA,
      packageVersion: undefined,
    })
    t.fail('should have thrown an error')
  } catch (error) {
    t.ok(error)
    t.match(error.message, 'packageVersion is missing')
  }
})

tap.test('should create a new git branch', async () => {
  const { openPr, stubs } = setup()
  await openPr(DEFAULT_ACTION_DATA)

  const branchName = `release/v${TEST_VERSION}`

  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'checkout',
    '-b',
    branchName,
  ])
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', ['add', '-A'])
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'commit',
    '-m',
    `"Release v${TEST_VERSION}"`,
  ])
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
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

  const branchName = `release/v${TEST_VERSION}`

  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'checkout',
    '-b',
    branchName,
  ])
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'commit',
    '-m',
    `"[v${TEST_VERSION}] The brand new v${TEST_VERSION} has been released"`,
  ])
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'push',
    'origin',
    branchName,
  ])
})

tap.test('should work with a custom version-prefix', async () => {
  const { openPr, stubs } = setup()

  const prData = {
    ...DEFAULT_ACTION_DATA,
    inputs: {
      ...DEFAULT_ACTION_DATA.inputs,
      'version-prefix': '',
    },
  }

  await openPr(prData)

  const branchName = `release/${TEST_VERSION}`

  // git
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'checkout',
    '-b',
    branchName,
  ])
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', ['add', '-A'])
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'commit',
    '-m',
    `"Release v${TEST_VERSION}"`,
  ])
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'push',
    'origin',
    branchName,
  ])

  // github release
  sinon.assert.calledWithExactly(
    stubs.callApiStub,
    {
      method: 'POST',
      endpoint: 'release',
      body: {
        version: TEST_VERSION,
        target: TEST_COMMIT_HASH,
        generateReleaseNotes: false,
        releaseNotes: TEST_RELEASE_NOTES,
      },
    },
    prData.inputs
  )

  sinon.assert.calledWithMatch(stubs.callApiStub, {
    method: 'POST',
    endpoint: 'pr',
    body: {
      head: `refs/heads/${branchName}`,
    },
  })
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
        version: `v${TEST_VERSION}`,
        target: TEST_COMMIT_HASH,
        generateReleaseNotes: false,
        releaseNotes: TEST_RELEASE_NOTES,
      },
    },
    DEFAULT_ACTION_DATA.inputs
  )
})

tap.test('should call the PR endpoint with a new version', async () => {
  const { openPr, stubs } = setup()
  await openPr(DEFAULT_ACTION_DATA)

  const branchName = `release/v${TEST_VERSION}`

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
          `A new **draft** GitHub release [v${TEST_VERSION}]() has been created.\n` +
          '\n' +
          `Release author: @John\n` +
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
          `<release-meta>{"version":"v${TEST_VERSION}"}</release-meta>\n` +
          '-->\n',
      },
    },
    DEFAULT_ACTION_DATA.inputs
  )
})

tap.test(
  'should create the correct release for a version with no minor',
  async () => {
    const localVersion = '2.0.0'
    const { openPr, stubs } = setup()
    execWithOutputStub.returns(localVersion)
    await openPr({
      ...DEFAULT_ACTION_DATA,
      packageVersion: localVersion,
    })
    const branchName = `release/v${localVersion}`
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
            `A new **draft** GitHub release [v${localVersion}]() has been created.\n` +
            '\n' +
            `Release author: @John\n` +
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
            `<release-meta>{"version":"v${localVersion}"}</release-meta>\n` +
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
    const localVersion = '0.0.5'
    const { openPr, stubs } = setup()
    execWithOutputStub.returns(localVersion)
    await openPr({
      ...DEFAULT_ACTION_DATA,
      packageVersion: localVersion,
    })
    const branchName = `release/v${localVersion}`
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
            `A new **draft** GitHub release [v${localVersion}]() has been created.\n` +
            '\n' +
            `Release author: @John\n` +
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
            `<release-meta>{"version":"v${localVersion}"}</release-meta>\n` +
            '-->\n',
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
  }
)

tap.test('should delete branch in case of pr failure', async t => {
  const localVersion = '0.0.5'
  const { openPr, stubs } = setup()
  const { context, inputs } = DEFAULT_ACTION_DATA
  stubs.callApiStub.onCall(1).rejects()
  await openPr({ context, inputs, packageVersion: localVersion })

  const branchName = `release/v${localVersion}`
  sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
    'push',
    'origin',
    '--delete',
    branchName,
  ])
  t.pass('branch deleted')
})

tap.test('Should call core.setFailed if it fails to create a PR', async t => {
  const branchName = `release/v${TEST_VERSION}`

  const { openPr, stubs } = setup()
  const { context, inputs, packageVersion } = DEFAULT_ACTION_DATA
  stubs.callApiStub.onCall(1).rejects()

  stubs.execWithOutputStub
    .withArgs('git', ['push', 'origin', '--delete', branchName])
    .rejects()

  await openPr({ context, inputs, packageVersion })

  sinon.assert.calledOnce(stubs.coreStub.setFailed)
  t.pass('failed called')
})

tap.test(
  'should call attachArtifact if artifact-path input is present',
  async () => {
    const { openPr, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs['artifact-path'] = 'dist'
    await openPr(data)

    sinon.assert.calledOnce(stubs.attachArtifactStub)
  }
)

tap.test('should not open Pr if create release draft fails', async t => {
  const { openPr, stubs } = setup()
  stubs.callApiStub = stubs.callApiStub.throws({ message: 'error message' })

  try {
    await openPr({
      ...DEFAULT_ACTION_DATA,
    })
    t.fail('should have thrown an error')
  } catch (error) {
    t.ok(error)
    t.match(error.message, 'Unable to create draft release: error message')
  }
})

tap.test(
  'should generate release notes if the latest release has not been found -> first release',
  async () => {
    const { openPr, stubs } = setup()
    stubs.releasesFetchLatestReleaseStub =
      stubs.releasesFetchLatestReleaseStub.returns(null)

    await openPr(DEFAULT_ACTION_DATA)

    sinon.assert.calledWithExactly(
      stubs.callApiStub,
      {
        method: 'POST',
        endpoint: 'release',
        body: {
          version: `v${TEST_VERSION}`,
          target: TEST_COMMIT_HASH,
          generateReleaseNotes: true,
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
  }
)

tap.test(
  'should automatically generate release notes if an error occurred while generating the specific release notes',
  async () => {
    const { openPr, stubs } = setup()
    stubs.releasesGenerateReleaseNotesStub =
      stubs.releasesGenerateReleaseNotesStub.throws({
        message: 'Unexpected Error',
      })

    await openPr(DEFAULT_ACTION_DATA)

    sinon.assert.calledWithExactly(
      stubs.callApiStub,
      {
        method: 'POST',
        endpoint: 'release',
        body: {
          version: `v${TEST_VERSION}`,
          target: TEST_COMMIT_HASH,
          generateReleaseNotes: true,
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
  }
)

tap.test(
  'should retrieve the specified base-tag release and POST a release with the generated release notes',
  async () => {
    const { openPr, stubs } = setup()

    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs['base-tag'] = TEST_BASE_TAG_VERSION

    await openPr(data)

    sinon.assert.calledWithExactly(
      stubs.callApiStub,
      {
        method: 'POST',
        endpoint: 'release',
        body: {
          version: `v${TEST_VERSION}`,
          target: TEST_COMMIT_HASH,
          generateReleaseNotes: false,
          releaseNotes: TEST_RELEASE_NOTES,
        },
      },
      data.inputs
    )
  }
)
