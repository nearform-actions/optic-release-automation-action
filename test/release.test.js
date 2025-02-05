'use strict'

const { afterEach, describe, it, mock } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')
const { mockModule } = require('./mockModule.js')

const tagVersionAction = require('../src/utils/tagVersion')
const publishToNpmAction = require('../src/utils/publishToNpm')
const notifyIssuesAction = require('../src/utils/notifyIssues')
const revertCommitAction = require('../src/utils/revertCommit')
const callApiAction = require('../src/utils/callApi')
const actionLog = require('../src/log')
const { PR_TITLE_PREFIX, APP_NAME } = require('../src/const')

let deleteReleaseStub = sinon.stub().resolves()
let pullsGetStub = sinon.stub()
let createCommentStub = sinon.stub()
let getReleaseStub = sinon.stub().returns({ data: { draft: true } })

const DEFAULT_ACTION_DATA = {
  github: {
    rest: {
      repos: {
        deleteRelease: deleteReleaseStub,
        getRelease: getReleaseStub,
      },
      issues: { createComment: createCommentStub },
      pulls: { get: pullsGetStub },
    },
  },
  inputs: {
    semver: 'patch',
    'app-name': APP_NAME,
  },
  context: {
    eventName: 'pull_request',
    repo: {
      repo: 'repo',
      owner: 'test',
    },
    payload: {
      ref: 'ref',
      action: 'closed',
      pull_request: {
        base: {
          ref: 'base-ref',
        },
        merged: true,
        user: { login: 'optic-release-automation[bot]' },
        title: PR_TITLE_PREFIX,
        body:
          '<!--\n' +
          '<release-meta>{"id":54503465,"version":"v5.1.3","npmTag":"latest","opticUrl":"https://optic-test.run.app/api/generate/"}</release-meta>\n' +
          '-->',
      },
    },
  },
  packageVersion: '1.1.1',
  packageName: 'testPackageName',
}

function setup({ npmVersion, env, isPublished = true, isScoped = true } = {}) {
  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      sinon.stub(process, 'env').value({ [key]: value })
    })
  }

  const logStub = sinon.stub(actionLog)
  const coreStub = sinon.stub(core)

  deleteReleaseStub.resetHistory()
  deleteReleaseStub.resolves()

  const execWithOutputStub = sinon.stub()
  execWithOutputStub
    .withArgs('curl', [
      '-s',
      'https://optic-test.run.app/api/generate/optic-token',
    ])
    .returns('otp123')

  const tagVersionStub = sinon.stub(tagVersionAction, 'tagVersionInGit')
  const revertCommitStub = sinon.stub(revertCommitAction, 'revertCommit')
  const publishToNpmStub = sinon.stub(publishToNpmAction, 'publishToNpm')
  const notifyIssuesStub = sinon.stub(notifyIssuesAction, 'notifyIssues')

  const packageName = isScoped ? '@some/package-name' : 'some-package-name'
  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: { body: 'test_body', html_url: 'test_url' } })

  const provenanceMock = {
    namedExports: {
      getNpmVersion: () => npmVersion,
      getProvenanceOptions: async npmVersion => {
        // Handle the error cases first
        if (npmVersion === '9.4.0') {
          throw new Error(
            'Provenance requires NPM >=9.5.0, but this action is using v9.4.0'
          )
        }
        if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
          throw new Error(
            'Provenance generation in GitHub Actions requires "write" access to the "id-token" permission'
          )
        }
        // Return provenance options if no errors
        return {
          provenance: true,
          provenanceToken: 'otp123',
        }
      },
    },
  }
  const release = mockModule('../src/release.js', {
    '../src/utils/execWithOutput.js': {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    },
    '../src/utils/tagVersion.js': {
      namedExports: {
        tagVersionInGit: tagVersionStub,
      },
    },
    '../src/utils/revertCommit.js': {
      namedExports: {
        revertCommit: revertCommitStub,
      },
    },
    '../src/utils/publishToNpm.js': {
      namedExports: {
        publishToNpm: publishToNpmStub,
      },
    },
    '../src/utils/notifyIssues.js': {
      namedExports: {
        notifyIssues: notifyIssuesStub,
      },
    },
    '../src/utils/provenance.js': provenanceMock,
    '../src/utils/packageInfo.js': {
      namedExports: {
        getLocalInfo: () => ({ name: packageName }),
        getPublishedInfo: async () =>
          isPublished ? { name: packageName } : null,
      },
    },
    '@actions/core': {
      namedExports: coreStub,
    },
  })

  return {
    release,
    stubs: {
      tagVersionStub,
      revertCommitStub,
      publishToNpmStub,
      notifyIssuesStub,
      execWithOutputStub,
      callApiStub,
      logStub,
      coreStub,
    },
  }
}
describe('release tests', async () => {
  afterEach(() => {
    sinon.restore()
    mock.restoreAll()
  })

  it('Should delete the release if the pr is not merged', async () => {
    const { release } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    await release(data)

    sinon.assert.calledOnceWithExactly(deleteReleaseStub, {
      owner: DEFAULT_ACTION_DATA.context.repo.owner,
      repo: DEFAULT_ACTION_DATA.context.repo.repo,
      release_id: 54503465,
    })
  })

  it('Should delete the release even if deleting the branch failed and should not fail', async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    stubs.execWithOutputStub.rejects(
      new Error('Something went wrong in the branch')
    )

    await release(data)

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    sinon.assert.calledOnceWithExactly(deleteReleaseStub, {
      owner: DEFAULT_ACTION_DATA.context.repo.owner,
      repo: DEFAULT_ACTION_DATA.context.repo.repo,
      release_id: 54503465,
    })
  })

  it('Should log an error if deleting the release fails', async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    deleteReleaseStub.rejects(new Error('Something went wrong in the release'))

    await release(data)

    sinon.assert.calledOnceWithExactly(
      stubs.coreStub.setFailed,
      `Something went wrong while deleting the release. \n Errors: Something went wrong in the release`
    )
  })

  it('Should log and exit if both the release and the branch fail', async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    stubs.execWithOutputStub.rejects(
      new Error('Something went wrong in the branch')
    )
    deleteReleaseStub.rejects(new Error('Something went wrong in the release'))

    await release(data)

    sinon.assert.calledOnceWithExactly(
      stubs.coreStub.setFailed,
      `Something went wrong while deleting the release. \n Errors: Something went wrong in the release`
    )
    sinon.assert.notCalled(stubs.publishToNpmStub)
  })

  it('Should publish to npm without optic', async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
      },
    })

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
    })
  })

  it('Should publish with provenance if flag set and conditions met', async () => {
    const { release, stubs } = setup({
      npmVersion: '9.5.0',
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' },
    })

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: 'true',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    assert.ok(true, 'not failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      provenance: true,
    })
    assert.ok(true, 'publish called')
  })

  it('Aborts publish with provenance if NPM version too old', async () => {
    const { release, stubs } = setup({
      npmVersion: '9.4.0',
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' },
    })

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: 'true',
      },
    })

    console.log('sionon calls', stubs.coreStub.setFailed.args)
    sinon.assert.calledWithMatch(
      stubs.coreStub.setFailed,
      'Provenance requires NPM >=9.5.0, but this action is using v9.4.0'
    )
  })

  it('Aborts publish with provenance if missing permission', async () => {
    const { release, stubs } = setup({
      npmVersion: '9.5.0',
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: undefined }, // Explicitly unset
    })

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: 'true',
      },
    })

    sinon.assert.calledWithMatch(
      stubs.coreStub.setFailed,
      'Provenance generation in GitHub Actions requires "write" access to the "id-token" permission'
    )
  })

  it('Should publish with --access public if flag set', async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        access: 'public',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    assert.ok(true, 'did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      access: 'public',
    })
    assert.ok(true, 'called publishToNpm')
  })

  it('Should publish with --access restricted if flag set', async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        access: 'restricted',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    assert.ok(true, 'did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      access: 'restricted',
    })
    assert.ok(true, 'called publishToNpm')
  })

  it('Should disallow unsupported --access flag', async () => {
    const { release, stubs } = setup()

    const invalidString =
      'public; node -e "throw new Error(`arbitrary command executed`)"'

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        access: invalidString,
      },
    })

    sinon.assert.calledWithMatch(
      stubs.coreStub.setFailed,
      `Invalid "access" option provided ("${invalidString}"), should be one of "public", "restricted"`
    )
  })

  it('Should publish with --access public and provenance if unscoped and unpublished', async () => {
    const { release, stubs } = setup({
      isScoped: false,
      isPublished: false,
      npmVersion: '9.5.0',
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' },
    })

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: true,
        access: 'public',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    assert.ok(true, 'did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      access: 'public',
      provenance: true,
    })
    assert.ok(true, 'called publishToNpm')
  })

  it('Should not override access restricted with provenance while unscoped and unpublished', async () => {
    const { release, stubs } = setup({
      isScoped: false,
      isPublished: false,
      npmVersion: '9.5.0',
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' },
    })

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: true,
        access: 'restricted',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    assert.ok(true, 'did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      access: 'restricted',
      provenance: true,
    })
    assert.ok(true, 'called publishToNpm')
  })

  it('Should not publish to npm if there is no npm token', async () => {
    const { release, stubs } = setup()
    stubs.callApiStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.notCalled(stubs.publishToNpmStub)
  })

  it('Should publish with provenance and not add access when scoped and unpublished', async () => {
    const { release, stubs } = setup({
      isScoped: true,
      isPublished: false,
      npmVersion: '9.5.0', // valid
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' }, // valid
    })
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: true,
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    assert.ok(true, 'did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      provenance: true,
    })
    assert.ok(true, 'called publishToNpm')
  })

  it('Should publish with provenance and not add access when unscoped and published', async () => {
    const { release, stubs } = setup({
      isScoped: false,
      isPublished: true,
      npmVersion: '9.5.0', // valid
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' }, // valid
    })
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: true,
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    assert.ok(true, 'did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      provenance: true,
    })
    assert.ok(true, 'called publishToNpm')
  })

  it('Should publish to npm with optic', async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
      },
    })

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
    })
  })

  it('Should tag versions', async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5')
    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.1')
    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.1.3')
  })

  it('Should call the release method', async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.calledWithExactly(
      stubs.callApiStub,
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {
          version: 'v5.1.3',
          releaseId: 54503465,
          isPreRelease: false,
        },
      },
      {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      }
    )
  })

  it('Should call the release method with the prerelease flag if the release is a prerelease', async () => {
    const { release, stubs } = setup()

    const version = 'v5.1.3-next.1'
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.body =
      '<!--\n' +
      `<release-meta>{"id":54503465,"version":"${version}","npmTag":"latest","opticUrl":"https://optic-test.run.app/api/generate/"}</release-meta>\n` +
      '-->'

    await release({
      ...data,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.notCalled(stubs.tagVersionStub)

    sinon.assert.calledWithExactly(
      stubs.callApiStub,
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {
          version,
          releaseId: 54503465,
          isPreRelease: true,
        },
      },
      {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      }
    )
  })

  it("Should NOT call the release method if the pr wasn't merged", async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    data.inputs = {
      ...data.inputs,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    await release(data)

    sinon.assert.notCalled(stubs.callApiStub)
  })

  it("Should NOT use npm if the pr wasn't merged", async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    data.inputs = {
      ...data.inputs,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    await release(data)

    sinon.assert.notCalled(stubs.publishToNpmStub)
  })

  it("Should NOT tag version in git if the pr wasn't merged", async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    data.inputs = {
      ...data.inputs,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    await release(data)

    sinon.assert.notCalled(stubs.tagVersionStub)
  })

  it('Should not do anything if the user is not optic-release-automation[bot]', async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.user.login = 'not_the_correct_one'
    await release(data)

    sinon.assert.notCalled(stubs.callApiStub)
    sinon.assert.notCalled(stubs.execWithOutputStub)
  })

  it('Should fail if the release metadata is incorrect', async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.body = 'this data is not correct'
    await release(data)

    sinon.assert.calledOnce(stubs.logStub.logError)
    sinon.assert.notCalled(stubs.callApiStub)
    sinon.assert.notCalled(stubs.execWithOutputStub)
  })

  it('Should call core.setFailed if the tagging the version in git fails', async () => {
    const { release, stubs } = setup()
    stubs.tagVersionStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.calledOnce(stubs.coreStub.setFailed)
  })

  it('Should call core.setFailed if the release fails', async () => {
    const { release, stubs } = setup()
    stubs.callApiStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
        'revert-commit-after-failure': 'true',
      },
    })

    sinon.assert.calledWithExactly(stubs.revertCommitStub, 'base-ref')
    sinon.assert.calledOnce(stubs.coreStub.setFailed)
  })

  it('Should call core.setFailed but not revert the commit when publish to npm fails', async () => {
    const { release, stubs } = setup()
    stubs.publishToNpmStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.notCalled(stubs.revertCommitStub)
    sinon.assert.calledOnce(stubs.coreStub.setFailed)
  })

  it('Should call core.setFailed and revert the commit when publish to npm fails', async () => {
    const { release, stubs } = setup()
    stubs.publishToNpmStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
        'revert-commit-after-failure': 'true',
      },
    })

    sinon.assert.calledWithExactly(stubs.revertCommitStub, 'base-ref')
    sinon.assert.calledOnce(stubs.coreStub.setFailed)
  })

  it('Should tag the major, minor & patch correctly for 0', async () => {
    const { release, stubs } = setup()
    stubs.callApiStub.throws()

    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs = {
      ...data.inputs,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    data.context.payload.pull_request.body =
      '<!--\n' +
      '<release-meta>{"id":54503465,"version":"v0.0.1","npmTag":"latest","opticUrl":"https://optic-zf3votdk5a-ew.a.run.app/api/generate/"}</release-meta>\n' +
      '-->'

    await release(data)

    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v0')
    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v0.0')
    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v0.0.1')
  })

  it('Should tag the major, minor & patch correctly', async () => {
    const { release, stubs } = setup()
    stubs.callApiStub.throws()

    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs = {
      ...data.inputs,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    data.context.payload.pull_request.body =
      '<!--\n' +
      '<release-meta>{"id":54503465,"version":"v5.0.0","npmTag":"latest","opticUrl":"https://optic-zf3votdk5a-ew.a.run.app/api/generate/"}</release-meta>\n' +
      '-->'

    await release(data)

    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5')
    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.0')
    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.0.0')
  })

  it('Should delete the release branch ALWAYS when the PR is closed', async () => {
    const { release, stubs } = setup()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    assert.deepStrictEqual(stubs.execWithOutputStub.getCall(0).args, [
      'git',
      ['push', 'origin', '--delete', 'release/v5.1.3'],
    ])
  })

  it('Should NOT delete the release branch if the PR is not closed', async () => {
    const { release, stubs } = setup()

    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs = {
      ...data.inputs,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    data.context.payload.action = 'something_else' // Not closed

    await release(data)

    sinon.assert.neverCalledWith(stubs.execWithOutputStub, 'git', [
      'push',
      'origin',
      '--delete',
      'release/v5.1.3',
    ])
  })

  it('Should not call notifyIssues function when feature is disabled', async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'notify-linked-issues': 'false',
      },
    })

    sinon.assert.notCalled(stubs.notifyIssuesStub)
  })

  it('Should call notifyIssues function correctly when feature is enabled', async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'notify-linked-issues': 'true',
      },
    })

    sinon.assert.calledWith(
      stubs.notifyIssuesStub,
      DEFAULT_ACTION_DATA.github,
      true,
      'test',
      'repo',
      { body: 'test_body', html_url: 'test_url' }
    )
  })

  it('Should not reject when notifyIssues fails', async () => {
    const { release, stubs } = setup()
    stubs.notifyIssuesStub.rejects()

    await assert.doesNotReject(
      release({
        ...DEFAULT_ACTION_DATA,
        inputs: {
          'app-name': APP_NAME,
          'npm-token': 'a-token',
          'notify-linked-issues': 'true',
        },
      })
    )
  })

  it('Should fail when getting draft release fails', async () => {
    const { release, stubs } = setup()

    await release({
      ...DEFAULT_ACTION_DATA,
      github: {
        ...DEFAULT_ACTION_DATA.github,
        rest: {
          ...DEFAULT_ACTION_DATA.github.rest,
          repos: {
            ...DEFAULT_ACTION_DATA.github.rest,
            getRelease: sinon.stub().rejects(),
          },
        },
      },
    })

    sinon.assert.called(stubs.coreStub.setFailed)
  })

  it('Should fail when release is not found', async () => {
    const { release, stubs } = setup()

    await release({
      ...DEFAULT_ACTION_DATA,
      github: {
        ...DEFAULT_ACTION_DATA.github,
        rest: {
          ...DEFAULT_ACTION_DATA.github.rest,
          repos: {
            ...DEFAULT_ACTION_DATA.github.rest,
            getRelease: sinon.stub().returns({ data: undefined }),
          },
        },
      },
    })

    sinon.assert.calledWith(
      stubs.coreStub.setFailed,
      `Couldn't find draft release to publish. Aborting.`
    )
  })

  it('Should not fail when release is not a draft', async () => {
    const { release, stubs } = setup()

    await release({
      ...DEFAULT_ACTION_DATA,
      github: {
        ...DEFAULT_ACTION_DATA.github,
        rest: {
          ...DEFAULT_ACTION_DATA.github.rest,
          repos: {
            ...DEFAULT_ACTION_DATA.github.rest,
            getRelease: sinon.stub().returns({ data: { draft: false } }),
          },
        },
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
  })

  it('Should merge extraOptions from getProvenanceOptions when available', async () => {
    const { release, stubs } = setup({
      npmVersion: '9.5.0',
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' },
    })

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: 'true',
      },
    })

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticToken: undefined,
      ngrokToken: undefined,
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      version: 'v5.1.3',
      provenance: true,
      access: undefined,
      provenanceToken: 'otp123',
    })
  })
})
