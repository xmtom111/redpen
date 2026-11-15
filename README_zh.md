# 🖍️ RedPen

[**免安装在线体验 · 简体中文**](https://xmtom111.github.io/redpen/zh/) · [**Try online · English**](https://xmtom111.github.io/redpen/) · [English README](README.md)

**练扎实的数学能力，学会看穿 AI 的推理错误与幻觉。**

AI 发展越快，我们越需要独立检查解答的能力。RedPen 提供故意埋错的数学解题过程：你指出出错步骤，解释违反了哪条规则，再写出正确做法。提交后逐条复盘所有错误，避免把错误知识带走。

## 第一次使用：三步开始

1. 点击上方“免安装在线体验 · 简体中文”。内置题目无需账号、API Key 或安装软件。
2. 选择一道内置题，初次可从级别 2 开始。自定义题可选择更容易找错的级别 3，再挑战级别 1；盲测会隐藏错误级别，也可能完全无错。
3. 下拉选择步骤，填写“哪里错了”和“正确写法”，点击提交，查看评分与完整复盘。

每处错误有三个得分点：定位、诊断、修正各 1 分。误报扣 1 分，每次提示扣 0.5 分。级别 0 完全正确；只说最终答案错了，不等于找到根本错误。

## 按自己的薄弱点练习

打开“AI 模型设置”，选择平台并粘贴自己的 API Key。输入题目或知识点，选择级别 0–4 或盲测，即可出题。还可上传题目文本、填入教材标准答案、选择难度和错误侧重点。答题、提示、批改、揭晓、哈希校验、AI 同台找错和薄弱项统计都在网页完成。

请求由浏览器直接发送给所选模型平台，可能产生费用。Key 仅存于本机浏览器，可随时清除，请在自己的设备使用。部分平台的 CORS 策略不允许浏览器调用，可换用兼容接口或本地服务的环境配置。浏览器生成题目不经过 SymPy 验算；哈希只能检验答案钥匙是否改变，不能证明数学正确，也不能阻止开发者工具查看钥匙。内置题库用规则评分，不等同于理解任意自然语言的智能判分。

## 级别选择

| 级别 | 内容 |
|---|---|
| 0 | 无错，练习信任正确推理 |
| 1 | 一处隐蔽错误，最难发现 |
| 2 | 2–3 处常见误区 |
| 3 | 约一半步骤有错，适合开始练习 |
| 4 | 大多步骤无效，适合刚接触的主题 |
| blind | 随机隐藏级别 0–2 |

## 本地应用与托管实例

仓库提供 Docker 配置及 Windows/macOS 发布流水线。官方 Hugging Face Space 和下载包尚需维护者发布，这里不提供虚构链接。具体操作见[部署说明](docs/deployment.md)。本地内置题库无需 Key；SymPy 用于检验答案钥匙中的数学恒等式。公式渲染依赖在线 MathJax，离线仍可阅读与输入纯文本数学。

## 高级：开发、命令行与 AI 编程助手

需要 Python 3.9+；基础 CLI 仅用标准库，机器验算需要 SymPy。

```bash
git clone https://github.com/xmtom111/redpen.git
cd redpen
pip install sympy
python redpen.py demo
```

浏览器会自动打开，本地中文入口为 http://127.0.0.1:8000/zh/ 。如需服务端模型，在环境中设置 REDPEN_API_KEY、REDPEN_BASE_URL、REDPEN_MODEL；不要提交密钥。也可在网页设置自己的浏览器 Key。

命令行支持 new、hint、submit、submit --ai、reveal、stats、verify。参数与示例见[英文高级说明](README.md#advanced-cli-development-and-ai-coding-assistants)。AGENTS.md 与 CLAUDE.md 定义 AI 编程助手的出题和评分协议；普通网页使用者无需阅读这些文件。

```bash
python -m unittest discover tests
python redpen.py demo --export _site
```

导出目录可部署到静态托管；仓库 Pages 工作流在 main 更新时部署双语站点。学习记录存于当前浏览器，清除站点数据会删除记录。完整协议见 [AGENTS.md](AGENTS.md)，许可证见 [LICENSE](LICENSE)。

### 命令行参数速查

| 操作 | 命令与参数 |
|---|---|
| 出题 | `python redpen.py new "知识点" --level 2`，支持 `0`–`4` 或 `blind` |
| 上传题目 | `new --file problem.txt --answer "教材答案"` |
| 难度与侧重点 | `--difficulty intro`（入门）、`standard`（标准）、`advanced`（进阶）、`competition`（竞赛）；`--focus sign,domain` 指定错误类别 |
| 提示 | `python redpen.py hint`，按数量、位置、概念分阶段给提示，每次扣 0.5 分 |
| 批改 | `python redpen.py submit`，或给出发现文件路径；网页用户直接点击提交即可 |
| AI 对比 | `python redpen.py submit --ai`，先完成自己的答题，再让 AI 独立找错 |
| 揭晓 | `python redpen.py reveal`，逐条解释全部错误，未找到的错误计为漏报 |
| 统计 | `python redpen.py stats`，显示各级别成绩和薄弱类别 |
| 校验 | `python redpen.py verify`，核对已密封答案的承诺哈希 |
| 本地网页 | `python redpen.py demo`；`--host` 和 `--port` 设置监听地址；`--no-open` 不自动弹出浏览器 |
| 静态导出 | `python redpen.py demo --export _site`，发布 `_site` 目录即可 |

CLI 的模型配置可从 `.env.example` 复制到 `.env` 后填写。网页用户可跳过此步，直接使用图形化设置。设置不同角色模型的高级选项见 `.env.example`。答案钥匙中提供的恒等式可由本地服务用 SymPy 检查；这不能证明每句推理都正确。若模型漏记了真实错误，智能判分可记为额外发现（bounty），但内置规则判分不能独立证明任意额外错误。

### 常见问题

- 不会输入公式？先点输入框，再点分数、根号、导数等按钮；公式用 `$…$` 包围可预览。
- Key 填了仍失败？检查平台、模型权限与额度；跨域失败时换兼容接口，或使用本地服务环境配置。
- 为什么正确答案也要检查？级别 0 训练你根据规则判断，不因怀疑 AI 就把每步都报错。
- 如何保留正确知识？复盘包含正确步骤、错因、检查习惯与同类练习；保存复盘，不要把埋错解答当答案。
- 多人共用设备？不要保存个人 API Key；离开前用“清除 Key”删除。清除浏览器站点数据还会删除练习统计。

网页测试：启动本地服务于 18971 端口，将静态导出目录用 HTTP 服务放在 18972 端口，在安装 Playwright 的环境运行 `node tests/browser-flow.cjs`。该测试使用模拟模型响应，不消耗真实 Key。
