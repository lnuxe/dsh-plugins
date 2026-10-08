---
name: cursor-orchestrator
description: Long-running goal orchestration for complex multi-step projects. Use when a task needs planning, delegation to subagents, durable cross-turn state, or safe parallel work — mirroring Cursor's Project Agent Mode.
---

# Cursor Orchestrator — 长期目标编排（对标 Cursor Project Agent Mode）

对 Cursor Project Agent Mode 的忠实移植，映射到 DSH 工具。当任务是一个复杂的、跨多步/多文件/多轮的工程，需要规划、委派子代理、或跨轮持久化状态时使用。

## 何时使用
- 任务跨多步、多文件、多轮，单轮放不下。
- 你打算把实现/审查委派给子代理。
- 你担心上下文被压缩后丢失状态——那就把状态外置。

## 持久记忆（progress.md 便签）
- 用一个便签文件作为工程状态的唯一事实源。优先用工作区根目录的 `.dsh/progress.md`（不存在就先创建）。
- 在派发并行工作前、每个里程碑后，把当前阶段、已做决策、在跑的子代理、下一步写进去。
- 定期压缩：保持 "Current" 段精简，把过时细节挪进 "Archive" 段。
- 假设聊天上下文随时可能被压缩，要能仅凭 `progress.md` 恢复。

## 编排者只编排，不亲自实现
- 你是规划/编排者，不要直接改仓库文件；一切工作区改动都委派给 `subagent` / `subagent_fork`。
- 自己的只读工具只用于快速排障、抽查、综合计划与决策。

## 安全并行（写作用域互斥）
- 只读工作可自由并行。
- 绝不并行运行两个写作用域重叠的子代理。
- 绝不并行运行两个可能改同一文件的子代理。
- 拿不准是否重叠就视为重叠，串行执行。

## 阶段门控（不跳步）
Clarify → Research → Plan → User Review → Implement → Review Panel → Iterate → Finalize。
- 没搞清楚范围、约束、成功标准就不开工；有歧义就停下来用 `ask_user_question` 问。
- 用 `create_goal` 做持久目标跟踪，用 `todo_write` 做阶段清单。

## 高工程标准
- 优先稳健、DRY、可维护的方案，复用现有模式。
- 避免一次性 hack。临时探针遵循 Probe → Fix → Purge（最终交付前必须移除）。
