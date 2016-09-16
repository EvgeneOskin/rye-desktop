import {Window} from './window';
import ApplicationMenu from './menu';
import AutoUpdateManager from './auto_update';
import Config from '../config';
import ipcHelpers from '../ipc-helpers';
import {BrowserWindow, Menu, app, dialog, ipcMain, shell} from 'electron';
import {CompositeDisposable} from 'event-kit';
import * as fs from 'fs-plus';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import * as url form 'url';
import {EventEmitter} from 'events';
import * as _ from 'underscore-plus';

let FindParentDir = null;
let Resolve = null;

let LocationSuffixRegExp = /(:\d+)(:\d+)?$/;

// The application's singleton class.
//
// It's the entry point into the Atom application and maintains the global state
// of the application.
//
export default class AtomApplication extends EventEmitter {

  exit(status) {
    app.exit(status)
  }

  constructor(options) {
    this.windows = null;
    this.applicationMenu = null;
    this.atomProtocolHandler = null;
    this.resourcePath = null;
    this.version = null;;
    this.quitting = false;

    {@resourcePath, @devResourcePath, @version, @safeMode, @socketPath, timeout, clearWindowState} = options
    this.pidsToOpenWindows = {}
    this.windows = []

    this.disposable = new CompositeDisposable
    this.handleEvents()
  }

    // This stuff was previously done in the constructor, but we want to be able to construct this object
    // for testing purposes without booting up the world. As you add tests, feel free to move instantiation
    // of these various sub-objects into the constructor, but you'll need to remove the side-effects they
    // perform during their construction, adding an initialize method that you call here.
  initialize(options) {
    global.atomApplication = this

    this.config.onDidChange 'core.useCustomTitleBar', this.promptForRelaunch

    this.autoUpdateManager = new AutoUpdateManager(this.version, options.test, this.resourcePath, this.config)
    this.applicationMenu = new ApplicationMenu(this.version, this.autoUpdateManager)
    this.atomProtocolHandler = new AtomProtocolHandler(this.resourcePath, this.safeMode)

    this.listenForArgumentsFromNewProcess()
    this.setupJavaScriptArguments()
    this.setupDockMenu()

    this.launch(options)
  }
  destroy() {
    windowsClosePromises = this.windows.map (window) ->
    window.close()
    window.closedPromise
    Promise.all(windowsClosePromises).then(=> this.disposable.dispose())
  }
  launch() {
    this.loadState(options)
  }

  openWithOptions({executedFrom, urlsToOpen, test, pidToKillWhenClosed, safeMode, newWindow, logFile, profileStartup, timeout, clearWindowState, addToLastWindow, env}) {
    app.focus()

    // Public: Removes the {AtomWindow} from the global window list.
    removeWindow: (window) ->
    this.windows.splice(this.windows.indexOf(window), 1)
    if (this.windows.length === 0) {
      this.applicationMenu?.enableWindowSpecificItems(false)
    }
    if (process.platform in ['win32', 'linux']) {
      app.quit()
    }
    return
  }

  // Public: Adds the {AtomWindow} to the global window list.
  addWindow(window) {
    this.windows.push window
    this.applicationMenu?.addWindow(window.browserWindow)
    window.once 'window:loaded', =>
      this.autoUpdateManager?.emitUpdateAvailableEvent(window)

    unless window.isSpec
    focusHandler = => this.lastFocusedWindow = window
    blurHandler = => this.saveState(false)
    window.browserWindow.on 'focus', focusHandler
    window.browserWindow.on 'blur', blurHandler
    window.browserWindow.once 'closed', =>
      this.lastFocusedWindow = null if window is this.lastFocusedWindow
    window.browserWindow.removeListener 'focus', focusHandler
    window.browserWindow.removeListener 'blur', blurHandler
    window.browserWindow.webContents.once 'did-finish-load', => this.saveState(false)
  }
  // Creates server to listen for additional atom application launches.
  //
  // You can run the atom command multiple times, but after the first launch
  // the other launches will just pass their information to this server and then
  // close immediately.
  listenForArgumentsFromNewProcess() {
    return unless this.socketPath?
      this.deleteSocketFile()
    server = net.createServer (connection) =>
      data = ''
    connection.on 'data', (chunk) ->
    data = data + chunk

    connection.on 'end', =>
      options = JSON.parse(data)
    this.openWithOptions(options)

    server.listen this.socketPath
    server.on 'error', (error) -> console.error 'Application server failed', error
  }
  deleteSocketFile() {
    if (process.platform === 'win32' || this.socketPath === undefined) {
      return if process.platform is 'win32' or not this.socketPath?
    }
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath)
      } catch error {
        // Ignore ENOENT errors in case the file was deleted between the exists
        // check and the call to unlink sync. This occurred occasionally on CI
        // which is why this check is here.
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }
  // Registers basic application commands, non-idempotent.
  handleEvents() {

    this.on 'application:quit', -> app.quit()
    this.on 'application:inspect', ({x, y, atomWindow}) ->
    atomWindow ?= this.focusedWindow()
    atomWindow?.browserWindow.inspectElement(x, y)

    this.on 'application:open-documentation', -> shell.openExternal('http://flight-manual.atom.io/')
    this.on 'application:open-discussions', -> shell.openExternal('https://discuss.atom.io')
    this.on 'application:open-faq', -> shell.openExternal('https://atom.io/faq')
    this.on 'application:open-terms-of-use', -> shell.openExternal('https://atom.io/terms')
    this.on 'application:report-issue', -> shell.openExternal('https://github.com/atom/atom/blob/master/CONTRIBUTING.md#submitting-issues')
    this.on 'application:search-issues', -> shell.openExternal('https://github.com/issues?q=+is%3Aissue+user%3Aatom')

    this.on 'application:install-update', =>
      this.quitting = true
    this.autoUpdateManager.install()

    this.on 'application:check-for-update', => this.autoUpdateManager.check()

    if (process.platform is 'darwin') {
      this.on 'application:bring-all-windows-to-front', -> Menu.sendActionToFirstResponder('arrangeInFront:')
      this.on 'application:hide', -> Menu.sendActionToFirstResponder('hide:')
      this.on 'application:hide-other-applications', -> Menu.sendActionToFirstResponder('hideOtherApplications:')
      this.on 'application:minimize', -> Menu.sendActionToFirstResponder('performMiniaturize:')
      this.on 'application:unhide-all-applications', -> Menu.sendActionToFirstResponder('unhideAllApplications:')
      this.on 'application:zoom', -> Menu.sendActionToFirstResponder('zoom:')
    } else {
      this.on 'application:minimize', -> this.focusedWindow()?.minimize()
    }
    this.on 'application:zoom', -> this.focusedWindow()?.maximize()


    this.disposable.add ipcHelpers.on app, 'before-quit', (event) =>
      unless this.quitting
    event.preventDefault()
    this.quitting = true
    Promise.all(this.windows.map((window) -> window.saveState())).then(-> app.quit())

    this.disposable.add ipcHelpers.on app, 'will-quit', =>
      this.killAllProcesses()
    this.deleteSocketFile()

    this.disposable.add ipcHelpers.on app, 'activate-with-no-open-windows', (event) =>
      event?.preventDefault()
    this.emit('application:new-window')

    // A request from the associated render process to open a new render process.
    this.disposable.add ipcHelpers.on ipcMain, 'open', (event, options) =>
      window = this.windowForEvent(event)
    new AtomWindow(this, options)

    this.disposable.add ipcHelpers.on ipcMain, 'update-application-menu', (event, template, keystrokesByCommand) =>
      win = BrowserWindow.fromWebContents(event.sender)
    this.applicationMenu?.update(win, template, keystrokesByCommand)


    this.disposable.add ipcHelpers.on ipcMain, 'command', (event, command) =>
      this.emit(command)

    this.disposable.add ipcHelpers.on ipcMain, 'window-command', (event, command, ...args) ->
    win = BrowserWindow.fromWebContents(event.sender)
    win.emit(command, ...args)

    this.disposable.add ipcHelpers.on ipcMain, 'call-window-method', (event, method, ...args) ->
    win = BrowserWindow.fromWebContents(event.sender)
    win[method](...args)

    this.disposable.add ipcHelpers.respondTo 'set-window-size', (win, width, height) ->
    win.setSize(width, height)

    this.disposable.add ipcHelpers.respondTo 'set-window-position', (win, x, y) ->
    win.setPosition(x, y)

    this.disposable.add ipcHelpers.respondTo 'center-window', (win) ->
    win.center()

    this.disposable.add ipcHelpers.respondTo 'focus-window', (win) ->
    win.focus()

    this.disposable.add ipcHelpers.respondTo 'show-window', (win) ->
    win.show()

    this.disposable.add ipcHelpers.respondTo 'hide-window', (win) ->
    win.hide()

    this.disposable.add ipcHelpers.respondTo 'get-temporary-window-state', (win) ->
    win.temporaryState

    this.disposable.add ipcHelpers.respondTo 'set-temporary-window-state', (win, state) ->
    win.temporaryState = state

    this.disposable.add ipcHelpers.on ipcMain, 'did-cancel-window-unload', =>
      this.quitting = false
    for window in this.windows
    window.didCancelWindowUnload()

    clipboard = require '../safe-clipboard'
    this.disposable.add ipcHelpers.on ipcMain, 'write-text-to-selection-clipboard', (event, selectedText) ->
    clipboard.writeText(selectedText, 'selection')

    this.disposable.add ipcHelpers.on ipcMain, 'write-to-stdout', (event, output) ->
    process.stdout.write(output)

    this.disposable.add ipcHelpers.on ipcMain, 'write-to-stderr', (event, output) ->
    process.stderr.write(output)

    this.disposable.add ipcHelpers.on ipcMain, 'add-recent-document', (event, filename) ->
    app.addRecentDocument(filename)

    this.disposable.add ipcHelpers.on ipcMain, 'execute-javascript-in-dev-tools', (event, code) ->
    event.sender.devToolsWebContents?.executeJavaScript(code)

    this.disposable.add ipcHelpers.on ipcMain, 'get-auto-update-manager-state', (event) =>
      event.returnValue = this.autoUpdateManager.getState()

    this.disposable.add ipcHelpers.on ipcMain, 'get-auto-update-manager-error', (event) =>
      event.returnValue = this.autoUpdateManager.getErrorMessage()
  }
  setupDockMenu() {
    if (process.platform === 'darwin') {
      const dockMenu = Menu.buildFromTemplate([
        {label: 'New Window', click: => this.emit('application:new-window')}
      ]);
      app.dock.setMenu(dockMenu);
    }
  }
  // Public: Executes the given command.
  //
  // If it isn't handled globally, delegate to the currently focused window.
  //
  // command - The string representing the command.
  // args - The optional arguments to pass along.
  sendCommand(command, ...args) {
    unless this.emit(command, ...args)
    focusedWindow = this.focusedWindow()
    if (focusedWindow !== undeinfed) {
      focusedWindow.sendCommand(command, ...args)
    } else {
      this.sendCommandToFirstResponder(command)
    }
  }

  // Public: Executes the given command on the given window.
  //
  // command - The string representing the command.
  // atomWindow - The {AtomWindow} to send the command to.
  // args - The optional arguments to pass along.
  sendCommandToWindow(command, atomWindow, ...args) {
    unless this.emit(command, ...args)
    if (atomWindow !== undefined) {
      atomWindow.sendCommand(command, ...args)
    } else {
      this.sendCommandToFirstResponder(command)
    }
  }
  // Returns the {AtomWindow} for the given ipcMain event.
  windowForEvent({sender}) {
    window = BrowserWindow.fromWebContents(sender)
    _.find this.windows, ({browserWindow}) -> window is browserWindow
  }
  // Public: Returns the currently focused {AtomWindow} or undefined if none.
  focusedWindow() {
    _.find this.windows, (atomWindow) -> atomWindow.isFocused()
  }
  // Get the platform-specific window offset for new windows.
  getWindowOffsetForCurrentPlatform() {
    offsetByPlatform = {
      darwin: 22
      win32: 26
    }
    offsetByPlatform[process.platform] ? 0
  }
  // Get the dimensions for opening a new window by cascading as appropriate to
  // the platform.
  getDimensionsForNewWindow() {
    let focusedWindow = (this.focusedWindow() || this.lastFocusedWindow);
    if (focusedWindow === undefined) {
      return;
    }
    if (focusedWindow.isMaximized()) {
      return
    }
    dimensions = focusedWindow.getDimensions()
    offset = this.getWindowOffsetForCurrentPlatform()
    if (dimensions !== undefined && offset !== undefined ) {
      dimensions.x += offset
      dimensions.y += offset
    }
    dimensions
  }

  // Kill all processes associated with opened windows.
  killAllProcesses() {
    for (pid of this.pidsToOpenWindows) {
      this.killProcess(pid);
    }
    return
  }

  // Kill process associated with the given opened window.
  killProcessForWindow(openedWindow) {
    for (pid, trackedWindow of this.pidsToOpenWindows) {
      if (trackedWindow === openedWindow) {
        this.killProcess(pid)
      }
    }
    return
  }
  // Kill the process with the given pid.
  killProcess(pid) {
    try {
      parsedPid = parseInt(pid);
      if (isFinite(parsedPid)) {
        process.kill(parsedPid)
      }
    } catch (error) {
      if (error.code !== 'ESRCH') {
        console.log("Killing process #{pid} failed: #{error.code ? error.message}")
      }
    }
    delete this.pidsToOpenWindows[pid]
  }
  saveState(allowEmpty=false) {
    if (this.quitting) {
      return;
    }
    states = []
    for (window in this.windows) {
    }
  }
  loadState(options) {
    let restorePreviousState = this.config.get('core.restorePreviousWindowsOnStart')
    if (restorePreviousState === undefined) {
      restorePreviousState = true;
    }
    if (restorePreviousState && (states = this.storageFolder.load('application.json')).length > 0) {
      for (state of states) {
        this.openWithOptions(Object.assign(options, {
          urlsToOpen: [],
          safeMode: this.safeMode,
        }))
      }
    } else {
      return null;
    }
  }
  promptForRelaunch() {
    const chosen = dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
      type: 'warning'
      title: 'Relaunch required'
      message: "You will need to relaunch Atom for this change to take effect."
      buttons: ['Quit Atom', 'Cancel']
    })
    if (chosen === 0) {
      // once we're using electron v.1.2.2
      // app.relaunch()
      app.quit()
    }
  }
}
