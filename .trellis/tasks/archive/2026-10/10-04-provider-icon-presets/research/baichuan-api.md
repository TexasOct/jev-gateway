# Baichuan official endpoint verification

The initial HTML fetch at https://platform.baichuan-ai.com/docs/api returned the
client-rendered shell. Its script
`/_next/static/chunks/pages/docs-v2/%5BdocName%5D-0ddd0609cc4b2087.js` loads
documentation through `/api/gitlab/yaml` with `{file: "api.yaml"}`. The shared
request function in `/_next/static/chunks/pages/_app-57838a78036bd45d.js`, module
48376, defaults that documentation request to POST.

A read-only POST to https://platform.baichuan-ai.com/api/gitlab/yaml with JSON
`{"file":"api.yaml"}` returned HTTP 200, `code: 0`, and the official YAML article.
The first lines declare:

```yaml
title: "通用对话（Chat Completions）"
method: POST
endpoint: /v1/chat/completions
description: >
  百川通用大模型对话接口，兼容 OpenAI 接口格式。
```

The article's request example uses
`https://api.baichuan-ai.com/v1/chat/completions`, bearer `$API_KEY`, standard
`model`/`messages`/`stream`, and OpenAI `chat.completion.chunk` responses. Thus the
template uses registered `openai`, base `https://api.baichuan-ai.com/v1` and
declared `BAICHUAN_API_KEY`. The earlier setup-only recommendation is superseded
by this direct official evidence. No generation request or credential was used.
