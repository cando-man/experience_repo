# PR関連スクリプト

このディレクトリには、GitHub Actionsワークフローで使用されるPR関連のユーティリティ関数が含まれています。

## ファイル構成

- `pr-utils.js` - PR関連のユーティリティ関数
- `README.md` - このファイル

## 最適化内容

### 1. モジュール化
- 重複していたコードを`pr-utils.js`に集約
- 各機能を独立した関数として分離
- 再利用可能なコンポーネントとして設計

### 2. エラーハンドリングの改善
- より詳細なエラーメッセージ
- 適切なエラー処理の実装
- 個別のPR更新エラーが全体の処理を停止しない設計

### 3. パフォーマンスの向上
- 不要なデバッグログの削減
- 効率的なデータ処理
- 環境変数の適切な使用

### 4. 可読性の向上
- JSDocコメントの追加
- 関数名の明確化
- コードの構造化

### 5. メンテナンス性の向上
- 単一責任の原則に従った関数設計
- テストしやすい構造
- 設定の外部化

## 主要な関数

### `getPRFromContext(github, context)`
コンテキストからPRオブジェクトを取得します。複数の方法でPRを取得し、フォールバック機能を提供します。

### `extractDesignDocs(prBody)`
PR本文から設計書リンクを抽出します。複数のパターンで設計書セクションを検索し、Googleスプレッドシートのリンクを抽出します。

### `findOpenPRsToBaseBranch(github, context, baseBranch, mergedPrNumber)`
指定されたベースブランチに対してオープンなPRを検索します。マージされたPRを除外します。

### `updatePRWithDesignDocs(github, context, targetPrNumbers, designDocs)`
指定されたPRに設計書情報を追加します。既存の設計書セクションがある場合は更新し、ない場合は新規作成します。

## 使用方法

```javascript
const { 
  getPRFromContext, 
  extractDesignDocs, 
  findOpenPRsToBaseBranch, 
  updatePRWithDesignDocs 
} = require('./scripts/pr-utils');

// PRオブジェクトの取得
const pr = await getPRFromContext(github, context);

// 設計書の抽出
const designDocs = extractDesignDocs(pr.body);

// 対象PRの検索
const targetPRs = await findOpenPRsToBaseBranch(github, context, baseBranch, mergedPrNumber);

// PRの更新
const result = await updatePRWithDesignDocs(github, context, targetPrNumbers, designDocs);
```

## 環境変数の使用

メモリに記録されている通り、GitHub Actionsワークフローでは`actions/github-script`を使用する際、ステップ間で値を渡す場合は`process.env.<variable>`を使用することが推奨されています。

```javascript
// 推奨
const baseBranch = process.env.base_branch;

// 非推奨
const baseBranch = core.getInput('base_branch');
```

## 今後の改善点

1. **テストの追加**: 各関数に対するユニットテストの実装
2. **設定の外部化**: 正規表現パターンや設定値を設定ファイルに移動
3. **ログレベルの制御**: デバッグログの有効/無効を設定可能に
4. **並列処理**: 複数PRの更新を並列で実行してパフォーマンス向上
5. **リトライ機能**: API呼び出し失敗時の自動リトライ機能 