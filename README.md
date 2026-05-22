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

## Windows Server 一键部署

适用于阿里云 Windows Server 2022。请先用 RDP 登录服务器，用“管理员身份”打开 PowerShell，然后运行：

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
irm https://raw.githubusercontent.com/ShonWal/questionnaire-demo/main/deploy/windows-setup.ps1 | iex
```

脚本会自动完成：

- 下载 Node.js 便携版到 `C:\questionnaire-demo\tools\node`
- 从 GitHub 下载最新版应用到 `C:\questionnaire-demo\app`
- 创建数据目录 `C:\questionnaire-demo\data`
- 注册 Windows 启动任务 `QuestionnaireDemo`
- 打开 Windows 防火墙 TCP `3000` 端口

如果公网无法访问 `http://47.108.189.6:3000`，请在阿里云 ECS 安全组入方向放行 TCP `3000`，授权对象可临时设置为 `0.0.0.0/0`。

查看运行日志：

```powershell
Get-Content C:\questionnaire-demo\logs\server.log -Tail 100
```

重启服务：

```powershell
Stop-ScheduledTask -TaskName QuestionnaireDemo
Start-ScheduledTask -TaskName QuestionnaireDemo
```

## 数据分析功能

问卷管理卡片中新增“数据分析”按钮。该功能参考 `questionnaire-stats` skill 的分析思路，在网页内直接对当前问卷回复做轻量统计：

- 描述性统计：回复数、完成率、每题有效回答/缺失、频数和百分比。
- 文本题统计：不同答案数量和高频文本答案。
- 单选/多选统计：选项次数和比例。
- 评分/数字题统计：均值、标准差、最小值、最大值。
- 信度分析：当存在至少 2 个可数值题项时计算 Cronbach's alpha。
- 相关性分析：当存在至少 2 个可数值题项时计算 Pearson r。

接口：

```text
GET /api/surveys/:id/analysis
```

说明：当前网页版本采用 Node.js 内置实现，适合在线即时分析；`questionnaire-stats` 原始 Python skill 仍适合离线 Excel/YAML 的完整学术分析流程。
