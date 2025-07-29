# experience_repo

## GitHub ActionsによるPR設計書リンク自動集約

このリポジトリには、GitHub Actionsを使用してPRの設計書リンクを自動的に集約する機能が実装されています。

### 機能概要

特定のブランチ（mainやdevelop）にPRがマージされた際、そのPRのDescriptionに記載された設計書のスプレッドシートリンクを自動的に抽出し、**マージされたPRのベースブランチが他のPRのヘッドブランチとなっているオープンなPR**のDescriptionに追記します。

### 使用方法

#### 1. PR Descriptionのフォーマット

マージするPRのDescriptionには以下の固定フォーマットで設計書リンクを記載してください：

```markdown
## 設計書一覧

* [機能A設計書](https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit)
* [機能B設計書](https://docs.google.com/spreadsheets/d/YYYYYYYYYYYYYYYYYYYY/edit)
```

**重要事項：**
- `## 設計書一覧` の見出しを使用してください
- 各リンクは Markdown のリスト形式 (`* [リンク名](URL)`) で記述してください
- Google スプレッドシートのURL (`https://docs.google.com/spreadsheets/d/...`) を使用してください

#### 2. 動作の流れ

1. **PRマージ**: main、develop、またはその派生ブランチにPRがマージされる
2. **自動実行**: GitHub Actionsワークフローが自動的に実行される
3. **リンク抽出**: マージされたPRのDescriptionから設計書リンクを抽出
4. **関連PR特定**: **マージされたPRのベースブランチが他のPRのヘッドブランチとなっているオープンなPR**を特定
5. **自動更新**: 関連PRのDescriptionに`## 関連設計書`セクションを追加

#### 3. 設定可能なブランチ

現在、以下のブランチで動作するように設定されています：
- `main`
- `develop`
- `develop/*`
- `release/*`
- `hotfix/*`

必要に応じて`.github/workflows/update-related-prs.yml`ファイルの`branches`セクションを編集してください。

### ファイル構成

```
.github/
└── workflows/
    └── update-related-prs.yml  # GitHub Actionsワークフロー
naiyou.md                       # 詳細な実装ドキュメント
README.md                       # このファイル
```

### 動作確認

#### 例：ブランチ構造での動作

```
main
├── develop/test (PR#1: develop/test → main)
│   └── feature/test (PR#2: feature/test → develop/test)
```

1. **PR#2をマージ**: `feature/test` → `develop/test`
2. **PR#1が更新される**: PR#2のベースブランチ（`develop/test`）がPR#1のヘッドブランチとなっているため

#### テスト手順

1. テスト用のPRを作成し、Descriptionに設計書リンクを記載
2. **マージされたPRのベースブランチがヘッドブランチとなっている別のオープンなPR**を作成
3. 最初のPRをマージ
4. 2番目のPRのDescriptionが自動更新されることを確認

### トラブルシューティング

#### よくある問題

1. **関連PRが見つからない場合**
   - 対象PRが**マージされたPRのベースブランチをヘッドブランチとしている**か確認してください
   - 例：PR#2（`feature/test` → `develop/test`）がマージされた場合、PR#1（`develop/test` → `main`）が更新される

2. **設計書リンクが抽出されない場合**
   - PRのDescriptionに`## 設計書一覧`セクションがあるか確認してください
   - リンクが正しいMarkdown形式で記載されているか確認してください

3. **GitHub Actionsが失敗する場合**
   - GitHub Actionsの実行ログを確認してエラーの詳細を確認してください
   - GitHub Tokenの権限設定を確認してください（通常は自動で設定されます）

#### デバッグ情報

ワークフローは詳細なログを出力します：
- 抽出された設計書リンクの一覧
- 見つかった関連PRの一覧（ベースブランチとヘッドブランチ情報含む）
- 更新されたPRの統計情報（成功数、エラー数）

### 技術的な詳細

#### ワークフローの構成

1. **Get Merged PR Details**: マージされたPRから設計書情報とベースブランチ情報を抽出
2. **Find All Open PRs**: マージされたPRのベースブランチが他のPRのヘッドブランチとなっているオープンPRを検索
3. **Update Target PR Descriptions**: 対象PRに設計書セクションを追加

#### 検索ロジック

- **対象**: マージされたPRのベースブランチが他のPRのヘッドブランチとなっているオープンなPR
- **除外**: マージされたPR自体
- **重複防止**: 既に`## 関連設計書`セクションがあるPRはスキップ

### 設計書リンクの記載について

PRのDescriptionには以下のセクションを含めてください：

```markdown
## 設計書一覧

* [設計書名](https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit)
```

このセクションに記載されたリンクは、PRがマージされた際に自動的に他の関連PRに集約され、以下の形式で追加されます：

```markdown
## 関連設計書

* [設計書名](https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit)
```

詳細な実装については`naiyou.md`を参照してください。
