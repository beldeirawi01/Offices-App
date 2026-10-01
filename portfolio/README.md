# Portfolio

Static, dependency-free portfolio site. No build step.

```
index.html        markup
css/styles.css    tokens, layout, components, viewer, responsive rules
js/main.js        theme toggle, progress bar, scroll spy, copy email, screenshot viewer
assets/img/       WebP screenshots: 720px for the grid, 1600px for the viewer
assets/            Baraa_Eldeirawi_Resume.pdf and WebP screenshots (img/)
tools/            scripts that regenerate the screenshots and the resume PDF (Playwright)
```

## Publish on GitHub Pages
Create a repo named `beldeirawi01.github.io`, copy the contents of this folder to its root, push to `main`.
It is then live at https://beldeirawi01.github.io.

## Regenerating screenshots
`tools/capture.mjs` captures the Jobscribe dashboard (API mocked with sample data) and
`tools/codeshots.mjs` renders the SauceDemo code images. Convert the PNG output to WebP at
720px and 1600px wide before adding it to `assets/img/`.

## Resume PDF
`tools/resume.html` is the source of `assets/Baraa_Eldeirawi_Resume.pdf`. It leaves out the phone number
because the file is public. Edit the HTML, then run `tools/make-resume.mjs` with Playwright installed.
