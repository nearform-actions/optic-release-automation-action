'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const execStub = sinon.stub()

const execWithOutputModule = proxyquire('../src/utils/execWithOutput', {
  '@actions/exec': {
    exec: execStub,
  },
})

tap.afterEach(() => {
  sinon.restore()
})

tap.test(
  'resolves with output of the exec command if exit code is 0',
  async t => {
    const output = 'output'

    execStub.callsFake((_, __, options) => {
      options.listeners.stdout(Buffer.from(output, 'utf8'))

      return Promise.resolve(0)
    })

    t.resolves(execWithOutputModule.execWithOutput('ls', ['-al']), output)
    execStub.calledWith('ls', ['-al'])
  }
)

tap.test(
  'Throws with output of the exec command if exit code is not 0',
  async t => {
    const output = 'output'

    execStub.callsFake((_, __, options) => {
      options.listeners.stderr(Buffer.from(output, 'utf8'))
      return Promise.reject(new Error())
    })

    t.rejects(
      () => execWithOutputModule.execWithOutput('ls', ['-al']),
      'Error: ls -al returned code 1  \nSTDOUT:  \nSTDERR: ${output}'
    )

    execStub.calledWith('ls', ['-al'])
  }
)

tap.test('provides cwd to exec function', async () => {
  const cwd = './'

  execStub.resolves(0)
  execWithOutputModule.execWithOutput('command', [], cwd)
  execStub.calledWith('command', [], { cwd })
})

tap.test('rejects if exit code is not 0', async t => {
  const errorOutput = 'error output'

  execStub.callsFake((_, __, options) => {
    options.listeners.stderr(Buffer.from(errorOutput, 'utf8'))

    return Promise.resolve(1)
  })

  t.rejects(execWithOutputModule.execWithOutput('command'))
  execStub.calledWith('command')
})

tap.only('passes env vars excluding `INPUT_*` env vars', async t => {
  const INPUT_NPM_TOKEN = 'some-secret-value'
  const INPUT_OPTIC_TOKEN = 'another-secret-value'
  const ACTIONS_ID_TOKEN_REQUEST_URL = 'https://example.com'
  const GITHUB_EVENT_NAME = 'someEvent'

  sinon.stub(process, 'env').value({
    ...process.env,
    INPUT_NPM_TOKEN,
    INPUT_OPTIC_TOKEN,
    ACTIONS_ID_TOKEN_REQUEST_URL,
    GITHUB_EVENT_NAME,
  })

  execStub.resolves(0)
  execWithOutputModule.execWithOutput('command', [])

  const envInExec = execStub.firstCall.lastArg.env

  // Check custom env vars are preserved
  t.has(envInExec, { ACTIONS_ID_TOKEN_REQUEST_URL })
  t.has(envInExec, { GITHUB_EVENT_NAME })

  // Check INPUT_* env vars are removed
  t.notHas(envInExec, { INPUT_NPM_TOKEN })
  t.notHas(envInExec, { INPUT_OPTIC_TOKEN })

  // Check "real" env vars are preserved.
  // Its value will vary by test runner, so just check it is present.
  t.hasProp(envInExec, 'NODE')
})
