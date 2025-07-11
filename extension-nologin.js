const vscode = require('vscode');
const fetch = require('node-fetch');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let disposable = vscode.commands.registerCommand('weiboHotSearch.show', async function () {
    const panel = vscode.window.createWebviewPanel(
      'weiboHotSearch',
      '微博热搜榜',
      vscode.ViewColumn.One,
      {}
    );

    const hotList = await fetchWeiboHot('https://weibo.com/ajax/statuses/hot_band');
    const entList = await fetchWeiboHot('https://weibo.com/ajax/statuses/entertainment');

    panel.webview.html = getWebviewContent(hotList, entList);
  });

  context.subscriptions.push(disposable);
}

async function fetchWeiboHot(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://weibo.com/'
      }
    });
    const json = await res.json();
    return (json.data.band_list || []).slice(0, 5);
  } catch (e) {
    vscode.window.showErrorMessage('请求微博热搜失败: ' + e.message);
    return [];
  }
}

function getWebviewContent(hotList, entList) {
  function listToHTML(list) {
    return list.map((item, i) => {
      const url = item.word_scheme || `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`;
      return `<li><a href="${url}" target="_blank">${i + 1}. ${item.word}</a> (${item.category || ''})</li>`;
    }).join('');
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: sans-serif; padding: 1em; }
        h2 { color: #e91e63; }
        ul { list-style: none; padding: 0; }
        li { margin-bottom: 6px; }
        a { text-decoration: none; color: #2196f3; }
      </style>
    </head>
    <body>
      <h2>🔥 微博热搜榜</h2>
      <ul>${listToHTML(hotList)}</ul>
      <h2>🎬 文娱榜</h2>
      <ul>${listToHTML(entList)}</ul>
    </body>
    </html>`;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
