'use strict'

const action = require('./action')

async function fn() {
  await action({
    github: {
      action_path: __dirname
    },
    inputs: {
      semver: 'patch'
    }
  })

}

fn()
