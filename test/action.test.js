'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')

const core = require('@actions/core')
const actionLog = require('../log')
const runSpawnAction = require('../utils/runSpawn')
const { PR_TITLE_PREFIX } = require('../const')

function buildStubbedAction() {
  const coreStub = sinon.stub(core)
  const logStub = sinon.stub(actionLog)
  const runSpawnStub = sinon.stub()
  const utilStub = sinon.stub(runSpawnAction, 'runSpawn').returns(runSpawnStub)
  const releaseStub = sinon.stub()
  const bumpStub = sinon.stub()

  process.env.GITHUB_ACTION_PATH = './'

  const action = proxyquire('../action', {
    '@actions/core': coreStub,
    './log': logStub,
    './release': releaseStub.resolves(),
    './bump': bumpStub.resolves(),
    './utils/runSpawn': utilStub,
  })

  return {
    action,
    stubs: {
      coreStub,
      logStub,
      releaseStub,
      bumpStub,
      utilStub,
      runSpawnStub,
    },
  }
}

tap.afterEach(() => {
  sinon.restore()
})

const DEFAULT_ACTION_DATA = {
  inputs: {},
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
  async t => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'something_else',
      },
    })

    t.ok(stubs.logStub.logError.calledOnceWith('Unsupported event'))
  }
)

tap.test(
  "the release feature should be called if it's a pull request",
  async t => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'pull_request',
      },
    })

    t.ok(stubs.logStub.logError.notCalled)
    t.ok(stubs.releaseStub.calledOnce)
  }
)

tap.test(
  "the bump feature should be called if it's a workflow_dispatch",
  async t => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'workflow_dispatch',
      },
    })

    t.ok(stubs.logStub.logError.notCalled)
    t.ok(stubs.bumpStub.calledOnce)
  }
)

tap.test(
  'npm should be configured if called with npm-token in inputs',
  async t => {
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

    t.ok(stubs.logStub.logError.notCalled)
    t.ok(stubs.bumpStub.calledOnce)
    t.ok(stubs.utilStub.runSpawn.calledOnce)
    t.ok(
      stubs.runSpawnStub.calledOnceWith('npm', [
        'config',
        'set',
        `//registry.npmjs.org/:_authToken=a-token`,
      ])
    )
  }
)
