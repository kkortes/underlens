import codie from '/node_modules/@ape-egg/codie/codie.js';

const languages = { yml: 'yaml', md: 'markdown', js: 'js' };

// Snippets written into the page highlight in place; the three project files
// load from /templates/, the npm package's own copies, so the guide never
// drifts from what `underlens init` writes.
export default () =>
  document.querySelectorAll('codie').forEach(async (el) => {
    const editor = codie(el);
    if (!el.dataset.src) return;
    editor.language = languages[el.dataset.src.split('.').pop()];
    editor.code = await (await fetch(`/templates/${el.dataset.src}`)).text();
  });
