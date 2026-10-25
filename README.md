<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="kit/assets/banner-dark.svg">
    <img src="kit/assets/banner-light.svg" alt="TillerHand: AI builds. You steer." width="100%">
  </picture>
</p>

<p align="center">
  <a href="kit/CHANGELOG.md"><img alt="Version" src="https://img.shields.io/badge/version-3.26.0-2a78d6?style=flat-square"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-2a78d6?style=flat-square"></a>
  <img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-ready-d97757?style=flat-square">
  <img alt="Node.js 18+" src="https://img.shields.io/badge/Node.js-18%2B-3c873a?style=flat-square">
</p>

<p align="center">
  <b>English</b> · <a href="README.tr.md">Türkçe</a> · <a href="https://burakdogrul.github.io/TillerHand/kit/guide.html"><b>Read the guide →</b></a>
</p>

---

**TillerHand** is a starter kit for building real products with [Claude Code](https://claude.com/claude-code), from the first idea to production and maintenance. The AI writes the code; you make the decisions. Every product, technical, design and cost choice comes to you as a short list of options with a recommendation and its trade-offs.

> The kit's commands and documents are in Turkish.

## Why TillerHand

| | |
|---|---|
| **You decide** | The AI asks before it commits to anything that matters: stack, data model, design, cost. Design questions come with visual previews. |
| **An expert board reviews** | Product, architecture, security, UX, QA and privacy reviewers check the plan, each task, each commit and each phase. |
| **Guardrails, not promises** | Hooks block secrets, destructive commands, unapproved prod deploys and weakened tests before they happen. |
| **Structure that holds** | A feature-based folder map, acceptance tests written first, and a dashboard that shows where the project stands. |

## Quick start

Requirements: [Claude Code](https://claude.com/claude-code), Git, Node.js 18+.

```bash
mkdir my-app && cd my-app
git clone https://github.com/burakdogrul/TillerHand.git vibe-kit
node vibe-kit/kit/kit.mjs init
claude
```

Then describe your idea in one to three sentences:

```
/start An invoicing and payment tracker for freelancers
```

Already have a project? Use `/adopt` instead. Codex and Antigravity are supported too: `node vibe-kit/kit/kit.mjs init --tool codex`.

## How it works

| Step | Command | What happens |
|---|---|---|
| Plan | `/start` | Questions turn your idea into a stack, architecture, design and roadmap. |
| Build | `/build` | One task at a time: tests first, then code, then review. |
| Check | `/board` · `/findings-all` | The board and scored reports on tech, security, UX, performance and legal. |
| Ship | `/release first` | Checklists, hosting and domain setup, approved production deploy. |
| Maintain | `/maintain` · `/fix-bug` | Updates, live monitoring and root-cause bug fixes. |

Every command, guard and document is explained in the **[guide](https://burakdogrul.github.io/TillerHand/kit/guide.html)**.

## License

[MIT](LICENSE) © 2026 Burak Doğrul
