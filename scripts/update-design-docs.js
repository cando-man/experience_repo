// GitHub Actionsのactions/github-scriptでは、coreとgithubはグローバルに利用可能
// const core = require('@actions/core');
// const github = require('@actions/github');

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
    console.log('PR Body:', prBody);
    console.log('Base Branch:', baseBranch);
    console.log('PR Merged:', pr.merged);
    
    // マージされていない場合は処理をスキップ
    if (!pr.merged) {
      console.log('PR is not merged. Skipping processing.');
      core.setOutput('design_docs', JSON.stringify([]));
      core.setOutput('base_branch', baseBranch);
      core.setOutput('merged_pr_number', pr.number);
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
      console.log('Section content:');
      console.log('"' + docSectionMatch[1] + '"');
      console.log('Section content (split by lines):');
      const sectionLines = docSectionMatch[1].split('\n');
      sectionLines.forEach((line, index) => {
        console.log(`${index}: "${line}"`);
      });
      
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
        console.log('All lines in PR body:');
        lines.forEach((line, index) => {
          console.log(`${index}: "${line}"`);
        });
        
        // パターン3: 設計書一覧を含む行を探す
        const designDocLines = lines.filter(line => line.includes('設計書一覧'));
        console.log('Lines containing "設計書一覧":', designDocLines);
      }
    }
    
    console.log('Extracted Design Docs:', designDocs);
    console.log('Base Branch of Merged PR:', baseBranch);
    core.setOutput('design_docs', JSON.stringify(designDocs));
    core.setOutput('base_branch', baseBranch);
    core.setOutput('merged_pr_number', pr.number);
    
  } catch (error) {
    console.error('Error in Get Merged PR Details:', error);
    console.error('Error stack:', error.stack);
    core.setFailed('Failed to get PR details: ' + error.message);
  }
}

async function findOpenPRs() {
  try {
    console.log('=== FINDING OPEN PRS ===');
    
    const baseBranch = process.env.base_branch;
    const mergedPrNumber = process.env.merged_pr_number;
    
    console.log('Base Branch:', baseBranch);
    console.log('Merged PR Number:', mergedPrNumber);
    
    if (!baseBranch) {
      console.error('Base branch not provided');
      core.setFailed('Base branch is required');
      return;
    }
    
    // 同じベースブランチに向けられたオープンなPRを取得
    const { data: openPRs } = await github.rest.pulls.list({
      owner: context.repo.owner,
      repo: context.repo.repo,
      state: 'open',
      base: baseBranch,
      sort: 'created',
      direction: 'desc'
    });
    
    console.log('Found open PRs:', openPRs.length);
    
    // マージされたPRを除外
    const targetPRs = openPRs.filter(pr => pr.number != mergedPrNumber);
    
    console.log('Target PRs (excluding merged PR):', targetPRs.length);
    targetPRs.forEach(pr => {
      console.log(`- PR #${pr.number}: ${pr.title}`);
    });
    
    const targetPrNumbers = targetPRs.map(pr => pr.number);
    core.setOutput('target_pr_numbers', JSON.stringify(targetPrNumbers));
    
  } catch (error) {
    console.error('Error in Find Open PRs:', error);
    console.error('Error stack:', error.stack);
    core.setFailed('Failed to find open PRs: ' + error.message);
  }
}

async function updatePRDescriptions() {
  try {
    console.log('=== UPDATING PR DESCRIPTIONS ===');
    
    const targetPrNumbers = JSON.parse(process.env.target_pr_numbers || '[]');
    const designDocs = JSON.parse(process.env.design_docs || '[]');
    
    console.log('Target PR Numbers:', targetPrNumbers);
    console.log('Design Docs:', designDocs);
    
    if (targetPrNumbers.length === 0) {
      console.log('No target PRs to update');
      return;
    }
    
    if (designDocs.length === 0) {
      console.log('No design docs to add');
      return;
    }
    
    // 設計書セクションのテンプレートを作成
    const designDocSection = `\n\n## 関連設計書\n\n${designDocs.join('\n')}`;
    
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
        
      } catch (error) {
        console.error(`Error updating PR #${prNumber}:`, error);
        // 個別のPRの更新エラーは全体の処理を停止させない
      }
    }
    
    console.log('PR description updates completed');
    
  } catch (error) {
    console.error('Error in Update PR Descriptions:', error);
    console.error('Error stack:', error.stack);
    core.setFailed('Failed to update PR descriptions: ' + error.message);
  }
}

module.exports = { getMergedPRDetails, findOpenPRs, updatePRDescriptions }; 