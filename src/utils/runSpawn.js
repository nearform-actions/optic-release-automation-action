'use strict'

const { StringDecoder } = require('node:string_decoder')

const { exec } = require('@actions/exec')

function runSpawn({ cwd } = {}) {
  return async (cmd, args) => {
    let output = ''
    let errorOutput = ''

    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')

    const options = {}
    options.cwd = cwd

    options.listeners = {
      stdout: data => {
        output += stdoutDecoder.write(data)
      },
      stderr: data => {
        errorOutput += stderrDecoder.write(data)
      },
    }

    const code = await exec(cmd, args, options)

    output += stdoutDecoder.end()
    errorOutput += stderrDecoder.end()

    if (code === 0) {
      return output.trim()
    }

    throw new Error(
      `${cmd} ${args.join(
        ' '
      )} returned code ${code} \nSTDOUT: ${output}\nSTDERR: ${errorOutput}`
    )
  }
}

exports.runSpawn = runSpawn
