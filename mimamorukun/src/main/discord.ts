import { Pool } from 'pg'
import { createServer } from 'http'
import { shell } from 'electron'
import * as keytar from 'keytar'
import * as dotenv from 'dotenv'
dotenv.config()

// ─── DB接続（mainプロセスのみ。rendererには絶対に漏らさない） ────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// ─── Discord OAuth2設定 ───────────────────────────────────────────────────
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!
const REDIRECT_URI = 'http://localhost:31415/callback'
const KEYTAR_SERVICE = 'mimamorukun-discord'
const KEYTAR_ACCOUNT = 'discord_token'

// ─── テーブル初期化 ───────────────────────────────────────────────────────
export async function initDiscordTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_settings (
      id             SERIAL PRIMARY KEY,
      guild_id       TEXT NOT NULL UNIQUE,
      guild_name     TEXT NOT NULL,
      bot_registered BOOLEAN NOT NULL DEFAULT FALSE,
      registered_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_links (
      id                SERIAL PRIMARY KEY,
      github_username   TEXT NOT NULL,
      discord_user_id   TEXT,
      discord_user_name TEXT,
      repo_full_name    TEXT NOT NULL,
      linked_at         TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(github_username, repo_full_name)
    )
  `)
  console.log('[discord] テーブル初期化完了')
}

// ─── OAuth2: ログイン開始（ブラウザを開く） ───────────────────────────────
export function startDiscordOAuth(): void {
  const url =
    `https://discord.com/api/oauth2/authorize` +
    `?client_id=${DISCORD_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`
  shell.openExternal(url)
}

// ─── OAuth2: コールバック待機→トークン取得→keytar保存 ───────────────────
export async function waitForDiscordCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url!, 'http://localhost:31415')
        const code = url.searchParams.get('code')

        // ブラウザに完了メッセージを返す
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ 認証完了！アプリに戻ってください。</h2></body></html>')
        server.close()

        if (!code) {
          reject(new Error('認証コードが取得できませんでした'))
          return
        }

        // コード → アクセストークンに交換
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
          })
        })

        const tokenData = await tokenRes.json()
        if (!tokenData.access_token) {
          reject(new Error('トークン取得失敗: ' + JSON.stringify(tokenData)))
          return
        }

        // keytarに安全に保存（DB・rendererには渡さない）
        await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, JSON.stringify(tokenData))
        console.log('[discord] OAuth2認証成功')
        resolve(tokenData.access_token)
      } catch (e) {
        reject(e)
      }
    })

    server.listen(31415, () => console.log('[discord] コールバック待機中: port 31415'))
    server.on('error', reject)
  })
}

// ─── 保存済みDiscordトークンを取得 ───────────────────────────────────────
export async function getSavedDiscordToken(): Promise<string | null> {
  const saved = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  if (!saved) return null
  return JSON.parse(saved).access_token
}

// ─── Discordトークンを削除（ログアウト用） ────────────────────────────────
export async function deleteDiscordToken(): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
}

// ─── ユーザーが参加しているGuild一覧を取得 ───────────────────────────────
export async function getUserGuilds(
  accessToken: string
): Promise<{ id: string; name: string }[]> {
  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error('Discordトークンが無効または期限切れです')
  return await res.json()
}

// ─── Botが収集済みのサーバー一覧（messagesテーブル、読み取りのみ） ──────
export async function getAvailableServers(): Promise<
  { guild_id: string; guild_name: string; message_count: number }[]
> {
  const result = await pool.query(`
    SELECT guild_id, guild_name, COUNT(*) AS message_count
    FROM messages
    GROUP BY guild_id, guild_name
    ORDER BY message_count DESC
  `)
  return result.rows.map((r) => ({ ...r, message_count: Number(r.message_count) }))
}

// ─── 登録済みDiscord設定を取得 ────────────────────────────────────────────
export async function getDiscordSettings(): Promise<{
  guild_id: string
  guild_name: string
  bot_registered: boolean
} | null> {
  const result = await pool.query(
    'SELECT guild_id, guild_name, bot_registered FROM discord_settings LIMIT 1'
  )
  return result.rows[0] || null
}

// ─── サーバーを登録 ───────────────────────────────────────────────────────
export async function saveDiscordServer(guildId: string, guildName: string): Promise<void> {
  await pool.query(
    `INSERT INTO discord_settings (guild_id, guild_name, bot_registered)
     VALUES ($1, $2, false)
     ON CONFLICT (guild_id) DO UPDATE SET guild_name = $2`,
    [guildId, guildName]
  )
}

// ─── Bot登録フラグをtrueに更新 ────────────────────────────────────────────
export async function setBotRegistered(guildId: string): Promise<void> {
  await pool.query(
    'UPDATE discord_settings SET bot_registered = true WHERE guild_id = $1',
    [guildId]
  )
}

// ─── 指定サーバーのDiscordユーザー一覧（読み取りのみ） ──────────────────
export async function getDiscordUsers(
  guildId: string
): Promise<{ author_id: string; author_name: string; message_count: number }[]> {
  const result = await pool.query(
    `SELECT author_id, author_name, COUNT(*) AS message_count
     FROM messages
     WHERE guild_id = $1
     GROUP BY author_id, author_name
     ORDER BY message_count DESC`,
    [guildId]
  )
  return result.rows.map((r) => ({ ...r, message_count: Number(r.message_count) }))
}

// ─── アカウント紐付けを取得 ───────────────────────────────────────────────
export async function getAccountLinks(
  repoFullName: string
): Promise<{ github_username: string; discord_user_id: string | null; discord_user_name: string | null }[]> {
  const result = await pool.query(
    'SELECT github_username, discord_user_id, discord_user_name FROM account_links WHERE repo_full_name = $1',
    [repoFullName]
  )
  return result.rows
}

// ─── アカウント紐付けを保存 ───────────────────────────────────────────────
export async function saveAccountLink(
  githubUsername: string,
  discordUserId: string,
  discordUserName: string,
  repoFullName: string
): Promise<void> {
  await pool.query(
    `INSERT INTO account_links (github_username, discord_user_id, discord_user_name, repo_full_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (github_username, repo_full_name) DO UPDATE
       SET discord_user_id = $2, discord_user_name = $3, linked_at = NOW()`,
    [githubUsername, discordUserId, discordUserName, repoFullName]
  )
}

// ─── GitHubユーザー名をaccount_linksに登録（紐付け前の雛形） ─────────────
export async function saveGithubUsersToDB(
  repoFullName: string,
  githubUsernames: string[]
): Promise<void> {
  for (const username of githubUsernames) {
    await pool.query(
      `INSERT INTO account_links (github_username, repo_full_name)
       VALUES ($1, $2)
       ON CONFLICT (github_username, repo_full_name) DO NOTHING`,
      [username, repoFullName]
    )
  }
}

// ─── Discordメッセージ数をスコアとして返す ───────────────────────────────
export async function calcDiscordScores(
  guildId: string
): Promise<{ author_id: string; author_name: string; score: number }[]> {
  const users = await getDiscordUsers(guildId)
  return users.map((u) => ({
    author_id: u.author_id,
    author_name: u.author_name,
    score: u.message_count
  }))
}
