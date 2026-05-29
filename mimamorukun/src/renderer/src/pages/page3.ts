import { showPage } from '../utils/dom'

// 画面3のチェックボックスを更新
export async function renderCheckList(): Promise<void> {
  const checkList = document.getElementById('checkList')
  if (!checkList) return

  const repos = await window.api.loadRepos()
  checkList.innerHTML = ''

  if (repos.length === 0) {
    checkList.innerHTML = '<li>登録されていません</li>'
    return
  }

  for (const repo of repos) {
    const li = document.createElement('li')
    li.innerHTML = `
      <label>
        <input type="checkbox" class="repoCheckbox" value="${repo.full_name}" checked />
        ${repo.full_name}
      </label>
    `
    checkList.appendChild(li)
  }
}

export function setupPage3(): void {
  const fetchBtn = document.getElementById('fetchBtn')
  const toPage2Btn = document.getElementById('toPage2Btn')

  // 前へボタン
  toPage2Btn?.addEventListener('click', () => {
    showPage('page2')
  })

  // データ取得ボタン
  fetchBtn?.addEventListener('click', async () => {
    const fetchStatus = document.getElementById('fetchStatus')
    const checkboxes = document.querySelectorAll<HTMLInputElement>('.repoCheckbox:checked')
    const selected = Array.from(checkboxes).map((cb) => cb.value)

    if (selected.length === 0) {
      if (fetchStatus) fetchStatus.innerText = 'リポジトリを選択してください'
      return
    }

    if (fetchStatus) fetchStatus.innerText = '取得中...'
    const outputPath = await window.api.fetchData(selected)
    if (fetchStatus) fetchStatus.innerText = `保存完了: ${outputPath}`
  })
}