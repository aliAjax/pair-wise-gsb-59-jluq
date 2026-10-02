# 公共采购技术响应符合性评审平台

基于 Angular、PrimeNG、NgRx、Angular Router、Apollo Angular、GraphQL、Nx 和 TypeScript 实现。前端不会用普通 JSON 占位接口，而是通过 Apollo Angular 对本地 GraphQL mock server 发起真实查询和 mutation。

## 功能

- 评审概览：否决项遗漏、评审覆盖、评分分歧、逾期澄清、重复证明和当前版本。
- 条款评审：技术条款树、供应商响应、证明文件、独立评审意见、评分和澄清发起。
- 批量比对：动态供应商列、评分差异定位、证明复用提示和差异筛选。
- 小组复核：保留各评审员独立意见，显示评分区间和分歧处理队列。
- 澄清轮次：发起澄清、登记回复、轮次和期限校验，未完成项目阻止定稿。
- 评审版本：创建并锁定定稿快照，保存内容哈希、响应数量和签署人。
- 角色分权：采购人员、评审员 A、评审员 B 和评审组长的操作入口按角色限制。
- 审计导出：GraphQL mutation 和版本操作写入审计日志，支持 JSON、CSV 导出。

## 技术栈

- Angular 22 standalone
- PrimeNG 22
- NgRx Store / Effects
- Angular Router
- Apollo Angular + GraphQL
- Nx workspace
- TypeScript 6
- Apollo Server 5 mock schema/server

## 本地 GraphQL

mock server 位于 `server/`，GraphQL 地址为 `http://127.0.0.1:18462/graphql`。schema 和 resolver 定义在 `server/schema.ts`、`server/server.ts`，初始数据位于 `server/data.ts`，运行时 mutation 会写入被 Git 忽略的 `server/runtime-data.json`。

## 运行

```bash
npm install
npm run dev
```

- 前端：`http://localhost:18459`
- GraphQL：`http://127.0.0.1:18462/graphql`

## 构建

```bash
npm run build
```

构建由 `nx build procurement-review` 执行 Angular application builder，并包含 TypeScript 与 Angular 模板严格检查。
