import { clipboard, ipcMain, globalShortcut, nativeImage } from 'electron'
import { store, notify, logger, i18n } from '../utils'
import { createToggler } from './utils'

const settingsOption = 'screenshotShortcut'
const shortcut = 'CommandOrControl+Alt+S'

async function makeScreenshotDir (ipfs) {
  try {
    await ipfs.files.stat('/screenshots')
  } catch (_) {
    await ipfs.files.mkdir('/screenshots')
  }
}

async function onSucess (ipfs, launchWebUI, path, img) {
  const stats = await ipfs.files.stat(path)
  const url = `https://share.ipfs.io/#/${stats.hash}`
  clipboard.writeText(url)

  notify({
    title: i18n.t('screenshotTakenTitle'),
    body: i18n.t('screenshotTakenBody'),
    icon: img.resize({
      width: 200,
      quality: 'good'
    })
  }, () => {
    launchWebUI(`/files${path}`)
  })
}

function onError (e) {
  logger.error(e)

  notify({
    title: i18n.t('screenshotErrorTitle'),
    body: i18n.t('screenshotErrorBody')
  })
}

function handleScreenshot (ctx) {
  let { getIpfsd, launchWebUI } = ctx

  return async (_, output) => {
    const ipfsd = getIpfsd()

    if (!ipfsd) {
      return
    }

    const ipfs = ipfsd.api

    if (!ipfs) {
      logger.info('Daemon not running. Aborting screenshot upload.')
      return
    }

    try {
      await makeScreenshotDir(ipfs)
      const isDir = output.length > 1
      let baseName = `/screenshots/${new Date().toISOString()}`

      if (isDir) {
        baseName += '/'
        await ipfs.files.mkdir(baseName)
      } else {
        baseName += '.png'
      }

      logger.info('Saving screenshots to %s', baseName)
      let lastImage = null

      for (let { name, image } of output) {
        const img = nativeImage.createFromDataURL(image)
        const path = isDir ? `${baseName}${name}.png` : baseName
        await ipfs.files.write(path, img.toPNG(), { create: true })
        lastImage = img
      }

      logger.info('Screenshots saved to %s', baseName)
      onSucess(ipfs, launchWebUI, baseName, lastImage)
    } catch (e) {
      onError(e)
    }
  }
}

export default function (ctx) {
  let { sendToMenubar } = ctx

  let activate = (value, oldValue) => {
    if (value === oldValue) return

    if (value === true) {
      globalShortcut.register(shortcut, () => {
        logger.info('Taking Screenshot')
        sendToMenubar('screenshot')
      })

      logger.info('Screenshot shortcut enabled')
    } else {
      globalShortcut.unregister(shortcut)
      logger.info('Screenshot shortcut disabled')
    }
  }

  activate(store.get(settingsOption, false))
  createToggler(ctx, settingsOption, activate)
  ipcMain.on('screenshot', handleScreenshot(ctx))
}
