'use strict'

const { describe, afterEach, it } = require('node:test')
const sinon = require('sinon')
const core = require('@actions/core')
const { mockModule } = require('./mockModule.js')

const setup = () => {
  const coreStub = sinon.stub(core)
  const logger = mockModule('../src/log.js', {
    '@actions/core': {
      namedExports: {
        debug: coreStub.debug,
        error: coreStub.error,
        info: coreStub.info,
        warning: coreStub.warning,
      },
    },
  })

  return { coreStub, logger }
}

describe('logger tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('calling log with an array will stringify it', async () => {
    const { logger, coreStub } = setup()
    logger.logDebug([1, 2, 3])
    sinon.assert.calledWithExactly(coreStub.debug, '1,2,3')
  })

  it('logDebug calls @actions/core/debug', async () => {
    const { logger, coreStub } = setup()
    logger.logDebug('Debug')
    sinon.assert.calledOnce(coreStub.debug)
    sinon.assert.notCalled(coreStub.error)
  })

  it('logError calls @actions/core/error', async () => {
    const { logger, coreStub } = setup()
    logger.logError(new Error('not a string'))
    sinon.assert.calledOnce(coreStub.error)
    sinon.assert.notCalled(coreStub.debug)
  })

  it('logInfo calls @actions/core/info', async () => {
    const { logger, coreStub } = setup()
    logger.logInfo('Debug')
    sinon.assert.calledOnce(coreStub.info)
    sinon.assert.notCalled(coreStub.debug)
  })

  it('logWarning calls @actions/core/warning', async () => {
    const { logger, coreStub } = setup()
    logger.logWarning('warning')
    sinon.assert.calledOnce(coreStub.warning)
    sinon.assert.notCalled(coreStub.debug)
  })
})
