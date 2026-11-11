# Request Lab

A small Postman-style API client built with Node.js and plain HTML/CSS/JavaScript. No dependencies or API key required. Node.js 22+.

## Run

```sh
cd /Users/ajoly/Documents/Codex/2026-11-10/gene/outputs/request-lab
npm start
```

Open http://localhost:3000. Change the port with `PORT=4000 npm start`.

## Use

- Choose GET (read), POST (create), PUT/PATCH (update), or DELETE. The sidebar loads demo requests for JSONPlaceholder. Demo writes are simulated by that service, not persisted.
- Enter a URL, JSON headers, and a raw or JSON body. The Content-Type header defaults to application/json; change it for other body types.
- Under Authorization, select Bearer, Basic, or an API key header. Enter credentials directly or reference environment variables, such as `{{token}}`. Authorization settings override matching headers.
- In the sidebar Environment section, edit the environment name and variable table. Add or remove rows, choose string/number/boolean types, and show or hide values. The raw JSON editor stays synchronized; you can also import a JSON file. Empty or duplicate keys and invalid typed values block sending until corrected. Variables work in URLs, header names/values, body text, and authentication fields. Body substitutions are literal text; escape JSON string values when needed. Missing variables produce an error.
- Inspect response status, elapsed time, size, body, and headers. JSON responses are pretty-printed. Recent request templates stay in memory; click one to restore its method and URL.

```json
{
  "name": "Local",
  "variables": {
    "baseUrl": "http://localhost:8080",
    "token": "your-token",
    "username": "your-user",
    "password": "your-password"
  }
}
```

The default environment loads from `environments/example.json` at page load. Use **Import JSON** for a private file; exported `*.local.json` files are ignored by Git. Nothing is saved in browser storage. Reloading clears unsaved invalid edits, responses, and history; valid environment edits persist on disk. Saved calls persist on disk. Export environments to retain values; exports contain secrets.

## Scope and limits

The server binds to loopback and proxies HTTP/HTTPS requests, including local API endpoints. Keep it local: it is a developer tool with access to your machine's network. API credentials are transmitted to the target API; use HTTPS for remote APIs. Redirects are displayed without being followed, so credentials are not forwarded automatically. Requests time out after 30 seconds; request and response bodies are limited to 5 MB. Responses display as UTF-8 text. Binary downloads, multipart uploads, cookie jars, OAuth login flows, and streaming are outside this starter's scope. History stores the URL as entered; avoid putting secrets directly in it.

## Verify

```sh
npm test
```

Tests use a local echo API to exercise CRUD methods, credential forwarding, response bodies, upstream errors, redirects, and proxy access restrictions.

## Saved calls

Name a request and select **Save call**. Calls are stored as individual JSON files in `calls/` (created automatically and ignored by Git). Select a call to restore its method, URL, headers, body, and active authorization fields; **Update call** saves changes to that file. **New call** starts a fresh request. Sidebar demo presets also start a new call.

**Duplicate** copies the saved file as `<id>_copy.json`; subsequent copies use `_copy_2`, `_copy_3`, etc. **Delete** removes the file after confirmation. **Export JSON** downloads the current editor request. **Import JSON** creates a saved call from an exported file; conflicting filenames are rejected rather than overwritten. You can also move valid JSON files into `calls/` and reload the page. Invalid files are omitted from the list.

Call names generate filenames on first save; renaming a loaded call changes its display name while keeping its filename. Environment values and response bodies are not included. Literal credentials in request URLs, headers, bodies, or active auth fields are saved as entered; use `{{variables}}` to keep their values in a separate environment.

## Multiple environments

The sidebar's **Active environment** selector chooses the single environment used by requests, even when the editor is collapsed. Expand Environment to create, rename, duplicate, or delete environments. **New** opens a blank inline name field. Click the checkmark (or press Enter) to create the file and activate the environment; Cancel returns to the existing editor without creating a file. Leaving the name blank creates `environment_1`, `environment_2`, etc. Each environment is stored as its own JSON file in `environments/`. Names are sanitized for filenames, and collisions receive a numeric suffix. Later renaming updates the display name while keeping the original filename.

Valid field edits save automatically and the UI displays saving, saved, or failure status. Invalid edits are not saved and must be corrected before switching. Files reload automatically when you reopen the app. Literal credentials are stored in local JSON files; private environment files are ignored by Git (the sample `example.json` remains tracked).

**Export JSON** exports the active environment using its filename. **Export all** downloads one JSON bundle containing all environments. **Import JSON** accepts either format and creates individual files without overwriting existing environments. Deleting an environment removes its JSON file after confirmation; the UI keeps at least one environment. Exports include secrets.

## Running in another IDE

Run `npm start` in the copied project's folder and open the exact URL printed in the terminal. The UI and filesystem API must run on the same Node.js server; an IDE HTML preview or Live Server alone cannot list or write environment files. Restart Node after updating `server.js`.

Environment storage always resolves relative to `server.js`, even when the IDE uses a different working directory. The sidebar displays the absolute storage folder, import success, and invalid-file warnings. **Refresh** reloads files added outside the app. Each checkout or copy has its own `environments/` folder. Private environment files are ignored by Git: use **Export all** and **Import JSON** to transfer them between copies. Import accepts individual exports, combined bundles, and Postman environment exports, and confirms files are written before refreshing the list.

## Request URL variables

Use `:VARIABLE_NAME` in a URL path segment or query value, such as `{{baseUrl}}/users/:USER_ID?type=:TYPE`. The **URL variables** request tab detects placeholders and lets you add, edit, or remove values. Names use letters, numbers, and underscores, starting with a letter or underscore. Variables belong to the current request and are included in saved call JSON, duplicate, import, and export. Older calls default to no URL variables. New calls and demo presets reset request variables.

Values are URL-encoded when substituted, so `a/b` becomes `a%2Fb`. To use the active environment, set a request variable value to `{{userId}}`. Environment references resolve before URL placeholders. Missing variables produce an error. Scheme, hostname, port, and ordinary colons are left intact. Values are stored as entered, so use environment references for secrets. Save or update the call to retain edits.

## Code organization

No framework, build step, or runtime dependencies are required. `server.js` wires the routes; `public/app.js` wires the browser components. Keep those entry points small when adding features.

| Area | Location | Responsibility |
| --- | --- | --- |
| Server routes | `src/environments.js`, `src/library.js`, `src/proxy.js` | Environment files, saved requests, outbound HTTP |
| Server utilities | `src/http.js`, `src/schemas.js`, `src/storage.js`, `src/static.js` | JSON transport, validation, atomic file writes, asset whitelist |
| Browser editors | `public/modules/environments.js`, `public/modules/request.js` | Environment state/autosave and request editing/execution |
| Browser library | `public/modules/library.js` | Saved request selection, persistence, and presets |
| Shared browser UI | `public/modules/ui.js`, `public/modules/layout.js` | API calls, downloads, errors, disclosure controls, full-screen layout |
| URL substitution | `public/request-variables.js` | Pure placeholder parsing, encoding, row reconciliation |
| Presentation | `public/index.html`, `public/style.css` | Markup and shared style tokens/components |

Editors expose small read/load interfaces rather than sharing mutable global state. Browser controls are wired before disk data loads. Adding a browser module also requires adding its name to the explicit whitelist in `src/static.js`. Existing API paths and saved JSON formats are preserved, including the legacy `/api/calls` path. Run `npm test` after changing behavior. When copying this project to another IDE, include `src/` and `public/modules/`, then restart the Node server.

## Library export

Quick requests, Library, and Environment use native collapsible headings. Library starts expanded; Environment starts collapsed. Select **Export all** inside Library to download `library.json`, containing `{ "version": 1, "requests": [...] }`. Each entry includes its saved name, method, URL, headers, body, authorization, and URL variables. This exports saved files rather than unsaved editor changes. Literal credentials in saved requests are included.
