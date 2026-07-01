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
      calculateDistortion: (repoName: string) => Promise<{
        scores: Record<string, number>
        avgScore: number
        stdDev: number
        distortion: number
      }>

      // Discord系
      discord: {
        getAvailableServers: () => Promise<{ guild_id: string; guild_name: string; message_count: number }[]>
        getSettings: () => Promise<{ guild_id: string; guild_name: string; bot_registered: boolean } | null>
        saveServer: (guildId: string, guildName: string) => Promise<void>
        setBotRegistered: (guildId: string) => Promise<void>
        getDiscordUsers: (guildId: string) => Promise<{ author_id: string; author_name: string; message_count: number }[]>
        getAccountLinks: (repoFullName: string) => Promise<{ github_username: string; discord_user_id: string | null; discord_user_name: string | null }[]>
        saveAccountLink: (githubUsername: string, discordUserId: string, discordUserName: string, repoFullName: string) => Promise<void>
        saveGithubUsers: (repoFullName: string, githubUsernames: string[]) => Promise<void>
        calcScores: (guildId: string) => Promise<{ author_id: string; author_name: string; score: number }[]>
      }
    }
  }
}
