const QR = (() => {
  const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];  // ระดับ M เวอร์ชัน 1..10
  const NUM_BLOCKS    = [0,  1,  1,  1,  2,  2,  4,  4,  4,  5,  5];
  const MAX_VER = 10;

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function rawModules(ver){
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2){
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

  /* ---- Reed–Solomon บน GF(256) ---- */
  function gfMul(x, y){
    let z = 0;
    for (let i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(deg){
    const r = new Array(deg).fill(0); r[deg - 1] = 1;
    let root = 1;
    for (let i = 0; i < deg; i++){
      for (let j = 0; j < deg; j++){ r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
      root = gfMul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div){
    const r = div.map(() => 0);
    for (const b of data){
      const f = b ^ r.shift(); r.push(0);
      div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
    }
    return r;
  }

  function addEcc(data, ver){
    const nb = NUM_BLOCKS[ver], el = ECC_PER_BLOCK[ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const div = rsDivisor(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++){
      const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++)
      blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) out.push(b[i]); });
    return out;
  }

  /* ---- เข้ารหัสข้อความเป็นบิต ---- */
  function encodeData(text){
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    for (; ver <= MAX_VER; ver++){
      const cc = ver < 10 ? 8 : 16;
      if (4 + cc + bytes.length * 8 <= dataCodewords(ver) * 8) break;
    }
    if (ver > MAX_VER) throw new Error('ข้อความยาวเกินไปสำหรับ QR');
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(ver) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    return {ver, codewords: addEcc(out, ver)};
  }

  /* ---- วาดเมทริกซ์ ---- */
  function build(text){
    const {ver, codewords} = encodeData(text);
    const size = ver * 4 + 17;
    const mod = Array.from({length: size}, () => new Array(size).fill(false));
    const fn  = Array.from({length: size}, () => new Array(size).fill(false));
    const setFn = (x, y, v) => { mod[y][x] = v; fn[y][x] = true; };

    for (let i = 0; i < size; i++){ setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++){
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    const pos = [];
    if (ver > 1){
      const n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
      pos.push(6);
      for (let p = ver * 4 + 10; pos.length < n; p -= step) pos.splice(1, 0, p);
    }
    pos.forEach((cy, i) => pos.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));

    const drawFormat = mask => {
      const data = (0 << 3) | mask;            // ระดับ M = 00
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(bits, i));
      setFn(8, 7, bit(bits, 6)); setFn(8, 8, bit(bits, 7)); setFn(7, 8, bit(bits, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(bits, i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(bits, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(bits, i));
      setFn(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7){
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++){
        const a = size - 11 + i % 3, b = Math.floor(i / 3);
        setFn(a, b, bit(bits, i)); setFn(b, a, bit(bits, i));
      }
    }

    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2){
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++){
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
        if (!fn[y][x] && k < codewords.length * 8){ mod[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; }
      }
    }

    const applyMask = m => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
        const inv = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0,
          (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, x * y % 2 + x * y % 3 === 0,
          (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0][m];
        if (!fn[y][x] && inv) mod[y][x] = !mod[y][x];
      }
    };
    const penalty = () => {
      let p = 0, dark = 0;
      const rows = [], cols = [];
      for (let y = 0; y < size; y++){
        rows.push(mod[y].map(v => v ? 1 : 0).join(''));
        cols.push(mod.map(r => r[y] ? 1 : 0).join(''));
        dark += mod[y].filter(Boolean).length;
      }
      [...rows, ...cols].forEach(s => {
        (s.match(/(.)\1{4,}/g) || []).forEach(m => { p += 3 + m.length - 5; });
        p += ((s.match(/(?=00001011101|10111010000)/g) || []).length) * 40;
      });
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++){
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++){
      applyMask(m); drawFormat(m);
      const p = penalty(); if (p < bestP){ bestP = p; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return {size, modules: mod, version: ver};
  }

  /* ---- วาดเป็น SVG (มีขอบขาว 4 โมดูลตามมาตรฐาน) ---- */
  function svg(text, label){
    const {size, modules} = build(text), q = 4;
    let d = '';
    for (let y = 0; y < size; y++){
      for (let x = 0; x < size; x++){
        if (!modules[y][x]) continue;
        let w = 1; while (x + w < size && modules[y][x + w]) w++;
        d += `M${x + q} ${y + q}h${w}v1h-${w}z`; x += w - 1;
      }
    }
    const n = size + q * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label || 'QR code'}">` +
      `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  /* ---- PromptPay (EMVCo QR) ---- */
  const field = (id, val) => id + String(val.length).padStart(2, '0') + val;
  function crc16(s){
    let c = 0xFFFF;
    for (let i = 0; i < s.length; i++){
      c ^= s.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
    }
    return c.toString(16).toUpperCase().padStart(4, '0');
  }
  /** ตรวจรูปแบบรหัสพร้อมเพย์: เบอร์มือถือ 10 หลัก (ขึ้นต้น 0) · เลขบัตรประชาชน/ภาษี 13 หลัก · e-Wallet 15 หลัก */
  function validPromptPayId(id){
    const d = String(id || '').replace(/\D/g, '');
    return (d.length === 10 && d[0] === '0') || d.length === 13 || d.length === 15;
  }
  function promptPayPayload(id, amount){
    const d = String(id || '').replace(/\D/g, '');
    if (!validPromptPayId(d)) return null;
    const target = d.length === 10 ? field('01', '0066' + d.slice(1)) : d.length === 13 ? field('02', d) : field('03', d);
    const amt = Number(amount) > 0 ? Number(amount).toFixed(2) : '';
    let s = field('00', '01') + field('01', amt ? '12' : '11') +
            field('29', field('00', 'A000000677010111') + target) + field('53', '764') +
            (amt ? field('54', amt) : '') + field('58', 'TH') + '6304';
    return s + crc16(s);
  }

  return {build, svg, promptPayPayload, validPromptPayId, crc16};
})();
if (typeof module !== 'undefined') module.exports = QR;
