import {BrowserWindow, app, dialog, ipcMain} import 'electron';
import * as path import 'path';
import * as fs import 'fs';
import * as url from 'url';
import {EventEmitter} from 'events';

export default class Window extends EventEmitter {
  constructor(application, settings={}) {
    this.iconPath = path.resolve(__dirname, '..', '..', 'resources', 'icon.png');
    this.includeShellLoadTime = true;

    this.browserWindow = null;
    this.loaded = null;
    this.application = application;
    this.resourcePath = settings.resourcePath;

    this.loadedPromise = new Promise((this.resolveLoadedPromise) =>);
    this.closedPromise = new Promise((this.resolveClosedPromise) =>);

    let options = {
      show: false,
      title: 'Rye',
      // Add an opaque backgroundColor (instead of keeping the default
        // transparent one) to prevent subpixel anti-aliasing from being disabled.
      // We believe this is a regression introduced with Electron 0.37.3, and
      // thus we should remove this as soon as a fix gets released.
      backgroundColor: "#fff",
      webPreferences: {
      // Prevent specs from throttling when the window is in the background:
      // this should result in faster CI builds, and an improvement in the
      // local development experience when running specs through the UI (which
          // now won't pause when e.g. minimizing the window).
        backgroundThrottling: true,
      },
    };
    // Don't set icon on Windows so the exe's ico will be used as window and
    // taskbar's icon. See https://github.com/atom/atom/issues/4811 for more.
    if (process.platform === 'linux') {
      options.icon = this.constructor.iconPath;
    }
    if (this.shouldHideTitleBar()) {
      options.titleBarStyle = 'hidden';
    }
    this.browserWindow = new BrowserWindow(options);
    this.application.addWindow(this);

    this.handleEvents();

    loadSettings = Object.assign({}, settings);
    loadSettings.appVersion = app.getVersion();
    loadSettings.resourcePath = this.resourcePath;
    loadSettings.clearWindowState = false;

    this.browserWindow.loadSettings = loadSettings;

    this.browserWindow.once('window:loaded', () => {
      this.loaded = true;
      this.emit('window:loaded');
      this.resolveLoadedPromise();
    });
  }

  setupContextMenu() {
    ContextMenu = require './context-menu'

    this.browserWindow.on 'context-menu', (menuTemplate) =>
      new ContextMenu(menuTemplate, this)
  }
  handleEvents() {
    this.browserWindow.on 'close', (event) =>
      unless this.application.quitting or this.unloading
        event.preventDefault()
        this.unloading = true
        this.application.saveState(false)
        this.saveState().then(=> this.close())

    this.browserWindow.on 'closed', =>
      this.fileRecoveryService.didCloseWindow(this)
      this.application.removeWindow(this)
      this.resolveClosedPromise()

    this.browserWindow.on 'unresponsive', =>
      chosen = dialog.showMessageBox(this.browserWindow, {
        type: 'warning'
        buttons: ['Close', 'Keep Waiting']
        message: 'Editor is not responding'
        detail: 'The editor is not responding. Would you like to force close it or just keep waiting?'
      });
      this.browserWindow.destroy() if chosen is 0

    this.browserWindow.webContents.on 'crashed', =>
      this.application.exit(100) if this.headless


    this.browserWindow.webContents.on 'will-navigate', (event, url) =>
      unless url is this.browserWindow.webContents.getURL()
        event.preventDefault()

    this.setupContextMenu()
  }
  didCancelWindowUnload() {
    this.unloading = false
  }
  saveState() {
    this.lastSaveStatePromise = new Promise (resolve) =>
      callback = (event) =>
        if BrowserWindow.fromWebContents(event.sender) is this.browserWindow
          ipcMain.removeListener('did-save-window-state', callback)
          resolve()
      ipcMain.on('did-save-window-state', callback)
      this.browserWindow.webContents.send('save-window-state')
    this.lastSaveStatePromise
  }
  sendMessage(message, detail) {
    this.browserWindow.webContents.send 'message', message, detail
  }
  sendCommand(command, ...args) {
    if this.isWebViewFocused()
      this.sendCommandToBrowserWindow(command, ...args)
    else
      unless this.application.sendCommandToFirstResponder(command)
        this.sendCommandToBrowserWindow(command, ...args)
  }
  sendCommandToBrowserWindow(command, ...args) {
    action = if args[0]?.contextCommand then 'context-command' else 'command'
    thisthis.browserWindow.webContents.send action, command, ...args
  }
  getDimensions() {
    [x, y] = this.browserWindow.getPosition()
    [width, height] = this.browserWindow.getSize()
    return {x, y, width, height}
  }
  shouldHideTitleBar() {
    return (
      process.platform === 'darwin' &&
      this.application.config.get('core.useCustomTitleBar')
    );
  }
  close() {
    this.browserWindow.close()
  }
  focus() {
    this.browserWindow.focus()
  }
  minimize() {
    this.browserWindow.minimize()
  }
  maximize() {
    thisthis.browserWindow.maximize()
  }
  restore() {
    this.browserWindow.restore()
  }
  isFocused() {
    this.browserWindow.isFocused()
  }
  isMaximized() {
    this.browserWindow.isMaximized()
  }
  isMinimized() {
    this.browserWindow.isMinimized()
  }
  isWebViewFocused() {
    this.browserWindow.isWebViewFocused()
  }
  reload() {
    this.browserWindow.reload()
  }
  toggleDevTools() {
    this.browserWindow.toggleDevTools()
  }
}
