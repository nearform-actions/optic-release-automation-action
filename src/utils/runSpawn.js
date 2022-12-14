'use strict'

const { getExecOutput } = require('@actions/exec')

function runSpawn({ cwd } = {}) {
  return async (cmd, args) => {
    const { exitCode, stdout, stderr } = await getExecOutput(cmd, args, { cwd })

    if (exitCode === 0) {
      return stdout
    }

    throw new Error(
      `${cmd} ${args.join(
        ' '
      )} returned code ${exitCode} \nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
    )
  }
}

exports.runSpawn = runSpawn
