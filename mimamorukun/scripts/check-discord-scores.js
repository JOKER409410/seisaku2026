// ─────────────────────────────────────────────────────────────────────────
// Discordスコアの中身を確認するための単体実行スクリプト
//
// calcDiscordScores()と同じSQL・計算式をそのまま抜き出したもの。
// discord.ts本体はElectron(shell)に依存しているため、動作確認用に
// pgとdotenvだけで完結する形にしてある（Electronを起動せず素のnodeで動く）。
//
// 使い方（mimamorukun/ ディレクトリで実行。.envにDATABASE_URLが必要）:
//   node scripts/check-discord-scores.js                # 登録済み全リポジトリ×サーバーを表示
//   node scripts/check-discord-scores.js <guild_id>      # 特定サーバーだけ表示
// ─────────────────────────────────────────────────────────────────────────

require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

const WEIGHTS = {
  messageCount: 0.3,
  activeDays: 0.25,
  channelCount: 0.15,
  replyCount: 0.15,
  avgContentLength: 0.15
}

async function calcScores(guildId) {
  const result = await pool.query(
    `
    SELECT
      author_id,
      MAX(author_name) AS author_name,
      COUNT(*) AS message_count,
      COUNT(DISTINCT channel_id) AS channel_count,
      COUNT(DISTINCT DATE(message_created_at)) AS active_days,
      COUNT(*) FILTER (WHERE reply_to IS NOT NULL) AS reply_count,
      COALESCE(
        AVG(LEAST(LENGTH(content), 200))
          FILTER (WHERE content IS NOT NULL AND content <> 'EMPTY' AND LENGTH(TRIM(content)) > 0),
        0
      ) AS avg_content_length
    FROM messages
    WHERE guild_id = $1
    GROUP BY author_id
    `,
    [guildId]
  )

  const scored = result.rows.map((r) => {
    const messageCount = Number(r.message_count)
    const activeDays = Number(r.active_days)
    const channelCount = Number(r.channel_count)
    const replyCount = Number(r.reply_count)
    const avgContentLength = Number(r.avg_content_length)

    const score =
      Math.log(messageCount + 1) * WEIGHTS.messageCount +
      Math.log(activeDays + 1) * WEIGHTS.activeDays +
      Math.log(channelCount + 1) * WEIGHTS.channelCount +
      Math.log(replyCount + 1) * WEIGHTS.replyCount +
      Math.log(avgContentLength + 1) * WEIGHTS.avgContentLength

    return {
      author_name: r.author_name,
      author_id: r.author_id,
      score: Number(score.toFixed(3)),
      messageCount,
      activeDays,
      channelCount,
      replyCount,
      avgContentLength: Number(avgContentLength.toFixed(1))
    }
  })

  // グラフ表示用: サーバー内でのmin-max正規化(0〜100%、最下位=0%・最上位=100%)
  const scoreValues = scored.map((s) => s.score)
  const min = Math.min(...scoreValues)
  const max = Math.max(...scoreValues)
  const range = max - min

  return scored
    .map((s) => ({
      ...s,
      scoreX20: Number((s.score * 20).toFixed(2)),
      percentage: range === 0 ? 100 : Number((((s.score - min) / range) * 100).toFixed(1))
    }))
    .sort((a, b) => b.score - a.score)
}

async function main() {
  const guildIdArg = process.argv[2]

  if (guildIdArg) {
    console.log(`\n=== サーバーID: ${guildIdArg} ===`)
    console.table(await calcScores(guildIdArg))
    await pool.end()
    return
  }

  // 引数なし → discord_settingsに登録済みの全リポジトリ×サーバーをまとめて表示
  const r = await pool.query(
    'SELECT DISTINCT repo_full_name, guild_id, guild_name FROM discord_settings ORDER BY repo_full_name'
  )
  if (r.rows.length === 0) {
    console.log('discord_settingsに登録済みのサーバーがありません。guild_idを引数で指定してください。')
    await pool.end()
    return
  }
  for (const row of r.rows) {
    console.log(
      `\n=== リポジトリ: ${row.repo_full_name || '(未設定)'} / サーバー: ${row.guild_name}(${row.guild_id}) ===`
    )
    console.table(await calcScores(row.guild_id))
  }
  await pool.end()
}

main().catch((e) => {
  console.error('エラー:', e)
  process.exit(1)
})
