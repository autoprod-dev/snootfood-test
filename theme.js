// Runs before first paint (tiny, blocking on purpose): light/dark follows the system until the
// user picks one with the toggle, then their pick is remembered on this device.
(function () {
  var KEY = 'snootfood.theme.v1', d = document.documentElement, mq = window.matchMedia('(prefers-color-scheme: dark)');
  function saved() { try { var t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null; } catch (e) { return null; } }
  function apply() { var t = saved() || (mq.matches ? 'dark' : 'light'); d.dataset.theme = t; var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#0b0b0b' : '#ffffff'; }
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
  window.snootTheme = {
    toggle: function () { var t = d.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(KEY, t); } catch (e) {} apply(); return t; },
    current: function () { return d.dataset.theme; },
  };
  document.addEventListener('DOMContentLoaded', apply);
})();
