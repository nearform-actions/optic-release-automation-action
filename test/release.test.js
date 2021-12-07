'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')

const runSpawnAction = require('../utils/runSpawn')
const tagVersionAction = require('../utils/tagVersion')
const callApiAction = require('../utils/callApi')

const { PR_TITLE_PREFIX } = require('../const')
const actionLog = require('../log')

const deleteReleaseStub = sinon.stub().resolves()

const DEFAULT_ACTION_DATA = {
  github: {
    rest: {
      repos: {
        deleteRelease: deleteReleaseStub,
      },
    },
  },
  inputs: {
    semver: 'patch',
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
        merged: true,
        user: { login: 'optic-release-automation[bot]' },
        title: PR_TITLE_PREFIX,
        body:
          '<!--\n' +
          '<release-meta>{"id":54503465,"version":"v5.1.3","npmTag":"latest","opticUrl":"https://optic-zf3votdk5a-ew.a.run.app/api/generate/"}</release-meta>\n' +
          '-->',
      },
    },
  },
}

function setup() {
  const logStub = sinon.stub(actionLog)
  const coreStub = sinon.stub(core)

  const runSpawnStub = sinon.stub().returns('otp123')
  const runSpawnProxy = sinon
    .stub(runSpawnAction, 'runSpawn')
    .returns(runSpawnStub)

  const tagVersionStub = sinon.stub(tagVersionAction, 'tagVersionInGit')

  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: {} })

  process.env.GITHUB_ACTION_PATH = './'

  const release = proxyquire('../release', {
    './utils/runSpawn': runSpawnProxy,
    './utils/tagVersion': tagVersionStub,
    '@actions/core': coreStub,
  })

  return {
    release,
    stubs: {
      tagVersionStub,
      runSpawnProxy,
      runSpawnStub,
      callApiStub,
      logStub,
      coreStub,
    },
  }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Should delete the release if the pr is not merged', async t => {
  const { release } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  await release(data)

  t.ok(
    deleteReleaseStub.calledOnceWith({
      owner: DEFAULT_ACTION_DATA.context.repo.owner,
      repo: DEFAULT_ACTION_DATA.context.repo.repo,
      release_id: 54503465,
    })
  )
})

tap.test('Should publish to npm without optic', async t => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'npm-token': 'a-token',
    },
    npmToken: 'a-token',
  })

  t.ok(stubs.runSpawnStub.calledWith('npm', ['publish', '--tag', 'latest']))
})

tap.test('Should not publish to npm if there is no npm token', async t => {
  const { release, stubs } = setup()
  stubs.callApiStub.throws()

  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  t.ok(
    stubs.runSpawnStub.neverCalledWith('npm', ['publish', '--tag', 'latest'])
  )
  t.ok(
    stubs.runSpawnStub.neverCalledWith('npm', [
      'publish',
      '--otp',
      'otp123',
      '--tag',
      'latest',
    ])
  )
})

tap.test('Should publish to npm with optic', async t => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
    },
    npmToken: 'a-token',
    opticToken: 'optic-token',
  })

  t.ok(
    stubs.runSpawnStub.calledWith('npm', [
      'publish',
      '--otp',
      'otp123',
      '--tag',
      'latest',
    ])
  )
})

tap.test('Should tag versions', async t => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  t.ok(stubs.tagVersionStub.calledWith('v5'))
  t.ok(stubs.tagVersionStub.calledWith('v5.1'))
})

tap.test('Should call the release method', async t => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  t.ok(
    stubs.callApiStub.calledWith(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {
          version: 'v5.1.3',
          releaseId: 54503465,
        },
      },
      {
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      }
    )
  )
})

tap.test(
  'Should not do anything if the user is not optic-release-automation[bot]',
  async t => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.user.login = 'not_the_correct_one'
    await release(data)

    t.ok(stubs.callApiStub.notCalled)
    t.ok(stubs.runSpawnStub.notCalled)
  }
)

tap.test('Should fail if the release metadata is incorrect', async t => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.body = 'this data is not correct'
  await release(data)

  t.ok(stubs.logStub.logError.calledOnce)
  t.ok(stubs.callApiStub.notCalled)
  t.ok(stubs.runSpawnStub.notCalled)
})

tap.test(
  'Should call core.setFailed if the tagging the version in git fails',
  async t => {
    const { release, stubs } = setup()
    stubs.tagVersionStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
      npmToken: 'a-token',
      opticToken: 'optic-token',
    })

    t.ok(stubs.coreStub.setFailed.calledOnce)
  }
)

tap.test('Should call core.setFailed if the release fails', async t => {
  const { release, stubs } = setup()
  stubs.callApiStub.throws()

  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  t.ok(stubs.coreStub.setFailed.calledOnce)
})

tap.test(
  'Should not tag the minor version in git if there is no minor',
  async t => {
    const { release, stubs } = setup()
    stubs.callApiStub.throws()

    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs = {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    data.context.payload.pull_request.body =
      '<!--\n' +
      '<release-meta>{"id":54503465,"version":"v5.0.1","npmTag":"latest","opticUrl":"https://optic-zf3votdk5a-ew.a.run.app/api/generate/"}</release-meta>\n' +
      '-->'

    await release(data)

    t.ok(stubs.tagVersionStub.calledOnceWith('v5'))
  }
)

tap.test(
  'Should not tag the major version in git if there is no major',
  async t => {
    const { release, stubs } = setup()
    stubs.callApiStub.throws()

    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs = {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    data.context.payload.pull_request.body =
      '<!--\n' +
      '<release-meta>{"id":54503465,"version":"v0.0.1","npmTag":"latest","opticUrl":"https://optic-zf3votdk5a-ew.a.run.app/api/generate/"}</release-meta>\n' +
      '-->'

    await release(data)

    t.ok(stubs.tagVersionStub.notCalled)
  }
)
