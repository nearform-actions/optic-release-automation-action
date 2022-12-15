'use strict'

const { StringDecoder } = require('node:string_decoder')

const { exec } = require('@actions/exec')

/**
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string}} options
 * @returns Promise<string>
 */
async function execWithOutput(cmd, args, { cwd } = {}) {
  let output = ''
  let errorOutput = ''

  const stdoutDecoder = new StringDecoder('utf8')
  const stderrDecoder = new StringDecoder('utf8')

  const options = {}

  if (cwd !== '') {
    options.cwd = cwd
  }

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

exports.execWithOutput = execWithOutput
