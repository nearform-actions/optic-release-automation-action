'use strict'

const { describe, it, afterEach } = require('node:test')
const sinon = require('sinon')
const actionLog = require('../src/log.js')
const { mockModule } = require('./mockModule.js')

const setup = ({ status }) => {
  const logStub = sinon.stub(actionLog)
  const fetchStub = sinon.stub()

  const callApiProxy = mockModule('../src/utils/callApi.js', {
    '../src/log.js': {
      defaultExport: logStub,
    },
    'node-fetch': {
      defaultExport: fetchStub.resolves({
        status,
        get json() {
          return () => {}
        },
      }),
    },
  })

  return { logStub, callApiProxy, fetchStub }
}

describe('callApi tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('Call api warns if code is not 200', async () => {
    const { logStub, callApiProxy } = setup({
      status: 401,
    })
    await callApiProxy.callApi(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {},
      },
      {
        'api-url': 'whatever',
      }
    )
    sinon.assert.calledOnce(logStub.logWarning)
  })

  it('Call api does not warn if code is 200', async () => {
    const { logStub, callApiProxy } = setup({
      status: 200,
    })
    await callApiProxy.callApi(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {},
      },
      { 'api-url': 'whatever' }
    )
    sinon.assert.notCalled(logStub.logWarning)
  })

  it('Call api does not append slash to api url if present', async () => {
    const { fetchStub, callApiProxy } = setup({
      status: 200,
    })
    await callApiProxy.callApi(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {},
      },
      { 'api-url': 'whatever/' }
    )
    sinon.assert.calledWith(fetchStub, 'whatever/release')
  })

  it('Call api appends slash to api url if not present', async () => {
    const { fetchStub, callApiProxy } = setup({
      status: 200,
    })
    await callApiProxy.callApi(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {},
      },
      { 'api-url': 'whatever' }
    )
    sinon.assert.calledWith(fetchStub, 'whatever/release')
  })
})
