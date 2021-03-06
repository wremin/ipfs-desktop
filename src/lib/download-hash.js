import path from 'path'
import fs from 'fs-extra'
import isIPFS from 'is-ipfs'
import { clipboard, app, shell, dialog, globalShortcut } from 'electron'
import { store, logger, logo, i18n, notify, notifyError } from '../utils'
import { createToggler } from './utils'

const settingsOption = 'downloadHashShortcut'
const shortcut = 'CommandOrControl+Alt+D'

function validateIPFS (text) {
  return isIPFS.multihash(text) ||
    isIPFS.cid(text) ||
    isIPFS.ipfsPath(text) ||
    isIPFS.ipfsPath(`/ipfs/${text}`)
}

function selectDirectory () {
  return new Promise(resolve => {
    dialog.showOpenDialog({
      title: 'Select a directory',
      defaultPath: app.getPath('downloads'),
      properties: [
        'openDirectory',
        'createDirectory'
      ]
    }, (res) => {
      if (!res || res.length === 0) {
        resolve()
      } else {
        resolve(res[0])
      }
    })
  })
}

async function saveFile (dir, file) {
  const location = path.join(dir, file.path)
  await fs.outputFile(location, file.content)
  logger.info(`File '${file.path}' downloaded to ${location}.`)
}

function handler (ctx) {
  const { getIpfsd } = ctx

  return async () => {
    const text = clipboard.readText().trim()
    const ipfsd = getIpfsd()

    if (!ipfsd || !text) {
      return
    }

    if (!validateIPFS(text)) {
      notify({
        title: i18n.t('cantDownloadHash'),
        body: i18n.t('invalidHashProvided'),
        icon: logo('black')
      })
      return
    }

    const dir = await selectDirectory(ctx)

    if (!dir) {
      logger.info(`Dropping hash ${text}: user didn't choose a path.`)
      return
    }

    let files

    try {
      logger.info(`Downloading ${text}: started`)
      files = await ipfsd.api.get(text)
      logger.info(`Downloading ${text}: completed`)
    } catch (e) {
      logger.error(e.stack)

      notifyError({
        title: i18n.t('cantDownloadHash'),
        body: i18n.t('errorWhileDownloadingHash')
      })
    }

    try {
      if (files.length > 1) {
        files.splice(0, 1)
      }

      await Promise.all(files.map(file => saveFile(dir, file)))

      notify({
        title: i18n.t('hashDownloaded'),
        body: i18n.t('hashDownloadedClickToView', { hash: text })
      }, () => {
        shell.showItemInFolder(path.join(dir, text))
      })
    } catch (e) {
      logger.error(e.stack)

      notifyError({
        title: i18n.t('cantDownloadHash'),
        body: i18n.t('errorWhileWritingFiles')
      })
    }
  }
}

export default function (ctx) {
  let activate = (value, oldValue) => {
    if (value === oldValue) return

    if (value === true) {
      globalShortcut.register(shortcut, handler(ctx))
      logger.info('Hash download shortcut: enabled')
    } else {
      globalShortcut.unregister(shortcut)
      logger.info('Hash download shortcut: disabled')
    }
  }

  activate(store.get(settingsOption, false))
  createToggler(ctx, settingsOption, activate)
}
