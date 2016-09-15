autoUpdater = null
import {EventEmitter} from 'events';
path = require 'path'

IdleState = 'idle'
CheckingState = 'checking'
DownloadingState = 'downloading'
UpdateAvailableState = 'update-available'
NoUpdateAvailableState = 'no-update-available'
UnsupportedState = 'unsupported'
ErrorState = 'error'

export class AutoUpdateManager {

  constructor: (version, testMode, config) => {
    this.version, this.testMode, this.config = version, testMode, config;
    Object.assign(this.prototype, EventEmitter.prototype);
    this.state = IdleState;
    this.iconPath = path.resolve(__dirname, '..', '..', 'resources', 'atom.png');
    this.feedUrl = `https://atom.io/api/updates?version=${this.version}`;
    process.nextTick(() => this.setupAutoUpdater());
  },
  setupAutoUpdater: () => {
    if(process.platform === 'win32') {
      autoUpdater = require('./auto-updater-win32');
    } else {
      {autoUpdater} = require('electron');
    }
    autoUpdater.on('error', (event, message) => {
      this.setState(ErrorState, message);
      this.emitWindowEvent('update-error');
      console.error(`Error Downloading Update: ${message}`);
    })
    autoUpdater.setFeedURL(this.feedUrl);

    autoUpdater.on('checking-for-update', () => {
      this.setState(CheckingState);
      this.emitWindowEvent('checking-for-update');
    })
    autoUpdater.on('update-not-available', () => {
      this.setState(NoUpdateAvailableState);
      this.emitWindowEvent('update-not-available');
    })
    autoUpdater.on ('update-available', () => {
      this.setState(DownloadingState);
      // We use sendMessage to send an event called 'update-available' in 'update-downloaded'
      // once the update download is complete. This mismatch between the electron
      // autoUpdater events is unfortunate but in the interest of not changing the
      // one existing event handled by applicationDelegate
      this.emitWindowEvent('did-begin-downloading-update');
      this.emit('did-begin-download');
    })
    autoUpdater.on ('update-downloaded', (event, releaseNotes, @releaseVersion) => {
      this.setState(UpdateAvailableState);
      this.emitUpdateAvailableEvent();
    })
    if (this.config['core.automaticallyUpdate']) {
      this.scheduleUpdateCheck();
    }

    switch(process.platform) {
      case 'win32':
        this.setState(UnsupportedState) unless autoUpdater.supportsUpdates();
        break;
      case 'linux':
        this.setState(UnsupportedState);
        break;
    }
  },
  emitUpdateAvailableEvent: () => {
    if (!this.releaseVersion) {
      this.emitWindowEvent('update-available', {this.releaseVersion})
    }
    return
  },
  emitWindowEvent: (eventName, payload) => {
    for atomWindow in this.getWindows() {
      atomWindow.sendMessage(eventName, payload)
    }
    return
  },
  setState: (state, errorMessage) => {
    if (this.state === state) {
      return;
    }
    this.state = state;
    this.errorMessage = errorMessage;
    this.emit('state-changed', this.state);
  },
  getState: () => {
    this.state
  },
  getErrorMessage: () => {
    this.errorMessage
  },
  scheduleUpdateCheck: () => {
    // Only schedule update check periodically if running in release version and
    // and there is no existing scheduled update check.
    if (!/\w{7}/.test(this.version) || this.checkForUpdatesIntervalID) {
      checkForUpdates = () => this.check(hidePopups: true);
      fourHours = 1000 * 60 * 60 * 4
      this.checkForUpdatesIntervalID = setInterval(checkForUpdates, fourHours)
      checkForUpdates()
    }
  },
  cancelScheduledUpdateCheck: () => {
    if (this.checkForUpdatesIntervalID) {
      clearInterval(this.checkForUpdatesIntervalID)
      this.checkForUpdatesIntervalID = null
    }
  },
  check: ({hidePopups}={}) => {
    if (!hidePopups) {
      autoUpdater.once 'update-not-available', this.onUpdateNotAvailable
      autoUpdater.once 'error', this.onUpdateError
    }
    if (!this.testMode) {
      autoUpdater.checkForUpdates();
    }
  },
  install: () => {
    if (!this.testMode) {
      autoUpdater.quitAndInstall();
    }
  },
  onUpdateNotAvailable: () => {
    autoUpdater.removeListener 'error', this.onUpdateError
    {dialog} = require 'electron'
    dialog.showMessageBox
      type: 'info'
      buttons: ['OK']
      icon: this.iconPath
      message: 'No update available.'
      title: 'No Update Available'
      detail: `Version ${this.version} is the latest version.`
  },
  onUpdateError: (event, message) => {
    autoUpdater.removeListener('update-not-available', this.onUpdateNotAvailable);
    {dialog} = require('electron');
    dialog.showMessageBox({
      type: 'warning'
      buttons: ['OK']
      icon: this.iconPath
      message: 'There was an error checking for updates.'
      title: 'Update Error'
      detail: message
    });
  },
  getWindows: () => global.atomApplication.windows;
}
