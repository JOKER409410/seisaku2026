import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { startOAuthFlow, getSavedToken, deleteToken, pollForToken } from './auth'
import { getRepositories, fetchAndSaveData, getOutputPath } from './github'
import { loadRepos, addRepo, removeRepo } from './repos'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ─── 認証系 ───────────────────────────────────────

  // 保存済みトークンを取得
  ipcMain.handle('auth:getToken', async () => {
    return await getSavedToken()
  })

  // デバイスフロー開始（ユーザーコードを返す）
  ipcMain.handle('auth:login', async () => {
  return await startOAuthFlow()
})

  // ユーザーが認証するまでポーリング
  ipcMain.handle('auth:poll', async () => {
    return await pollForToken()
  })

  // ログアウト
  ipcMain.handle('auth:logout', async () => {
    await deleteToken()
  })

  // ─── リポジトリ管理系 ──────────────────────────────

  // GitHubからリポジトリ一覧を取得
  ipcMain.handle('repos:getAll', async () => {
    const token = await getSavedToken()
    if (!token) throw new Error('未認証です')
    return await getRepositories(token)
  })

  // 登録済みリポジトリを取得
  ipcMain.handle('repos:load', () => {
    return loadRepos()
  })

  // リポジトリを追加
  ipcMain.handle('repos:add', (_, repo: { name: string; full_name: string }) => {
    return addRepo(repo)
  })

  // リポジトリを削除
  ipcMain.handle('repos:remove', (_, fullName: string) => {
    removeRepo(fullName)
  })

  // ─── データ取得系 ──────────────────────────────────

  // 選択したリポジトリのデータを取得してJSONに保存
  ipcMain.handle('github:fetch', async (_, selectedRepos: string[]) => {
    const token = await getSavedToken()
    if (!token) throw new Error('未認証です')
    await fetchAndSaveData(token, selectedRepos)
    return getOutputPath()
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})