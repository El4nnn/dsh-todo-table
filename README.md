# dsh-todo-table

右侧栏里的待办表：一张固定两列的表格 —— **待办事项 / 办理状态**，内容由对话指定后填入。

不是又一个让人手动敲的待办 App。行来自插件自己的一个 JSON 文件，所以你（或 agent）在对话里说「把这几件事加到待办表」，我直接改文件，打开着的表几秒内自己长出这几行。

- 右侧栏原生 tab，起始页有一张「待办清单」入口卡
- 三档状态：待办理 / 办理中 / 已完成，点胶囊循环推进并写回文件
- 数据在磁盘上的 JSON 里，不依赖 localStorage，换浏览器不丢
- 中文 / English 文案跟随 DSH 语言
- 零依赖、无构建步骤，纯 ESM + 一个浏览器模块

## 安装

插件装在 **profile** 里（不是全局），以本机 DSH profile 为例：

1. 把仓库放到任意目录，例如 `C:\repos\dsh-todo-table`
2. 编辑 profile 的 `package.json`（Windows 上一般是 `%USERPROFILE%\.dsh\profiles\<profile>\package.json`）：

```json
{
  "dependencies": {
    "dsh-todo-table": "link:C:/repos/dsh-todo-table"
  },
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-todo-table"]
    }
  }
}
```

3. 在该 profile 目录下 `pnpm install`，然后刷新 DSH 页面

依赖 `@deepseek-ai/dsh-client-ui-sidebar-right`（右侧栏本体）。装了它，插件启动时会往 `sidebar.right.pane.tab` 槽位注册 tab 并挂一张入口卡；没有右侧栏时插件会打一条 `console.error` 并安静退出，不影响其他功能。

## 用法

| 想做 | 怎么做 |
| --- | --- |
| 打开表 | 展开右侧栏 → 起始页里的 **「待办清单」** 卡片 |
| 加 / 改 / 删待办 | 在对话里说，agent 改 `data/todos.json` 的 `items` |
| 推进状态 | 点状态胶囊：待办理 → 办理中 → 已完成 → 待办理（循环） |
| 手动刷新 | 表头右上角的刷新按钮（平时不用点，5 秒自动轮询） |

## 数据文件

真实数据在插件目录下的 `data/todos.json`，**不入库**（`.gitignore` 里挡了）。首次使用：

```bash
cp data/todos.example.json data/todos.json
```

文件格式：

```json
{
  "title": "显示的标题，留空则用「待办清单」",
  "updatedAt": "2026-11-10T22:05:00+08:00",
  "items": [
    { "id": "t1", "text": "待办事项内容", "status": "pending", "note": "可选备注" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 行的唯一标识，缺失时按顺序补 `item-N` |
| `text` | 必填，空字符串的行会被丢掉 |
| `status` | `pending` / `doing` / `done`，非法值退回 `pending` |
| `note` | 可选，显示在待办文字下方的浅色小字 |

文件缺失、写坏 JSON、或某行字段不合法，都不会让表崩：Host 半会把非法行过滤掉，整个文件读不出来时降级成空表。所以手改文件不用小心翼翼，改错了最多是那几行不显示。

## HTTP 接口

Host 半（`index.mjs`）只做一件事：用一条 exact 路由把 JSON 交给浏览器。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| `GET` / `HEAD` | `/api/dsh-todo-table` | 返回当前表格文档（200） |
| `POST` | `/api/dsh-todo-table` | body `{ "id", "status" }`，改一行并落盘（200） |
| 其他 | | 405 |
| | 坏 JSON body 或字段缺失 | 400 |
| | 未知 `id` | 404 |

请求体上限 64 KB，响应一律 `cache-control: no-store`。

> ⚠️ 这条路由**没有鉴权**——它假设 DSH 的 web 服务只在本机 `127.0.0.1` 上可达。别把 DSH 的端口直接暴露到公网。

## 目录结构

| 文件 | 作用 |
| --- | --- |
| `index.mjs` | Host 半：`/api/dsh-todo-table`（GET 读、POST 改状态） |
| `client.js` | 浏览器半：注册 tab 类型 + 右侧栏入口卡 + 表格 body |
| `cordis.patch.yml` | bundle patch：往 loader 里插入 `todo-table` 这一行 |
| `data/todos.json` | 真实数据（不入库） |
| `data/todos.example.json` | 数据格式示例，兼首次使用的自检清单 |
| `locale/zh.json`、`locale/en.json` | 插件管理页显示用的标题与描述 |
| `icon.svg` | 入口图标 |

## 已知限制

- 表里只能改状态，**不能增删行、不能排序**——行的增删由 JSON 决定，这是「内容由对话指定」这个前提的直接结果
- 数据靠 5 秒轮询 + 窗口聚焦刷新，不是推送；改完到看见最多 5 秒
- 只支持单一表格实例（一份 `todos.json`）

## 许可

[MIT](LICENSE)
