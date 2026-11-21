# 🖍️ RedPen

[**免安装在线体验 · 简体中文**](https://xmtom111.github.io/redpen/zh/) · [**Try online · English**](https://xmtom111.github.io/redpen/) · [English README](README.md)

**红笔抓错：专治一本正经的胡说八道**（代码 · 数学 · 逻辑）

AI 越会写看起来头头是道的答案，人越需要快速抓错的能力。RedPen 点开就能玩：提供短小的代码片段、逻辑统计简报与数学解题过程，里面可能藏着典型 AI 坑，也可能完全没毛病。点击出错行标红、选出错因与改法，立刻看红笔批改复盘。

## 网页即开即玩

1. **首屏直接开做「今日红笔」**：打开 `/` 或 `/zh/` 即进入当天 3 道精选（尽量覆盖逻辑、代码、数学），无需登录、后端或 API Key。
2. **默认点选，高级才手写**：点出可疑的那一行，错因和改法会立刻出现在行下方；如果全文没问题，再选「我觉得没问题」。需要手写诊断时，点「卡了？」切到自由输入。
3. **连胜与无剧透战绩卡**：进度和连胜保存在本地浏览器。通关今日红笔后会出现一张方便截图转发的无剧透战绩卡（Wordle 风格，不含题号与答案），也可复制或系统分享。
4. **按题包刷题与出题工坊**：在「题库」可按逻辑 / 代码 / 数学分类或盲测练习；「出题工坊」作为次级入口，仅在需要填入个人 API Key 现场出题时使用。

计分：每处错误定位、诊断、修正各 1 分；误标正确行会拉低准确度并扣 1 分；提示每次扣 0.5 分。级别 0 完全正确。

## 自定义出题（出题工坊）

点击顶部「出题工坊」→「AI 模型设置」，选择平台并粘贴自己的 API Key，即可按主题或题目生成自定义练习。还可上传题目文本、填入参考答案、选择难度与错误侧重点，并在提交后让 AI 同台找错对比。

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
