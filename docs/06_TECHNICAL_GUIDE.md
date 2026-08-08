# 回页技术指南

本页只描述当前代码，不写未来设想。

## 运行结构

Vinext/React 客户端由 `app/page.tsx` 组合写下、日记池、思考线、回响、评测和设置。`app/thought-line-model.ts` 集中处理思考线选择物化、归线、移出、重命名、归档、权限和合并；`app/echo-card.tsx` 负责证据优先的回响呈现。

本地私人模式通过 `/api/data` 读写 `local-data/` 不可变 generation：创建 staging、校验内容与引用、生成 manifest、再更新 current pointer，旧代次不自动删除。EchoRecord 和事件经独立端点读取、追加。

公开 `worker/index.ts` 只服务托管页面，不暴露私人数据 API、不读取 `local-data/`、不绑定私人存储。

## 当前状态流

1. 启动读取 Entry、ThoughtLine、CaseRecord，再读取 EchoRecord；
2. 缺少 `thoughtLineIds` 的旧 Entry 在内存归一为空数组；
3. 新思考线名称编辑时只是 `draft:` selection，保存 Entry 时才物化；
4. 自动保存把 Entry、ThoughtLine、CaseRecord 写入新 generation；
5. `selectCurrentEcho` 同时检查 lifecycle、线状态、整线权限、单篇权限、共同归属、时间和结束事件；
6. 回响回应保存为新 Entry，并默认继承来源 ThoughtLine。

## 测试与技术债

领域规则在 `thought-line-model.test.mjs`；存储兼容在 `local-data-store.test.mjs`；界面边界在 `rendered-html.test.mjs`；回响事件由 store 测试覆盖。

`app/page.tsx` 仍承担较多视图编排，MVP 验证后再拆组件。当前无生产模型调用；CaseRecord 暂随主 generation 保存；`docs/assets/` 中三张正式图以 SVG 为唯一可编辑源，PNG、BPMN 与 HTML 为同步产物。
