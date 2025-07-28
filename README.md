# experience_repo

## GitHub ActionsによるPR設計書リンク自動集約

このリポジトリには、GitHub Actionsを使用してPRの設計書リンクを自動的に集約する機能が実装されています。

### 機能概要

特定のブランチ（mainやdevelop）にPRがマージされた際、そのPRのDescriptionに記載された設計書のスプレッドシートリンクを自動的に抽出し、同じブランチをベースとする現在オープンなすべてのPRのDescriptionに追記します。

### 使用方法

#### 1. PR Descriptionのフォーマット

マージするPRのDescriptionには以下の固定フォーマットで設計書リンクを記載してください：

```markdown
# 設計書一覧

* [機能A設計書](https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit)
* [機能B設計書](https://docs.google.com/spreadsheets/d/YYYYYYYYYYYYYYYYYYYY/edit)
```

**重要事項：**
- `# 設計書一覧` の見出しを使用してください
- 各リンクは Markdown のリスト形式 (`* [リンク名](URL)`) で記述してください
- Google スプレッドシートのURL (`https://docs.google.com/spreadsheets/d/...`) を使用してください

#### 2. 動作の流れ

1. **PRマージ**: mainまたはdevelopブランチにPRがマージされる
2. **自動実行**: GitHub Actionsワークフローが自動的に実行される
3. **リンク抽出**: マージされたPRのDescriptionから設計書リンクを抽出
4. **関連PR特定**: 同じベースブランチを持つオープンなPRを特定
5. **自動更新**: 関連PRのDescriptionに`# 集約設計書一覧`セクションを追加・更新

#### 3. 設定可能なブランチ

現在、以下のブランチで動作するように設定されています：
- `main`
- `develop`

必要に応じて`.github/workflows/update-related-prs.yml`ファイルの`branches`セクションを編集してください。

### ファイル構成

```
.github/
├── workflows/
│   └── update-related-prs.yml  # GitHub Actionsワークフロー
└── pull_request_template.md    # PRテンプレート（設計書項目のみ）
naiyou.md                       # 詳細な実装ドキュメント
README.md                       # このファイル
```

### 動作確認

1. テスト用のPRを作成し、Descriptionに設計書リンクを記載
2. 同じベースブランチに別のオープンなPRを作成
3. 最初のPRをマージ
4. 2番目のPRのDescriptionが自動更新されることを確認

### トラブルシューティング

- GitHub Actionsの実行ログを確認してエラーの詳細を確認してください
- PRのDescriptionフォーマットが正しいか確認してください
- GitHub Tokenの権限設定を確認してください（通常は自動で設定されます）

### PRテンプレートの使用方法

このリポジトリには実験プロジェクト用のシンプルなPRテンプレートが用意されています：

#### PRテンプレート (`.github/pull_request_template.md`)
- 設計書リンクの記載に特化したシンプルなテンプレート
- 実験プロジェクトに適した最小限の構成
- 自動集約機能との連携で情報共有を効率化

#### テンプレートの使用方法
PR作成時に、以下のいずれかの方法でテンプレートを使用できます：
- ブラウザ上でPRを作成する際に、テンプレートが自動的に適用されます
- または、手動でテンプレートの内容をコピーして使用してください

### 設計書リンクの記載について

テンプレートには「設計書一覧」セクションが含まれており、以下のフォーマットで設計書リンクを記載してください：

```markdown
* [設計書名](https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit)
```

このセクションに記載されたリンクは、PRがマージされた際に自動的に他の関連PRに集約されます。

詳細な実装については`naiyou.md`を参照してください。
