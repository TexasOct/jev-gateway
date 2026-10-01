# CC Switch 与上游模型列表参考

## 参考范围

研究日期：2026-09-30。以下链接取自本轮实际获取的上游文档和源文件。CC Switch 的截图与主分支会更新，这里只记录可核实的交互与边界，不把截图视作本项目设计系统。

## CC Switch

| 来源 | 本轮核实的事实 | 对 JEV 规划的用途 |
| --- | --- | --- |
| [添加供应商文档](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/2-providers/2.1-add.md) | 预设填入名称与 endpoint；填写 key 后可获取模型；自定义配置和共享配置均有入口 | 预设是统一配置之上的录入辅助，不能成为第二份运行时配置 |
| [编辑供应商文档](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/2-providers/2.3-edit.md) | 可编辑名称、备注、官网与图标；图标支持搜索、名称提示、预览 | 分离品牌展示元数据与传输配置，保留自定义入口 |
| [添加界面截图](https://raw.githubusercontent.com/farion1231/cc-switch/main/assets/screenshots/add-zh.png) | 截图展示预设浏览区、自定义入口、品牌预览、名称/备注/官网表单与添加操作 | 借鉴配置流程；不复制截图中的嵌套卡片、胶囊选项与间距 |
| [IconPicker.tsx](https://raw.githubusercontent.com/farion1231/cc-switch/main/src/components/IconPicker.tsx) | 从 `@/icons/extracted` 读取列表，用 `searchIcons` 过滤，复用 `ProviderIcon`；该文件未实现类别或专门的键盘导航 | 搜索图标可借鉴；JEV 需要独立补足键盘、焦点与无结果状态 |
| [ProviderIcon.tsx](https://raw.githubusercontent.com/farion1231/cc-switch/main/src/components/ProviderIcon.tsx) | 注册 SVG、URL image、名称首字母依次回退；URL image 使用 `img`，可能发起外部资源请求 | JEV 的 CSP 要求本地资源；不能直接复制远程图标加载或未验证 SVG 注入方式 |
| [ModelInputWithFetch.tsx](https://raw.githubusercontent.com/farion1231/cc-switch/main/src/components/providers/forms/shared/ModelInputWithFetch.tsx) | 有 `onFetch` 时出现获取按钮；有加载状态；获取后保留输入框与可搜索下拉 | 自动获取不应取消手动输入；该组件本身没有证明自动导入、认证校验或错误策略 |

GitHub tree API 本轮返回 `truncated: false`，确认上述源码路径存在。CC Switch 主仓库声明 MIT 许可证。代码许可证并不能单独证明所有供应商品牌资产可任意使用；JEV 仍需逐项记录官方来源、品牌使用说明、署名或许可约束。

## 官方 logo 来源约束

- [OpenAI Brand](https://openai.com/brand/) 可在搜索结果中确认是官方品牌指南入口，但本轮直接获取返回 403。未完成具体下载文件与使用条款核验，不能宣称 OpenAI logo 已收录或获许可。
- [Anthropic Official Brand Assets](https://brandfolder.com/anthropic/) 的实际页面确认这是其官方资产来源，公开集合可访问且要求遵循使用指南。本轮未获取具体资产下载链接。
- 搜索“Gemini logo”返回了加密货币交易平台的同名品牌页面。这不是 Google Gemini 的官方来源，必须排除。其他同名供应商也要核对品牌主体，不能按名称直接采集。
- 预设 manifest 应记录 `brand_id`、官方品牌主体、来源页面、资源路径、使用说明和可用明暗版本。没有核实资源的品牌不能标记为已有官方 logo。
- 操作图标库、品牌图库许可证、商标使用规范分别核查。代码许可、第三方图标包和 favicon 都不能代替官方来源证据。

## 官方模型列表

| 上游 | 实际获取的文档 | 确认事实 | 规划约束 |
| --- | --- | --- | --- |
| OpenAI | [Models list](https://developers.openai.com/api/reference/resources/models/methods/list) | `GET https://api.openai.com/v1/models`，Bearer key；`data[]` 包含 `id`、`created`、`object`、`owned_by` 等基本字段 | 列表没有保证给出价格、上下文、工具或多模态支持，不能按名称猜测这些属性 |
| Anthropic | [Models list](https://docs.anthropic.com/en/api/models-list)；[API overview](https://docs.anthropic.com/en/api/overview) | `GET /v1/models`；有 `after_id` / `before_id` / `limit` 和 `has_more` / `last_id`；当前文档含可空 capability/token 元数据。Overview 当前说明 Bearer 认证或仍受支持的 `x-api-key`，以及必需 `anthropic-version` | 同一路径不代表 OpenAI 响应协议；字段可空，映射需保留来源。模型列表适配不顺带实现 OAuth/WIF |
| Gemini | [Models API](https://ai.google.dev/api/models)；[API key](https://ai.google.dev/gemini-api/docs/api-key) | `GET https://generativelanguage.googleapis.com/v1beta/models`；`pageSize` / `pageToken` 与 `nextPageToken`；名称有 `models/` 前缀，`supportedGenerationMethods` 可标明 `generateContent`。REST 认证示例使用 `x-goog-api-key` | 需要独立适配分页、名称规范与生成接口能力；将 key 放在服务端 header，不能出现在浏览器请求 URL |

OpenAI 旧文档入口本轮返回 403，官方完整 API YAML 超过获取工具 2 MB 上限；已改用上表可读取的官方 API reference。没有发送真实 API key，也没有调用任何真实模型列表或生成接口。

## 技术建议，尚非产品决定

1. 用 provider type 或已注册协议选择模型发现适配器，不能以品牌或 hostname 猜协议。
2. 统一输出安全的上游模型标识及可核实元数据；分页未取完时显式标识结果不完整，不能把部分列表当成全部。
3. 自动发现只读取远端列表。用户随后确认采用搜索/勾选后显式导入，支持全选；获取和刷新不自动创建路由模型。
4. 对已导入模型按 `provider/upstream_model` 去重。刷新不删除旧模型、不覆盖用户的能力、标签、优先级或策略引用。
5. 上游无列表接口时保留手动输入；decision System One 的评估接口不应自动套用 LLM 的 `/models` 路径。
6. logo 使用构建时收录的本地资源，引用固定资产 ID；logo 自定义的具体范围需结合已有图标库决定。任意远程 URL、原始 SVG 或图片上传不应在未定义安全边界时直接加入。

## 实现前仍需核实

- 当前 JEV provider type 与模型列表能力的精确对应，由本任务后端研究记录。
- 官方 logo 覆盖清单、每个资源的来源和品牌许可；第三方维护的图标不能仅凭包名宣称为官方资产。
- 上游失败、分页、超时、响应体大小、取消、并发与凭证变化的测试矩阵。
- Native Anthropic/Gemini 的具体实现需与当前 transport 类型核对；若一期不支持，应明确显示不支持并允许手动输入。官方通用认证文档已经取证，不能改用未经核实的固定 SDK 方法或 query-key 拼接。
