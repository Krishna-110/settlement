// Builds Play Store screenshots at 1080x1920 (9:16).
// One set covers the phone, 7-inch and 10-inch tablet slots.
const sharp = require('sharp');
const fs = require('fs');

const W = 1080, H = 1920, BG = '#FFFFFF';
const RAW = 'screenshots/raw', OUT = 'screenshots/play';

// src-3 is the dashboard behind a notification sheet: crop the sheet away and
// reverse the 50% black scrim (white reads 127 instead of 255) to recover it.
const SHOTS = [
  { src: 'src-3.jpeg', out: '01-dashboard.png',   crop: 1150, undim: true },
  { src: 'src-1.jpeg', out: '02-record.png'       },
  { src: 'src-4.jpeg', out: '03-settlements.png'  },
  { src: 'src-5.jpeg', out: '04-circle.png'       },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of SHOTS) {
    let img = sharp(`${RAW}/${s.src}`);
    if (s.crop) {
      const m = await sharp(`${RAW}/${s.src}`).metadata();
      img = img.extract({ left: 0, top: 0, width: m.width, height: s.crop });
    }
    if (s.undim) img = img.linear(255 / 127, 0);

    await img.resize(W, H, { fit: 'contain', background: BG })
      .flatten({ background: BG })
      .png({ compressionLevel: 9 })
      .toFile(`${OUT}/${s.out}`);

    const m = await sharp(`${OUT}/${s.out}`).metadata();
    const kb = (fs.statSync(`${OUT}/${s.out}`).size / 1024).toFixed(0);
    const ok = m.width === W && m.height === H && !m.hasAlpha && kb < 8192;
    console.log(`${ok ? 'OK ' : 'BAD'}  ${s.out.padEnd(20)} ${m.width}x${m.height}  alpha=${!!m.hasAlpha}  ${kb} KB`);
  }
})();
