// 納品前の点検と、月額の下限の計算。どちらもこのページの中だけで動く（外へ送らない）
(function () {
  const $ = (id) => document.getElementById(id);
  const D = window.MIHON || {};
  $('p-nouhinsho').textContent = D.nouhinsho || '(見本の納品書が読み込めませんでした)';
  $('p-kenpin').textContent = D.kenpin || '(見本の点検結果が読み込めませんでした)';

  const FILLER = /(えー|えーと|あのー|えっと)/;
  const KATA = /[ァ-ヴー]{3,}/g;
  const NUM = /[0-9０-９]|[一二三四五六七八九十百千万億]/;

  function parseSrt(text) {
    const items = [], broken = [];
    text.replace(/\r/g, '').trim().split(/\n\s*\n/).forEach((block) => {
      const lines = block.trim().split('\n');
      if (lines.length < 3) { if (block.trim()) broken.push(block.trim().slice(0, 40)); return; }
      const m = lines[1].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
      if (!m) { broken.push(block.trim().slice(0, 40)); return; }
      const g = m.slice(1).map(Number);
      items.push({
        a: g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000,
        b: g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000,
        t: lines.slice(2).join('\n').trim(),
      });
    });
    items.sort((x, y) => x.a - y.a);
    return { items, broken };
  }

  const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function kenpin() {
    const text = $('srt').value;
    if (!text.trim()) { $('out').innerHTML = '<p class="ng">字幕を貼ってください。</p>'; return; }
    const maxChars = +$('maxchars').value, minS = +$('mins').value, maxS = +$('maxs').value;
    const kotoba = $('kotoba').value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    const { items, broken } = parseSrt(text);
    if (!items.length) { $('out').innerHTML = '<p class="ng">字幕として読めませんでした。番号・時刻・文字の3行と、間の空行を確かめてください。</p>'; return; }

    const ng = [], q = [], ok = [];
    if (broken.length) ng.push(`読めない字幕が ${broken.length}か所あります（番号・時刻・文字の3行と空行を確かめてください）`);
    else ok.push('字幕ファイルの形は壊れていません');

    const nagai = items.map((x, i) => [i + 1, x]).filter(([, x]) => x.t.length > maxChars);
    if (nagai.length) ng.push(`1枚 ${maxChars}字を超えた字幕が ${nagai.length}枚（画面からはみ出します）: ${nagai.slice(0, 10).map(([i]) => i + '番').join('・')}`);
    const kasa = items.map((x, i) => i).filter((i) => i > 0 && items[i].a < items[i - 1].b - 0.01);
    if (kasa.length) ng.push(`時刻が重なっている字幕が ${kasa.length}か所: ${kasa.slice(0, 10).map((i) => (i + 1) + '番').join('・')}`);
    const mij = items.map((x, i) => [i + 1, x]).filter(([, x]) => x.b - x.a < minS);
    if (mij.length) q.push(`${minS}秒より短い字幕が ${mij.length}枚（読めません）: ${mij.slice(0, 10).map(([i]) => i + '番').join('・')}`);
    const nob = items.map((x, i) => [i + 1, x]).filter(([, x]) => x.b - x.a > maxS);
    if (nob.length) q.push(`${maxS}秒より長く出たままの字幕が ${nob.length}枚: ${nob.slice(0, 10).map(([i]) => i + '番').join('・')}`);
    if (!nagai.length && !kasa.length && !mij.length && !nob.length) ok.push(`字幕 ${items.length}枚は、文字数・表示時間・重なりの点検を通りました`);

    if (items[0].a > 3.0) q.push(`最初の字幕が ${items[0].a.toFixed(1)}秒後です（3秒以内が目安）`);
    else ok.push(`最初の字幕は ${items[0].a.toFixed(1)}秒後`);

    let prev = 0; const ana = [];
    items.forEach((x) => { if (x.a - prev > 2.0) ana.push([prev, x.a]); prev = x.b; });
    if (ana.length) q.push(`字幕が2秒以上ない所が ${ana.length}か所: ${ana.slice(0, 6).map(([a, b]) => mmss(a) + '〜' + mmss(b)).join('・')}（話していたら足す。黙っているだけなら直さない）`);
    else ok.push('字幕が2秒以上ない所はありません');

    const fil = items.map((x, i) => [i + 1, x]).filter(([, x]) => FILLER.test(x.t));
    if (fil.length) q.push(`「えー」「あのー」が字幕に残っています（${fil.length}枚）: ${fil.slice(0, 10).map(([i]) => i + '番').join('・')}`);
    else ok.push('言いよどみは字幕に残っていません');

    const joined = items.map((x) => x.t).join('');
    const denai = kotoba.filter((w) => !joined.includes(w));
    if (denai.length) q.push(`登録した言葉が字幕に1度も出ていません: ${denai.join('・')}（その回で話していない語なら気にしなくてよい。話しているなら別の字になっています）`);
    else if (kotoba.length) ok.push(`登録した言葉 ${kotoba.length}語は、すべて字幕に出ています`);

    const mi = {};
    items.forEach((x, i) => {
      (x.t.match(KATA) || []).forEach((w) => {
        if (!kotoba.some((k) => w.includes(k) || k.includes(w))) (mi[w] = mi[w] || []).push(i + 1);
      });
    });
    const miList = Object.entries(mi).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
    if (miList.length) q.push(`登録していないカタカナ語があります（正しいか見てください）: ${miList.map(([w, v]) => `${w}(${v.length}回)`).join('・')}`);

    const hito = [];
    items.forEach((x, i) => {
      const why = [];
      if (NUM.test(x.t)) why.push('数字');
      kotoba.forEach((w) => { if (x.t.includes(w)) why.push(w); });
      if (why.length) hito.push({ n: i + 1, at: mmss(x.a), t: x.t, why: [...new Set(why)].join('・') });
    });

    let html = `<h3>渡せない（先に直す）: <span class="${ng.length ? 'ng' : 'ok'}">${ng.length}件</span></h3>`;
    html += ng.length ? '<ul>' + ng.map((x) => `<li class="ng">${esc(x)}</li>`).join('') + '</ul>' : '<p class="dim">なし</p>';
    html += `<h3>人が見る（機械では決められない）: <span class="q">${q.length}件</span></h3>`;
    html += q.length ? '<ul>' + q.map((x) => `<li class="q">${esc(x)}</li>`).join('') + '</ul>' : '<p class="dim">なし</p>';
    html += `<h3>通った点検: <span class="ok">${ok.length}件</span></h3><ul>` + ok.map((x) => `<li class="ok">${esc(x)}</li>`).join('') + '</ul>';
    html += `<h3>必ず自分の目で読む字幕: ${hito.length}枚</h3>`;
    html += '<table><tr><th>番</th><th>時刻</th><th>字幕</th><th>理由</th></tr>'
      + hito.map((h) => `<tr><td>${h.n}</td><td>${h.at}</td><td>${esc(h.t)}</td><td>${esc(h.why)}</td></tr>`).join('') + '</table>';
    html += '<p class="dim">機械が見ていないところ: 言い直し／映像の見切れ／BGMの権利／固有名詞の字／冒頭の入り方。音量と尺は動画が要るので、ここでは見ていません。</p>';
    $('out').innerHTML = html;
  }

  function mitsumori() {
    const fun = +$('fun').value, honsu = +$('honsu').value, soto = +$('soto').value, jikyu = +$('jikyu').value;
    const naka = fun * honsu, zen = (fun + soto) * honsu;
    const en = (m) => Math.round(jikyu * m / 60).toLocaleString('ja-JP');
    $('mitsu').innerHTML = `<table>
<tr><th>編集だけの時間（月）</th><td>${naka}分（${(naka / 60).toFixed(1)}時間）</td><td>月額の下限 ${en(naka)}円</td></tr>
<tr><th>やり取り・請求を足した時間（月）</th><td>${zen}分（${(zen / 60).toFixed(1)}時間）</td><td>月額の下限 <b>${en(zen)}円</b></td></tr>
<tr><th>1本あたり</th><td>${fun + soto}分</td><td>${en(fun + soto)}円</td></tr>
</table>
<p class="dim">相手が払うかどうかは別の話です。これは自分の時間から出した下限で、相場でも売上の見込みでもありません。
修正が1回で収まらない案件は、この線を割ります。</p>`;
  }

  $('b-run').addEventListener('click', kenpin);
  $('b-mitsu').addEventListener('click', mitsumori);
  $('b-kikai').addEventListener('click', () => { $('srt').value = D.srt_kikai || ''; kenpin(); });
  $('b-naoshi').addEventListener('click', () => { $('srt').value = D.srt_naoshi || ''; kenpin(); });
  $('b-clear').addEventListener('click', () => { $('srt').value = ''; $('out').innerHTML = ''; });
  mitsumori();
})();
