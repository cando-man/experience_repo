/**
 * PR関連のユーティリティ関数
 */

/**
 * コンテキストからPRオブジェクトを取得
 * @param {Object} github - GitHub API クライアント
 * @param {Object} context - GitHub Actions コンテキスト
 * @returns {Promise<Object|null>} PRオブジェクトまたはnull
 */
async function getPRFromContext(github, context) {
  // contextオブジェクトの存在確認
  if (typeof context === 'undefined') {
    console.error('context object is undefined');
    return null;
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
      return null;
    }
  }
  
  return pr;
}

/**
 * PR本文から設計書リンクを抽出
 * @param {string} prBody - PR本文
 * @returns {Array<string>} 設計書リンクの配列
 */
function extractDesignDocs(prBody) {
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
  
  return designDocs;
}

/**
 * ベースブランチに対してオープンなPRを検索
 * @param {Object} github - GitHub API クライアント
 * @param {Object} context - GitHub Actions コンテキスト
 * @param {string} baseBranch - ベースブランチ
 * @param {string} mergedPrNumber - マージされたPR番号
 * @returns {Promise<Array>} 対象PRの配列
 */
async function findOpenPRsToBaseBranch(github, context, baseBranch, mergedPrNumber) {
  // マージされたPRのベースブランチがヘッドブランチとなっているオープンなPRを取得
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
  
  return targetPRs;
}

/**
 * PRに設計書情報を追加
 * @param {Object} github - GitHub API クライアント
 * @param {Object} context - GitHub Actions コンテキスト
 * @param {Array<number>} targetPrNumbers - 対象PR番号の配列
 * @param {Array<string>} designDocs - 設計書リンクの配列
 * @returns {Promise<Object>} 更新結果（successCount, errorCount）
 */
async function updatePRWithDesignDocs(github, context, targetPrNumbers, designDocs) {
  // 設計書セクションのテンプレートを作成
  const designDocSection = `\n\n## 設計書一覧\n\n${designDocs.join('\n')}`;
  
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
      
      // 既に設計書一覧セクションがあるかチェック
      if (newBody.includes('## 設計書一覧')) {
        console.log(`PR #${prNumber} already has design doc section, adding to existing section`);
        
        // 既存の設計書一覧セクションに設計書を追加
        const designDocLines = designDocs.map(doc => doc.trim());
        const existingDesignDocs = [];
        
        // 既存の設計書を抽出
        const existingMatch = newBody.match(/##\s*設計書一覧\r?\n([\s\S]*?)(?=\r?\n##|\r?\n---|$)/);
        if (existingMatch) {
          const existingSection = existingMatch[1];
          const existingLinks = existingSection.match(/\*\s*\[.*?\]\(https:\/\/docs\.google\.com\/spreadsheets\/d\/.*?\)/g);
          if (existingLinks) {
            existingDesignDocs.push(...existingLinks.map(link => link.trim()));
          }
        }
        
        // 新しい設計書を追加（重複を避ける）
        const allDesignDocs = [...new Set([...existingDesignDocs, ...designDocLines])];
        
        // 既存のセクションを新しい内容で置き換え
        const newDesignDocSection = `## 設計書一覧\n\n${allDesignDocs.join('\n')}`;
        newBody = newBody.replace(/##\s*設計書一覧\r?\n[\s\S]*?(?=\r?\n##|\r?\n---|$)/, newDesignDocSection);
      } else {
        // 設計書セクションを新規追加
        newBody += designDocSection;
      }
      
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
  
  return { successCount, errorCount };
}

module.exports = {
  getPRFromContext,
  extractDesignDocs,
  findOpenPRsToBaseBranch,
  updatePRWithDesignDocs
}; 