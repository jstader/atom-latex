import fs from "fs";

import Opener from "../opener";
import { heredoc, isPdfFile } from "../werkzeug";

export default class SkimOpener extends Opener {
  public hasSynctex() {
    return true;
  }

  public canOpenInBackground() {
    return true;
  }

  public canOpen(filePath: string) {
    const supportedFile = isPdfFile(filePath);
    const binaryExists = fs.existsSync(atom.config.get("latex.skimPath"));
    return process.platform === "darwin" && supportedFile && binaryExists;
  }

  public async open(filePath: string, texPath: string, lineNumber: number) {
    const skimPath = atom.config.get("latex.skimPath");
    const shouldActivate = !this.shouldOpenInBackground();
    const command = heredoc(`
      osascript -e \
      "
      set theLine to \\"${lineNumber}\\" as integer
      set theFile to POSIX file \\"${filePath}\\"
      set theSource to POSIX file \\"${texPath}\\"
      set thePath to POSIX path of (theFile as alias)
      tell application \\"${skimPath}\\"
        if ${shouldActivate} then activate
        try
          set theDocs to get documents whose path is thePath
          if (count of theDocs) > 0 then revert theDocs
        end try
        open theFile
        tell front document to go to TeX line theLine from theSource
      end tell
      "
      `);

    await latex.process.executeChildProcess(command!, { showError: true });
  }
}
