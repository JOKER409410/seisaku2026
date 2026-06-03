import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // 認証系
      getToken: () => Promise<string | null>
      login: () => Promise<{ userCode: string; verificationUri: string }>
      poll: () => Promise<string>
      logout: () => Promise<void>

      // リポジトリ管理系
      getAllRepos: () => Promise<{ name: string; full_name: string }[]>
      loadRepos: () => Promise<{ name: string; full_name: string; added_at: string }[]>
      addRepo: (repo: { name: string; full_name: string }) => Promise<{ success: boolean; message: string }>
      removeRepo: (fullName: string) => Promise<void>

      // データ取得系
      fetchData: (selectedRepos: string[]) => Promise<string>
      calculateDistortion: (repoName: string) => Promise<{ scores: Record<string, number>; avgScore: number; stdDev: number; distortion: number }>
    }
  }
}