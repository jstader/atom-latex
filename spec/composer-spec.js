/** @babel */

// eslint-disable-next-line no-unused-vars
import { afterEach, beforeEach, it, fit } from './async-spec-helpers'
import { activatePackages, cloneFixtures } from './spec-helpers'

import fs from 'fs-plus'
import path from 'path'
import werkzeug from '../lib/werkzeug'
import Composer from '../lib/composer'
import BuildState from '../lib/build-state'

describe('Composer', () => {
  beforeEach(async () => {
    await activatePackages()
  })

  describe('build', () => {
    let editor, builder, composer, fixturesPath

    function initializeSpies (filePath, jobNames = [null], statusCode = 0) {
      editor = jasmine.createSpyObj('MockEditor', ['save', 'isModified'])
      spyOn(composer, 'initializeBuildStateFromMagic').andCallFake(state => { state.setJobNames(jobNames) })
      spyOn(werkzeug, 'getEditorDetails').andReturn({ editor, filePath, lineNumber: 1 })

      builder = jasmine.createSpyObj('MockBuilder', ['run', 'constructArgs', 'parseLogAndFdbFiles'])
      builder.run.andCallFake(() => {
        switch (statusCode) {
          case 0: { return Promise.resolve(statusCode) }
        }

        return Promise.reject(statusCode)
      })
      spyOn(latex.builderRegistry, 'getBuilder').andReturn(builder)

      spyOn(composer, 'runDiCy').andCallThrough()
      spyOn(latex.opener, 'open')
    }

    beforeEach(() => {
      fixturesPath = cloneFixtures()
      composer = new Composer()
      spyOn(composer, 'showResult').andReturn()
      spyOn(composer, 'showError').andReturn()
      atom.config.set('latex.loggingLevel', 'error')
    })

    afterEach(() => {
      composer.dispose()
    })

    it('does nothing for new, unsaved files', async () => {
      initializeSpies(null)

      const result = await composer.build()

      expect(result).toBe(false)
      expect(composer.showResult).not.toHaveBeenCalled()
      expect(composer.showError).not.toHaveBeenCalled()
    })

    it('does nothing for unsupported file extensions', async () => {
      initializeSpies('foo.bar')
      latex.builderRegistry.getBuilder.andReturn(null)

      const result = await composer.build()

      expect(result).toBe(false)
      expect(composer.showResult).not.toHaveBeenCalled()
      expect(composer.showError).not.toHaveBeenCalled()
    })

    it('saves the file before building, if modified', async () => {
      initializeSpies('file.tex')
      editor.isModified.andReturn(true)

      builder.parseLogAndFdbFiles.andReturn({
        outputFilePath: 'file.pdf',
        messages: []
      })

      await composer.build()

      expect(editor.isModified).toHaveBeenCalled()
      expect(editor.save).toHaveBeenCalled()
    })

    it('runs the build two times with multiple job names', async () => {
      initializeSpies('file.tex', ['foo', 'bar'])

      builder.parseLogAndFdbFiles.andReturn({
        outputFilePath: 'file.pdf',
        messages: []
      })

      await composer.build()

      expect(builder.run.callCount).toBe(2)
    })

    it('invokes `showResult` after a successful build, with expected log parsing result', async () => {
      initializeSpies('file.tex')
      builder.parseLogAndFdbFiles.andCallFake(state => {
        state.setLogMessages([])
        state.setOutputFilePath('file.pdf')
      })

      await composer.build()

      expect(composer.showResult).toHaveBeenCalled()
    })

    it('treats missing output file data in log file as an error', async () => {
      initializeSpies('file.tex')
      builder.parseLogAndFdbFiles.andCallFake(state => {
        state.setLogMessages([])
      })

      try { await composer.build() } catch (error) {}

      expect(composer.showError).toHaveBeenCalled()
    })

    it('treats missing result from parser as an error', async () => {
      initializeSpies('file.tex')
      builder.parseLogAndFdbFiles.andCallFake(state => {})

      try { await composer.build() } catch (error) {}

      expect(composer.showError).toHaveBeenCalled()
    })

    it('handles active item not being a text editor', async () => {
      spyOn(atom.workspace, 'getActiveTextEditor').andReturn()
      spyOn(werkzeug, 'getEditorDetails').andCallThrough()

      try { await composer.build() } catch (error) {}

      expect(werkzeug.getEditorDetails).toHaveBeenCalled()
    })

    it('successfully builds LaTeX file using DiCy', async () => {
      const filePath = path.join(fixturesPath, 'file.tex')
      const targetPath = path.join(fixturesPath, 'file.pdf')

      initializeSpies(filePath)
      atom.config.set('latex.useDicy', true)

      try { await composer.build() } catch (error) {}

      expect(composer.runDiCy).toHaveBeenCalled()
      expect(latex.opener.open).toHaveBeenCalledWith(targetPath, filePath, 1)
      expect(latex.log.getMessages()).toEqual([])
    })

    it('successfully executes DiCy when given a file path containing spaces', async () => {
      const filePath = path.join(fixturesPath, 'filename with spaces.tex')
      const targetPath = path.join(fixturesPath, 'filename with spaces.pdf')

      initializeSpies(filePath)
      atom.config.set('latex.useDicy', true)

      try { await composer.build() } catch (error) {}

      expect(composer.runDiCy).toHaveBeenCalled()
      expect(latex.opener.open).toHaveBeenCalledWith(targetPath, filePath, 1)
      expect(latex.log.getMessages()).toEqual([])
    })

    it('fails to produce target when error messages are generated using DiCy', async () => {
      const filePath = path.join(fixturesPath, 'error-warning.tex')

      initializeSpies(filePath)
      atom.config.set('latex.useDicy', true)

      try { await composer.build() } catch (error) {}

      expect(composer.runDiCy).toHaveBeenCalled()
      expect(latex.opener.open).not.toHaveBeenCalled()
      expect(latex.log.getMessages().length).not.toBe(0)
    })

    it('successfully builds knitr file using DiCy', async () => {
      const filePath = path.join(fixturesPath, 'knitr', 'file.Rnw')
      const targetPath = path.join(fixturesPath, 'knitr', 'file.pdf')

      initializeSpies(filePath)
      atom.config.set('latex.useDicy', true)

      try { await composer.build() } catch (error) {}

      expect(composer.runDiCy).toHaveBeenCalled()
      expect(latex.opener.open).toHaveBeenCalledWith(targetPath, filePath, 1)
      expect(latex.log.getMessages()).toEqual([])
    })
  })

  describe('clean', () => {
    let fixturesPath, composer

    function initializeSpies (filePath, jobNames = [null]) {
      spyOn(composer, 'initializeBuildStateFromMagic').andCallFake(state => { state.setJobNames(jobNames) })
      spyOn(werkzeug, 'getEditorDetails').andReturn({ filePath })
      spyOn(composer, 'getGeneratedFileList').andCallFake((builder, state) => {
        let { dir, name } = path.parse(state.getFilePath())
        if (state.getOutputDirectory()) {
          dir = path.resolve(dir, state.getOutputDirectory())
        }
        if (state.getJobName()) {
          name = state.getJobName()
        }

        return new Set([
          path.format({ dir, name, ext: '.log' }),
          path.format({ dir, name, ext: '.aux' })
        ])
      })
    }

    beforeEach(() => {
      fixturesPath = cloneFixtures()
      composer = new Composer()

      spyOn(fs, 'removeSync').andCallThrough()
      atom.config.set('latex.cleanPatterns', ['**/*.aux', '/_minted-{jobname}'])
    })

    it('deletes aux file but leaves log file when log file is not in cleanPatterns', async () => {
      initializeSpies(path.join(fixturesPath, 'foo.tex'))

      try { await composer.clean() } catch (error) {}

      expect(fs.removeSync).toHaveBeenCalledWith(path.join(fixturesPath, 'foo.aux'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, '_minted-foo'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, 'foo.log'))
    })

    it('deletes aux file but leaves log file when log file is not in cleanPatterns with output directory', async () => {
      const outdir = 'build'
      atom.config.set('latex.outputDirectory', outdir)
      initializeSpies(path.join(fixturesPath, 'foo.tex'))

      try { await composer.clean() } catch (error) {}

      expect(fs.removeSync).toHaveBeenCalledWith(path.join(fixturesPath, outdir, 'foo.aux'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, '_minted-foo'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, outdir, 'foo.log'))
    })

    it('deletes aux file but leaves log file when log file is not in cleanPatterns with output directory with dot in name', async () => {
      const outdir = '.build'
      atom.config.set('latex.outputDirectory', outdir)
      initializeSpies(path.join(fixturesPath, 'foo.tex'))

      try { await composer.clean() } catch (error) {}

      expect(fs.removeSync).toHaveBeenCalledWith(path.join(fixturesPath, outdir, 'foo.aux'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, '_minted-foo'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, outdir, 'foo.log'))
    })

    it('deletes aux file but leaves log file when log file is not in cleanPatterns with relative output directory', async () => {
      const outdir = path.join('..', 'build')
      atom.config.set('latex.outputDirectory', outdir)
      initializeSpies(path.join(fixturesPath, 'foo.tex'))

      try { await composer.clean() } catch (error) {}

      expect(fs.removeSync).toHaveBeenCalledWith(path.join(fixturesPath, outdir, 'foo.aux'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, '_minted-foo'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, outdir, 'foo.log'))
    })

    it('deletes aux file but leaves log file when log file is not in cleanPatterns with absolute output directory', async () => {
      const outdir = process.platform === 'win32' ? 'c:\\build' : '/build'
      atom.config.set('latex.outputDirectory', outdir)
      initializeSpies(path.join(fixturesPath, 'foo.tex'))

      try { await composer.clean() } catch (error) {}

      expect(fs.removeSync).toHaveBeenCalledWith(path.join(outdir, 'foo.aux'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, '_minted-foo'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(outdir, 'foo.log'))
    })

    it('deletes aux files but leaves log files when log file is not in cleanPatterns with jobnames', async () => {
      initializeSpies(path.join(fixturesPath, 'foo.tex'), ['bar', 'wibble'])

      try { await composer.clean() } catch (error) {}

      expect(fs.removeSync).toHaveBeenCalledWith(path.join(fixturesPath, 'bar.aux'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, 'bar.log'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, '_minted-bar'))
      expect(fs.removeSync).toHaveBeenCalledWith(path.join(fixturesPath, 'wibble.aux'))
      expect(fs.removeSync).not.toHaveBeenCalledWith(path.join(fixturesPath, 'wibble.log'))
      expect(fs.removeSync).toHaveBeenCalledWith(path.join(fixturesPath, '_minted-wibble'))
    })

    it('stops immediately if the file is not a TeX document', async () => {
      const filePath = 'foo.bar'
      initializeSpies(filePath, [])

      try { await composer.clean() } catch (error) {}

      expect(fs.removeSync).not.toHaveBeenCalled()
    })
  })

  describe('shouldMoveResult', () => {
    let composer, state, jobState
    const rootFilePath = '/wibble/gronk.tex'

    function initializeSpies (outputDirectory = '') {
      composer = new Composer()
      state = new BuildState(rootFilePath)
      state.setOutputDirectory(outputDirectory)
      jobState = state.getJobStates()[0]
    }

    it('should return false when using neither an output directory, nor the move option', () => {
      initializeSpies()
      state.setMoveResultToSourceDirectory(false)

      expect(composer.shouldMoveResult(jobState)).toBe(false)
    })

    it('should return false when not using an output directory, but using the move option', () => {
      initializeSpies()
      state.setMoveResultToSourceDirectory(true)

      expect(composer.shouldMoveResult(jobState)).toBe(false)
    })

    it('should return false when not using the move option, but using an output directory', () => {
      initializeSpies('baz')
      state.setMoveResultToSourceDirectory(false)

      expect(composer.shouldMoveResult(jobState)).toBe(false)
    })

    it('should return true when using both an output directory and the move option', () => {
      initializeSpies('baz')
      state.setMoveResultToSourceDirectory(true)

      expect(composer.shouldMoveResult(jobState)).toBe(true)
    })
  })

  describe('sync', () => {
    let composer

    beforeEach(() => {
      composer = new Composer()
    })

    it('silently does nothing when the current editor is transient', async () => {
      spyOn(werkzeug, 'getEditorDetails').andReturn({ filePath: null })
      spyOn(composer, 'resolveOutputFilePath').andCallThrough()
      spyOn(latex.opener, 'open').andReturn(true)

      await composer.sync()

      expect(composer.resolveOutputFilePath).not.toHaveBeenCalled()
      expect(latex.opener.open).not.toHaveBeenCalled()
    })

    it('logs a warning and returns when an output file cannot be resolved', async () => {
      spyOn(werkzeug, 'getEditorDetails').andReturn({ filePath: 'file.tex', lineNumber: 1 })
      spyOn(composer, 'resolveOutputFilePath').andReturn()
      spyOn(latex.opener, 'open').andReturn(true)
      spyOn(latex.log, 'warning').andCallThrough()

      await composer.sync()

      expect(latex.log.warning).toHaveBeenCalled()
      expect(latex.opener.open).not.toHaveBeenCalled()
    })

    it('launches the opener using editor metadata and resolved output file', async () => {
      const filePath = 'file.tex'
      const lineNumber = 1
      const outputFilePath = 'file.pdf'
      spyOn(werkzeug, 'getEditorDetails').andReturn({ filePath, lineNumber })
      spyOn(composer, 'resolveOutputFilePath').andReturn(outputFilePath)
      spyOn(latex.opener, 'open').andReturn(true)

      await composer.sync()

      expect(latex.opener.open).toHaveBeenCalledWith(outputFilePath, filePath, lineNumber)
    })

    it('launches the opener using editor metadata and resolved output file with jobnames', async () => {
      const filePath = 'file.tex'
      const lineNumber = 1
      const jobNames = ['foo', 'bar']

      spyOn(werkzeug, 'getEditorDetails').andReturn({ filePath, lineNumber })
      spyOn(composer, 'resolveOutputFilePath').andCallFake((builder, state) => state.getJobName() + '.pdf')
      spyOn(composer, 'initializeBuildStateFromMagic').andCallFake(state => { state.setJobNames(jobNames) })
      spyOn(latex.opener, 'open').andReturn(true)

      await composer.sync()

      expect(latex.opener.open).toHaveBeenCalledWith('foo.pdf', filePath, lineNumber)
      expect(latex.opener.open).toHaveBeenCalledWith('bar.pdf', filePath, lineNumber)
    })
  })

  describe('moveResult', () => {
    let composer, state, jobState
    const texFilePath = path.normalize('/angle/gronk.tex')
    const outputFilePath = path.normalize('/angle/dangle/gronk.pdf')

    beforeEach(() => {
      composer = new Composer()
      state = new BuildState(texFilePath)
      jobState = state.getJobStates()[0]
      jobState.setOutputFilePath(outputFilePath)

      spyOn(fs, 'removeSync')
      spyOn(fs, 'moveSync')
    })

    it('verifies that the output file and the synctex file are moved when they exist', () => {
      const destOutputFilePath = path.normalize('/angle/gronk.pdf')
      const syncTexPath = path.normalize('/angle/dangle/gronk.synctex.gz')
      const destSyncTexPath = path.normalize('/angle/gronk.synctex.gz')

      spyOn(fs, 'existsSync').andReturn(true)

      composer.moveResult(jobState)
      expect(fs.removeSync).toHaveBeenCalledWith(destOutputFilePath)
      expect(fs.removeSync).toHaveBeenCalledWith(destSyncTexPath)
      expect(fs.moveSync).toHaveBeenCalledWith(outputFilePath, destOutputFilePath)
      expect(fs.moveSync).toHaveBeenCalledWith(syncTexPath, destSyncTexPath)
    })

    it('verifies that the output file and the synctex file are not moved when they do not exist', () => {
      spyOn(fs, 'existsSync').andReturn(false)

      composer.moveResult(jobState)
      expect(fs.removeSync).not.toHaveBeenCalled()
      expect(fs.removeSync).not.toHaveBeenCalled()
      expect(fs.moveSync).not.toHaveBeenCalled()
      expect(fs.moveSync).not.toHaveBeenCalled()
    })
  })

  describe('initializeBuildStateFromProperties', () => {
    let state, composer
    const primaryString = 'primary'
    const secondaryString = 'secondary'
    const primaryArray = [primaryString]
    const secondaryArray = [secondaryString]

    beforeEach(() => {
      state = new BuildState('gronk.tex')
      composer = new Composer()
    })

    it('verifies that first level properties override second level properties', () => {
      const properties = {
        cleanPatterns: primaryArray,
        enableExtendedBuildMode: true,
        enableShellEscape: true,
        enableSynctex: true,
        jobNames: primaryArray,
        jobnames: secondaryArray,
        jobname: secondaryString,
        customEngine: primaryString,
        engine: secondaryString,
        program: secondaryString,
        moveResultToSourceDirectory: true,
        outputFormat: primaryString,
        format: secondaryString,
        outputDirectory: primaryString,
        output_directory: secondaryString,
        producer: primaryString
      }

      composer.initializeBuildStateFromProperties(state, properties)

      expect(state.getCleanPatterns()).toEqual(primaryArray, 'cleanPatterns to be set')
      expect(state.getEnableExtendedBuildMode()).toBe(true, 'enableExtendedBuildMode to be set')
      expect(state.getEnableShellEscape()).toBe(true, 'enableShellEscape to be set')
      expect(state.getEnableSynctex()).toBe(true, 'enableSynctex to be set')
      expect(state.getJobNames()).toEqual(primaryArray, 'jobNames to set by jobNames property not by jobnames or jobname property')
      expect(state.getEngine()).toBe(primaryString, 'engine to be set by customEngine property not by engine or program property')
      expect(state.getMoveResultToSourceDirectory()).toBe(true, 'moveResultToSourceDirectory to be set')
      expect(state.getOutputFormat()).toBe(primaryString, 'outputFormat to be set by outputFormat property not by format property')
      expect(state.getOutputDirectory()).toBe(primaryString, 'outputDirectory to be set by outputDirectory property not by output_directory property')
      expect(state.getProducer()).toBe(primaryString, 'producer to be set')
    })

    it('verifies that second level properties override third level properties', () => {
      const properties = {
        jobnames: primaryArray,
        jobname: secondaryString,
        engine: primaryString,
        program: secondaryString,
        format: primaryString,
        output_directory: primaryString
      }

      composer.initializeBuildStateFromProperties(state, properties)

      expect(state.getJobNames()).toEqual(primaryArray, 'jobNames to be set')
      expect(state.getEngine()).toBe(primaryString, 'engine to be set by engine property not by program property')
      expect(state.getOutputFormat()).toBe(primaryString, 'outputFormat to be set')
      expect(state.getOutputDirectory()).toBe(primaryString, 'outputDirectory to be set')
    })

    it('verifies that third level properties are set', () => {
      const properties = {
        jobname: primaryString,
        program: primaryString
      }

      composer.initializeBuildStateFromProperties(state, properties)

      expect(state.getJobNames()).toEqual(primaryArray, 'jobNames to be set')
      expect(state.getEngine()).toBe(primaryString, 'engine to be set')
    })
  })

  describe('initializeBuildStateFromConfig', () => {
    it('verifies that build state loaded from config settings is correct', () => {
      const state = new BuildState('foo.tex')
      const composer = new Composer()
      const outputDirectory = 'build'
      const cleanPatterns = ['**/*.foo']

      atom.config.set('latex.outputDirectory', outputDirectory)
      atom.config.set('latex.cleanPatterns', cleanPatterns)
      atom.config.set('latex.enableShellEscape', true)

      composer.initializeBuildStateFromConfig(state)

      expect(state.getOutputDirectory()).toEqual(outputDirectory)
      expect(state.getOutputFormat()).toEqual('pdf')
      expect(state.getProducer()).toEqual('dvipdfmx')
      expect(state.getEngine()).toEqual('pdflatex')
      expect(state.getCleanPatterns()).toEqual(cleanPatterns)
      expect(state.getEnableShellEscape()).toBe(true)
      expect(state.getEnableSynctex()).toBe(true)
      expect(state.getEnableExtendedBuildMode()).toBe(true)
      expect(state.getMoveResultToSourceDirectory()).toBe(true)
    })
  })

  describe('initializeBuildStateFromMagic', () => {
    it('detects magic and overrides build state values', () => {
      const filePath = path.join(__dirname, 'fixtures', 'magic-comments', 'override-settings.tex')
      const state = new BuildState(filePath)
      const composer = new Composer()

      composer.initializeBuildStateFromMagic(state)

      expect(state.getOutputDirectory()).toEqual('wibble')
      expect(state.getOutputFormat()).toEqual('ps')
      expect(state.getProducer()).toEqual('xdvipdfmx')
      expect(state.getEngine()).toEqual('lualatex')
      expect(state.getJobNames()).toEqual(['foo bar', 'snafu'])
      expect(state.getCleanPatterns()).toEqual(['**/*.quux', 'foo/bar'])
      expect(state.getEnableShellEscape()).toBe(true)
      expect(state.getEnableSynctex()).toBe(true)
      expect(state.getEnableExtendedBuildMode()).toBe(true)
      expect(state.getMoveResultToSourceDirectory()).toBe(true)
    })

    it('detect root magic comment and loads remaining magic comments from root', () => {
      const filePath = path.join(__dirname, 'fixtures', 'magic-comments', 'multiple-magic-comments.tex')
      const state = new BuildState(filePath)
      const composer = new Composer()

      composer.initializeBuildStateFromMagic(state)

      expect(state.getEngine()).not.toEqual('lualatex')
    })
  })

  describe('initializeBuild', () => {
    it('verifies that build state is cached and that old cached state is removed', () => {
      const composer = new Composer()
      const fixturesPath = cloneFixtures()
      const filePath = path.join(fixturesPath, 'file.tex')
      const subFilePath = path.join(fixturesPath, 'magic-comments', 'multiple-magic-comments.tex')
      const engine = 'lualatex'

      let build = composer.initializeBuild(subFilePath)
      // Set engine as a flag to indicate the cached state
      build.state.setEngine(engine)
      expect(build.state.getFilePath()).toBe(filePath)
      expect(build.state.hasSubfile(subFilePath)).toBe(true)

      build = composer.initializeBuild(filePath, true)
      expect(build.state.getEngine()).toBe(engine)
      expect(build.state.hasSubfile(subFilePath)).toBe(true)

      build = composer.initializeBuild(filePath)
      expect(build.state.getEngine()).not.toBe(engine)
      expect(build.state.hasSubfile(subFilePath)).toBe(false)
    })

    it('verifies that magic properties override config properties', () => {
      const filePath = path.join(__dirname, 'fixtures', 'magic-comments', 'override-settings.tex')
      const composer = new Composer()

      atom.config.set('latex.enableShellEscape', false)
      atom.config.set('latex.enableExtendedBuildMode', false)
      atom.config.set('latex.moveResultToSourceDirectory', false)

      spyOn(composer, 'initializeBuildStateFromSettingsFile').andCallFake(() => {})

      const { state } = composer.initializeBuild(filePath)

      expect(state.getOutputDirectory()).toEqual('wibble')
      expect(state.getOutputFormat()).toEqual('ps')
      expect(state.getProducer()).toEqual('xdvipdfmx')
      expect(state.getEngine()).toEqual('lualatex')
      expect(state.getJobNames()).toEqual(['foo bar', 'snafu'])
      expect(state.getCleanPatterns()).toEqual(['**/*.quux', 'foo/bar'])
      expect(state.getEnableShellEscape()).toBe(true)
      expect(state.getEnableSynctex()).toBe(true)
      expect(state.getEnableExtendedBuildMode()).toBe(true)
      expect(state.getMoveResultToSourceDirectory()).toBe(true)
    })

    it('verifies that settings file properties override config properties', () => {
      const filePath = path.join(__dirname, 'fixtures', 'magic-comments', 'override-settings.tex')
      const composer = new Composer()

      atom.config.set('latex.enableShellEscape', false)
      atom.config.set('latex.enableExtendedBuildMode', false)
      atom.config.set('latex.moveResultToSourceDirectory', false)

      spyOn(composer, 'initializeBuildStateFromMagic').andCallFake(() => {})

      const { state } = composer.initializeBuild(filePath)

      expect(state.getOutputDirectory()).toEqual('foo')
      expect(state.getOutputFormat()).toEqual('dvi')
      expect(state.getProducer()).toEqual('ps2pdf')
      expect(state.getEngine()).toEqual('xelatex')
      expect(state.getJobNames()).toEqual(['wibble', 'quux'])
      expect(state.getCleanPatterns()).toEqual(['**/*.snafu', 'foo/bar/bax'])
      expect(state.getEnableShellEscape()).toBe(true)
      expect(state.getEnableSynctex()).toBe(true)
      expect(state.getEnableExtendedBuildMode()).toBe(true)
      expect(state.getMoveResultToSourceDirectory()).toBe(true)
    })

    it('verifies that settings file properties override magic properties', () => {
      const filePath = path.join(__dirname, 'fixtures', 'magic-comments', 'override-settings.tex')
      const composer = new Composer()

      atom.config.set('latex.enableShellEscape', false)
      atom.config.set('latex.enableExtendedBuildMode', false)
      atom.config.set('latex.moveResultToSourceDirectory', false)

      const { state } = composer.initializeBuild(filePath)

      expect(state.getOutputDirectory()).toEqual('foo')
      expect(state.getOutputFormat()).toEqual('dvi')
      expect(state.getProducer()).toEqual('ps2pdf')
      expect(state.getEngine()).toEqual('xelatex')
      expect(state.getJobNames()).toEqual(['wibble', 'quux'])
      expect(state.getCleanPatterns()).toEqual(['**/*.snafu', 'foo/bar/bax'])
    })
  })

  describe('resolveOutputFilePath', () => {
    let builder, state, jobState, composer

    beforeEach(() => {
      composer = new Composer()
      state = new BuildState('foo.tex')
      jobState = state.getJobStates()[0]
      builder = jasmine.createSpyObj('MockBuilder', ['parseLogAndFdbFiles'])
    })

    it('returns outputFilePath if already set in jobState', () => {
      const outputFilePath = 'foo.pdf'

      jobState.setOutputFilePath(outputFilePath)

      expect(composer.resolveOutputFilePath(builder, jobState)).toEqual(outputFilePath)
    })

    it('returns outputFilePath returned by parseLogAndFdbFiles', () => {
      const outputFilePath = 'foo.pdf'

      builder.parseLogAndFdbFiles.andCallFake(state => {
        state.setOutputFilePath(outputFilePath)
      })

      expect(composer.resolveOutputFilePath(builder, jobState)).toEqual(outputFilePath)
    })

    it('returns null returned if parseLogAndFdbFiles fails', () => {
      expect(composer.resolveOutputFilePath(builder, jobState)).toEqual(null)
    })

    it('updates outputFilePath if moveResultToSourceDirectory is set', () => {
      const outputFilePath = 'foo.pdf'
      const outputDirectory = 'bar'

      state.setOutputDirectory(outputDirectory)
      state.setMoveResultToSourceDirectory(true)

      builder.parseLogAndFdbFiles.andCallFake(state => {
        state.setOutputFilePath(path.join(outputDirectory, outputFilePath))
      })

      expect(composer.resolveOutputFilePath(builder, jobState)).toEqual(outputFilePath)
    })
  })

  describe('getDiCy', () => {
    let composer, fixturesPath, rootBaseName, subFileBaseName, rootFilePath, subFilePath

    beforeEach(() => {
      composer = new Composer()
      spyOn(composer, 'shouldUseDiCy').andReturn(true)
      spyOn(composer, 'startDiCy').andCallFake(() => {
        composer.dicy = jasmine.createSpyObj('MockDiCy', [
          'clear', 'run', 'getTargetPaths', 'setInstanceOptions', 'setUserOptions'])
      })

      fixturesPath = path.join(__dirname, 'fixtures')
      rootBaseName = 'file.tex'
      rootFilePath = path.join(fixturesPath, rootBaseName)
      subFileBaseName = 'root-comment.tex'
      subFilePath = path.join(fixturesPath, 'magic-comments', subFileBaseName)
    })

    it('verifies that DiCy is correctly initialized for a simple file', async () => {
      const result = await composer.initializeDiCy(rootFilePath)

      expect(composer.startDiCy).toHaveBeenCalled()
      expect(composer.dicy.clear).not.toHaveBeenCalled()
      expect(composer.dicy.setInstanceOptions).toHaveBeenCalledWith(rootFilePath, {
        severity: 'info'
      })
      expect(composer.dicy.setUserOptions).toHaveBeenCalled()
      expect(result).toEqual(rootFilePath)
    })

    it('verifies that root magic comment is detected', async () => {
      const result = await composer.initializeDiCy(subFilePath)

      expect(result).toEqual(rootFilePath)
    })

    it('verifies that DiCy is correctly initialized for a simple file', async () => {
      const result = await composer.initializeDiCy(rootFilePath)

      expect(composer.startDiCy).toHaveBeenCalled()
      expect(composer.dicy.clear).not.toHaveBeenCalled()
      expect(composer.dicy.setInstanceOptions).toHaveBeenCalledWith(rootFilePath, {
        severity: 'info'
      })
      expect(composer.dicy.setUserOptions).toHaveBeenCalled()
      expect(result).toEqual(rootFilePath)
    })

    it('verifies that correct optins are set when fastLoad is enabled', async () => {
      await composer.initializeDiCy(rootFilePath, false, true)
      expect(composer.dicy.setInstanceOptions).toHaveBeenCalledWith(rootFilePath, {
        severity: 'info',
        validateCache: false
      })
    })

    it('verifies that DiCy.clear is called if shouldRebuild is set', async () => {
      await composer.initializeDiCy(rootFilePath, true)

      expect(composer.dicy.setInstanceOptions).toHaveBeenCalledWith(rootFilePath, {
        severity: 'info',
        loadCache: false
      })
      expect(composer.dicy.clear).toHaveBeenCalled()
    })

    it('verifies that DiCy.setUserOptions is not called if updateDiCyUserOptions is not set', async () => {
      composer.updateDiCyUserOptions = false
      await composer.initializeDiCy(rootFilePath)

      expect(composer.dicy.setUserOptions).not.toHaveBeenCalled()
    })
  })

  describe('runDiCy', () => {
    const sourceBaseName = 'file.tex'
    const outputBaseName = 'file.pdf'
    const synctexBaseName = 'file.synctex.gz'

    let composer, dicy, fixturesPath, sourcePath, outputPath, synctexPath

    beforeEach(() => {
      composer = new Composer()
      fixturesPath = path.join(__dirname, 'fixtures')
    })

    function initializeSpies (result = true) {
      dicy = jasmine.createSpyObj('MockDiCy', ['run', 'getTargetPaths', 'setInstanceOptions', 'setUserOptions'])
      dicy.run.andCallFake(() => Promise.resolve(result))
      dicy.getTargetPaths.andCallFake(() => Promise.resolve([outputPath, synctexPath]))
      composer.dicy = dicy

      sourcePath = path.join(fixturesPath, sourceBaseName)
      outputPath = path.join(fixturesPath, outputBaseName)
      synctexPath = path.join(fixturesPath, synctexBaseName)

      spyOn(werkzeug, 'getEditorDetails').andReturn({ filePath: sourcePath, lineNumber: 1 })
      spyOn(latex.opener, 'open').andCallFake(() => Promise.resolve(true))
    }

    it('opens PDF after successful build, but does open SyncTeX file', async () => {
      initializeSpies()

      await composer.runDiCy(['build'])

      expect(latex.opener.open).toHaveBeenCalledWith(outputPath, sourcePath, 1)
      expect(latex.opener.open).not.toHaveBeenCalledWith(synctexPath, sourcePath, 1)
    })

    it('does not open targets after unsuccessful build', async () => {
      initializeSpies(false)

      await composer.runDiCy(['build'])

      expect(latex.opener.open).not.toHaveBeenCalled()
    })

    it('does not open targets after successful build if open is not requested', async () => {
      initializeSpies(true)

      await composer.runDiCy(['build'], { openResults: false })

      expect(latex.opener.open).not.toHaveBeenCalled()
    })
  })
})
