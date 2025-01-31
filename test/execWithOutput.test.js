'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const { redactConfidentialArguments } = require('../src/utils/execWithOutput')

const setup = ({ t }) => {
  const execStubInner = sinon.stub()
  const execMock = t.mock.module('@actions/exec', {
    namedExports: {
      exec: execStubInner,
    },
  })

  const execWithOutputModule = require('../src/utils/execWithOutput')
  return { execStub: execStubInner, execWithOutputModule, execMock }
}

test('execWithOutput tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/execWithOutput')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test(
    'resolves with output of the exec command if exit code is 0',
    async t => {
      const { execStub, execWithOutputModule, execMock } = setup({ t })
      const output = 'output'

      execStub.callsFake((_, __, options) => {
        options.listeners.stdout(Buffer.from(output, 'utf8'))
        return Promise.resolve(0)
      })

      await assert.doesNotReject(
        execWithOutputModule.execWithOutput('ls', ['-al']),
        output
      )
      sinon.assert.calledWithExactly(execStub, 'ls', ['-al'], sinon.match({}))
      execMock.restore()
    }
  )

  await t.test(
    'Throws with output of the exec command if exit code is not 0',
    async t => {
      const { execStub, execWithOutputModule, execMock } = setup({ t })
      const output = 'output'

      execStub.callsFake((_, __, options) => {
        options.listeners.stderr(Buffer.from(output, 'utf8'))
        return Promise.reject(new Error())
      })

      await assert.rejects(
        execWithOutputModule.execWithOutput('ls', ['-al']),
        'Error: ls -al returned code 1  \nSTDOUT:  \nSTDERR: ${output}'
      )
      sinon.assert.calledWithExactly(execStub, 'ls', ['-al'], sinon.match({}))
      execMock.restore()
    }
  )

  await t.test('provides cwd to exec function', async t => {
    const { execStub, execWithOutputModule, execMock } = setup({ t })
    const cwd = './'

    execStub.resolves(0)
    await execWithOutputModule.execWithOutput('command', [], { cwd })
    sinon.assert.calledWithExactly(
      execStub,
      'command',
      [],
      sinon.match({ cwd })
    )
    execMock.restore()
  })

  await t.test('rejects if exit code is not 0', async t => {
    const { execStub, execWithOutputModule, execMock } = setup({ t })
    const errorOutput = 'error output'

    execStub.callsFake((_, __, options) => {
      options.listeners.stderr(Buffer.from(errorOutput, 'utf8'))
      return Promise.resolve(1)
    })

    await assert.rejects(
      () => execWithOutputModule.execWithOutput('command'),
      error => {
        assert.match(error.message, /command\s+returned code 1/)
        assert.match(error.message, /STDERR: error output/)
        sinon.assert.called(execStub)
        return true
      }
    )

    execMock.restore()
  })

  await t.test('passes env vars excluding `INPUT_*` env vars', async t => {
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

    const { execStub, execWithOutputModule, execMock } = setup({ t })
    execStub.resolves(0)
    await execWithOutputModule.execWithOutput('command', [])

    const envInExec = execStub.firstCall.lastArg.env

    assert.deepEqual(
      envInExec.ACTIONS_ID_TOKEN_REQUEST_URL,
      ACTIONS_ID_TOKEN_REQUEST_URL
    )
    assert.deepEqual(envInExec.GITHUB_EVENT_NAME, GITHUB_EVENT_NAME)
    assert.equal(envInExec.INPUT_NPM_TOKEN, undefined)
    assert.equal(envInExec.INPUT_OPTIC_TOKEN, undefined)
    assert.ok(envInExec.NODE)
    execMock.restore()
  })

  await t.test('Invalid arguments inputs should not fail', async () => {
    const redactedBlankArray = redactConfidentialArguments([])
    const redactedUndefinedArray = redactConfidentialArguments(undefined)
    const redactedNullArray = redactConfidentialArguments(null)

    assert.equal(Array.isArray(redactedBlankArray), true)
    assert.equal(Array.isArray(redactedUndefinedArray), true)
    assert.equal(Array.isArray(redactedNullArray), true)

    assert.equal(redactedBlankArray.length, 0)
    assert.equal(redactedUndefinedArray.length, 0)
    assert.equal(redactedNullArray.length, 0)
  })

  await t.test('Valid arguments inputs should pass', async () => {
    const args = ['publish', '--tag', 'latest', '--access', 'public']
    const otp = '1827Sdys7'

    const arrayWithOTP = [...args.slice(0, 2), '--otp', otp, ...args.slice(2)]
    const arrayWithOTPInStart = ['--otp', otp, ...args]
    const arrayWithOTPAtEnd = [...args, '--otp', otp]

    const redactedArray1 = redactConfidentialArguments(arrayWithOTP)
    const redactedArray2 = redactConfidentialArguments(arrayWithOTPInStart)
    const redactedArray3 = redactConfidentialArguments(arrayWithOTPAtEnd)
    const redactedArray4 = redactConfidentialArguments(args)

    assert.equal(
      Array.isArray(redactedArray1),
      true,
      'Failed - [Array with OTP] - Output Not An Array'
    )
    assert.equal(
      redactedArray1.length,
      arrayWithOTP.length - 2,
      'Failed - [Array with OTP] - Output Array Length not matching>>'
    )
    assert.equal(
      redactedArray1.includes('--otp'),
      false,
      'Failed - [Array with OTP] - OTP Keyword is found in Output Array'
    )
    assert.equal(
      redactedArray1.includes(otp),
      false,
      'Failed - [Array with OTP] - OTP Value is found in Output Array'
    )

    assert.equal(
      Array.isArray(redactedArray2),
      true,
      'Failed - [Array with OTP in start] - Output Not An Array'
    )
    assert.equal(
      redactedArray2.length,
      arrayWithOTPInStart.length - 2,
      'Failed - [Array with OTP in start] - Output Array Length not matching'
    )
    assert.equal(
      redactedArray2.includes('--otp'),
      false,
      'Failed - [Array with OTP in start] - OTP Keyword is found in Output Array'
    )
    assert.equal(
      redactedArray2.includes(otp),
      false,
      'Failed - [Array with OTP in start] - OTP Value is found in Output Array'
    )

    assert.equal(
      Array.isArray(redactedArray3),
      true,
      'Failed - [Array with OTP in end] - Output Not An Array'
    )
    assert.equal(
      redactedArray3.length,
      arrayWithOTPAtEnd.length - 2,
      'Failed - [Array with OTP in end] - Output Array Length not matching'
    )
    assert.equal(
      redactedArray3.includes('--otp'),
      false,
      'Failed - [Array with OTP in end] - OTP Keyword is found in Output Array'
    )
    assert.equal(
      redactedArray3.includes(otp),
      false,
      'Failed - [Array with OTP in end] - OTP Value is found in Output Array'
    )

    assert.equal(
      Array.isArray(redactedArray4),
      true,
      'Failed - [Array with no OTP] - Output Not An Array'
    )
    assert.equal(
      redactedArray4.length,
      args.length,
      'Failed - [Array with no OTP] - Output Array Length not matching'
    )
  })

  await t.test(
    'Otp should be redacted from args in case of an error',
    async t => {
      const { execWithOutputModule, execMock } = setup({ t })
      const args = ['publish', '--tag', 'latest', '--access', 'public']
      const otp = '872333'

      const arrayWithOTP = [...args.slice(0, 2), '--otp', otp, ...args.slice(2)]
      const arrayWithOTPInStart = ['--otp', otp, ...args]
      const arrayWithOTPAtEnd = [...args, '--otp', otp]

      await assert.rejects(
        () => execWithOutputModule.execWithOutput('ls', arrayWithOTP),
        error => {
          assert.equal(
            error.message.indexOf('--otp'),
            -1,
            'Failed - [Array with OTP] - OTP Keyword is found in Error Output'
          )
          assert.equal(
            error.message.indexOf(otp),
            -1,
            'Failed - [Array with OTP] - OTP Value is found in Error Output'
          )
          return true
        }
      )

      await assert.rejects(
        () => execWithOutputModule.execWithOutput('ls', arrayWithOTPInStart),
        error => {
          assert.equal(
            error.message.indexOf('--otp'),
            -1,
            'Failed - [Array with OTP in start] - OTP Keyword is found in Error Output'
          )
          assert.equal(
            error.message.indexOf(otp),
            -1,
            'Failed - [Array with OTP in start] - OTP Value is found in Error Output'
          )
          return true
        }
      )

      await assert.rejects(
        () => execWithOutputModule.execWithOutput('ls', arrayWithOTPAtEnd),
        error => {
          assert.equal(
            error.message.indexOf('--otp'),
            -1,
            'Failed - [Array with OTP in end] - OTP Keyword is found in Error Output'
          )
          assert.equal(
            error.message.indexOf(otp),
            -1,
            'Failed - [Array with OTP in end] - OTP Value is found in Error Output'
          )
          return true
        }
      )

      await assert.rejects(
        () => execWithOutputModule.execWithOutput('ls', args),
        error => {
          assert.equal(
            error.message.indexOf('--tag') > -1,
            true,
            'Failed - [Array without OTP] - Expected Keyword is not found in Error Output'
          )
          assert.equal(
            error.message.indexOf('latest') > -1,
            true,
            'Failed - [Array without OTP] - Expected Value is not found in Error Output'
          )
          return true
        }
      )

      execMock.restore()
    }
  )
})
