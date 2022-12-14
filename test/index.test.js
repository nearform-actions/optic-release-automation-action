'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')

const actionLog = require('../src/log')

const { PR_TITLE_PREFIX } = require('../src/const')

function buildStubbedAction() {
  const logStub = sinon.stub(actionLog)
  const releaseStub = sinon.stub()
  const openPrStub = sinon.stub()
  const bumpStub = sinon.stub()
  const runSpawnStub = sinon.stub()

  const { runAction, getBumpedVersionNumber } = proxyquire('../src/index', {
    './log': logStub,
    './release': releaseStub.resolves(),
    './openPr': openPrStub.resolves(),
    './utils/runSpawn': {
      runSpawn: () => runSpawnStub.resolves(),
    },
    './utils/bump': {
      getAutoBumpedVersion: bumpStub,
    },
  })

  return {
    action: runAction,
    getBumpedVersionNumber,
    stubs: {
      logStub,
      releaseStub,
      openPrStub,
      bumpStub,
      runSpawnStub,
    },
  }
}

tap.afterEach(() => {
  sinon.restore()
})

const DEFAULT_ACTION_DATA = {
  inputs: {},
  packageVersion: '3.1.1',
  context: {
    eventName: 'pull_request',
    repo: {
      repo: {},
      owner: {},
    },
    payload: {
      action: 'closed',
      pull_request: {
        user: { login: 'optic-release-automation[bot]' },
        title: PR_TITLE_PREFIX,
      },
    },
  },
}

tap.test(
  'should not run if the event is not workflow_dispatch or pull_request',
  async () => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'something_else',
      },
    })

    sinon.assert.calledWithExactly(stubs.logStub.logError, 'Unsupported event')
  }
)

tap.test(
  "the release feature should be called if it's a pull request",
  async () => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'pull_request',
      },
    })

    sinon.assert.notCalled(stubs.logStub.logError)
    sinon.assert.calledOnce(stubs.releaseStub)
  }
)

tap.test(
  "the bump feature should be called if it's a workflow_dispatch",
  async () => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'workflow_dispatch',
      },
    })

    sinon.assert.notCalled(stubs.logStub.logError)
    sinon.assert.calledOnce(stubs.openPrStub)
  }
)

tap.test(
  'npm should be configured if called with npm-token in inputs',
  async () => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'npm-token': 'a-token',
      },
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'workflow_dispatch',
      },
    })

    sinon.assert.notCalled(stubs.logStub.logError)
    sinon.assert.calledOnce(stubs.openPrStub)
  }
)

tap.test('should call getAutoBumpedVersion if semver is auto', async t => {
  const { getBumpedVersionNumber, stubs } = buildStubbedAction()

  stubs.bumpStub.resolves('3.0.0')

  const inputs = { semver: 'auto' }
  const newVersion = await getBumpedVersionNumber({
    github: {},
    context: {},
    inputs,
  })

  sinon.assert.calledOnce(stubs.bumpStub)
  sinon.assert.calledTwice(stubs.runSpawnStub)
  t.same(newVersion, '3.0.0')
})
