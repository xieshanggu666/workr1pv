# 🚜 像素农场 · 种田经营（SQLite 持久化）

基于 **Vue 3 + Vite + Pinia（前端）+ Express + SQLite（后端）** 的像素风种田经营游戏，`node:sqlite` 原生数据库持久化存档。

## 技术栈

- 前端：Vue 3 + Vite + Pinia，Canvas 2D 像素风渲染
- 后端：Node.js（内置 `node:sqlite`）+ Express，REST API
- 数据库：`server/farm.db`（SQLite，首次启动自动建表 + 预置数据）

## 运行

```bash
npm install
npm run dev
```

启动前端（http://localhost:5180）与后端 API（http://localhost:4110），两者同时运行。Vite 已配置 `/api` 代理到后端。

> 需 Node.js ≥ 22.13（内置 `node:sqlite`）。

## 玩法

1. **种植**：点击耕地 → 选种子 → 播种；浇水/施肥/除虫养护
2. **时间**：用「+1天」推进，作物按生长天数成熟，四维（水分/肥力/光照/虫害）逐日变化
3. **收获/经济**：收获作物 + 卖到市场赚金币；买种子/领养动物
4. **畜牧**：领养母鸡/绵羊/奶牛，喂食、产出蛋/毛/奶
5. **加工**：加工坊二次加工（面粉/番茄汁/奶酪等），升级建筑解锁配方
6. **季节**：春夏秋冬 28 天一轮，冬季光照下降

## 数据库表

`player` `plots` `crops` `inventory` `buildings` `animals`

## 后续可扩展

天气与灾难、矿洞探险、节日活动、好友拜访/联机、图鉴成就、多存档、存档导出、游玩教程引导