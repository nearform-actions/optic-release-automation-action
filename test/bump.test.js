'use strict'

const { afterEach, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')
const { mockModule } = require('./mockModule.js')

const callApiAction = require('../src/utils/callApi.js')
const artifactAction = require('../src/utils/artifact.js')
const releasesAction = require('../src/utils/releases.js')
const execWithOutput = require('../src/utils/execWithOutput.js')
const { PR_TITLE_PREFIX } = require('../src/const.js')

const TEST_RELEASE_NOTES = 'Release Notes'
const TEST_BASE_TAG_VERSION = 'v1.0.0'
const TEST_LATEST_VERSION = '3.1.0'
const TEST_VERSION = '3.1.1'
const TEST_COMMIT_HASH = 'c86b0a35014a7036b245f81ff9de9bd738a5fe95'

function setup() {
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

  const openPr = mockModule('../src/openPr.js', {
    '../src/utils/execWithOutput.js': {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    },
    '../src/utils/artifact.js': {
      namedExports: {
        attach: attachArtifactStub,
      },
    },
    '@actions/core': {
      namedExports: coreStub,
    },
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

describe('openPr tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('should trigger an error when the packageVersion is missing', async () => {
    const { openPr } = setup()

    await assert.rejects(
      openPr({
        ...DEFAULT_ACTION_DATA,
        packageVersion: undefined,
      }),
      /packageVersion is missing/
    )
  })

  it('should trigger an error if the branch already exists', async () => {
    const { openPr, stubs } = setup()

    const actionData = {
      ...DEFAULT_ACTION_DATA,
      packageVersion: '1.2.3',
    }

    stubs.execWithOutputStub
      .withArgs('git', ['ls-remote', '--heads', 'origin', 'release/v1.2.3'])
      .resolves('somehashhere          refs/heads/release/v1.2.3')

    await assert.rejects(
      openPr(actionData),
      /Release branch release\/v1.2.3 already exists on the remote. {2}Please either delete it and run again, or select a different version/
    )
  })

  it('should create a new git branch', async () => {
    const { openPr, stubs } = setup()
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
  })

  it('should handle custom commit messages', async () => {
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
      `[v${TEST_VERSION}] The brand new v${TEST_VERSION} has been released`,
    ])
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'git', [
      'push',
      'origin',
      branchName,
    ])
  })

  it('should work with a custom version-prefix', async () => {
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
  })

  it('should call the release endpoint with a new version', async () => {
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

  it('should trigger an error if the release endpoint responds with an invalid draft release', async () => {
    const { openPr, stubs } = setup()

    stubs.callApiStub.resolves({})

    await assert.rejects(
      openPr(DEFAULT_ACTION_DATA),
      /Unable to create draft release: API responded with a 200 status but no draft release returned. {2}Please clean up any artifacts \(draft release, release branch, etc.\) and try again/
    )
  })

  it('should call the PR endpoint with a new version', async () => {
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
  })

  it('should create the correct release for a version with no minor', async () => {
    const localVersion = '2.0.0'
    const { openPr, stubs } = setup()
    stubs.execWithOutputStub.returns(localVersion)

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
            'This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform-actions/optic-release-automation-action).\n' +
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
            `<release-meta>{"id":"foo","version":"v${localVersion}"}</release-meta>\n` +
            '-->\n',
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
  })

  it('should create the correct release for a version with no major', async () => {
    const localVersion = '0.0.5'
    const { openPr, stubs } = setup()

    stubs.execWithOutputStub.returns(localVersion)

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
            'This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform-actions/optic-release-automation-action).\n' +
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
            `<release-meta>{"id":"foo","version":"v${localVersion}"}</release-meta>\n` +
            '-->\n',
        },
      },
      DEFAULT_ACTION_DATA.inputs
    )
  })

  it('should delete branch in case of pr failure', async () => {
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
    assert.ok(true, 'branch deleted')
  })

  it('Should call core.setFailed if it fails to create a PR', async () => {
    const branchName = `release/v${TEST_VERSION}`

    const { openPr, stubs } = setup()
    const { context, inputs, packageVersion } = DEFAULT_ACTION_DATA
    stubs.callApiStub.onCall(1).rejects()

    stubs.execWithOutputStub
      .withArgs('git', ['push', 'origin', '--delete', branchName])
      .rejects()

    await openPr({ context, inputs, packageVersion })

    sinon.assert.calledOnce(stubs.coreStub.setFailed)
    assert.ok(true, 'failed called')
  })

  it('should call attachArtifact if artifact-path input is present', async () => {
    const { openPr, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs['artifact-path'] = 'dist'
    await openPr(data)

    sinon.assert.calledOnce(stubs.attachArtifactStub)
  })

  it('should not open Pr if create release draft fails', async () => {
    const { openPr, stubs } = setup()
    stubs.callApiStub.throws({ message: 'error message' })

    await assert.rejects(openPr(DEFAULT_ACTION_DATA), {
      message: 'Unable to create draft release: error message',
    })
  })

  it('should generate release notes if the latest release has not been found -> first release', async () => {
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
  })

  it('should automatically generate release notes if an error occurred while generating the specific release notes', async () => {
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
  })

  it('should retrieve the specified base-tag release and POST a release with the generated release notes', async () => {
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
  })
})
