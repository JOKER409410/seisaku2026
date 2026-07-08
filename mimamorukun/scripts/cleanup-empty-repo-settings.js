// ─────────────────────────────────────────────────────────────────────────
// discord_settingsテーブルに残った「repo_full_name = ''（未設定）」の行を
// 確認・削除するスクリプト。
//
// 経緯: repo_full_nameカラムを後から追加した際のマイグレーションで
// DEFAULT ''にしていたため、それ以前に登録されていた行だけ repo_full_name が
// 空文字のまま残っている。中身は他の行と同じサーバー情報の複製なので、
// 消しても他のリポジトリの設定には影響しない。
//
// 使い方（mimamorukun/ ディレクトリで実行。.envにDATABASE_URLが必要）:
//   node scripts/cleanup-empty-repo-settings.js         # 対象行を表示するだけ（削除しない）
//   node scripts/cleanup-empty-repo-settings.js --delete # 実際に削除する
// ─────────────────────────────────────────────────────────────────────────

require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function main() {
  const shouldDelete = process.argv.includes('--delete')

  const target = await pool.query(
    `SELECT id, repo_full_name, guild_id, guild_name, bot_registered, registered_at
     FROM discord_settings
     WHERE repo_full_name = ''`
  )

  if (target.rows.length === 0) {
    console.log('repo_full_nameが空文字の行はありません。何もしません。')
    await pool.end()
    return
  }

  console.log(`対象: ${target.rows.length}件`)
  console.table(target.rows)

  if (!shouldDelete) {
    console.log('\n削除は実行していません。削除する場合は --delete を付けて再実行してください。')
    console.log('例: node scripts/cleanup-empty-repo-settings.js --delete')
    await pool.end()
    return
  }

  const result = await pool.query(`DELETE FROM discord_settings WHERE repo_full_name = ''`)
  console.log(`\n${result.rowCount}件削除しました。`)
  await pool.end()
}

main().catch((e) => {
  console.error('エラー:', e)
  process.exit(1)
})
