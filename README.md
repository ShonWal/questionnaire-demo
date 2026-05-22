# 问卷设计与发布 Demo

一个简洁的“问卷星”类全栈 demo，前端使用原生 HTML/CSS/JavaScript，后端使用 Node.js 内置 `http` 模块，不依赖第三方包。

## 已实现功能

- 设计问卷：标题、说明、单行文本、长文本、单选、多选、评分题、必填项。
- 发放问卷：保存后自动发布，并生成 `/#/fill/{surveyId}` 填写链接。
- 填写问卷：访问填写链接即可提交回复。
- 查看回复：后台卡片中点击“查看回复”。
- 导出数据：点击“导出 CSV”，可用 Excel/WPS 打开。
- 数据存储：默认写入 `data/db.json`，仓库内提供 `data/db.example.json` 作为初始数据库结构。

## 本地运行

```bash
cd questionnaire-demo
npm start
```

浏览器打开：

```text
http://localhost:3000
```

## 自测

```bash
npm run test:api
```

该测试会创建临时数据库，验证创建问卷、提交回复、读取回复和 CSV 导出。

## API 简表

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/surveys` | 获取问卷列表 |
| `POST` | `/api/surveys` | 创建并发布问卷 |
| `GET` | `/api/surveys/:id` | 获取问卷详情 |
| `PATCH` | `/api/surveys/:id` | 更新问卷 |
| `POST` | `/api/surveys/:id/responses` | 提交问卷回复 |
| `GET` | `/api/surveys/:id/responses` | 查看问卷回复 |
| `GET` | `/api/surveys/:id/export.csv` | 导出 CSV |

## 数据库与 GitHub

当前 demo 使用文件型数据库 `data/db.json`，适合演示和小规模试用。GitHub 适合托管代码、数据库结构和示例数据，不适合作为在线问卷的实时数据库，因为频繁写入 GitHub commit 会慢、容易冲突，也会暴露数据管理风险。

建议部署方式：

1. 把本项目代码推送到你的 GitHub 仓库。
2. 将 `data/db.example.json` 作为数据库结构样例提交到 GitHub。
3. 在线服务器运行时使用服务器本地的 `data/db.json` 存储真实数据，并做好备份。
4. 如果后续要正式使用，建议把存储切换为 PostgreSQL/MySQL/SQLite，并增加登录权限。

## 服务器部署示例

### 方式 A：直接运行 Node

```bash
git clone <你的仓库地址>
cd questionnaire-demo
npm start
```

如果要指定端口或数据库路径：

```bash
PORT=3000 DB_FILE=/var/lib/questionnaire-demo/db.json npm start
```

### 方式 B：Docker

```bash
docker build -t questionnaire-demo .
docker run -d --name questionnaire-demo -p 3000:3000 -v questionnaire-data:/app/data questionnaire-demo
```

### 方式 C：PM2

```bash
npm install -g pm2
pm2 start server.js --name questionnaire-demo --env production
pm2 save
```

生产环境建议再用 Nginx 反向代理域名到 `http://127.0.0.1:3000`。

## 后续增强建议

- 增加管理员登录、问卷编辑权限和防重复提交。
- 增加题目排序、复制题目、逻辑跳转和更多题型。
- 将文件数据库升级为 SQLite/PostgreSQL。
- 增加 Docker Compose、HTTPS、自动备份和 GitHub Actions 自动部署。
