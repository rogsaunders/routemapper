# RouteMapper Documentation

This folder is the **master copy** of RouteMapper's documentation. Copies published elsewhere (the Notion documentation hub, the public user-guide pages) are views of these files. Change the file here first, then update the published copy.

## Current documents

| Document | For | What it covers |
|---|---|---|
| [specification.md](specification.md) | Investors, partners | What RouteMapper is, who it's for, features, status, pricing, business model, roadmap |
| [architecture.md](architecture.md) | Technical readers | How it is built: apps, roadbook engine, data, sync, billing, maps, security, technical debt |
| [route-mapper-workflow.md](route-mapper-workflow.md) | Organisers, navigators | End-to-end field workflow: prepare → record → review → distribute → travel |
| [user-guide.md](user-guide.md) | Everyone using the app | Every screen, button and setting (published to Notion) |
| [Running the Roadbook Preview.md](Running%20the%20Roadbook%20Preview.md) | Developer (Roger) | Regenerating HTML/DOCX roadbooks from JSON with the scripts; icon reference |
| [../DEVELOPMENT.md](../DEVELOPMENT.md) | Developers | Branching, previews, release workflow |

## Design records

Decisions captured while a feature was designed. They explain *why* things are built the way they are; the current state lives in `architecture.md`.

| Record | Date | Topic |
|---|---|---|
| [drive-mode-architecture.md](drive-mode-architecture.md) | May 2026 | Travel Mode (originally "Drive Mode") MVP |
| [travel-standalone-app.md](travel-standalone-app.md) | Jun 2026 | Standalone RouteMapper Travel app at go.routemapper.net |
| [route-library.md](route-library.md) | Jun 2026 | Route Library marketplace and phased plan |
| [route-library-content-policy.md](route-library-content-policy.md) | Jun 2026 | Draft content policy, safety disclaimer and author terms (needs legal review before paid routes) |

## Database change records

The production database is not under migration control. These SQL files record changes applied by hand, so they can be audited and repeated: `profile-fields-migration.sql`, `route-library-phase-a-migration.sql`, `route-library-admin-migration.sql`, `stage-exports-delete-policy-migration.sql`, and `../db/`.

## Samples

`samples/` — reference GPX exports from Rally Navigator (OpenRally and plain), used to validate import and export.

## Archive

[`archive/`](archive/) holds retired documents: specifications v1–v3.1 (2025), workflow v2–v7, and the December 2024 website notes. Kept for history; do not use them as a description of the current product.

## Updating these documents

1. Edit the Markdown file here on a branch and open a pull request.
2. After it merges, update the matching Notion page (paste the new content or the changed section).
3. Add a line to the document's *Document history* table.
