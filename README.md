# Migrating a Jira Connect app to Forge: what broke, what it took, what Atlassian's review flagged

This repository is a working Forge port of [samid737/jira-checklist-plugin](https://github.com/samid737/jira-checklist-plugin),
a small open-source Atlassian Connect app that adds a **Checklists** panel to every Jira issue.
It was ported as a public, end-to-end example of a Connect → Forge migration: same feature,
same data, no server.

If you own a Connect app and are weighing the migration, this README is the short version of
what you will run into. The code next to it is the long version.

## Result in one table

| | Connect (original) | Forge (this port) |
|---|---|---|
| Hosting | Your own Node/Express server (Heroku Procfile) | None. Atlassian hosts it |
| Auth | JWT per request via `atlassian-connect-express` | Handled by the platform; the panel calls Jira as the current user |
| Install lifecycle | `/installed` webhook, tenant rows in SQLite/Postgres | None needed |
| App descriptor | `atlassian-connect.json` | `manifest.yml` |
| UI | Server-rendered Handlebars in an iframe, jQuery + jQuery UI + AUI from CDNs | UI Kit (native React components), no CDN scripts |
| Storage | Jira issue entity property `todos` | Same property, same JSON shape. Existing checklists survive the switch |
| Runtime dependencies | 12 (Express, ACE, Sequelize, sqlite3, hbs, …) | 3 (`@forge/react`, `@forge/bridge`, `react`) |
| App code | 489 lines across 10 files | 141 lines in 1 file |
| Egress | Your server plus three CDNs | Zero. Eligible for the Runs on Atlassian badge |
| Revenue share (paid apps) | 20 %, rising to 25 % on 1 Oct 2026 | 0 % up to $1M lifetime Forge revenue, then 17 % |

## What the app does

Open any issue. The Checklists panel lets you add items, tick them off, reorder them and delete them.
The list is stored on the issue itself, in the entity property `todos`, exactly as the Connect app stored it:

```json
{ "todos": { "Write tests": true, "Update docs": false } }
```

Because the property key and shape are unchanged, a site that uninstalls the Connect app and installs
this one keeps every checklist on every issue. No data migration step.

## What changed, module by module

| Connect descriptor | Forge manifest |
|---|---|
| `webPanels` at `atl.jira.view.issue.left.context` | `jira:issuePanel` with `render: native` |
| `scopes: [READ, WRITE]` | `read:jira-work`, `write:jira-work` |
| `authentication.type: jwt` | Not applicable |
| `lifecycle.installed` | Not applicable |
| `baseUrl`, `links.self` | Not applicable |

| Connect code | Forge code |
|---|---|
| `app.js` (Express bootstrap, middleware, static files) | Deleted |
| `routes/index.js` (JWT-authenticated route rendering the panel) | Deleted |
| `views/*.hbs` (layout + panel template) | Deleted |
| `public/js/addon.js` (jQuery UI logic, `AP.request` calls) | `src/frontend/index.jsx` (React + `requestJira`) |
| `config.json` (ports, DB store, host whitelist) | Deleted |
| `atlassian-connect.json` | `manifest.yml` |

## What broke, and how it was fixed

1. **Everything server-side disappeared, which is the point.** `atlassian-connect-express`, Express,
   JWT verification, the SQLite tenant store, the `/installed` hook: none of it has a Forge equivalent
   because none of it is needed. The panel calls the Jira REST API directly from the frontend through
   `requestJira` from `@forge/bridge`, as the current user, which is what `AP.request` did in Connect.

2. **Drag-and-drop reordering has no UI Kit equivalent.** The original used jQuery UI `sortable`.
   UI Kit has no drag-and-drop component, so the port uses up/down buttons. If drag-and-drop is
   essential for your app, that module needs Custom UI (your own React bundle in an iframe) rather than UI Kit.

3. **UI Kit's `Textfield` has no `onKeyDown`.** The original added an item on Enter with a jQuery `keyup`
   handler. UI Kit's `Textfield` only exposes `onChange`, `onBlur` and `onFocus`. The idiomatic fix is to
   wrap the input in UI Kit's `Form` and let its `onSubmit` handle Enter. This is not obvious from the
   docs; it was found by reading the type definitions in `@atlaskit/forge-react-types`.

4. **The UI Kit template scaffolds a backend you may not need.** `forge create` with the issue-panel
   template generates a resolver (`src/index.js`, `src/resolvers/`, a `function` module, `@forge/resolver`).
   When the frontend can call Jira itself, delete all of it. Fewer moving parts, and no server-side code to review.

5. **The REST version moved from v2 to v3.** The original called `/rest/api/2/issue/{key}/properties/todos`.
   The port uses v3. Entity property endpoints are identical between the two, so the payload did not change.

6. **Scopes are named differently and must be confirmed at install time.** Connect's `READ`/`WRITE` became
   `read:jira-work`/`write:jira-work`. After the first deploy the CLI warns about new scopes; install with
   `--confirm-scopes`, and on later scope changes run `forge install --upgrade`.

7. **`forge create` wants a terminal.** It prompts you to pick a Developer Space, which fails in
   non-interactive shells. Pass `-s <developer-space-id> -y` instead. Get the id from `forge developer-spaces list`.

8. **The generated `app.id` in `manifest.yml` must be kept.** If you rebuild the manifest from your own
   template, copy the `app:` block from the generated file or deploys go to a different app.

9. **Two behaviours in the original were quietly wrong and were not preserved.** It rendered item text with
   `innerHTML` (an injection vector), and any load error silently showed an empty list. The port renders text
   as text and surfaces save/load errors in the panel.

10. **The browser caches the UI Kit bundle.** After each deploy, hard-reload the issue page or you will be
    testing the previous version.

## Behaviour parity

| Feature | Connect | Forge port |
|---|---|---|
| Add item | Yes | Yes |
| Add on Enter | Yes | Yes, via `Form` submit |
| Toggle done | Yes | Yes |
| Delete item | Yes | Yes |
| Reorder | Drag-and-drop | Up/down buttons |
| Re-adding an existing item | Keeps position, resets to not done | Same |
| Progress count | No | "n of m done" |
| Error display | Silent | Shown in panel |

## What it took

Reading the original, writing the port, deploying and installing on a test site fit in one working session.
The port is 141 lines of React. There is no build tooling beyond the Forge CLI and no infrastructure to run.

## What Atlassian's review flagged

Not submitted to the Marketplace yet. This section will be filled in after review.

## Run it yourself

```bash
npm install -g @forge/cli && forge login
git clone https://github.com/hermogenes-lopez/checklist-forge.git && cd checklist-forge && npm install
forge register            # registers a copy under your own developer account
forge deploy -e development
forge install -e development --site <your-site>.atlassian.net --product jira --confirm-scopes
```

Open any issue and look for the **Checklists** panel.

## License and attribution

Apache License 2.0, same as the original. See `LICENSE` and `NOTICE`. The original app is by
[samid737](https://github.com/samid737); this port changes the runtime, not the idea.
