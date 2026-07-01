import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config()

// ─── DB接続（mainプロセスのみ。rendererには絶対に漏らさない） ────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Supabaseはssl必須
})

// ─── テーブル初期化 ───────────────────────────────────────────────────────
export async function initDiscordTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_settings (
      id            SERIAL PRIMARY KEY,
      guild_id      TEXT NOT NULL UNIQUE,
      guild_name    TEXT NOT NULL,
      bot_registered BOOLEAN NOT NULL DEFAULT FALSE,
      registered_at TIMESTAMPTZ DEFAULT NOW()
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

// ─── Botが収集済みのサーバー一覧（messagesテーブルから取得、読み取りのみ） ──
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

// ─── サーバーを登録（bot_registered=falseで初期登録） ────────────────────
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

// ─── アカウント紐付けを保存（上書きあり） ────────────────────────────────
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

// ─── github-data.jsonのGitHubユーザー名をDBに登録（紐付け前の雛形） ──────
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

// ─── Discordのメッセージ数をスコアとして返す ─────────────────────────────
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
