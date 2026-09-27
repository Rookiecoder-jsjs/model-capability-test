# 模型能力测试 (Model Capability Test)

用于对模型能力进行测试、评测与对比的实验仓库。

English name: **Model Capability Test**

## 目录结构

```
mt/
├── README.md      # 项目说明
├── .gitignore     # 忽略规则
└── (后续) prompts/     # 测试提示词
    (后续) results/     # 测试结果输出
```

## 约定

- 测试提示词与运行结果分离：`prompts/` 存放输入，`results/` 存放输出。
- `results/` 中的产物默认不提交，避免仓库被大量生成文件撑大。
- 每次实验使用独立分支，便于对比不同模型在同一提示词下的表现。
