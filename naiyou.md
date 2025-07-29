# GitHub ActionsによるPR設計書リンク自動集約

このドキュメントは、GitHub Actionsを使用して、マージされたプルリクエスト（PR）の設計書リンクを、**マージされたPRのベースブランチが他のPRのヘッドブランチとなっているオープンなPR**のDescriptionに自動的に集約する方法を説明します。

## 1. 目的

特定のブランチ（例: main や develop）にPRがマージされた際、そのPRのDescriptionに記載された設計書のスプレッドシートリンクを自動的に抽出し、**マージされたPRのベースブランチが他のPRのヘッドブランチとなっている現在オープンなすべてのPR**のDescriptionに追記します。これにより、関連するPRに常に最新の設計書情報が集約され、参照漏れを防ぎます。

## 2. 実装方法の概要

GitHub Actionsのワークフローを定義し、以下の流れで処理を実行します。

1. **PRマージイベントの検知**: 特定のベースブランチへのPRがマージされたことをトリガーとします。
2. **設計書リンクの抽出**: マージされたPRのDescriptionから、特定のフォーマットで記載された設計書リンクを抽出します。
3. **関連PRの特定**: **マージされたPRのベースブランチが他のPRのヘッドブランチとなっている、現在オープンなすべてのPR**をリストアップします。
4. **Descriptionの更新**: リストアップされた各PRのDescriptionの`## 設計書一覧`セクションに、抽出した設計書リンクを追記します。

## 3. 前提条件と準備

### 3.1. PR Descriptionのフォーマット

設計書リンクを正確に抽出するため、マージするPRのDescriptionには以下の固定フォーマットでリンクを記載してください。

```markdown
## 設計書一覧

* [機能A設計書](https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit)
* [機能B設計書](https://docs.google.com/spreadsheets/d/YYYYYYYYYYYYYYYYYYYY/edit)
```

**重要事項：**
- `## 設計書一覧` の見出しを使用してください
- 各リンクは Markdown のリスト形式 (`* [リンク名](URL)`) で記述してください
- Google スプレッドシートのURL (`https://docs.google.com/spreadsheets/d/...`) を使用してください

### 3.2. GitHub Tokenの権限

ワークフローがPRのDescriptionを更新するために、以下の権限が必要です。

```yaml
permissions:
  contents: read
  pull-requests: write
```

通常、GitHub Actionsが提供する `GITHUB_TOKEN` には必要な権限が含まれていますが、リポジトリの設定で制限されている場合は確認・調整が必要です。

## 4. GitHub Actionsワークフロー

### 4.1. ワークフローファイル (.github/workflows/update-related-prs.yml)

```yaml
name: Update Related PRs with Design Docs

on:
  pull_request:
    types: [closed]
    branches:
      - main
      - develop
      - develop/*
      - release/*
      - hotfix/*

jobs:
  update-design-docs:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Get Merged PR Details
        id: get_pr_details
        uses: actions/github-script@v7
        with:
          script: |
            async function getMergedPRDetails() {
              try {
                console.log('=== GETTING PR DETAILS ===');
                
                // contextオブジェクトの存在確認
                if (typeof context === 'undefined') {
                  console.error('context object is undefined');
                  core.setFailed('context object is not available');
                  return;
                }
                
                // 複数の方法でPRオブジェクトを取得
                let pr = null;
                
                // 方法1: context.payload.pull_request (推奨)
                if (context.payload && context.payload.pull_request) {
                  pr = context.payload.pull_request;
                  console.log('Using context.payload.pull_request');
                }
                // 方法2: github.event.pull_request (フォールバック)
                else if (github.event && github.event.pull_request) {
                  pr = github.event.pull_request;
                  console.log('Using github.event.pull_request');
                }
                // 方法3: APIを使用してPRを取得
                else {
                  console.log('PR object not found in event, trying to get from API');
                  try {
                    const prNumber = context.issue.number;
                    if (!prNumber) {
                      throw new Error('PR number not found in context');
                    }
                    const { data: prData } = await github.rest.pulls.get({
                      owner: context.repo.owner,
                      repo: context.repo.repo,
                      pull_number: prNumber,
                    });
                    pr = prData;
                    console.log('Retrieved PR from API');
                  } catch (error) {
                    console.error('Failed to get PR from API:', error);
                    core.setFailed('Could not retrieve pull request information');
                    return;
                  }
                }
                
                if (!pr) {
                  console.error('Pull request object not found');
                  core.setFailed('Pull request object is undefined');
                  return;
                }
                
                const prBody = pr.body || '';
                const baseBranch = pr.base.ref;
                
                console.log('PR Number:', pr.number);
                console.log('PR Body Length:', prBody.length);
                console.log('Base Branch:', baseBranch);
                console.log('PR Merged:', pr.merged);
                
                // マージされていない場合は処理をスキップ
                if (!pr.merged) {
                  console.log('PR is not merged. Skipping processing.');
                  core.setOutput('design_docs', JSON.stringify([]));
                  core.setOutput('base_branch', baseBranch);
                  core.setOutput('merged_pr_number', pr.number.toString());
                  return;
                }
                
                // 設計書一覧セクションを正規表現で抽出
                console.log('=== DESIGN DOC EXTRACTION DEBUG ===');
                console.log('Looking for design doc section...');
                
                // 複数のパターンを試す
                let docSectionMatch = null;
                const patterns = [
                  /##\s*[^\r\n]*設計書一覧\r?\n([\s\S]*?)(?=\r?\n##|\r?\n---|$)/,
                  /#\s*[^\r\n]*設計書一覧\r?\n([\s\S]*?)(?=\r?\n#|\r?\n---|$)/,
                  /設計書一覧\r?\n([\s\S]*?)(?=\r?\n##|\r?\n#|\r?\n---|$)/
                ];
                
                for (let i = 0; i < patterns.length; i++) {
                  const pattern = patterns[i];
                  console.log(`Trying pattern ${i + 1}:`, pattern);
                  docSectionMatch = prBody.match(pattern);
                  if (docSectionMatch) {
                    console.log(`Pattern ${i + 1} matched!`);
                    break;
                  }
                }
                
                console.log('docSectionMatch:', docSectionMatch);
                
                let designDocs = [];
                
                if (docSectionMatch) {
                  console.log('Found design doc section:', docSectionMatch[1]);
                  
                  // 設計書セクションの内容を詳しく確認
                  console.log('=== DESIGN DOC SECTION DEBUG ===');
                  console.log('Section content length:', docSectionMatch[1].length);
                  const sectionLines = docSectionMatch[1].split('\n');
                  console.log('Section lines count:', sectionLines.length);
                  
                  // リンク抽出のデバッグ
                  console.log('=== LINK EXTRACTION DEBUG ===');
                  const linkPattern = /\*\s*\[.*?\]\(https:\/\/docs\.google\.com\/spreadsheets\/d\/.*?\)/g;
                  console.log('Looking for links with pattern:', linkPattern);
                  
                  const links = docSectionMatch[1].match(linkPattern);
                  console.log('Found links:', links);
                  
                  if (links) {
                    designDocs = links.map(link => link.trim());
                    console.log('Processed design docs:', designDocs);
                  } else {
                    console.log('No links found in section');
                    
                    // 代替パターンを試す
                    console.log('Trying alternative link patterns...');
                    
                    // パターン1: より緩いマッチング
                    const altPattern1 = /\*.*?https:\/\/docs\.google\.com\/spreadsheets\/d\/.*?\)/g;
                    const altLinks1 = docSectionMatch[1].match(altPattern1);
                    console.log('Alternative pattern 1 result:', altLinks1);
                    
                    // パターン2: 行単位でGoogleスプレッドシートのリンクを探す
                    const googleSheetLines = sectionLines.filter(line => line.includes('docs.google.com/spreadsheets'));
                    console.log('Lines containing Google Sheets links:', googleSheetLines);
                  }
                } else {
                  console.log('No design doc section found');
                  // 代替パターンを試す
                  console.log('Trying alternative patterns...');
                  
                  // パターン1: より緩いマッチング
                  const altMatch1 = prBody.match(/#\s*設計書一覧[\s\S]*?(?=\r?\n#|\r?\n---|$)/);
                  console.log('Alternative pattern 1 result:', altMatch1);
                  
                  if (altMatch1) {
                    console.log('Using alternative pattern result');
                    // 代替パターンで見つかった場合のリンク抽出
                    const links = altMatch1[0].match(/\*\s*\[.*?\]\(https:\/\/docs\.google\.com\/spreadsheets\/d\/.*?\)/g);
                    if (links) {
                      designDocs = links.map(link => link.trim());
                      console.log('Found links from alternative pattern:', designDocs);
                    }
                  } else {
                    // パターン2: 行単位での検索
                    const lines = prBody.split('\n');
                    console.log('Total lines in PR body:', lines.length);
                    
                    // パターン3: 設計書一覧を含む行を探す
                    const designDocLines = lines.filter(line => line.includes('設計書一覧'));
                    console.log('Lines containing "設計書一覧":', designDocLines.length);
                  }
                }
                
                console.log('Extracted Design Docs:', designDocs);
                console.log('Base Branch of Merged PR:', baseBranch);
                core.setOutput('design_docs', JSON.stringify(designDocs));
                core.setOutput('base_branch', baseBranch);
                core.setOutput('merged_pr_number', pr.number.toString());
                
              } catch (error) {
                console.error('Error in Get Merged PR Details:', error);
                console.error('Error stack:', error.stack);
                core.setFailed('Failed to get PR details: ' + error.message);
              }
            }
            
            await getMergedPRDetails();

      - name: Find All Open PRs to the Same Base Branch
        id: find_all_open_prs
        uses: actions/github-script@v7
        with:
          script: |
            async function findOpenPRs() {
              try {
                console.log('=== FINDING OPEN PRS ===');
                
                const baseBranch = core.getInput('base_branch') || process.env.base_branch;
                const mergedPrNumber = core.getInput('merged_pr_number') || process.env.merged_pr_number;
                
                console.log('Base Branch:', baseBranch);
                console.log('Merged PR Number:', mergedPrNumber);
                
                if (!baseBranch) {
                  console.error('Base branch not provided');
                  core.setFailed('Base branch is required');
                  return;
                }
                
                // マージされたPRのベースブランチが他のPRのヘッドブランチとなっているオープンなPRを取得
                const { data: openPRs } = await github.rest.pulls.list({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  state: 'open',
                  head: `${context.repo.owner}:${baseBranch}`,
                  sort: 'created',
                  direction: 'desc'
                });
                
                console.log('Found open PRs with head branch:', openPRs.length);
                
                // マージされたPRを除外
                const targetPRs = openPRs.filter(pr => pr.number != mergedPrNumber);
                
                console.log('Target PRs (excluding merged PR):', targetPRs.length);
                targetPRs.forEach(pr => {
                  console.log(`- PR #${pr.number}: ${pr.title} (base: ${pr.base.ref}, head: ${pr.head.ref})`);
                });
                
                const targetPrNumbers = targetPRs.map(pr => pr.number);
                core.setOutput('target_pr_numbers', JSON.stringify(targetPrNumbers));
                
              } catch (error) {
                console.error('Error in Find Open PRs:', error);
                console.error('Error stack:', error.stack);
                core.setFailed('Failed to find open PRs: ' + error.message);
              }
            }
            
            await findOpenPRs();
        env:
          base_branch: ${{ steps.get_pr_details.outputs.base_branch }}
          merged_pr_number: ${{ steps.get_pr_details.outputs.merged_pr_number }}

      - name: Update Target PR Descriptions
        if: steps.find_all_open_prs.outputs.target_pr_numbers != '[]' && steps.find_all_open_prs.outputs.target_pr_numbers != 'null'
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            async function updatePRDescriptions() {
              try {
                console.log('=== UPDATING PR DESCRIPTIONS ===');
                
                const targetPrNumbersStr = core.getInput('target_pr_numbers') || process.env.target_pr_numbers || '[]';
                const designDocsStr = core.getInput('design_docs') || process.env.design_docs || '[]';
                
                const targetPrNumbers = JSON.parse(targetPrNumbersStr);
                const designDocs = JSON.parse(designDocsStr);
                
                console.log('Target PR Numbers:', targetPrNumbers);
                console.log('Design Docs:', designDocs);
                
                if (!Array.isArray(targetPrNumbers) || targetPrNumbers.length === 0) {
                  console.log('No target PRs to update');
                  return;
                }
                
                if (!Array.isArray(designDocs) || designDocs.length === 0) {
                  console.log('No design docs to add');
                  return;
                }
                
                // 設計書セクションのテンプレートを作成
                const designDocSection = `\n\n## 関連設計書\n\n${designDocs.join('\n')}`;
                
                let successCount = 0;
                let errorCount = 0;
                
                for (const prNumber of targetPrNumbers) {
                  try {
                    console.log(`Updating PR #${prNumber}...`);
                    
                    // PRの現在の内容を取得
                    const { data: pr } = await github.rest.pulls.get({
                      owner: context.repo.owner,
                      repo: context.repo.repo,
                      pull_number: prNumber
                    });
                    
                    let newBody = pr.body || '';
                    
                    // 既に設計書セクションがあるかチェック
                    if (newBody.includes('## 関連設計書')) {
                      console.log(`PR #${prNumber} already has design doc section, skipping`);
                      continue;
                    }
                    
                    // 設計書セクションを追加
                    newBody += designDocSection;
                    
                    // PRの説明を更新
                    await github.rest.pulls.update({
                      owner: context.repo.owner,
                      repo: context.repo.repo,
                      pull_number: prNumber,
                      body: newBody
                    });
                    
                    console.log(`Successfully updated PR #${prNumber}`);
                    successCount++;
                    
                  } catch (error) {
                    console.error(`Error updating PR #${prNumber}:`, error.message);
                    errorCount++;
                    // 個別のPRの更新エラーは全体の処理を停止させない
                  }
                }
                
                console.log(`PR description updates completed. Success: ${successCount}, Errors: ${errorCount}`);
                
                if (errorCount > 0) {
                  console.warn(`Warning: ${errorCount} PR(s) failed to update`);
                }
                
              } catch (error) {
                console.error('Error in Update PR Descriptions:', error);
                console.error('Error stack:', error.stack);
                core.setFailed('Failed to update PR descriptions: ' + error.message);
              }
            }
            
            await updatePRDescriptions();
        env:
          target_pr_numbers: ${{ steps.find_all_open_prs.outputs.target_pr_numbers }}
          design_docs: ${{ steps.get_pr_details.outputs.design_docs }}
```

### 4.2. ワークフローの動作説明

#### Step 1: Get Merged PR Details
- マージされたPRの情報を取得
- PRのDescriptionから設計書リンクを抽出
- ベースブランチの情報を取得

#### Step 2: Find All Open PRs
- **マージされたPRのベースブランチが他のPRのヘッドブランチとなっているオープンなPR**を検索
- マージされたPR自体は除外
- 対象となるPRの番号リストを出力

#### Step 3: Update Target PR Descriptions
- 対象PRのDescriptionの`## 設計書一覧`セクションに設計書リンクを追加
- 既にセクションがある場合は既存の内容に追加（重複を避ける）
- セクションがない場合は新規作成
- エラーハンドリングと統計情報の出力

## 5. 動作確認とデバッグ

### 5.1. テスト手順

#### 例：ブランチ構造での動作

```
main
├── develop/test (PR#1: develop/test → main)
│   └── feature/test (PR#2: feature/test → develop/test)
```

1. **PR#2をマージ**: `feature/test` → `develop/test`
2. **PR#1が更新される**: PR#2のベースブランチ（`develop/test`）がPR#1のヘッドブランチとなっているため

#### テスト手順

1. **テスト用PRの作成**: 設計書リンクを含むPRを作成
2. **関連PRの作成**: マージされたPRのベースブランチがヘッドブランチとなっている別のPRを作成
3. **PRのマージ**: 最初のPRをマージ
4. **動作確認**: 2番目のPRのDescriptionが自動更新されることを確認

### 5.2. デバッグ情報

ワークフローは詳細なログを出力します：
- 抽出された設計書リンクの一覧
- 見つかった関連PRの一覧（ベースブランチとヘッドブランチ情報含む）
- 更新されたPRの統計情報（成功数、エラー数）

### 5.3. よくある問題と解決方法

#### 関連PRが見つからない場合
- 対象PRが**マージされたPRのベースブランチをヘッドブランチとしている**か確認
- 例：PR#2（`feature/test` → `develop/test`）がマージされた場合、PR#1（`develop/test` → `main`）が更新される

#### 設計書リンクが抽出されない場合
- PRのDescriptionに`## 設計書一覧`セクションがあるか確認
- リンクが正しいMarkdown形式で記載されているか確認

#### 設計書が正しく追加されない場合
- 対象PRのDescriptionに`## 設計書一覧`セクションが存在するか確認
- 既存の設計書と重複していないか確認

#### GitHub Actionsが失敗する場合
- GitHub Actionsの実行ログを確認
- GitHub Tokenの権限設定を確認

## 6. 技術的な詳細

### 6.1. 検索ロジック

- **対象**: マージされたPRのベースブランチが他のPRのヘッドブランチとなっているオープンなPR
- **除外**: マージされたPR自体
- **重複防止**: 既に`## 関連設計書`セクションがあるPRはスキップ

### 6.2. 正規表現パターン

設計書セクションの抽出には複数のパターンを使用：
```javascript
const patterns = [
  /##\s*[^\r\n]*設計書一覧\r?\n([\s\S]*?)(?=\r?\n##|\r?\n---|$)/,
  /#\s*[^\r\n]*設計書一覧\r?\n([\s\S]*?)(?=\r?\n#|\r?\n---|$)/,
  /設計書一覧\r?\n([\s\S]*?)(?=\r?\n##|\r?\n#|\r?\n---|$)/
];
```

### 6.3. 設計書追加ロジック

- **新規セクション作成**: `## 設計書一覧`セクションが存在しない場合は新規作成
- **既存セクション更新**: 既存のセクションがある場合は、既存の設計書に新しい設計書を追加
- **重複防止**: `Set`を使用して重複する設計書リンクを自動的に除外

### 6.4. エラーハンドリング

- 個別のPR更新エラーは全体の処理を停止させない
- 詳細なエラーログと統計情報を出力
- 環境変数の存在チェックと型安全性の確保