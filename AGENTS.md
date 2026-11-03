The project uses vanilla HTML, CSS and JavaScript.
No Node.js, npm, frameworks or build tools.

### File Responsibilities

- index.html: HTML structure only.
- script.js: Main application logic and rendering.
- script-demo.js: Demo data.
- script-production.js: Production chord data.

### Rules

- Use BEM naming methodology.
- Keep all JavaScript outside HTML.
- Do not duplicate application logic.
- Keep demo and production data separate.
- Both modes must use the same rendering logic.
- Do not put demo data inside script.js.
- Do not put rendering logic inside demo or production files.
- Keep the project simple. Do not create additional files without a clear reason.