# Journal - TexasOct (Part 1)

> AI development session journal
> Started: 2026-09-23

---


## Session 1: macOS v0.1.0 release repair and public acceptance
<!-- trellis-session: v=2 fp=c4ff9df2cab3dcff -->

**Date**: 2026-10-02
**Task**: macOS v0.1.0 release repair and public acceptance
**Branch**: `fix/v0.1.0-macos-release`

### Summary

Repaired foreground runtime lookup, process ownership, and local proxy handling; republished v0.1.0 and verified the public installer in isolated and default macOS paths.

### Main Changes

- Unified installed foreground and managed runtime resolution; replaced rendered ps parsing with actual psutil argv.
- Gated publication on Ubuntu and macOS acceptance of the same built wheel; backed up and replaced the authorized existing tag and Release.
- Preserved operator configuration, credentials, existing SQLite rows, and initial stopped service state; archived the sanitized requirement report.

### Git Commits

| Hash | Message |
|------|---------|
| `33ae6ce` | fix: repair macOS runtime and gate release on installed acceptance |
| `a01b642` | docs: record public v0.1.0 macOS acceptance |

### Testing

- [OK] 755 Python tests, 210 frontend tests, clean Pyright, frontend/build/packaging/shell/release gates.
- [OK] Publication run 36910091577: all four jobs succeeded; four public assets and all digests verified.
- [OK] Public wheel: 59 checks; public isolated/default installer phases: 148 checks; installed parity: 52 files; no probe files remain.

### Status

[OK] **Completed**


## Session 2: Complete public v0.1.0 and actual operator acceptance
<!-- trellis-session: v=2 fp=64fe4ef06681b633 -->

**Date**: 2026-10-03
**Task**: Complete public v0.1.0 and actual operator acceptance
**Branch**: `fix/v0.1.0-macos-release`

### Summary

完成首次设置、分步 Provider/model 配置、全局默认路由、真实业务与正式 v0.1.0 发布；实际配置备份删除后公开重装，原记录保留，服务健康运行。

### Main Changes

- 正式 tag 指向精确验收 commit；公开四资产与 sidecars/digests 一致，报告提交不移动 tag。
- 实际 config 编辑/overlay/reload、三个策略和 supplied-assistant 续聊通过；四次真实调用无重试，原 6 条业务元组分别保留至 10 条。
- 保留原 306/2 与 204/1 失败、20/0 retained verifier 和 2048 reasoning-only 边界；已完成独立验收并归档任务。

### Git Commits

| Hash | Message |
|------|---------|
| `c5adab66927816fdd8542fc8c3c1586d29939679` | feat: enable incremental setup and global default routing |
| `019a3030ad735db63167bc5176f245f89293c0e4` | docs: record installed business requirements acceptance |

### Testing

- [OK] 970 backend；267 frontend unit；120 browser；344 native；Pyright/types/lint/build/freshness/lock/shell/validator 通过。
- [OK] 精确发布 head 的四个 CI job 成功；公共 wheel/installer 各 119 项；实际公开重装 0；实际 completion 239/0、4 次 stream。
- [OK] 最终 status/doctor 0、authorized health ok、数据库完整、empty activity、cleanup warning 0；backup/auth/history/source parity 均保留。

### Status

[OK] **Completed**
