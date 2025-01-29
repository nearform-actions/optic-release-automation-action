'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')

const callApiAction = require('../src/utils/callApi')
const artifactAction = require('../src/utils/artifact')
const releasesAction = require('../src/utils/releases')
const execWithOutput = require('../src/utils/execWithOutput')
const { PR_TITLE_PREFIX } = require('../src/const')

const TEST_RELEASE_NOTES = 'Release Notes'
const TEST_BASE_TAG_VERSION = 'v1.0.0'
const TEST_LATEST_VERSION = '3.1.0'
const TEST_VERSION = '3.1.1'
const TEST_COMMIT_HASH = 'c86b0a35014a7036b245f81ff9de9bd738a5fe95'

const setup = ({ t }) => {
  const attachArtifactStub = sinon.stub(artifactAction, 'attach').resolves({
    artifact: {
      isPresent: true,
      url: 'https://example.com',
      label: 'label',
    },
  })

  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: { id: 'foo' } })

  const coreStub = sinon.stub(core)

  const execWithOutputStub = sinon
    .stub(execWithOutput, 'execWithOutput')
    .resolves(TEST_VERSION)

  execWithOutputStub
    .withArgs('git', ['rev-parse', 'HEAD'])
    .resolves(TEST_COMMIT_HASH)
  execWithOutputStub
    .withArgs('git', ['ls-remote', '--heads', 'origin', 'release/v3.1.1'])
    .resolves('')
  execWithOutputStub
    .withArgs('git', ['ls-remote', '--heads', 'origin', 'release/3.1.1'])
    .resolves('')
  execWithOutputStub
    .withArgs('git', ['ls-remote', '--heads', 'origin', 'release/v2.0.0'])
    .resolves('')
  execWithOutputStub
    .withArgs('git', ['ls-remote', '--heads', 'origin', 'release/v0.0.5'])
    .resolves('')

  const releasesFetchLatestReleaseStub = sinon
    .stub(releasesAction, 'fetchLatestRelease')
    .returns({
      tag_name: TEST_LATEST_VERSION,
    })

  const releasesFetchReleaseByTagStub = sinon
    .stub(releasesAction, 'fetchReleaseByTag')
    .returns({
      tag_name: TEST_BASE_TAG_VERSION,
    })

  const releasesGenerateReleaseNotesStub = sinon
    .stub(releasesAction, 'generateReleaseNotes')
    .returns({
      body: TEST_RELEASE_NOTES,
    })

  const execWithOutputMock = t.mock.module('../src/utils/execWithOutput.js', {
    namedExports: {
      execWithOutput: execWithOutputStub,
    },
  })

  const artifactMock = t.mock.module('../src/utils/artifact.js', {
    defaultExports: {
      attach: attachArtifactStub,
    },
  })

  const coreMock = t.mock.module('@actions/core', {
    namedExports: coreStub,
  })
  return {
    openPr: require('../src/openPr.js'),
    stubs: {
      execWithOutputStub,
      callApiStub,
      coreStub,
      attachArtifactStub,
      releasesFetchReleaseByTagStub,
      releasesFetchLatestReleaseStub,
      releasesGenerateReleaseNotesStub,
    },
    mocks: {
      // openPrMock,
      execWithOutputMock,
      artifactMock,
      coreMock,
    },
  }
}

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

test('openPr tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/openPr')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test(
    'should trigger an error when the packageVersion is missing',
    async t => {
      const { openPr, mocks } = setup({ t })

      await assert.rejects(
        openPr({
          ...DEFAULT_ACTION_DATA,
          packageVersion: undefined,
        }),
        /packageVersion is missing/
      )
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'should trigger an error if the branch already exists',
    async t => {
      const { openPr, stubs, mocks } = setup({ t })

      const actionData = {
        ...DEFAULT_ACTION_DATA,
        packageVersion: '1.2.3',
      }

      stubs.execWithOutputStub
        .withArgs('git', ['ls-remote', '--heads', 'origin', 'release/v1.2.3'])
        .resolves('somehashhere          refs/heads/release/v1.2.3')

      await assert.rejects(
        openPr(actionData),
        /Release branch release\/v1.2.3 already exists on the remote.  Please either delete it and run again, or select a different version/
      )
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test('should create a new git branch', async t => {
    const { openPr, stubs, mocks } = setup({ t })
    await openPr(DEFAULT_ACTION_DATA)

    const branchName = `release/v${TEST_VERSION}`

    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'checkout',
      '-b',
      branchName,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'add',
      '-A',
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'commit',
      '-m',
      `Release v${TEST_VERSION}`,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'push',
      'origin',
      branchName,
    ])
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test('should handle custom commit messages', async t => {
    const { openPr, stubs, mocks } = setup({ t })
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
      `[v${TEST_VERSION}] The brand new v${TEST_VERSION} has been released`,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'push',
      'origin',
      branchName,
    ])
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    'should trigger an error when the packageVersion is missing',
    async t => {
      const { openPr, mocks } = setup({ t })

      await assert.rejects(
        openPr({
          ...DEFAULT_ACTION_DATA,
          packageVersion: undefined,
        }),
        /packageVersion is missing/
      )
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'should trigger an error if the branch already exists',
    async t => {
      const { openPr, stubs, mocks } = setup({ t })

      const actionData = {
        ...DEFAULT_ACTION_DATA,
        packageVersion: '1.2.3',
      }

      stubs.execWithOutputStub
        .withArgs('git', ['ls-remote', '--heads', 'origin', 'release/v1.2.3'])
        .resolves('somehashhere          refs/heads/release/v1.2.3')

      await assert.rejects(
        openPr(actionData),
        /Release branch release\/v1.2.3 already exists on the remote.  Please either delete it and run again, or select a different version/
      )
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test('should create a new git branch', async t => {
    const { openPr, stubs, mocks } = setup({ t })
    await openPr(DEFAULT_ACTION_DATA)

    const branchName = `release/v${TEST_VERSION}`

    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'checkout',
      '-b',
      branchName,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'add',
      '-A',
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'commit',
      '-m',
      `Release v${TEST_VERSION}`,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'push',
      'origin',
      branchName,
    ])
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test('should handle custom commit messages', async t => {
    const { openPr, stubs, mocks } = setup({ t })
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
      `[v${TEST_VERSION}] The brand new v${TEST_VERSION} has been released`,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'push',
      'origin',
      branchName,
    ])
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test('should work with a custom version-prefix', async t => {
    const { openPr, stubs, mocks } = setup({ t })

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
      'ls-remote',
      '--heads',
      'origin',
      branchName,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'checkout',
      '-b',
      branchName,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'add',
      '-A',
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'commit',
      '-m',
      `Release ${TEST_VERSION}`,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'push',
      'origin',
      branchName,
    ])

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

    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    'should call the release endpoint with a new version',
    async t => {
      const { openPr, stubs, mocks } = setup({ t })
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
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'should trigger an error if the release endpoint responds with an invalid draft release',
    async t => {
      const { openPr, stubs, mocks } = setup({ t })

      stubs.callApiStub.resolves({})

      await assert.rejects(
        openPr(DEFAULT_ACTION_DATA),
        /Unable to create draft release: API responded with a 200 status but no draft release returned. {2}Please clean up any artifacts \(draft release, release branch, etc.\) and try again/
      )
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test('should call the PR endpoint with a new version', async t => {
    const { openPr, stubs, mocks } = setup({ t })
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
            'This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform-actions/optic-release-automation-action).\n' +
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
            `<release-meta>{"id":"foo","version":"v${TEST_VERSION}"}</release-meta>\n` +
            '-->\n',
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
    Object.values(mocks).forEach(mock => mock.restore())
  })
})
