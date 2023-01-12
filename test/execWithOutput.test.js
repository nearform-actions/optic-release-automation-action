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
