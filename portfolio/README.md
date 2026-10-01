# Portfolio

Static, dependency-free portfolio site. No build step.

```
index.html        markup
css/styles.css    tokens, layout, components, viewer, responsive rules
js/main.js        theme toggle, progress bar, scroll spy, copy email, screenshot viewer
assets/img/       WebP screenshots: 720px for the grid, 1600px for the viewer
tools/            scripts that regenerate the screenshots (Playwright)
```

## Publish on GitHub Pages
Create a repo named `beldeirawi01.github.io`, copy the contents of this folder to its root, push to `main`.
It is then live at https://beldeirawi01.github.io.

## Regenerating screenshots
`tools/capture.mjs` captures the Jobscribe dashboard (API mocked with sample data) and
`tools/codeshots.mjs` renders the SauceDemo code images. Convert the PNG output to WebP at
720px and 1600px wide before adding it to `assets/img/`.
