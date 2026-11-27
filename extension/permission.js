const origin = new URLSearchParams(location.search).get('origin') || '';
document.getElementById('site').textContent = origin;
const send = (granted) => chrome.runtime.sendMessage({ type: 'permission_result', origin, granted });
document.getElementById('allow').addEventListener('click', async () => {
  let ok = false;
  try { ok = await chrome.permissions.request({ origins: [origin + '/*'] }); } catch { ok = false; }
  await send(ok);
});
document.getElementById('deny').addEventListener('click', () => send(false));
