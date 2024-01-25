'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const { removeConfidentialArguments } = require('../src/utils/execWithOutput')

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

tap.test('Invalid arguments inputs should not fail', async t => {
  const redactedBlankArray = removeConfidentialArguments([]);
  const redactedUndefinedArray = removeConfidentialArguments(undefined);
  const redactedNullArray = removeConfidentialArguments(null);

  t.equal(Array.isArray(redactedBlankArray), true)
  t.equal(Array.isArray(redactedUndefinedArray), true)
  t.equal(Array.isArray(redactedNullArray), true)

  t.equal(redactedBlankArray?.length, 0)
  t.equal(redactedUndefinedArray?.length, 0)
  t.equal(redactedNullArray?.length, 0)

})

tap.test('Otp should be redacted from args in case of an error', async t => {
  const args = [
    'publish',
    '--tag',
    'latest',
    '--access',
    'public',
  ]

  const arrayWithOTP = [...args.slice(0,2), '--OtP', '11211', ...args.slice(2)]
  const arrayWithOTPInStart = ['--otp', 112111, ...args]
  const arrayWithOTPAtEnd = [...args, '--otp', 112111]

  const errorMessage1 = await t.rejects(execWithOutputModule.execWithOutput('ls', arrayWithOTP));
  const errorMessage2 = await t.rejects(execWithOutputModule.execWithOutput('ls', arrayWithOTPInStart));
  const errorMessage3 = await t.rejects(execWithOutputModule.execWithOutput('ls', arrayWithOTPAtEnd));
  const errorMessage4 = await t.rejects(execWithOutputModule.execWithOutput('ls', args));
  
  t.ok(errorMessage1.message.indexOf('--otp') === -1 && errorMessage1.message.indexOf('publish') > -1)
  t.ok(errorMessage2.message.indexOf('--otp') === -1 && errorMessage2.message.indexOf('publish') > -1)
  t.ok(errorMessage3.message.indexOf('--otp') === -1 && errorMessage3.message.indexOf('publish') > -1)
  t.ok(errorMessage4.message.indexOf('publish') > -1)

})