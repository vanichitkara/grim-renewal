import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-ignore plain JS module without types (extension has no build step)
import { originAllowed, cancelSiteOrigin } from '../../extension/origins.js';

// The extension files are plain JS (no build step). Load them without importing TS-unknown modules.
const root = new URL('../../extension/', import.meta.url);
const reader = (() => {
  const module: { exports: any } = { exports: {} };
  new Function('module', readFileSync(fileURLToPath(new URL('reader.js', root)), 'utf8'))(module);
  return module.exports as { read(doc: any): { elements: any[] }; click(doc: any, ref: string): string };
})();
const origins = { originAllowed, cancelSiteOrigin };

type N = { tag: string; attrs?: Record<string, string>; text?: string; hidden?: boolean; checked?: boolean; disabled?: boolean; value?: string; kids?: N[] };
function node(n: N, parent: any = null): any {
  const el: any = {
    nodeType: 1,
    tagName: n.tag.toUpperCase(),
    hidden: !!n.hidden,
    checked: n.checked,
    disabled: n.disabled,
    value: n.value,
    parentElement: parent,
    textContent: n.text ?? '',
    removed: [] as string[],
    clicked: 0,
    attrs: { ...(n.attrs ?? {}) },
    getAttribute(k: string) { return k in el.attrs ? el.attrs[k] : null; },
    setAttribute(k: string, v: string) { el.attrs[k] = v; },
    removeAttribute(k: string) { delete el.attrs[k]; },
    matches(sel: string) { return sel === 'input[type=password]' && el.tagName === 'INPUT' && el.attrs.type === 'password'; },
    querySelector(sel: string) { return sel === 'input[type=password]' ? el.kids.find((k: any) => k.matches(sel)) ?? null : null; },
    click() { el.clicked += 1; },
    labels: null,
    closest() { return null; },
  };
  el.kids = (n.kids ?? []).map((k) => node(k, el));
  return el;
}
function doc(nodes: N[]) {
  const els = nodes.map((n) => node(n));
  return {
    els,
    defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    querySelectorAll(sel: string) {
      if (sel.startsWith('[data-grim-ref]')) return els.filter((e) => 'data-grim-ref' in e.attrs);
      return els;
    },
    querySelector(sel: string) {
      const m = /data-grim-ref="([^"]+)"/.exec(sel);
      return els.find((e) => e.attrs['data-grim-ref'] === m![1]) ?? null;
    },
  };
}

describe('reader.read', () => {
  it('gives clickable controls a ref and text nodes none', () => {
    const d = doc([
      { tag: 'button', text: ' Cancel   subscription ' },
      { tag: 'p', text: 'Plan: Pro' },
    ]);
    const { elements } = reader.read(d);
    expect(elements[0]).toEqual({ ref: 'g1', role: 'button', name: 'Cancel subscription' });
    expect(elements[1]).toMatchObject({ ref: '', role: 'paragraph', name: 'Plan: Pro' });
  });
  it('skips hidden nodes and disabled buttons get no ref', () => {
    const d = doc([{ tag: 'button', text: 'Gone', hidden: true }, { tag: 'button', text: 'Later', disabled: true }]);
    const { elements } = reader.read(d);
    expect(elements).toEqual([{ ref: '', role: 'button', name: 'Later' }]);
  });
  it('marks password, checkbox and radio inputs; password has no ref', () => {
    const d = doc([
      { tag: 'input', attrs: { type: 'password', 'aria-label': 'Password' } },
      { tag: 'input', attrs: { type: 'checkbox', 'aria-label': 'I understand' }, checked: false },
      { tag: 'input', attrs: { type: 'submit' }, value: 'Yes, cancel' },
    ]);
    const { elements } = reader.read(d);
    expect(elements[0]).toEqual({ ref: '', role: 'textbox', name: 'Password', inputType: 'password' });
    expect(elements[1]).toEqual({ ref: 'g1', role: 'checkbox', name: 'I understand', inputType: 'checkbox', checked: false });
    expect(elements[2]).toEqual({ ref: 'g2', role: 'button', name: 'Yes, cancel' });
  });
  it('refs restart each snapshot', () => {
    const d = doc([{ tag: 'a', text: 'Billing' }]);
    reader.read(d);
    expect(reader.read(d).elements[0]!.ref).toBe('g1');
  });
});

describe('reader.click', () => {
  it('clicks by ref, and says stale for an unknown or odd ref', () => {
    const d = doc([{ tag: 'button', text: 'Cancel' }]);
    reader.read(d);
    expect(reader.click(d, 'g1')).toBe('ok');
    expect(d.els[0].clicked).toBe(1);
    expect(reader.click(d, 'g9')).toBe('stale_ref');
    expect(reader.click(d, '"]x')).toBe('stale_ref');
  });
  it('refuses a password field or a control holding one', () => {
    const d = doc([{ tag: 'div', attrs: { role: 'button' }, kids: [{ tag: 'input', attrs: { type: 'password' } }] }]);
    reader.read(d);
    d.els[0].attrs['data-grim-ref'] = 'g1';
    expect(reader.click(d, 'g1')).toBe('password_refused');
    expect(d.els[0].clicked).toBe(0);
  });
});

describe('origins', () => {
  const pats = ['https://vanichitkara.github.io/*', 'http://localhost/*', 'http://127.0.0.1/*'];
  it('allows the app origins on any port for localhost', () => {
    expect(origins.originAllowed('https://vanichitkara.github.io', pats)).toBe(true);
    expect(origins.originAllowed('http://localhost:5173', pats)).toBe(true);
    expect(origins.originAllowed('http://127.0.0.1:9000', pats)).toBe(true);
  });
  it('refuses other sites, other schemes and junk', () => {
    expect(origins.originAllowed('https://evil.test', pats)).toBe(false);
    expect(origins.originAllowed('https://vanichitkara.github.io.evil.test', pats)).toBe(false);
    expect(origins.originAllowed('http://vanichitkara.github.io', pats)).toBe(false);
    expect(origins.originAllowed('', pats)).toBe(false);
    expect(origins.originAllowed('null', pats)).toBe(false);
  });
  it('only opens web pages', () => {
    expect(origins.cancelSiteOrigin('https://a.test/x?y=1')).toBe('https://a.test');
    expect(origins.cancelSiteOrigin('javascript:alert(1)')).toBeNull();
    expect(origins.cancelSiteOrigin('file:///etc/passwd')).toBeNull();
  });
});
