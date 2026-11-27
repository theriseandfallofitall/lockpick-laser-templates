/* Opt-in design submission (static site, no server). Needs window.ckState() from customizer.js:
   { tool, name, query, values, svg, dxf, warnings }. Downloads <slug>.lockpick-design.json and, when the button carries a
   data-submit repo URL, opens a prefilled GitHub new-issue page. Nothing is sent anywhere without the person's click. */
(function () {
  const btn = document.getElementById('ck-submit');
  if (!btn) return;
  const repo = (btn.dataset.submit || '').replace(/\/+$/, '');
  const MAX_URL = 6000;
  const slug = s => (String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)) || 'design';

  const d = document.createElement('dialog');
  d.id = 'sub-d';
  d.innerHTML = '<div class="bar"><h3>Submit to the library</h3><button type="button" class="x" data-x>Close ✕</button></div>' +
    '<form method="dialog" novalidate>' +
    '<label>Design title (required)<input type="text" name="title" maxlength="80" required></label>' +
    '<label>Credit name (optional)<input type="text" name="credit" maxlength="80"></label>' +
    '<label>Notes (optional)<textarea name="notes" rows="3" maxlength="600"></textarea></label>' +
    '<label class="chk"><input type="checkbox" name="agree" required><span>I agree to share this design publicly under CC BY 4.0</span></label>' +
    '<p class="note" data-how></p><p class="msg" data-msg></p>' +
    '<div class="acts"><button type="button" value="cancel" data-x>Cancel</button><button type="submit" value="ok">Download and submit</button></div></form>';
  document.body.appendChild(d);
  const f = d.querySelector('form'), msg = d.querySelector('[data-msg]');
  d.querySelector('[data-how]').textContent = repo
    ? 'This downloads a .lockpick-design.json file and opens a prefilled GitHub issue; press Submit there. Nothing is sent until you do.'
    : 'This downloads a .lockpick-design.json file. Send the downloaded file to the library owner.';
  d.querySelectorAll('[data-x]').forEach(b => b.onclick = () => d.close());
  d.onclick = e => { if (e.target === d) d.close(); };

  btn.addEventListener('click', e => {
    e.preventDefault();
    if (typeof window.ckState !== 'function') { alert('The customiser is not ready yet.'); return; }
    msg.textContent = '';
    d.showModal();
  });

  f.addEventListener('submit', e => {
    e.preventDefault();
    const st = window.ckState();
    const v = n => f.elements[n].value.trim();
    if (!v('title')) { msg.textContent = 'Give the design a title.'; return; }
    if (!f.elements.agree.checked) { msg.textContent = 'Tick the box to agree to CC BY 4.0 sharing.'; return; }
    if (!st || !st.query) { msg.textContent = 'Nothing to submit yet: make a design first.'; return; }
    const data = { format: 'lockpick-design/1', title: v('title'), credit: v('credit'), notes: v('notes'), licence: 'CC-BY-4.0',
                   created: new Date().toISOString(), tool: st.tool, query: st.query, values: st.values };
    const json = JSON.stringify(data, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = slug(data.title) + '.lockpick-design.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (repo) {
      const title = 'Design submission: ' + data.title;
      const mk = j => repo + '/issues/new?title=' + encodeURIComponent(title) + '&body=' +
        encodeURIComponent('Opt-in submission, shared under CC BY 4.0.\n\n```json\n' + j + '\n```\n');
      let url = mk(json);
      if (url.length > MAX_URL) {   // keep the URL short: shorten notes first, then drop the full values (the query reloads the design)
        const slim = Object.assign({}, data, { notes: data.notes.slice(0, 200) });
        url = mk(JSON.stringify(slim));
        if (url.length > MAX_URL) { delete slim.values; slim.notes = '(see the attached file)'; url = mk(JSON.stringify(slim)); }
        if (url.length > MAX_URL) url = repo + '/issues/new?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent('Please attach the downloaded .lockpick-design.json file here.');
      }
      window.open(url, '_blank', 'noopener');
    }
    d.close();
  });
})();
