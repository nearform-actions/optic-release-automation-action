'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')

const runSpawnAction = require('../src/utils/runSpawn')
const tagVersionAction = require('../src/utils/tagVersion')
const callApiAction = require('../src/utils/callApi')

const { PR_TITLE_PREFIX } = require('../src/const')
const actionLog = require('../src/log')

let deleteReleaseStub = sinon.stub().resolves()

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
          '<release-meta>{"id":54503465,"version":"v5.1.3","npmTag":"latest","opticUrl":"https://optic-test.run.app/api/generate/"}</release-meta>\n' +
          '-->',
      },
    },
  },
}

function setup() {
  const logStub = sinon.stub(actionLog)
  const coreStub = sinon.stub(core)
  deleteReleaseStub.resetHistory()
  deleteReleaseStub.resolves()
  const runSpawnStub = sinon.stub().returns('otp123')
  const runSpawnProxy = sinon
    .stub(runSpawnAction, 'runSpawn')
    .returns(runSpawnStub)

  const tagVersionStub = sinon.stub(tagVersionAction, 'tagVersionInGit')

  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: {} })

  const release = proxyquire('../src/release', {
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

tap.test('Should delete the release if the pr is not merged', async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  await release(data)

  sinon.assert.calledOnceWithExactly(stubs.runSpawnStub, 'git', [
    'push',
    'origin',
    '--delete',
    `release/v5.1.3`,
  ])

  sinon.assert.calledOnceWithExactly(deleteReleaseStub, {
    owner: DEFAULT_ACTION_DATA.context.repo.owner,
    repo: DEFAULT_ACTION_DATA.context.repo.repo,
    release_id: 54503465,
  })
})

tap.test(
  'Should delete the release even if deleting the branch failed',
  async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    stubs.runSpawnStub.rejects(new Error('Something went wrong in the branch'))

    await release(data)

    sinon.assert.calledOnceWithExactly(
      stubs.coreStub.setFailed,
      `Something went wrong while deleting the branch or release. \n Errors: Something went wrong in the branch`
    )
    sinon.assert.calledOnceWithExactly(deleteReleaseStub, {
      owner: DEFAULT_ACTION_DATA.context.repo.owner,
      repo: DEFAULT_ACTION_DATA.context.repo.repo,
      release_id: 54503465,
    })
  }
)

tap.test('Should log an error if deleting the release fails', async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  deleteReleaseStub.rejects(new Error('Something went wrong in the release'))

  await release(data)

  sinon.assert.calledOnceWithExactly(
    stubs.coreStub.setFailed,
    `Something went wrong while deleting the branch or release. \n Errors: Something went wrong in the release`
  )
})

tap.test(
  'Should log and exit if both the release and the branch fail',
  async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    stubs.runSpawnStub.rejects(new Error('Something went wrong in the branch'))
    deleteReleaseStub.rejects(new Error('Something went wrong in the release'))

    await release(data)

    sinon.assert.calledOnceWithExactly(
      stubs.coreStub.setFailed,
      `Something went wrong while deleting the branch or release. \n Errors: Something went wrong in the branch\nSomething went wrong in the release`
    )
    sinon.assert.neverCalledWith(stubs.runSpawnStub, 'npm', [
      'publish',
      '--tag',
      'latest',
    ])
  }
)

tap.test('Should publish to npm without optic', async () => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'npm-token': 'a-token',
    },
  })

  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'npm', [
    'pack',
    '--dry-run',
  ])
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'npm', [
    'publish',
    '--tag',
    'latest',
  ])
})

tap.test('Should not publish to npm if there is no npm token', async () => {
  const { release, stubs } = setup()
  stubs.callApiStub.throws()

  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  sinon.assert.neverCalledWith(stubs.runSpawnStub, 'npm', [
    'publish',
    '--tag',
    'latest',
  ])
  sinon.assert.neverCalledWith(stubs.runSpawnStub, 'npm', [
    'publish',
    '--otp',
    'otp123',
    '--tag',
    'latest',
  ])
})

tap.test('Should publish to npm with optic', async t => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
    },
  })

  sinon.assert.calledWithExactly(stubs.runSpawnStub.getCall(0), 'npm', [
    'config',
    'set',
    '//registry.npmjs.org/:_authToken=a-token',
  ])
  t.pass('npm config')

  sinon.assert.calledWithExactly(stubs.runSpawnStub.getCall(1), 'npm', [
    'pack',
    '--dry-run',
  ])
  t.pass('npm pack called')

  sinon.assert.calledWithExactly(stubs.runSpawnStub.getCall(2), 'curl', [
    '-s',
    'https://optic-test.run.app/api/generate/optic-token',
  ])
  t.pass('curl called')

  sinon.assert.calledWithExactly(stubs.runSpawnStub.getCall(3), 'npm', [
    'publish',
    '--otp',
    'otp123',
    '--tag',
    'latest',
  ])
  t.pass('npm publish called')
})

tap.test('Should tag versions', async () => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5')
  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.1')
})

tap.test('Should call the release method', async () => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
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
      },
    },
    {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
  )
})

tap.test(
  "Should NOT call the release method if the pr wasn't merged",
  async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    data.inputs = {
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    await release(data)

    sinon.assert.notCalled(stubs.callApiStub)
  }
)

tap.test("Should NOT use npm if the pr wasn't merged", async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  data.inputs = {
    'npm-token': 'a-token',
    'optic-token': 'optic-token',
    'sync-semver-tags': 'true',
  }
  await release(data)
  sinon.assert.neverCalledWith(stubs.runSpawnStub, 'npm', [
    'publish',
    '--tag',
    'latest',
  ])
})

tap.test("Should NOT tag version in git if the pr wasn't merged", async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  data.inputs = {
    'npm-token': 'a-token',
    'optic-token': 'optic-token',
    'sync-semver-tags': 'true',
  }
  await release(data)
  sinon.assert.notCalled(stubs.tagVersionStub)
})

tap.test(
  'Should not do anything if the user is not optic-release-automation[bot]',
  async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.user.login = 'not_the_correct_one'
    await release(data)

    sinon.assert.notCalled(stubs.callApiStub)
    sinon.assert.notCalled(stubs.runSpawnStub)
  }
)

tap.test('Should fail if the release metadata is incorrect', async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.body = 'this data is not correct'
  await release(data)

  sinon.assert.calledOnce(stubs.logStub.logError)
  sinon.assert.notCalled(stubs.callApiStub)
  sinon.assert.notCalled(stubs.runSpawnStub)
})

tap.test(
  'Should call core.setFailed if the tagging the version in git fails',
  async () => {
    const { release, stubs } = setup()
    stubs.tagVersionStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.calledOnce(stubs.coreStub.setFailed)
  }
)

tap.test('Should call core.setFailed if the release fails', async () => {
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

  sinon.assert.calledOnce(stubs.coreStub.setFailed)
})

tap.test(
  'Should tag the minor version in git even if the minor is 0, but major is not',
  async () => {
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

    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5')
    sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.0')
  }
)

tap.test(
  'Should not tag the minor version in git when major is 0',
  async () => {
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
      '<release-meta>{"id":54503465,"version":"v0.2.1","npmTag":"latest","opticUrl":"https://optic-zf3votdk5a-ew.a.run.app/api/generate/"}</release-meta>\n' +
      '-->'

    await release(data)

    sinon.assert.notCalled(stubs.tagVersionStub)
  }
)

tap.test(
  'Should not tag the major version in git if there is no major',
  async () => {
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

    sinon.assert.notCalled(stubs.tagVersionStub)
  }
)
