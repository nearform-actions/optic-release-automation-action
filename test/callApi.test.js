'use strict'

const { describe, it, mock } = require('node:test')
const assert = require('node:assert/strict')
const actionLog = require('../src/log.js')
const { mockModule } = require('./mockModule.js')

const mockAllMethods = obj =>
  Object.fromEntries(Object.keys(obj).map(key => [key, mock.fn()]))

const setup = ({ status }) => {
  const logStub = mockAllMethods(actionLog)
  const fetchStub = mock.fn(() =>
    Promise.resolve({
      status,
      get json() {
        return () => {}
      },
    })
  )

  const callApiProxy = mockModule('../src/utils/callApi.js', {
    '../src/log.js': {
      defaultExport: logStub,
    },
    'node-fetch': {
      defaultExport: fetchStub,
    },
  })

  return { logStub, callApiProxy, fetchStub }
}

describe('callApi tests', async () => {
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
    assert.strictEqual(logStub.logWarning.mock.calls.length, 1)
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
    assert.strictEqual(logStub.logWarning.mock.calls.length, 0)
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
    assert.strictEqual(fetchStub.mock.calls.length, 1)
    assert.strictEqual(fetchStub.mock.calls[0].arguments[0], 'whatever/release')
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
    assert.strictEqual(fetchStub.mock.calls.length, 1)
    assert.strictEqual(fetchStub.mock.calls[0].arguments[0], 'whatever/release')
  })
})
