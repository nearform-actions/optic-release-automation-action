'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const actionExecStub = sinon.stub()

const execWithOutputModule = proxyquire('../src/utils/execWithOutput', {
  '@actions/exec': {
    exec: actionExecStub,
  },
})

tap.afterEach(() => {
  sinon.restore()
})

tap.test(
  'resolves with output of the exec command if exit code is 0',
  async t => {
    const output = 'output'

    actionExecStub.callsFake((_, __, options) => {
      options.listeners.stdout(Buffer.from(output, 'utf8'))

      return Promise.resolve(0)
    })

    const exec = execWithOutputModule.execWithOutput()
    t.resolves(exec('ls', ['-al']), output)
    actionExecStub.calledWith('ls', ['-al'])
  }
)

tap.test(
  'Throws with output of the exec command if exit code is not 0',
  async t => {
    const output = 'output'

    actionExecStub.callsFake((_, __, options) => {
      options.listeners.stderr(Buffer.from(output, 'utf8'))
      return Promise.reject(new Error())
    })
    const exec = execWithOutputModule.execWithOutput()

    t.rejects(
      () => exec('ls', ['-al']),
      'Error: ls -al returned code 1  \nSTDOUT:  \nSTDERR: ${output}'
    )

    actionExecStub.calledWith('ls', ['-al'])
  }
)

tap.test('provides cwd to exec function', async () => {
  const cwd = './'

  actionExecStub.resolves(0)
  const exec = execWithOutputModule.execWithOutput()
  exec('command', [], cwd)
  actionExecStub.calledWith('command', [], { cwd })
})

tap.test('rejects if exit code is not 0', async t => {
  const errorOutput = 'error output'

  actionExecStub.callsFake((_, __, options) => {
    options.listeners.stderr(Buffer.from(errorOutput, 'utf8'))

    return Promise.resolve(1)
  })

  const exec = execWithOutputModule.execWithOutput()
  t.rejects(exec('command'))
  actionExecStub.calledWith('command')
})

tap.test('use proper cwd when supplied', async t => {
  const output = 'output'
  const cwd = '/test/path'

  actionExecStub.callsFake((_, __, options) => {
    t.equal(options.cwd, cwd)
    options.listeners.stdout(Buffer.from(output, 'utf8'))

    return Promise.resolve(0)
  })

  const exec = execWithOutputModule.execWithOutput({ cwd })
  t.resolves(exec('ls', ['-al']), output)
})
