'use strict'

const { mock } = require('node:test')

function mockModule(module, dependencies) {
  mock.restoreAll()
  delete require.cache[require.resolve(module)]
  Object.entries(dependencies).forEach(([name, value]) => {
    mock.module(name, value)
  })
  return require(module)
}

exports.mockModule = mockModule
