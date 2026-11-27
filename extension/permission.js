const params = new URLSearchParams(location.search);
const origin = params.get('origin') || '';
const app = params.get('app') || 'Grim Renewal';
document.getElementById('site').textContent = origin;
document.getElementById('app').textContent = app || 'Grim Renewal';
const send = (granted) => chrome.runtime.sendMessage({ type: 'permission_result', origin, granted });
document.getElementById('allow').addEventListener('click', async () => {
  let ok = false;
  try { ok = await chrome.permissions.request({ origins: [origin + '/*'] }); } catch { ok = false; }
  await send(ok);
});
document.getElementById('deny').addEventListener('click', () => send(false));
