import { shell } from 'electron'
import * as keytar from 'keytar'
import * as dotenv from 'dotenv'
dotenv.config()

const CLIENT_ID = process.env.GITHUB_CLIENT_ID!
const SCOPE = 'read:org,repo'
const SERVICE_NAME = 'mimamorukun'
const ACCOUNT_NAME = 'github_token'

// device_codeを一時保存
let _deviceCode = ''
let _interval = 5

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

// デバイスフローを開始
export async function startOAuthFlow(): Promise<{ userCode: string; verificationUri: string }> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE })
  })

  const data = await res.json()
  console.log('デバイスフロー開始:', data)

  // device_codeとintervalを保存
  _deviceCode = data.device_code
  _interval = data.interval || 5

  // ブラウザでGitHubの入力ページを開く
  shell.openExternal(data.verification_uri)

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri
  }
}

// ユーザーが認証するまでポーリング
export async function pollForToken(): Promise<string> {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, _interval * 1000))

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: _deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })

    const data = await res.json()
    console.log('ポーリング結果:', data)

    if (data.access_token) {
      // ユーザー情報を取得
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${data.access_token}` }
      })
      const user = await userRes.json()

      // Credential Managerに保存
      await keytar.setPassword(
        SERVICE_NAME,
        ACCOUNT_NAME,
        JSON.stringify({
          access_token: data.access_token,
          scope: data.scope,
          user: user.login,
          saved_at: new Date().toISOString()
        })
      )

      console.log('認証成功:', user.login)
      return data.access_token
    }

    if (data.error && data.error !== 'authorization_pending') {
      throw new Error(data.error)
    }
  }
}