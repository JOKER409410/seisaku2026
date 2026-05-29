# seisaku2026

# mimamorukun

GitHubのコミット数・ブランチ作成回数を取得して記録するElectronアプリです。

## 必要なもの

- Node.js
- GitHubアカウント

## セットアップ

### STEP 1　リポジトリをクローン

```bash
git clone https://github.com/あなたのユーザー名/mimamorukun.git
cd mimamorukun
```

---

### STEP 2　GitHub OAuth Appを作成

1. GitHubにログイン
2. 右上のアイコン → **Settings**
3. 左メニュー一番下 → **Developer settings**
4. **OAuth Apps** → **New OAuth App**
5. 以下を入力して **Register application**

| 項目 | 入力値 |
|---|---|
| Application name | `mimamorukun`（任意） |
| Homepage URL | `http://localhost` |
| Authorization callback URL | `http://localhost:8080/callback` |

6. 登録後の画面で **Client ID** をメモ
7. **Generate a new client secret** をクリックして **Client Secret** をメモ
8. **Enable Device Flow** にチェックを入れて **Update application** をクリック

---

### STEP 3　.envファイルを作成

プロジェクトのルートフォルダ（`mimamorukun/`直下）に `.env` という名前のファイルを作成して以下を記入：

```env
GITHUB_CLIENT_ID=ここにClient IDを貼る
GITHUB_CLIENT_SECRET=ここにClient Secretを貼る
```

> ⚠️ `.env` ファイルは絶対にGitHubにプッシュしないでください

---

### STEP 4　依存ライブラリをインストール

```bash
npm install
```

---

### STEP 5　起動

```bash
npm run dev
```

---

## 使い方

### 画面1: 認証
1. **GitHubでログイン** ボタンを押す
2. 画面に表示されたコードをコピーする
3. 自動で開くブラウザのGitHubページにコードを入力する
4. **Authorize** ボタンをクリックする
5. アプリが自動でリポジトリ管理画面に移動する

### 画面2: リポジトリ管理
1. セレクトボックスから登録したいリポジトリを選ぶ
2. **追加** ボタンを押す（最大5個まで登録可能）
3. 不要なリポジトリは **削除** ボタンで削除できる
4. 準備ができたら **次へ →** ボタンで画面3へ

### 画面3: データ取得
1. 取得したいリポジトリにチェックを入れる
2. **データを取得して保存** ボタンを押す
3. プロジェクトフォルダに `github-data.json` が保存される

---

## 取得できるデータ

```json
{
  "owner/repo-name": {
    "commits": {
      "total": 120,
      "byUser": {
        "user1": 80,
        "user2": 40
      }
    },
    "branches": {
      "total": 10,
      "byUser": {
        "user1": 6,
        "user2": 4
      }
    },
    "fetched_at": "2026-05-29T07:00:00.000Z"
  }
}
```

---

## 注意事項

- `.env` ファイルは絶対にGitHubにプッシュしないでください
- `github-data.json` にはリポジトリの情報が含まれるため取り扱いに注意してください