// Page reader. Injected into the ONE cancel tab by the service worker (chrome.scripting, files:[...]).
// Returns {elements:[{ref,role,name,inputType?,checked?,disabled?}]}. Never types. Never returns a password value.
// Written over a small DOM interface so tests can run it on fake nodes.
// shortcut: top frame only, no shadow DOM or iframes. Upgrade if a merchant hides the button there.
// SHOULD 2: returns only clickable controls (button/a/input[submit|button]/[role=button|link|checkbox|radio]),
//   headings h1-h3, role=status/alert/aria-live text, and elements whose text matches the DONE pattern.
//   No p, li, label, textarea, select free text. Each name is trimmed to 120 chars.
(function () {
  var ATTR = 'data-grim-ref';
  // Clickable controls + headings + live regions only. No p, li, label, textarea, select.
  var CLICKABLE_SEL = 'a,button,input,[role=button],[role=link],[role=checkbox],[role=radio]';
  var HEADING_SEL = 'h1,h2,h3';
  var LIVE_SEL = '[role=status],[role=alert],[aria-live]';
  var DONE_RE = /cancel(l)?ed|you have been|no longer be charged/i;
  var MAX_CLICKABLE = 150;
  var MAX_CHARS = 120;

  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS); }

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
    if (/^h[1-3]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'submit' || t === 'button') return 'button';
      if (t === 'checkbox' || t === 'radio') return t;
      return 'textbox';
    }
    return tag;
  }

  function readClickable(doc) {
    var old = doc.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < old.length; i++) old[i].removeAttribute(ATTR);

    var elements = [];
    var n = 0;

    // 1. Clickable controls — assign refs.
    var nodes = doc.querySelectorAll(CLICKABLE_SEL);
    for (var j = 0; j < nodes.length && n < MAX_CLICKABLE; j++) {
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
      var isDisabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
      if (isDisabled) {
        // Report disabled clickable but no ref.
        out.disabled = true;
        elements.push(out);
        continue;
      }
      if (type === 'password') {
        // Password inputs: no ref, report with inputType so the driver can detect login_required.
        elements.push(out);
        continue;
      }
      n += 1;
      out.ref = 'g' + n;
      el.setAttribute(ATTR, out.ref);
      elements.push(out);
    }

    // 2. Headings h1-h3 — no refs.
    var headings = doc.querySelectorAll(HEADING_SEL);
    for (var k = 0; k < headings.length; k++) {
      var h = headings[k];
      if (!visible(h, doc)) continue;
      elements.push({ ref: '', role: 'heading', name: nameOf(h) });
    }

    // 3. Live regions (status/alert/aria-live) — needed for DONE detection.
    var lives = doc.querySelectorAll(LIVE_SEL);
    for (var l = 0; l < lives.length; l++) {
      var lv = lives[l];
      if (!visible(lv, doc)) continue;
      var lvName = nameOf(lv);
      if (!lvName) continue;
      var lvRole = lv.getAttribute('role') || 'status';
      elements.push({ ref: '', role: lvRole, name: lvName });
    }

    // 4. Any VISIBLE leaf element whose text matches the DONE pattern —
    //    so the browser adapter can detect cancellation even when the merchant uses
    //    a plain <p> or <div> for the confirmation message.
    //    "Leaf" here means no visible child element nodes (avoids matching a container
    //    whose hidden child contains the DONE text).
    var all = doc.querySelectorAll('*');
    for (var m2 = 0; m2 < all.length; m2++) {
      var ae = all[m2];
      if (!visible(ae, doc)) continue;
      // Only consider leaf-ish elements: no visible child elements.
      var hasVisibleChild = false;
      var ch = ae.children || ae.kids || [];
      for (var ci = 0; ci < ch.length; ci++) {
        if (visible(ch[ci], doc)) { hasVisibleChild = true; break; }
      }
      if (hasVisibleChild) continue;
      var atext = clean(ae.textContent || '');
      if (!DONE_RE.test(atext)) continue;
      // Only add if not already captured (live region or heading).
      var alreadyIn = elements.some(function (e) { return e.name === atext; });
      if (!alreadyIn) {
        elements.push({ ref: '', role: ae.getAttribute('role') || ae.tagName.toLowerCase(), name: atext });
      }
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

  var api = { read: readClickable, click: click };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return api; // unit tests: no page
  // In the page's isolated world: keep the API for the click call, and return the snapshot.
  window.__grimReaper = api;
  return readClickable(document);
})();
