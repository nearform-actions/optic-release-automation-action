'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const actionLog = require('../src/log')
const core = require('@actions/core')
const exec = require('@actions/exec')
const clone = require('lodash.clonedeep')
const { PR_TITLE_PREFIX } = require('../src/const')

const DEFAULT_ACTION_DATA = {
  inputs: {},
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

const setup = () => {
  const coreStub = sinon.stub(core)
  const execStub = sinon.stub(exec)
  const logStub = sinon.stub(actionLog)

  const build = proxyquire('../src/build', {
    '@actions/core': coreStub,
    '@actions/exec': execStub,
  })

  return {
    stubs: {
      logStub,
      coreStub,
      execStub,
    },
    build,
  }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Should call build commands correctly', async () => {
  const { build, stubs } = setup()

  const data = clone(DEFAULT_ACTION_DATA)

  data.inputs['build-command'] = 'npm install\n npm build'

  await build(data)

  sinon.assert.calledWithMatch(stubs.execStub.exec, 'npm', ['-v'], {
    cwd: '.',
  })
  sinon.assert.calledWithMatch(stubs.execStub.exec, 'node', ['-v'], {
    cwd: '.',
  })
  sinon.assert.calledWithMatch(stubs.execStub.exec, 'npm', ['install'], {
    cwd: '.',
  })
  sinon.assert.calledWithMatch(stubs.execStub.exec, 'npm', ['build'], {
    cwd: '.',
  })
})

tap.test(
  'Should call build commands with correct path when in a monorepo',
  async () => {
    const { build, stubs } = setup()

    const data = clone(DEFAULT_ACTION_DATA)

    data.inputs['build-command'] = 'npm install\n npm build'
    data.context.payload.pull_request.body =
      '<!--\n' +
      '<release-meta>{"id":54503465,"version":"v5.1.3","npmTag":"latest", "monorepoPackage": "react-app", "monorepoRoot": "packages"}</release-meta>\n' +
      '-->'

    await build(data)

    sinon.assert.calledWithMatch(stubs.execStub.exec, 'npm', ['-v'], {
      cwd: 'packages/react-app',
    })
    sinon.assert.calledWithMatch(stubs.execStub.exec, 'node', ['-v'], {
      cwd: 'packages/react-app',
    })
    sinon.assert.calledWithMatch(stubs.execStub.exec, 'npm', ['install'], {
      cwd: 'packages/react-app',
    })
    sinon.assert.calledWithMatch(stubs.execStub.exec, 'npm', ['build'], {
      cwd: 'packages/react-app',
    })
  }
)

tap.test("Should fail if release metadata can't be parsed as json", async t => {
  const { build, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)

  data.inputs['build-command'] = 'npm install\n npm build'
  data.context.payload.pull_request.body =
    '<!--\n' + '<release-meta>{"invalidjson}</release-meta>\n' + '-->'

  try {
    await build(data)
  } catch (err) {
    t.ok('Build expected to throw with invalid metadata')
  }
  sinon.assert.notCalled(stubs.execStub.exec)
})

tap.test('Should fail if running build command throws an error', async () => {
  const { build, stubs } = setup()

  const data = clone(DEFAULT_ACTION_DATA)
  data.inputs['build-command'] = 'npm install\n npm build'

  stubs.execStub.exec.throws()

  await build(data)

  sinon.assert.calledOnce(stubs.coreStub.setFailed)
})
