(function () {
  async function copyText(text) {
    if (!text) return false;
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }

  function flashLabel(node, nextLabel) {
    const original = node.dataset.label || node.textContent;
    node.dataset.label = original;
    node.textContent = nextLabel;
    clearTimeout(node._copyResetTimer);
    node._copyResetTimer = setTimeout(function () {
      node.textContent = original;
    }, 1400);
  }

  document.querySelectorAll('[data-copy], [data-copy-current], [data-copy-path]').forEach(function (node) {
    node.addEventListener('click', async function () {
      const text = node.dataset.copyCurrent === 'url'
        ? window.location.href
        : node.dataset.copyPath
          ? new URL(node.dataset.copyPath, window.location.href).href
          : (node.dataset.copy || '');

      try {
        const copied = await copyText(text);
        flashLabel(node, copied ? 'Copied' : 'Copy failed');
      } catch (_error) {
        flashLabel(node, 'Copy failed');
      }
    });
  });
}());
