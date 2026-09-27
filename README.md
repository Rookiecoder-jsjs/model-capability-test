# 模型能力测试 (Model Capability Test)

本仓库**只存放模型能力测试的结果**。

测试用的提示词（prompts）不放在这里，统一维护在独立的提示词仓库中；每条结果通过 **prompt_id** 回指到那个仓库的对应提示词。两边职责分离：提示词仓库管「问什么」，本仓库管「答得怎么样」。

## 目录结构

```
mt/
├── README.md
├── .gitignore
└── results/
    └── <model-slug>/
        └── <prompt_id>/
            ├── meta.json    # 运行元数据：模型、参数、时间、提示词来源
            └── output.md    # 模型原始输出
```

`<model-slug>` 用模型标识（如 `gpt-5`、`claude-opus-5`、`gemini-3-pro`），`<prompt_id>` 用提示词仓库中的唯一 ID。同一批提示词跑不同模型时，进本仓库不同目录，便于横向对比。

## meta.json 字段约定

```json
{
  "prompt_id": "reasoning-001",
  "prompt_ref": "prompts/reasoning/reasoning-001.md",
  "prompt_commit": "<提示词仓库的 commit sha>",
  "model": "claude-opus-5",
  "model_id": "<API 返回的精确模型 ID>",
  "date": "2026-09-27T00:00:00Z",
  "params": {
    "temperature": 1.0,
    "max_tokens": 8192
  },
  "judge": null
}
```

- `prompt_commit` 记录当时提示词的版本，保证结果可复现——提示词仓库改了以后仍能定位到原文。
- `judge` 预留给评分结果（人工打分或自动评测的得分），跑完评测后回填。

## 新增一条结果

1. 从提示词仓库取 `prompt_id`。
2. 在 `results/<model-slug>/<prompt_id>/` 下建目录。
3. 写入 `meta.json` 和 `output.md`。
4. 提交信息格式：`<prompt_id> · <model>`。
