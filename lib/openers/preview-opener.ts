import Opener from "../opener";
import { isPdfFile, isPsFile } from "../werkzeug";

export default class PreviewOpener extends Opener {
  public canOpenInBackground() {
    return true;
  }

  public canOpen(filePath: string) {
    const supportedFile = isPdfFile(filePath) || isPsFile(filePath);
    return process.platform === "darwin" && supportedFile;
  }

  public async open(filePath: string, _texPath: string, _lineNumber: number) {
    let command = `open -g -a Preview.app "${filePath}"`;
    if (!this.shouldOpenInBackground()) {
      command = command.replace(/-g\s/, "");
    }

    await latex.process.executeChildProcess(command, { showError: true });
  }
}
