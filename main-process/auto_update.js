import {EventEmitter} from 'events';
import {dialog, autoUpdater} from 'electron';
import * as path from 'path';

const IdleState = 'idle'
const CheckingState = 'checking'
const DownloadingState = 'downloading'
const UpdateAvailableState = 'update-available'
const NoUpdateAvailableState = 'no-update-available'
const UnsupportedState = 'unsupported'
const ErrorState = 'error'

export class AutoUpdateManager extends EventEmitter {

  constructor(version, testMode, config) {
    super();
    console.log(`create fuck ${version}`);
    this.version, this.testMode, this.config = version, testMode, config;
    console.log(`create fuck ${version}`);
    this.state = IdleState;
    this.iconPath = path.resolve(__dirname, '..', '..', 'resources', 'atom.png');
    this.feedUrl = `https://atom.io/api/updates?version=${this.version}`;
    process.nextTick(() => this.setupAutoUpdater());
  }
  setupAutoUpdater() {
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
    autoUpdater.on('update-available', () => {
      this.setState(DownloadingState);
      // We use sendMessage to send an event called 'update-available' in 'update-downloaded'
      // once the update download is complete. This mismatch between the electron
      // autoUpdater events is unfortunate but in the interest of not changing the
      // one existing event handled by applicationDelegate
      this.emitWindowEvent('did-begin-downloading-update');
      this.emit('did-begin-download');
    })
    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseVersion) => {
      this.releaseVersion = releaseVersion;
      this.setState(UpdateAvailableState);
      this.emitUpdateAvailableEvent();
    })
    if (this.config['core.automaticallyUpdate']) {
      this.scheduleUpdateCheck();
    }

    switch(process.platform) {
      case 'win32':
        if (!autoUpdater.supportsUpdates()) {
          this.setState(UnsupportedState)
        }
        break;
      case 'linux':
        this.setState(UnsupportedState);
        break;
    }
  }
  emitUpdateAvailableEvent() {
    if (!this.releaseVersion) {
      this.emitWindowEvent('update-available', this.releaseVersion)
    }
    return
  }
  emitWindowEvent(eventName, payload) {
    for (atomWindow in this.getWindows()) {
      atomWindow.sendMessage(eventName, payload)
    }
    return
  }
  setState(state, errorMessage) {
    if (this.state === state) {
      return;
    }
    this.state = state;
    this.errorMessage = errorMessage;
    this.emit('state-changed', this.state);
  }
  getState() {
    this.state
  }
  getErrorMessage() {
    this.errorMessage
  }
  scheduleUpdateCheck() {
    // Only schedule update check periodically if running in release version and
    // and there is no existing scheduled update check.
    if (!/\w{7}/.test(this.version) || this.checkForUpdatesIntervalID) {
      checkForUpdates = () => this.check(hidePopups: true);
      fourHours = 1000 * 60 * 60 * 4
      this.checkForUpdatesIntervalID = setInterval(checkForUpdates, fourHours)
      checkForUpdates()
    }
  }
  cancelScheduledUpdateCheck() {
    if (this.checkForUpdatesIntervalID) {
      clearInterval(this.checkForUpdatesIntervalID)
      this.checkForUpdatesIntervalID = null
    }
  }
  check({hidePopups}={}) {
    if (!hidePopups) {
      autoUpdater.once('update-not-available', this.onUpdateNotAvailable);
      autoUpdater.once('error', this.onUpdateError);
    }
    if (!this.testMode) {
      autoUpdater.checkForUpdates();
    }
  }
  install() {
    if (!this.testMode) {
      autoUpdater.quitAndInstall();
    }
  }
  onUpdateNotAvailable() {
    autoUpdater.removeListener('error', this.onUpdateError);
    dialog.showMessageBox({
      type: 'info',
      buttons: ['OK'],
      icon: this.iconPath,
      message: 'No update available.',
      title: 'No Update Available',
      detail: `Version ${this.version} is the latest version.`,
    })
  }
  onUpdateError(event, message) {
    autoUpdater.removeListener('update-not-available', this.onUpdateNotAvailable);
    dialog.showMessageBox({
      type: 'warning',
      buttons: ['OK'],
      icon: this.iconPath,
      message: 'There was an error checking for updates.',
      title: 'Update Error',
      detail: message
    });
  }
  getWindows() {
    return global.atomApplication.windows;
  }
}
