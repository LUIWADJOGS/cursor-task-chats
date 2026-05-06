/** Общие фрагменты разметки карточки задачи (YouGile-стиль). */

export function escapeTaskCardHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderInfoBadge(
  icon: string,
  label: string,
  value: string,
  options?: { color?: string; title?: string }
): string {
  const style = options?.color ? ` style="--badge-accent:${escapeTaskCardHtml(options.color)};"` : '';
  const title = options?.title ? ` title="${escapeTaskCardHtml(options.title)}"` : '';
  return `
    <div class="info-badge"${style}${title}>
      <span class="info-icon">${escapeTaskCardHtml(icon)}</span>
      <span class="info-text">
        <span class="info-label">${escapeTaskCardHtml(label)}</span>
        <span class="info-value">${escapeTaskCardHtml(value)}</span>
      </span>
    </div>
  `;
}
