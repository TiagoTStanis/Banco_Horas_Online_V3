import { supabase } from './db.js';

function showLoading(show) {
  let overlay = document.getElementById('loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style = `
      position:fixed; inset:0; display:none; align-items:center; justify-content:center;
      background:rgba(255,255,255,0.9); font: 16px sans-serif; z-index:9999;
    `;
    overlay.innerHTML = '<div>🔄 Reconectando...</div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = show ? 'flex' : 'none';
}

export function initRealtime() {
  window.addEventListener('offline', () => showLoading(true));
  window.addEventListener('online', () => showLoading(false));

  const channel = supabase.channel('db-changes');

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'clock_entries' },
    () => {
      if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
      if (typeof window.refreshReports === 'function') window.refreshReports();
    }
  );

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'tickets' },
    () => {
      if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
      if (typeof window.refreshReports === 'function') window.refreshReports();
    }
  );

  channel.subscribe((status) => {
    console.log('Canal realtime:', status);
    if (status === 'SUBSCRIBED') showLoading(false);
    if (status === 'CLOSED' || status === 'TIMED_OUT') showLoading(true);
  });
}
