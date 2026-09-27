# AGENTS.md

本文件是本仓库的**权威规范**（agent 与人类共同遵守）。README.md 是面向人的简介，本文件是细则；两者冲突时以本文件为准。

---

## 1. 仓库定位

本仓库**只存放模型能力测试的结果**。

| | 存放位置 |
|---|---|
| 测试提示词（问什么） | **另一个独立仓库**，本仓库不存 |
| 模型输出（答得怎么样） | 本仓库 `results/` |

每条结果通过 `prompt_id` 回指提示词仓库。**严禁**在本仓库新建 `prompts/`、`.txt` 格式的提示词文件或任何形式的提示词副本。

本仓库同时是 **public** 仓库，提交前必读第 7 节红线。

---

## 2. 目录结构

```
mt/
├── AGENTS.md                  # 本文件，规范
├── README.md                  # 面向人的简介
├── .gitignore
├── results/                   # 【唯一的数据区】
│   ├── index.csv              # 全部结果的总索引，见第 5 节
│   ├── <model-slug>/          # 一个模型一个目录
│   │   └── <prompt_id>/       # 一条提示词一个目录
│   │       ├── meta.json      # 必填，运行元数据
│   │       ├── output.md      # 必填，模型输出正文
│   │       └── raw.json       # 可选，API 原始响应
│   └── ...
└── tools/                     # 【可选】处理结果的脚本
```

铁律：

- `results/` 下**只有** `<model-slug>/` 和 `index.csv`。不要在 `results/` 根层散落文件。
- 脚本、代码一律放 `tools/`，**不得**放进 `results/`。`results/` 是纯数据区。
- 不要新建 `outputs/`、`archive/`、`backup/` 这类同义目录。纠错方式是移动文件，不是另开新目录。

---

## 3. 命名规范

**`<model-slug>`** — 模型目录名
- 规则：全小写，仅 `[a-z0-9-]`，不含空格与下划线。
- 取模型的稳定标识名，不用版本日期：`claude-opus-5`、`gpt-5`、`gemini-3-pro`。
- 同一系列的不同版本视为不同模型，分开建目录：`gpt-5` 与 `gpt-5-mini` 并列。

**`<prompt_id>`** — 提示词 ID
- 规则：`<category>-<NNN>`，全小写，三位数字补零。例：`reasoning-001`、`coding-014`。
- `<category>` 的取值由提示词仓库定义，本仓库照抄，不自创。
- 该 ID 必须与提示词仓库中的 ID **逐字一致**，不允许本仓库单方面改名。

> 目录总规模提示：模型数 × 提示词数 × 2 个文件。50 模型 × 100 提示词 = 10000 个目录。
> 这是刻意的——结果天然按 (模型, 提示词) 二元组寻址，靠 `index.csv` 提供全局检索，不靠目录嵌套。

---

## 4. 单条结果目录的内容

### `meta.json`（必填）

```json
{
  "prompt_id": "reasoning-001",
  "prompt_ref": "prompts/reasoning/reasoning-001.md",
  "prompt_commit": "3f9a1c2",
  "model": "claude-opus-5",
  "model_id": "claude-opus-5-20260101",
  "date": "2026-09-27T10:30:00Z",
  "params": {
    "temperature": 1.0,
    "max_tokens": 8192
  },
  "judge": null
}
```

| 字段 | 说明 |
|---|---|
| `prompt_id` | 与目录名一致，与提示词仓库一致 |
| `prompt_ref` | 提示词在**提示词仓库**中的路径 |
| `prompt_commit` | 运行时提示词仓库的 commit sha（可短 sha）。保证提示词改动后仍能还原当时原文 |
| `model` | 与 `<model-slug>` 目录名一致 |
| `model_id` | API 返回的精确模型 ID，可能带日期后缀。**不要**用它做目录名 |
| `date` | ISO 8601 UTC，精确到秒 |
| `params` | 实际生效的采样参数。默认值也照实写，不要省略 |
| `judge` | 评分。`null` = 未评；已评则填 `{"score": 4, "max": 5, "by": "human"}` |

`judge` 评完回填，**不要**为此单独开目录。

### `output.md`（必填）
模型输出正文，原样保存，Markdown 格式。**不要**摘要、不要润色、不要修正格式错误。

### `raw.json`（可选）
API 原始响应，保留 token 计数、finish_reason 等。体积大时可省略。

---

## 5. `results/index.csv`

每一行一条结果，表头固定：

```csv
prompt_id,model,date,judge_score,path
reasoning-001,claude-opus-5,2026-09-27T10:30:00Z,4,results/claude-opus-5/reasoning-001
reasoning-001,gpt-5,2026-09-27T11:05:00Z,3,results/gpt-5/reasoning-001
```

- 按 `prompt_id` 排序，同一 prompt_id 内按 `model` 排序。稳定排序保证 git diff 干净。
- `judge_score` 未评分留空，勿填 `0`。
- 新增/删除结果**必须**同步更新此文件。它是跨模型对比的入口，不要靠遍历目录来查。
- 可由 `tools/` 脚本重新生成，但**入库的版本需人工确认**。

---

## 6. 提交规范

**提交信息**

```
<model> · <prompt_id>          新增一条结果
<model> · <prompt_id> · 补评   回填 judge 分数
整理 · 批量导入 <n> 条
```

例：`claude-opus-5 · reasoning-001`

**追加写（append-only）** — 这是本仓库最重要的纪律：

- 已提交的结果**不得**修改。模型答得不好也是有价值的数据，事后修好会毁掉整个仓库的对比价值。
- 采录错误（贴错文件、串行）时：把原目录 `git mv` 成 `<prompt_id>.invalid/` 并在 `meta.json` 加 `"invalid_reason"`，然后重新录一条。保留痕迹，不要 `git rm` 抹掉。
- **禁止** `git push --force`、`git rebase` 已推送的提交、修改任何已有提交。

---

## 7. 红线（public 仓库）

1. **密钥**：提交前确认无 API key、token、密码。模型偶尔会在输出里回显提示词中的凭据——扫一遍 `output.md`。发现即整条重录并轮换该密钥。
2. **个人信息**：真实姓名、邮箱、手机号、住址一律脱敏。本仓库用户身份统一用 GitHub 账号名。
3. **不追踪**：`.gitignore` 顶部有中文警示，**不要**把 `results/` 加进忽略规则。这是本仓库的主体内容。
4. **体积**：单条结果超过 ~2MB 时，改为在 `output.md` 存截断预览 + 全文另存为 release 附件，并在 `meta.json` 记 `truncated: true`。git 历史不可逆，大文件不要直接提交。

---

## 8. 常见任务

**录入一条结果**

```bash
PID=reasoning-001
MODEL=claude-opus-5
mkdir -p "results/$MODEL/$PID"
# 写入 meta.json 与 output.md
# 然后在 results/index.csv 追加一行（按排序位置插入）
git add "results/$MODEL/$PID" results/index.csv
git commit -m "$MODEL · $PID"
```

**批量导入**：先把所有结果文件放好，再用 `tools/` 脚本统一生成 `index.csv` 并 `git add results/`。一次提交一条，diff 太大不易审查。

**加一个新模型的测试**：只需 `mkdir results/<new-model>/`，无需改动任何已有内容。

**重命名模型目录**（如模型更名）：`git mv` 整个目录 + 同步改 `meta.json` 的 `model` 字段 + `index.csv` + 提交信息。不要新建目录再删旧的。
