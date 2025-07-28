GitHub ActionsによるPR設計書リンク自動集約
このドキュメントは、GitHub Actionsを使用して、マージされたプルリクエスト（PR）の設計書リンクを、同じベースブランチを持つ他のオープンなPRのDescriptionに自動的に集約する方法を説明します。

1. 目的
特定のブランチ（例: main や develop）にPRがマージされた際、そのPRのDescriptionに記載された設計書のスプレッドシートリンクを自動的に抽出し、同じブランチをベースとする現在オープンなすべてのPRのDescriptionに追記します。これにより、関連するPRに常に最新の設計書情報が集約され、参照漏れを防ぎます。

2. 実装方法の概要
GitHub Actionsのワークフローを定義し、以下の流れで処理を実行します。

PRマージイベントの検知: 特定のベースブランチへのPRがマージされたことをトリガーとします。

設計書リンクの抽出: マージされたPRのDescriptionから、特定のフォーマットで記載された設計書リンクを抽出します。

関連PRの特定: マージされたPRと同じベースブランチを持つ、現在オープンなすべてのPRをリストアップします。

Descriptionの更新: リストアップされた各PRのDescriptionに、抽出した設計書リンクを追記（または既存セクションを更新）します。

3. 前提条件と準備
3.1. PR Descriptionのフォーマット
設計書リンクを正確に抽出するため、マージするPRのDescriptionには以下の固定フォーマットでリンクを記載してください。

Markdown

# 設計書一覧

* [機能A設計書](https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit)
* [機能B設計書](https://docs.google.com/spreadsheets/d/YYYYYYYYYYYYYYYYYYYY/edit)
# 設計書一覧 の見出しを使用してください。

各リンクは Markdown のリスト形式 (* [リンク名](URL)) で記述してください。

Google スプレッドシートのURL (https://docs.google.com/spreadsheets/d/...) を使用してください。

3.2. GitHub Tokenの権限
ワークフローがPRのDescriptionを更新するために、以下の権限が必要です。

pull-requests: write

通常、GitHub Actionsが提供する GITHUB_TOKEN には必要な権限が含まれていますが、リポジトリの設定で制限されている場合は確認・調整が必要です。

4. GitHub Actionsワークフロー (.github/workflows/update-related-prs.yml)
以下の内容でYAMLファイルを .github/workflows/ ディレクトリに配置してください。

YAML

name: Update Related PRs with Design Docs

on:
  pull_request:
    types: [closed]
    branches:
      # 設計書リンクを共有したいPRのベースブランチを指定します。
      # 例: 'main', 'develop', 'release/*' など、運用に合わせて追加・変更してください。
      - main
      - develop

jobs:
  update-design-docs:
    # PRがマージされた場合のみ実行
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # PRの更新に必要なパーミッション

    steps:
      - name: Get Merged PR Details
        id: get_pr_details
        uses: actions/github-script@v7
        with:
          script: |
            const pr = github.event.pull_request;
            const prBody = pr.body || ''; // マージされたPRの説明文を取得
            const baseBranch = pr.base.ref; // マージされたPRのベースブランチを取得
            
            // 設計書一覧セクションを正規表現で抽出
            // `# 設計書一覧` の後から、次の `#` 見出しまたはPRの終わりまでを対象とします。
            const docSectionMatch = prBody.match(/#\s*設計書一覧\n([\s\S]*?)(?=\n#|\n---|$)/);
            
            let designDocs = [];
            if (docSectionMatch && docSectionMatch[1]) {
                // Googleスプレッドシートのリンク（`* [タイトル](https://docs.google.com/spreadsheets/d/...)` 形式）を抽出
                const links = docSectionMatch[1].match(/\*\s*\[.*?\]\(https:\/\/docs\.google\.com\/spreadsheets\/d\/.*?\)/g);
                if (links) {
                    designDocs = links.map(link => link.trim());
                }
            }
            
            console.log('Extracted Design Docs:', designDocs);
            console.log('Base Branch of Merged PR:', baseBranch);
            core.setOutput('design_docs', JSON.stringify(designDocs));
            core.setOutput('base_branch', baseBranch);
            core.setOutput('merged_pr_number', pr.number); // マージされたPR自身の番号

      - name: Find All Open PRs to the Same Base Branch
        id: find_all_open_prs
        uses: actions/github-script@v7
        with:
          script: |
            const baseBranch = core.getInput('base_branch');
            const mergedPrNumber = parseInt(core.getInput('merged_pr_number'));

            if (!baseBranch) {
              console.log('Base branch not found. Skipping finding open PRs.');
              core.setOutput('target_pr_numbers', JSON.stringify([]));
              return;
            }

            // マージされたPRと同じベースブランチをターゲットとする、オープンなすべてのPRを取得
            const { data: pulls } = await github.rest.pulls.list({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open', // オープンなPRのみ
              base: baseBranch, // マージされたPRと同じベースブランチ
              per_page: 100 // 一度に取得するPRの最大数（必要に応じて調整）
            });
            
            // マージされたPR自身は更新対象から除外
            const targetPrNumbers = pulls
              .filter(pr => pr.number !== mergedPrNumber)
              .map(pr => pr.number);
            
            console.log('Found Open PR Numbers to update:', targetPrNumbers);
            core.setOutput('target_pr_numbers', JSON.stringify(targetPrNumbers));
        env:
          base_branch: ${{ steps.get_pr_details.outputs.base_branch }}
          merged_pr_number: ${{ steps.get_pr_details.outputs.merged_pr_number }}

      - name: Update Target PR Descriptions
        # 更新対象のPRが見つかった場合のみ実行
        if: steps.find_all_open_prs.outputs.target_pr_numbers != '[]'
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const targetPrNumbers = JSON.parse(core.getInput('target_pr_numbers'));
            const mergedDesignDocs = JSON.parse(core.getInput('design_docs'));
            
            if (mergedDesignDocs.length === 0) {
              console.log('No design docs found in the merged PR. Skipping update for all target PRs.');
              return; // 設計書リンクが見つからなければ何もしない
            }

            for (const prNumber of targetPrNumbers) {
              try {
                // 対象PRの現在のDescriptionを取得
                const { data: targetPr } = await github.rest.pulls.get({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  pull_number: prNumber,
                });

                let newTargetPrBody = targetPr.body || '';
                let existingDesignDocs = [];

                // 対象PRに既に「集約設計書一覧」セクションがあるかチェック
                const targetDocSectionMatch = newTargetPrBody.match(/#\s*集約設計書一覧\n([\s\S]*?)(?=\n#|\n---|$)/);
                if (targetDocSectionMatch && targetDocSectionMatch[1]) {
                  const links = targetDocSectionMatch[1].match(/\*\s*\[.*?\]\(https:\/\/docs\.google\.com\/spreadsheets\/d\/.*?\)/g);
                  if (links) {
                    existingDesignDocs = links.map(link => link.trim());
                  }
                }

                // マージされたPRのリンクを既存のリストに追加（重複は避ける）
                const allDesignDocs = [...new Set([...existingDesignDocs, ...mergedDesignDocs])];

                // 更新された設計書一覧セクションを生成
                let updatedDocSection = '# 集約設計書一覧\n\n' + allDesignDocs.join('\n');
                updatedDocSection += `\n\n---`; // 区切り線

                // 対象PRのDescriptionを更新
                if (targetDocSectionMatch) {
                  // 既存のセクションがあれば置き換える
                  newTargetPrBody = newTargetPrBody.replace(targetDocSectionMatch[0], updatedDocSection);
                } else {
                  // なければ追加する
                  newTargetPrBody += '\n\n' + updatedDocSection;
                }

                await github.rest.pulls.update({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  pull_number: prNumber,
                  body: newTargetPrBody,
                });
                console.log(`Updated PR #${prNumber} with new design docs.`);
              } catch (error) {
                console.error(`Failed to update PR #${prNumber}: ${error.message}`);
              }
            }
        env:
          target_pr_numbers: ${{ steps.find_all_open_prs.outputs.target_pr_numbers }}
          design_docs: ${{ steps.get_pr_details.outputs.design_docs }}
5. 動作確認とデバッグ
テストリポジトリでの実行を強く推奨します。

PRを作成し、Descriptionに「3.1. PR Descriptionのフォーマット」に従って設計書リンクを記載します。

そのPRをマージします。

同じベースブランチを持つ他のオープンなPRのDescriptionが更新されることを確認します。

GitHub Actionsのワークフロー実行ログを確認し、エラーが出ていないか確認してください。