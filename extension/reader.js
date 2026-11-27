// Page reader. Injected into the ONE cancel tab by the service worker (chrome.scripting, files:[...]).
// Returns {elements:[{ref,role,name,inputType?,checked?}]}. Never types. Never returns a password value.
// Written over a small DOM interface so tests can run it on fake nodes.
// shortcut: top frame only, no shadow DOM or iframes. Upgrade if a merchant hides the button there.
(function () {
  var ATTR = 'data-grim-ref';
  var SEL = 'a,button,input,select,textarea,h1,h2,h3,h4,p,li,label,[role=button],[role=link],[role=status],[role=alert],[role=checkbox],[role=radio]';
  var MAX = 300;

  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 200); }

  function visible(el, doc) {
    var view = doc.defaultView;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hidden) return false;
      if (view && view.getComputedStyle) {
        var cs = view.getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      }
    }
    return true;
  }

  function nameOf(el) {
    var a = el.getAttribute('aria-label');
    if (a) return clean(a);
    var tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'submit' || t === 'button') return clean(el.value || el.getAttribute('value'));
      var lab = el.labels && el.labels[0] ? el.labels[0].textContent : (el.closest && el.closest('label') ? el.closest('label').textContent : '');
      return clean(lab || el.getAttribute('placeholder'));
    }
    return clean(el.textContent);
  }

  function roleOf(el) {
    var r = el.getAttribute('role');
    if (r) return r;
    var tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'p') return 'paragraph';
    if (tag === 'li') return 'listitem';
    if (tag === 'label') return 'label';
    if (/^h[1-4]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'submit' || t === 'button') return 'button';
      if (t === 'checkbox' || t === 'radio') return t;
      return 'textbox';
    }
    return tag;
  }

  function read(doc) {
    var old = doc.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < old.length; i++) old[i].removeAttribute(ATTR);
    var nodes = doc.querySelectorAll(SEL);
    var elements = [];
    var n = 0;
    for (var j = 0; j < nodes.length && elements.length < MAX; j++) {
      var el = nodes[j];
      if (!visible(el, doc)) continue;
      var tag = el.tagName.toLowerCase();
      var role = roleOf(el);
      var type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
      var isButtonInput = tag === 'input' && (type === 'submit' || type === 'button');
      var out = { ref: '', role: role, name: nameOf(el) };
      if (tag === 'input' && !isButtonInput) out.inputType = type;
      if (role === 'checkbox' || role === 'radio') {
        out.inputType = out.inputType || role;
        out.checked = tag === 'input' ? !!el.checked : el.getAttribute('aria-checked') === 'true';
      }
      var clickable = tag === 'a' || tag === 'button' || isButtonInput || role === 'button' || role === 'link' || role === 'checkbox' || role === 'radio';
      if (clickable && type !== 'password' && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
        n += 1;
        out.ref = 'g' + n;
        el.setAttribute(ATTR, out.ref);
      }
      if (tag === 'label' && !out.name) continue;
      elements.push(out);
    }
    return { elements: elements };
  }

  /** Clicks the element a snapshot gave this ref. Refuses a password field or anything holding one. */
  function click(doc, ref) {
    if (!/^g\d{1,4}$/.test(ref)) return 'stale_ref';
    var el = doc.querySelector('[' + ATTR + '="' + ref + '"]');
    if (!el) return 'stale_ref';
    if ((el.matches && el.matches('input[type=password]')) || (el.querySelector && el.querySelector('input[type=password]'))) {
      return 'password_refused';
    }
    el.click();
    return 'ok';
  }

  var api = { read: read, click: click };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return api; // unit tests: no page
  // In the page's isolated world: keep the API for the click call, and return the snapshot.
  window.__grimReaper = api;
  return read(document);
})();
