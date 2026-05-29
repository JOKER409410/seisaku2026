import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const REPOS_FILE = join(app.getPath('userData'), 'repos.json')
const MAX_REPOS = 5

export interface Repository {
  name: string
  full_name: string
  added_at: string
}

// 登録済みリポジトリを読み込む
export function loadRepos(): Repository[] {
  if (!existsSync(REPOS_FILE)) return []
  return JSON.parse(readFileSync(REPOS_FILE, 'utf-8'))
}

// リポジトリを追加
export function addRepo(repo: { name: string; full_name: string }): { success: boolean; message: string } {
  const repos = loadRepos()

  if (repos.length >= MAX_REPOS) {
    return { success: false, message: `登録できるリポジトリは最大${MAX_REPOS}個までです` }
  }

  if (repos.find((r) => r.full_name === repo.full_name)) {
    return { success: false, message: 'すでに登録されています' }
  }

  repos.push({ ...repo, added_at: new Date().toISOString() })
  writeFileSync(REPOS_FILE, JSON.stringify(repos, null, 2), 'utf-8')
  return { success: true, message: '登録しました' }
}

// リポジトリを削除
export function removeRepo(fullName: string): void {
  const repos = loadRepos().filter((r) => r.full_name !== fullName)
  writeFileSync(REPOS_FILE, JSON.stringify(repos, null, 2), 'utf-8')
}