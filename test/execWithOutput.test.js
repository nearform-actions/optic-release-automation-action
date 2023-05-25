'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const setup = () => {
  const execStubInner = sinon.stub()
  return {
    execStub: execStubInner,
    execWithOutputModule: proxyquire('../src/utils/execWithOutput', {
      '@actions/exec': {
        exec: execStubInner,
      },
    }),
  }
}
const { execStub, execWithOutputModule } = setup()

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

    await t.resolves(execWithOutputModule.execWithOutput('ls', ['-al']), output)
    sinon.assert.calledWithExactly(execStub, 'ls', ['-al'], sinon.match({}))
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

    await t.rejects(
      () => execWithOutputModule.execWithOutput('ls', ['-al']),
      'Error: ls -al returned code 1  \nSTDOUT:  \nSTDERR: ${output}'
    )

    sinon.assert.calledWithExactly(execStub, 'ls', ['-al'], sinon.match({}))
  }
)

tap.test('provides cwd to exec function', async () => {
  const cwd = './'

  execStub.resolves(0)
  await execWithOutputModule.execWithOutput('command', [], { cwd })
  sinon.assert.calledWithExactly(execStub, 'command', [], sinon.match({ cwd }))
})

tap.test('rejects if exit code is not 0', async t => {
  const errorOutput = 'error output'

  execStub.callsFake((_, __, options) => {
    options.listeners.stderr(Buffer.from(errorOutput, 'utf8'))

    return Promise.resolve(1)
  })

  await t.rejects(execWithOutputModule.execWithOutput('command'))
  sinon.assert.calledWithExactly(execStub, 'command', [], sinon.match({}))
})

tap.test('passes env vars excluding `INPUT_*` env vars', async t => {
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

  // Redo setup so it gets the new env vars
  const withEnv = setup()

  withEnv.execStub.resolves(0)
  withEnv.execWithOutputModule.execWithOutput('command', [])

  const envInExec = withEnv.execStub.firstCall.lastArg.env

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
