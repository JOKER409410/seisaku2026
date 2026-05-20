import { shell } from 'electron'
import * as keytar from 'keytar'
import * as http from 'http'
import * as dotenv from 'dotenv'
dotenv.config()

const CLIENT_ID = process.env.GITHUB_CLIENT_ID!
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!
const REDIRECT_URI = 'http://localhost:8080/callback'
const SCOPE = 'read:org,repo'
const SERVICE_NAME = 'mimamorukun'
const ACCOUNT_NAME = 'github_token'

// 保存済みトークンを取得
export async function getSavedToken(): Promise<string | null> {
  const saved = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
  if (!saved) return null
  const tokenData = JSON.parse(saved)
  return tokenData.access_token
}

// トークンを削除（ログアウト用）
export async function deleteToken(): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
}

// OAuth認証フローを開始
export async function startOAuthFlow(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/callback')) return

      const url = new URL(req.url, 'http://localhost:8080')
      const code = url.searchParams.get('code')

      if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('認証失敗。コードが取得できませんでした。')
        reject(new Error('code not found'))
        return
      }

      // codeをトークンと交換
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code })
      })

      const tokenData = await tokenRes.json()

      if (tokenData.error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('認証失敗: ' + tokenData.error_description)
        reject(new Error(tokenData.error_description))
        return
      }

      // ユーザー情報を取得
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      })
      const user = await userRes.json()

      // Credential Managerに保存
      await keytar.setPassword(
        SERVICE_NAME,
        ACCOUNT_NAME,
        JSON.stringify({
          access_token: tokenData.access_token,
          scope: tokenData.scope,
          user: user.login,
          saved_at: new Date().toISOString()
        })
      )

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`認証成功！ようこそ ${user.login} さん。このタブは閉じてください。`)
      server.close()
      resolve(tokenData.access_token)
    })

    server.listen(8080, () => {
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPE}&redirect_uri=${REDIRECT_URI}`
      shell.openExternal(authUrl)
    })
  })
}