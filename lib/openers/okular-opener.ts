import fs from 'fs'
import Opener from '../opener'
import { isPdfFile, pathToUri } from '../werkzeug'

export default class OkularOpener extends Opener {
  hasSynctex () {
    return true
  }

  canOpenInBackground () {
    return true
  }

  canOpen (filePath: string) {
    const supportedFile = isPdfFile(filePath)
    const binaryExists = fs.existsSync(atom.config.get('latex.okularPath'))
    return process.platform === 'linux' && supportedFile && binaryExists
  }

  async open (filePath: string, texPath: string, lineNumber: number) {
    const uri = pathToUri(filePath, `src:${lineNumber} ${texPath}`)
    const args = [
      '--unique',
      `"${uri}"`
    ]

    if (this.shouldOpenInBackground()) {
      args.unshift('--noraise')
    }

    const okularPath = atom.config.get('latex.okularPath')
    const command = `"${okularPath}" ${args.join(' ')}`
    await latex.process.executeChildProcess(command, { showError: true })
  }
}
