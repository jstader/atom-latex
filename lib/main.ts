import { CompositeDisposable, Disposable } from "atom";

import MarkerManager from "./marker-manager";

let disposables = new CompositeDisposable();

export function activate(serialized: any) {
  bootstrap();

  if (serialized && serialized.messages) {
    latex.log.setMessages(serialized.messages);
  }

  disposables.add(atom.commands.add("atom-workspace", {
    "latex:build": () => latex.composer.build(false),
    "latex:check-runtime": () => checkRuntime(),
    "latex:clean": () => latex.composer.clean(),
    "latex:clear-log": () => latex.log.clear(),
    "latex:hide-log": () => latex.log.hide(),
    "latex:kill": () => latex.composer.kill(),
    "latex:rebuild": () => latex.composer.build(true),
    "latex:show-log": () => latex.log.show(),
    "latex:sync": () => latex.composer.sync(),
    "latex:sync-log": () => latex.log.sync(),
    "latex:toggle-log": () => latex.log.toggle(),
  }));

  disposables.add(atom.workspace.observeTextEditors((editor) => {
    disposables.add(editor.onDidSave(async () => {
      // Let's play it safe; only trigger builds for the active editor.
      const activeEditor = atom.workspace.getActiveTextEditor();
      if (editor === activeEditor && atom.config.get("latex.buildOnSave")) {
        await latex.composer.build(false, false);
      }
    }));
  }));

  disposables.add(atom.workspace.observeTextEditors((editor) => {
    disposables.add(new MarkerManager(editor));
  }));
}

export function deactivate() {
  disposables.dispose();
  disposables = new CompositeDisposable();
  delete global.latex;
}

export function serialize() {
  return { messages: latex.log.getMessages(false) };
}

export function consumeStatusBar(statusBar: any) {
  bootstrap();
  latex.status.attachStatusBar(statusBar);
  return new Disposable(() => {
    if (global.latex) {
      global.latex.status.detachStatusBar();
    }
  });
}

export function deserializeLog(_serialized: any) {
  bootstrap();
  const LogDock = require("./views/log-dock");
  return new LogDock();
}

function bootstrap() {
  if (global.latex) { return; }

  const Latex = require("./latex").default;
  global.latex = new Latex();
  disposables.add(global.latex);
}

async function checkRuntime() {
  latex.log.clear();
  await latex.builderRegistry.checkRuntimeDependencies();
  latex.opener.checkRuntimeDependencies();
}
