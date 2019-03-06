import path from "path";

import BuildState from "../build-state";
import Builder from "../builder";
import JobState from "../job-state";

const LATEX_PATTERN = /^latex|u?platex$/;
const LATEXMK_VERSION_PATTERN = /Version\s+(\S+)/i;
const LATEXMK_MINIMUM_VERSION = "4.37";
const PDF_ENGINE_PATTERN = /^(xelatex|lualatex)$/;

export default class LatexmkBuilder extends Builder {
  public static canProcess(state: BuildState) {
    return !!state.getTexFilePath();
  }

  public executable = "latexmk";

  public async run(jobState: JobState) {
    const args = this.constructArgs(jobState);

    const { statusCode, stderr }: any = await this.execLatexmk(jobState.getProjectPath()!, args);
    if (statusCode !== 0) {
      this.logStatusCode(statusCode, stderr);
    }

    return statusCode;
  }

  public async execLatexmk(directoryPath: string, args: string[]) {
    const options = this.constructChildProcessOptions(directoryPath, { max_print_line: 1000 });

    // NOTE: Temporary solution to latexmk no longer supporting special chars in paths.
    if (atom.config.get("latex.useRelativePaths") && options.cwd) {
      const absPath = args[args.length - 1].slice(1, -1);
      const relPath = path.relative(options.cwd, absPath);
      args[args.length - 1] = `"${relPath}"`;
    }

    const command = `${this.executable} ${args.join(" ")}`;

    return latex.process.executeChildProcess(command, options);
  }

  public async checkRuntimeDependencies() {
    const { statusCode, stdout, stderr }: any = await this.execLatexmk(".", ["-v"]);

    if (statusCode !== 0) {
      latex.log.error(`latexmk check failed with code ${statusCode} and response of "${stderr}".`);
      return;
    }

    const match = stdout.match(LATEXMK_VERSION_PATTERN);

    if (!match) {
      latex.log.warning(`latexmk check succeeded but with an unknown version response of "${stdout}".`);
      return;
    }

    const version = match[1];

    if (version < LATEXMK_MINIMUM_VERSION) {
      latex.log.warning(
        `latexmk check succeeded but with a version of ${version}". ` +
        `Minimum version required is ${LATEXMK_MINIMUM_VERSION}.`);
      return;
    }

    latex.log.info(`latexmk check succeeded. Found version ${version}.`);
  }

  public logStatusCode(statusCode: number, stderr?: string) {
    switch (statusCode) {
      case 10:
        latex.log.error("latexmk: Bad command line arguments.");
        break;
      case 11:
        latex.log.error("latexmk: File specified on command line not found or other file not found.");
        break;
      case 12:
        latex.log.error("latexmk: Failure in some part of making files.");
        break;
      case 13:
        latex.log.error("latexmk: error in initialization file.");
        break;
      case 20:
        latex.log.error("latexmk: probable bug or retcode from called program.");
        break;
      default:
        super.logStatusCode(statusCode, stderr);
    }
  }

  public constructArgs(jobState: JobState) {
    const args = [
      "-interaction=nonstopmode",
      "-f",
      "-cd",
      "-file-line-error",
    ];

    if (jobState.getShouldRebuild()) {
      args.push("-g");
    }
    if (jobState.getJobName()) {
      args.push(`-jobname="${jobState.getJobName()}"`);
    }
    if (jobState.getEnableShellEscape()) {
      args.push("-shell-escape");
    }
    if (jobState.getEnableSynctex()) {
      args.push("-synctex=1");
    }
    if (jobState.getEnableExtendedBuildMode()) {
      const latexmkrcPath = path.resolve(__dirname, "..", "..", "resources", "latexmkrc");
      args.push(`-r "${latexmkrcPath}"`);
    }

    if (jobState.getEngine().match(LATEX_PATTERN)) {
      args.push(`-latex="${jobState.getEngine()}"`);
      args.push(jobState.getOutputFormat() === "pdf"
        ? this.constructPdfProducerArgs(jobState)
        : `-${jobState.getOutputFormat()}`);
    } else {
      // Look for other PDF engines that can be specified using short command
      // options, i.e. -lualatex and -xelatex
      if (jobState.getOutputFormat() === "pdf" && jobState.getEngine().match(PDF_ENGINE_PATTERN)) {
        args.push(`-${jobState.getEngine()}`);
      } else {
        // Keep the option noise to a minimum by not passing default engine
        if (jobState.getEngine() !== "pdflatex") {
          args.push(`-pdflatex="${jobState.getEngine()}"`);
        }
        args.push(`-${jobState.getOutputFormat()}`);
      }
    }

    if (jobState.getOutputDirectory()) {
      args.push(`-outdir="${jobState.getOutputDirectory()}"`);
    }

    args.push(`"${jobState.getTexFilePath()}"`);
    return args;
  }

  public constructPdfProducerArgs(jobState: JobState) {
    const producer = jobState.getProducer();

    switch (producer) {
      case "ps2pdf":
        return "-pdfps";
      case "dvipdf":
        return '-pdfdvi -e "$dvipdf = \'dvipdf %O %S %D\';"';
      default:
        return `-pdfdvi -e "$dvipdf = '${producer} %O -o %D %S';"`;
    }
  }
}
