# Google DESIGN.md 格式依据

## 用户要求与来源

用户指定根目录 `DESIGN.md` 遵循 `https://github.com/google-labs-code/design.md` 的规范。此前的自定义编号结构已替换，不以其他设计 skill 的章节模板作为格式验收依据。

- 权威 specification：[docs/spec.md，固定提交 `9bf8eae67128b6cc55ad9bf86665767deb4c11cd`](https://github.com/google-labs-code/design.md/blob/9bf8eae67128b6cc55ad9bf86665767deb4c11cd/docs/spec.md)。
- 官方示例：[Paws & Paths](https://github.com/google-labs-code/design.md/blob/9bf8eae67128b6cc55ad9bf86665767deb4c11cd/examples/paws-and-paths/DESIGN.md)。
- 根目录 `DESIGN.md` 描述界面；任务目录的小写 `design.md` 描述技术架构，两者独立。

## 已采用的格式

1. 文件顶部可选 YAML front matter，本项目选择提供，包含 `version: alpha`、`name`、`description` 与 `colors`、`typography`、`rounded`、`spacing`、`components`。
2. YAML token 是规范默认值，正文解释用途。引用使用 `{path.to.token}`，尺寸明确单位，组件属性只使用 schema 支持的字段。
3. 正文使用 `##` 标准章节，依次为 `Overview`、`Colors`、`Typography`、`Layout`、`Elevation & Depth`、`Shapes`、`Components`、`Do's and Don'ts`。补充来源、交互、状态与验证说明放在相应章节的 `###` 小节中。
4. Alpha 格式没有单独的主题对象，项目用明确的 `-dark` token 和组件变体表达暗色默认值；动态 seed 仍由现有 `palette.ts` 生成，不成为第二个运行时配置来源。
5. 当前源码、已知差异、provider 计划分别标明。官方 logo 尚未收集完成，产品浏览器/无障碍验收没有执行。

## 校验证据

```bash
npx --yes @google/design.md@0.4.0 lint --format json DESIGN.md
```

执行结果：exit 0、0 errors、0 warnings。信息级提示不作为格式失败。CLI 使用固定包版本，不修改产品依赖、lockfile 或 generated bundle。

另行核对 token 来源、相对 Markdown 链接、标准章节顺序、文件名大小写，以及新建父/子任务的引用。格式 lint 不证明当前全部页面遵循文档，也不替代浏览器、品牌授权或产品安全验收。

## Context 使用注意

现有 `.trellis/spec/backend/dashboard-routing-config.md` 超过默认单文件注入长度，任务校验会提示注入截断。后续 implement/check 必须主动读取该文件全文，不能把注入片段视为完整规范。本轮不改全局注入设置或截断原文件。
