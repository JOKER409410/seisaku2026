import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFileSync } from 'fs'
import icon from '../../resources/icon.png?asset'
import { startOAuthFlow, getSavedToken, deleteToken, pollForToken } from './auth'
import { getRepositories, fetchAndSaveData, getOutputPath, calculateDistortion } from './github'
import { loadRepos, addRepo, removeRepo } from './repos'
import {
  initDiscordTables,
  getAvailableServers,
  getDiscordSettings,
  saveDiscordServer,
  setBotRegistered,
  getDiscordUsers,
  getAccountLinks,
  saveAccountLink,
  saveGithubUsersToDB,
  calcDiscordScores
} from './discord'

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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Discord用テーブルをアプリ起動時に初期化
  try {
    await initDiscordTables()
  } catch (e) {
    console.error('[discord] テーブル初期化失敗:', e)
  }

  // ─── 認証系 ───────────────────────────────────────
  ipcMain.handle('auth:getToken', async () => {
    return await getSavedToken()
  })
  ipcMain.handle('auth:login', async () => {
    return await startOAuthFlow()
  })
  ipcMain.handle('auth:poll', async () => {
    return await pollForToken()
  })
  ipcMain.handle('auth:logout', async () => {
    await deleteToken()
  })

  // ─── リポジトリ管理系 ──────────────────────────────
  ipcMain.handle('repos:getAll', async () => {
    const token = await getSavedToken()
    if (!token) throw new Error('未認証です')
    return await getRepositories(token)
  })
  ipcMain.handle('repos:load', () => {
    return loadRepos()
  })
  ipcMain.handle('repos:add', (_, repo: { name: string; full_name: string }) => {
    return addRepo(repo)
  })
  ipcMain.handle('repos:remove', (_, fullName: string) => {
    removeRepo(fullName)
  })

  // ─── データ取得系 ──────────────────────────────────
  ipcMain.handle('github:fetch', async (_, selectedRepos: string[]) => {
    const token = await getSavedToken()
    if (!token) throw new Error('未認証です')
    await fetchAndSaveData(token, selectedRepos)
    return getOutputPath()
  })
  ipcMain.handle('github:calculateDistortion', async (_, repoName: string) => {
    const outputPath = getOutputPath()
    const data = JSON.parse(readFileSync(outputPath, 'utf-8'))
    if (!data[repoName]) throw new Error(`データが見つかりません: ${repoName}`)
    const repoData = data[repoName]
    return calculateDistortion(repoData.commits.byUser, repoData.branches.byUser)
  })

  // ─── Discord系 ────────────────────────────────────
  // Botが収集済みのサーバー一覧（messagesテーブル、読み取りのみ）
  ipcMain.handle('discord:getAvailableServers', async () => {
    return await getAvailableServers()
  })

  // 登録済みDiscord設定を取得
  ipcMain.handle('discord:getSettings', async () => {
    return await getDiscordSettings()
  })

  // サーバーを登録
  ipcMain.handle('discord:saveServer', async (_, guildId: string, guildName: string) => {
    await saveDiscordServer(guildId, guildName)
  })

  // Bot登録フラグをtrueに更新
  ipcMain.handle('discord:setBotRegistered', async (_, guildId: string) => {
    await setBotRegistered(guildId)
  })

  // 指定サーバーのDiscordユーザー一覧
  ipcMain.handle('discord:getDiscordUsers', async (_, guildId: string) => {
    return await getDiscordUsers(guildId)
  })

  // アカウント紐付けを取得
  ipcMain.handle('discord:getAccountLinks', async (_, repoFullName: string) => {
    return await getAccountLinks(repoFullName)
  })

  // アカウント紐付けを保存
  ipcMain.handle(
    'discord:saveAccountLink',
    async (_, githubUsername: string, discordUserId: string, discordUserName: string, repoFullName: string) => {
      await saveAccountLink(githubUsername, discordUserId, discordUserName, repoFullName)
    }
  )

  // github-data.jsonのGitHubユーザー名をDBに保存
  ipcMain.handle(
    'discord:saveGithubUsers',
    async (_, repoFullName: string, githubUsernames: string[]) => {
      await saveGithubUsersToDB(repoFullName, githubUsernames)
    }
  )

  // Discordスコアを計算
  ipcMain.handle('discord:calcScores', async (_, guildId: string) => {
    return await calcDiscordScores(guildId)
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
