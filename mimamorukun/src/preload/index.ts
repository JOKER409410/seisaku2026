import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // ─── 認証系 ───────────────────────────────────────

  // 保存済みトークンを取得
  getToken: (): Promise<string | null> =>
    ipcRenderer.invoke('auth:getToken'),

  // デバイスフロー開始（ユーザーコードを返す）
  login: (): Promise<{ userCode: string; verificationUri: string }> =>
    ipcRenderer.invoke('auth:login'),

  // ユーザーが認証するまでポーリング
  poll: (): Promise<string> =>
    ipcRenderer.invoke('auth:poll'),

  // ログアウト
  logout: (): Promise<void> =>
    ipcRenderer.invoke('auth:logout'),

  // ─── リポジトリ管理系 ──────────────────────────────

  // GitHubからリポジトリ一覧を取得
  getAllRepos: (): Promise<{ name: string; full_name: string }[]> =>
    ipcRenderer.invoke('repos:getAll'),

  // 登録済みリポジトリを取得
  loadRepos: (): Promise<{ name: string; full_name: string; added_at: string }[]> =>
    ipcRenderer.invoke('repos:load'),

  // リポジトリを追加
  addRepo: (repo: { name: string; full_name: string }): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('repos:add', repo),

  // リポジトリを削除
  removeRepo: (fullName: string): Promise<void> =>
    ipcRenderer.invoke('repos:remove', fullName),

  // ─── データ取得系 ──────────────────────────────────

  // 選択したリポジトリのデータを取得してJSONに保存
  fetchData: (selectedRepos: string[]): Promise<string> =>
    ipcRenderer.invoke('github:fetch', selectedRepos),

  // 崩壊度を計算
  calculateDistortion: (repoName: string): Promise<{ scores: Record<string, number>; avgScore: number; stdDev: number; distortion: number }> =>
    ipcRenderer.invoke('github:calculateDistortion', repoName)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}