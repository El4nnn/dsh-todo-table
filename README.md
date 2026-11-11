# dsh-todo-table

右侧栏里的待办表：两列「待办事项 / 办理状态」。表是**独立实体**，可以有很多张，每张开一个自己的右侧栏 tab；内容由对话填入（agent 直接改 JSON），点状态胶囊推进。

- 打开时先进**选择页**：打开已有表，或新开一张
- 每张表是独立的 tab（`dsh-resource://todo-table/<id>`），两张表能同时开着、并排分屏
- 表名可改，tab 标签跟着变
- 数据在磁盘 JSON 里，不依赖 localStorage，换浏览器不丢
- 中文 / English 文案跟随 DSH 语言
- 零依赖、无构建步骤

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

依赖 `@deepseek-ai/dsh-client-ui-sidebar-right`（右侧栏本体）。没有右侧栏时插件会打一条 `console.error` 并安静退出，不影响其他功能。

## 用法

右侧栏 → `+`（或展开右侧栏后的起始页）→ **待办清单** 卡片，打开的是选择页。

| 想做 | 怎么做 |
| --- | --- |
| 打开已有表 | 选择页列出所有表（名称 / 项数 / 完成数 / 更新时间 / 是否标了会话），点一下就开 |
| 新开表 | 写个名字 → 「新建并打开」；勾「标记为本对话的表」会记下当前会话 |
| 改名 | 表头铅笔按钮，或直接点标题；回车保存 / Esc 取消 |
| 换表 | 表头「切换表」按钮，回到选择页 |
| 推进状态 | 点状态胶囊：待办理 → 办理中 → 已完成 → 待办理（循环） |
| 加内容 | 在对话里说，agent 改 `data/tables/<id>.json` |

## 数据在哪

```
data/index.json          表清单：id / name / sessionId / createdAt / updatedAt
data/tables/<id>.json    每张表的行
```

整个 `data/` 都不入库（你自己的待办内容在里面）。首次使用可以拿示例垫一下：

```bash
cp -r examples/. data/
```

行的格式：

```json
{
  "updatedAt": "2026-01-01T00:00:00.000Z",
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

`data/` 不存在也没关系：读不到就当作零张表，第一次新建表时自动创建。手改文件写坏了也只是那一行不显示，不会让表崩。

## HTTP 接口

Host 半（`index.mjs`）注册一条 **prefix** 路由 `/api/dsh-todo-table`：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/dsh-todo-table`、`/tables` | 表清单 + 每张表的项数/完成数（也可当自检探针，返回里带 `build` 标记） |
| `POST` | `/api/dsh-todo-table/tables` | `{ name, sessionId? }` 新建一张表 |
| `POST` | `/api/dsh-todo-table/rename` | `{ id, name }` 改名 |
| `GET` | `/api/dsh-todo-table/rows?id=` | 一张表的全部行 |
| `POST` | `/api/dsh-todo-table/status` | `{ tableId, itemId, status }` 改一行的状态 |

错误码：字段缺失或 body 不是 JSON → 400；未知表 / 未知行 → 404；未知路径 → 404；方法不对 → 405。请求体上限 64 KB，响应一律 `cache-control: no-store`。

> ⚠️ 这条路由**没有鉴权**——它假设 DSH 的 web 服务只在本机 `127.0.0.1` 上可达。别把 DSH 的端口暴露到公网。

## 目录结构

| 文件 | 作用 |
| --- | --- |
| `index.mjs` | Host 半：prefix 路由 + JSON 文件读写 |
| `client.js` | 浏览器半：`todo-picker`（选择页）与 `todo-table`（每表一个 tab）两个类型 |
| `cordis.patch.yml` | bundle patch：往 loader 里插入 `todo-table` 这一行 |
| `examples/` | 示例数据，`cp -r examples/. data/` 即可看到效果 |
| `data/` | 真实数据（不入库） |
| `locale/zh.json`、`locale/en.json` | 插件管理页显示用的标题与描述 |
| `icon.svg` | 入口图标 |

## 已知限制

- **不能删表**——只能手改 `data/index.json` 把条目去掉，再删 `data/tables/<id>.json`
- 不能排序 / 分组，表清单按 `index.json` 里的顺序
- 「标记为本对话的表」现在只是记下 `sessionId`（选择页上会显示），**不是**强制绑定，不改变谁能看
- 数据靠 5 秒轮询 + 窗口聚焦刷新，不是推送
- 从 0.1.x 升级不会自动迁移：旧版 `data/todos.json` 里的行需要手动搬进某张表的 `data/tables/<id>.json`

## 许可

[MIT](LICENSE)
