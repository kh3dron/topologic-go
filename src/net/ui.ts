// Shared DOM helpers for the online pages (lobby, hub, auth panel): the
// element factory previously copied per-module, plus the bordered section
// boxes the hub and lobby organize their content into.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

export interface Section {
  root: HTMLElement;
  body: HTMLElement;
}

export function section(title: string, count?: number | string): Section {
  const root = el('section', 'hub-section');
  const head = el('div', 'hub-section-head');
  head.appendChild(el('h2', 'hub-section-title', title));
  if (count !== undefined) head.appendChild(el('span', 'hub-count', String(count)));
  const body = el('div', 'hub-section-body');
  root.append(head, body);
  return { root, body };
}
