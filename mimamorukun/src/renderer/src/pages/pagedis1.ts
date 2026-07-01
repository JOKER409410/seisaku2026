import { showPage } from '../utils/dom'
import { selectedRepoName } from './pagegit3'

// 選択中のDiscordサーバー情報（pagedis2から参照できるようにexport）
export let selectedGuildId: string = ''
export let selectedGuildName: string = ''

// ─── Discord全体フロー開始（pagegit3から呼び出す） ───────────────────────
// スキップ判定を行い、適切なページへ遷移する
export async function initDiscordFlow(): Promise<void> {
  const settings = await window.api.discord.getSettings()

  if (settings?.bot_registered) {
    // サーバーもBotも登録済み → アカウント紐付け確認へ直接飛ぶ
    selectedGuildId = settings.guild_id
    selectedGuildName = settings.guild_name
    await goToLinkingPage()
    return
  }

  if (settings?.guild_id) {
    // サーバーは登録済みだがBotが未確認 → Bot登録確認ページへ
    selectedGuildId = settings.guild_id
    selectedGuildName = settings.guild_name
    await renderBotConfirmPage()
    showPage('pagedis2')
    return
  }

  // 未登録 → サーバー選択ページを表示
  await renderServerList()
  showPage('pagedis1')
}

// ─── サーバー一覧を描画 ───────────────────────────────────────────────────
async function renderServerList(): Promise<void> {
  const list = document.getElementById('serverList')
  const msgEl = document.getElementById('serverMessage')
  const selectBtn = document.getElementById('selectServerBtn') as HTMLButtonElement

  if (!list) return

  list.innerHTML = '<li>読み込み中...</li>'
  if (msgEl) msgEl.innerText = ''

  try {
    const servers = await window.api.discord.getAvailableServers()

    if (servers.length === 0) {
      list.innerHTML = '<li>Botが参加しているサーバーが見つかりません。Botを先にDiscordに追加してください。</li>'
      return
    }

    list.innerHTML = ''

    for (const server of servers) {
      const li = document.createElement('li')
      li.innerHTML = `
        <label class="server-item">
          <input type="radio" name="serverRadio" class="serverRadio"
                 value="${server.guild_id}" data-name="${server.guild_name}" />
          <span><strong>${server.guild_name}</strong>（メッセージ数: ${server.message_count}）</span>
        </label>
      `
      list.appendChild(li)
    }

    // 1件だけなら自動選択
    const radios = list.querySelectorAll<HTMLInputElement>('.serverRadio')
    if (radios.length === 1) {
      radios[0].checked = true
    }

    if (selectBtn) selectBtn.style.display = 'inline-block'
  } catch (e) {
    list.innerHTML = '<li style="color:red;">サーバー一覧の取得に失敗しました</li>'
    console.error(e)
  }
}

// ─── Bot確認ページの内容を描画 ───────────────────────────────────────────
export async function renderBotConfirmPage(): Promise<void> {
  const guildNameEl = document.getElementById('botGuildName')
  const statusEl = document.getElementById('botStatus')
  const countEl = document.getElementById('botMessageCount')

  if (guildNameEl) guildNameEl.innerText = selectedGuildName

  try {
    const users = await window.api.discord.getDiscordUsers(selectedGuildId)
    const totalMessages = users.reduce((sum, u) => sum + u.message_count, 0)

    if (users.length > 0) {
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-ok">✓ Botが正常にデータを収集しています</span>'
      }
      if (countEl) {
        countEl.innerText = `収集済み: ${users.length}人のユーザー、合計 ${totalMessages} 件のメッセージ`
      }
    } else {
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-warn">⚠ このサーバーのメッセージがまだありません。Botが参加しているか確認してください。</span>'
      }
      if (countEl) countEl.innerText = ''
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:red;">状態確認に失敗しました</span>'
  }
}

// ─── アカウント紐付けページへ遷移 ───────────────────────────────────────
export async function goToLinkingPage(): Promise<void> {
  // github-data.jsonのGitHubユーザー名をDBに保存
  try {
    const repoData = await window.api.discord.getAccountLinks(selectedRepoName)
    // まだ何も入っていない場合はgithubデータからユーザー名を登録
    if (repoData.length === 0) {
      const distortion = await window.api.calculateDistortion(selectedRepoName)
      const githubUsernames = Object.keys(distortion.scores)
      await window.api.discord.saveGithubUsers(selectedRepoName, githubUsernames)
    }
  } catch (e) {
    console.error('GitHubユーザー登録失敗:', e)
  }

  // 紐付けページを描画してから遷移
  const { renderLinkingPage } = await import('./pagedis2')
  await renderLinkingPage(selectedGuildId, selectedRepoName)
  showPage('pagedis3')
}

// ─── setupPage4: ボタンのイベント登録（初回1回だけ呼ぶ） ────────────────
export function setupPage4(): void {
  // サーバー選択ページのボタン
  document.getElementById('selectServerBtn')?.addEventListener('click', async () => {
    const selected = document.querySelector<HTMLInputElement>('.serverRadio:checked')
    const msgEl = document.getElementById('serverMessage')

    if (!selected) {
      if (msgEl) msgEl.innerText = 'サーバーを選択してください'
      return
    }

    selectedGuildId = selected.value
    selectedGuildName = selected.dataset.name || ''

    await window.api.discord.saveServer(selectedGuildId, selectedGuildName)

    await renderBotConfirmPage()
    showPage('pagedis2')
  })

  document.getElementById('disBackBtn')?.addEventListener('click', () => {
    showPage('pagegit3')
  })

  // Bot確認ページのボタン
  document.getElementById('botRegisteredBtn')?.addEventListener('click', async () => {
    await window.api.discord.setBotRegistered(selectedGuildId)
    await goToLinkingPage()
  })

  document.getElementById('dis2BackBtn')?.addEventListener('click', () => {
    showPage('pagedis1')
  })
}
