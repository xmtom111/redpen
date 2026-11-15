# Publishing and desktop distribution

The public GitHub Pages app is [English](https://xmtom111.github.io/redpen/) / [简体中文](https://xmtom111.github.io/redpen/zh/). An official Hugging Face Space and release downloads have not been published by this change.

## Repository settings (owner)

Apply `docs/repository-metadata.json` to the repository Description, Website, and Topics through GitHub's About settings. With authenticated GitHub CLI:

```sh
gh repo edit xmtom111/redpen --description 'Practice math skills by catching planted mistakes in AI reasoning.' --homepage https://xmtom111.github.io/redpen/ --add-topic math --add-topic education --add-topic ai-literacy --add-topic critical-thinking --add-topic reasoning
```

## Official Hugging Face Docker Space (owner)

1. Sign in to the owning Hugging Face account, create a public Space with Docker SDK, port 7860.
2. Upload the root Dockerfile, redpen.py, AGENTS.md, LICENSE, NOTICE, README.md, and the full demo directory. Use the repository's Dockerfile unchanged. Do not upload `.env`, sessions, or user keys.
3. In the Space's README metadata, set `sdk: docker` and `app_port: 7860` (preserve the rest of the project documentation).
4. Built-in practice and users' browser keys require no shared server secret. If enabling server-funded live rounds, configure REDPEN_API_KEY, REDPEN_BASE_URL, REDPEN_MODEL in Space secrets. A public instance with shared keys allows visitors to spend that account's quota; leave these unset unless intended.
5. Wait for Running; test `/` and `/zh/`, submit a built-in round, verify its hash and check that SymPy checks pass. Test browser-provider CORS separately.
6. Put the actual, tested Space URL beside the Pages buttons in both READMEs. Do not insert a guessed URL.

本仓库已提供 7860 端口的 Docker 配置。维护者创建公开 Docker Space、上传上述文件、验证双语练习后，再把真实地址放到两个 README 顶部。

## Windows and macOS releases (owner)

`release.yml` builds Windows x64, macOS Apple Silicon and macOS Intel executables. Each includes Python, static assets, both banks, instructions, and SymPy. The frozen `--self-test` validates bundled resources and mathematical checks before upload. Tag builds create a **draft** GitHub Release; manual dispatch only uploads build artifacts.

1. Review and merge the branch through your normal process, then run **Build desktop releases → Run workflow** to inspect artifacts first.
2. Download and extract the correct architecture on clean Windows and macOS machines without Python, Git or Docker. Double-click, confirm the browser opens, complete a built-in round, check hints/verify/reveal and Chinese navigation. Disconnect the network and repeat built-in practice with text formulas. Test `RedPen --self-test` from a terminal as an additional maintainer check.
3. These are unsigned builds. Add Windows signing and macOS signing/notarization using owner-held certificates if frictionless trusted launch is required. Test Gatekeeper/SmartScreen behavior and document any OS prompt accurately; CI alone cannot certify first launch on a clean machine.
4. Create and push a version tag, for example `git tag v0.2.0` then `git push origin v0.2.0`, after choosing the real version. The workflow attaches archives and SHA256SUMS.txt to a draft release.
5. Verify all three assets and checksums, publish the draft in GitHub Releases, and add the actual latest-release link to both READMEs.

需要维护者运行工作流、下载到未安装开发工具的 Windows/macOS 电脑验证，再发布草稿 Release。构建不会从本地自动推送，也不声称已通过真实干净电脑验收。
