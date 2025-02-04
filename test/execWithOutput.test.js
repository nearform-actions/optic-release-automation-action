'use strict'

const { it, describe, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const { redactConfidentialArguments } = require('../src/utils/execWithOutput')
const { mockModule } = require('./mockModule.js')

const setup = () => {
  const execStubInner = sinon.stub()

  return {
    execStub: execStubInner,
    execWithOutputModule: mockModule('../src/utils/execWithOutput.js', {
      '@actions/exec': {
        namedExports: {
          exec: execStubInner,
        },
      },
    }),
  }
}
const { execStub, execWithOutputModule } = setup()

describe('execWithOutput tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('resolves with output of the exec command if exit code is 0', async () => {
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
  })

  it('Throws with output of the exec command if exit code is not 0', async () => {
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
  })

  it('provides cwd to exec function', async () => {
    const cwd = './'

    execStub.resolves(0)
    await execWithOutputModule.execWithOutput('command', [], { cwd })
    sinon.assert.calledWithExactly(
      execStub,
      'command',
      [],
      sinon.match({ cwd })
    )
  })

  it('rejects if exit code is not 0', async () => {
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
  })

  it('passes env vars excluding `INPUT_*` env vars', async () => {
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
    const withEnv = setup()
    withEnv.execStub.resolves(0)
    await withEnv.execWithOutputModule.execWithOutput('command', [])

    const envInExec = withEnv.execStub.firstCall.lastArg.env

    assert.deepStrictEqual(
      envInExec.ACTIONS_ID_TOKEN_REQUEST_URL,
      ACTIONS_ID_TOKEN_REQUEST_URL
    )
    assert.deepStrictEqual(envInExec.GITHUB_EVENT_NAME, GITHUB_EVENT_NAME)
    assert.strictEqual(envInExec.INPUT_NPM_TOKEN, undefined)
    assert.strictEqual(envInExec.INPUT_OPTIC_TOKEN, undefined)
    assert.ok(envInExec.NODE)
  })

  it('Invalid arguments inputs should not fail', async () => {
    const redactedBlankArray = redactConfidentialArguments([])
    const redactedUndefinedArray = redactConfidentialArguments(undefined)
    const redactedNullArray = redactConfidentialArguments(null)

    assert.strictEqual(Array.isArray(redactedBlankArray), true)
    assert.strictEqual(Array.isArray(redactedUndefinedArray), true)
    assert.strictEqual(Array.isArray(redactedNullArray), true)

    assert.strictEqual(redactedBlankArray.length, 0)
    assert.strictEqual(redactedUndefinedArray.length, 0)
    assert.strictEqual(redactedNullArray.length, 0)
  })

  it('Valid arguments inputs should pass', async () => {
    const args = ['publish', '--tag', 'latest', '--access', 'public']
    const otp = '1827Sdys7'

    const arrayWithOTP = [...args.slice(0, 2), '--otp', otp, ...args.slice(2)]
    const arrayWithOTPInStart = ['--otp', otp, ...args]
    const arrayWithOTPAtEnd = [...args, '--otp', otp]

    const redactedArray1 = redactConfidentialArguments(arrayWithOTP)
    const redactedArray2 = redactConfidentialArguments(arrayWithOTPInStart)
    const redactedArray3 = redactConfidentialArguments(arrayWithOTPAtEnd)
    const redactedArray4 = redactConfidentialArguments(args)

    assert.strictEqual(
      Array.isArray(redactedArray1),
      true,
      'Failed - [Array with OTP] - Output Not An Array'
    )
    assert.strictEqual(
      redactedArray1.length,
      arrayWithOTP.length - 2,
      'Failed - [Array with OTP] - Output Array Length not matching>>'
    )
    assert.strictEqual(
      redactedArray1.includes('--otp'),
      false,
      'Failed - [Array with OTP] - OTP Keyword is found in Output Array'
    )
    assert.strictEqual(
      redactedArray1.includes(otp),
      false,
      'Failed - [Array with OTP] - OTP Value is found in Output Array'
    )

    assert.strictEqual(
      Array.isArray(redactedArray2),
      true,
      'Failed - [Array with OTP in start] - Output Not An Array'
    )
    assert.strictEqual(
      redactedArray2.length,
      arrayWithOTPInStart.length - 2,
      'Failed - [Array with OTP in start] - Output Array Length not matching'
    )
    assert.strictEqual(
      redactedArray2.includes('--otp'),
      false,
      'Failed - [Array with OTP in start] - OTP Keyword is found in Output Array'
    )
    assert.strictEqual(
      redactedArray2.includes(otp),
      false,
      'Failed - [Array with OTP in start] - OTP Value is found in Output Array'
    )

    assert.strictEqual(
      Array.isArray(redactedArray3),
      true,
      'Failed - [Array with OTP in end] - Output Not An Array'
    )
    assert.strictEqual(
      redactedArray3.length,
      arrayWithOTPAtEnd.length - 2,
      'Failed - [Array with OTP in end] - Output Array Length not matching'
    )
    assert.strictEqual(
      redactedArray3.includes('--otp'),
      false,
      'Failed - [Array with OTP in end] - OTP Keyword is found in Output Array'
    )
    assert.strictEqual(
      redactedArray3.includes(otp),
      false,
      'Failed - [Array with OTP in end] - OTP Value is found in Output Array'
    )

    assert.strictEqual(
      Array.isArray(redactedArray4),
      true,
      'Failed - [Array with no OTP] - Output Not An Array'
    )
    assert.strictEqual(
      redactedArray4.length,
      args.length,
      'Failed - [Array with no OTP] - Output Array Length not matching'
    )
  })

  it('Otp should be redacted from args in case of an error', async () => {
    const args = ['publish', '--tag', 'latest', '--access', 'public']
    const otp = '872333'

    const arrayWithOTP = [...args.slice(0, 2), '--otp', otp, ...args.slice(2)]
    const arrayWithOTPInStart = ['--otp', otp, ...args]
    const arrayWithOTPAtEnd = [...args, '--otp', otp]

    await assert.rejects(
      () => execWithOutputModule.execWithOutput('ls', arrayWithOTP),
      error => {
        assert.strictEqual(
          error.message.indexOf('--otp'),
          -1,
          'Failed - [Array with OTP] - OTP Keyword is found in Error Output'
        )
        assert.strictEqual(
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
        assert.strictEqual(
          error.message.indexOf('--otp'),
          -1,
          'Failed - [Array with OTP in start] - OTP Keyword is found in Error Output'
        )
        assert.strictEqual(
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
        assert.strictEqual(
          error.message.indexOf('--otp'),
          -1,
          'Failed - [Array with OTP in end] - OTP Keyword is found in Error Output'
        )
        assert.strictEqual(
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
        assert.strictEqual(
          error.message.indexOf('--tag') > -1,
          true,
          'Failed - [Array without OTP] - Expected Keyword is not found in Error Output'
        )
        assert.strictEqual(
          error.message.indexOf('latest') > -1,
          true,
          'Failed - [Array without OTP] - Expected Value is not found in Error Output'
        )
        return true
      }
    )
  })
})
