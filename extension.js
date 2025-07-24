const vscode = require('vscode');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let disposable = vscode.commands.registerCommand('weiboHotSearch.show', async function () {
    const panel = vscode.window.createWebviewPanel(
      'weiboHotSearch',
      '微博热搜榜',
      vscode.ViewColumn.One,
      {
        enableScripts: true, // 允许点击跳转
      }
    );

    // 设置初始页面（加载中）
    panel.webview.html = `
      <html><body>
        <h2>正在加载微博热搜...</h2>
      </body></html>
    `;
    panel.webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'refresh') {
        const url = msg.type === 'hot'
          ? 'https://s.weibo.com/top/summary?cate=realtime'
          : 'https://s.weibo.com/top/summary?cate=entrank';

        const list = await fetchWeiboHot(url);
        const lines = list.map((item, index) => {
          const safeTitle = item.title.replace(/"/g, '\\"');
          return ` * ${(item.rank || index + 1).toString().padStart(2, '0')}. ${safeTitle}`;
        });
        const content = [`/**`, ...lines, ` */`].join('\n');

        panel.webview.postMessage({ command: 'update', type: msg.type, content });
      }
    });
    try {
      const hotList = await fetchWeiboHot('https://s.weibo.com/top/summary?cate=realtime');
      const entList = await fetchWeiboHot('https://s.weibo.com/top/summary?cate=entrank');

      panel.webview.html = getWebviewContent(hotList, entList);
    } catch (e) {
      panel.webview.html = `<html><body><h2>加载失败：</h2><pre>${e.message}</pre></body></html>`;
    }
  });

  context.subscriptions.push(disposable);
    const treeDataProvider = new class {
    getTreeItem() {
      const item = new vscode.TreeItem('点击查看微博热搜');
      item.command = {
        command: 'weiboHotSearch.show',
        title: '打开微博热搜榜',
      };
      item.collapsibleState = vscode.TreeItemCollapsibleState.None;
      return item;
    }

    getChildren() {
      return [new vscode.TreeItem('点击查看微博热搜')];
    }
  };

  vscode.window.registerTreeDataProvider('weiboHotView', treeDataProvider);

}

async function fetchWeiboHot(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true, // 不显示浏览器窗口
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/102.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const html = await page.content();
    const $ = cheerio.load(html);
    const list = [];

    $('table tbody tr').each((i, el) => {
      const rank = $(el).find('td.td-01').text().trim();
      const a = $(el).find('td.td-02 a');
      const title = a.text().trim();
      const href = a.attr('href');
      const hot = $(el).find('td.td-03').text().trim();
      const link = href ? (href.startsWith('http') ? href : 'https://s.weibo.com' + href) : '';

      if (title) {
        list.push({ rank: rank || (i + 1).toString(), title, hot, link });
      }
    });

    return list;
  } catch (err) {
    console.error('获取微博热搜失败（puppeteer）：', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

function getWebviewContent(hotList, entList) {
  function renderContent(id, list) {
    const lines = list.map((item, index) => {
      const safeTitle = item.title.replace(/"/g, '\\"');
      return ` * ${(item.rank || index + 1).toString().padStart(2, '0')}. ${safeTitle}`;
    });
    return [`/**`, ...lines, ` */`].join('\n');
  }

  const hotText = renderContent('hot', hotList);
  const entText = renderContent('ent', entList);

  return `
  <!DOCTYPE html>
  <html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        background-color: #1e1e1e;
        color: #d4d4d4;
        font-family: Consolas, Monaco, 'Courier New', monospace;
        font-size: 13px;
        padding: 0;
        margin: 0;
      }

      .tabs {
        display: flex;
        background-color: #2d2d2d;
        border-bottom: 1px solid #444;
      }

      .tab {
        flex: 1;
        text-align: center;
        padding: 10px;
        cursor: pointer;
        font-weight: bold;
        color: #ccc;
        border-right: 1px solid #444;
      }

      .tab.active {
        background-color: #1e1e1e;
        color: #fff;
      }

      .refresh-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #2d2d2d;
        padding: 6px 12px;
        border-top: 1px solid #333;
        border-bottom: 1px solid #333;
      }

      .refresh-bar .title {
        font-weight: bold;
      }

      .refresh-bar button {
        background: none;
        border: none;
        color: #4FC1FF;
        cursor: pointer;
        font-weight: bold;
      }

      .refresh-bar button:hover {
        text-decoration: underline;
      }

      .content {
        padding: 12px 20px;
        white-space: pre-wrap;
        display: none;
      }

      .content.active {
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="tabs">
      <div class="tab active" id="tab-hot">🔥 热搜榜</div>
      <div class="tab" id="tab-ent">🎬 文娱榜</div>
    </div>

    <div class="refresh-bar" id="refresh-hot">
      <span class="title">🔥 微博热搜榜</span>
      <button onclick="refresh('hot')">🔄 刷新</button>
    </div>
    <pre class="content active" id="content-hot">${hotText}</pre>

    <div class="refresh-bar" id="refresh-ent" style="display: none;">
      <span class="title">🎬 文娱热搜榜</span>
      <button onclick="refresh('ent')">🔄 刷新</button>
    </div>
    <pre class="content" id="content-ent">${entText}</pre>

    <script>
      const vscode = acquireVsCodeApi();

      const tabHot = document.getElementById('tab-hot');
      const tabEnt = document.getElementById('tab-ent');
      const contentHot = document.getElementById('content-hot');
      const contentEnt = document.getElementById('content-ent');
      const refreshHot = document.getElementById('refresh-hot');
      const refreshEnt = document.getElementById('refresh-ent');

      tabHot.onclick = () => {
        tabHot.classList.add('active');
        tabEnt.classList.remove('active');
        contentHot.classList.add('active');
        contentEnt.classList.remove('active');
        refreshHot.style.display = 'flex';
        refreshEnt.style.display = 'none';
      };

      tabEnt.onclick = () => {
        tabEnt.classList.add('active');
        tabHot.classList.remove('active');
        contentEnt.classList.add('active');
        contentHot.classList.remove('active');
        refreshEnt.style.display = 'flex';
        refreshHot.style.display = 'none';
      };

      function refresh(type) {
        vscode.postMessage({ command: 'refresh', type });
      }

      window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'update') {
          const pre = document.getElementById('content-' + msg.type);
          pre.textContent = msg.content;
        }
      });
    </script>
  </body>
  </html>
  `;
}



function deactivate() {}


module.exports = {
  activate,
  deactivate,
};
