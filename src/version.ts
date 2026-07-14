export function mountVersionBadge(): void {
  const badge = document.createElement('a');
  badge.className = 'version-badge';
  badge.textContent = __APP_VERSION__;
  badge.title = `topologic-go ${__APP_VERSION__}`;
  badge.href = 'https://github.com/kh3dron/topologic-go/releases';
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  document.body.appendChild(badge);
}
