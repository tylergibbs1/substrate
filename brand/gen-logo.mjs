import fs from "node:fs";
const C = 128, R = 72, r = 46;
const D2R = Math.PI / 180;
const pt = (a, rad) => [ +(C + rad * Math.cos(a * D2R)).toFixed(2), +(C + rad * Math.sin(a * D2R)).toFixed(2) ];
function sector(a1, a2) {
  const large = (a2 - a1) > 180 ? 1 : 0;
  const [ox1, oy1] = pt(a1, R), [ox2, oy2] = pt(a2, R);
  const [ix2, iy2] = pt(a2, r), [ix1, iy1] = pt(a1, r);
  return `M ${ox1} ${oy1} A ${R} ${R} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`;
}
const gap = 19;
const arcA = sector(45 + gap, 225 - gap);
const arcB = sector(225 + gap, 405 - gap);
const reach = 101, halfW = 14.5;
const t1 = pt(45, reach), t2 = pt(225, reach), s1 = pt(135, halfW), s2 = pt(315, halfW);
const needle = `M ${t1[0]} ${t1[1]} L ${s1[0]} ${s1[1]} L ${t2[0]} ${t2[1]} L ${s2[0]} ${s2[1]} Z`;
const markPaths = (fill) =>
  `<path d="${arcA}" fill="${fill}"/><path d="${arcB}" fill="${fill}"/><path d="${needle}" fill="${fill}"/>`;

const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">';
// 1. Bare mark, white, transparent bg
fs.writeFileSync("substrate-mark.svg", `${head}${markPaths("#ffffff")}</svg>\n`);
// 2. Inverted mark (black on transparent) for light surfaces
fs.writeFileSync("substrate-mark-black.svg", `${head}${markPaths("#0a0a0a")}</svg>\n`);
// 3. App icon: rounded near-black tile + white mark
fs.writeFileSync(
  "substrate-icon.svg",
  `${head}<rect width="256" height="256" rx="56" fill="#0a0a0a"/>${markPaths("#ffffff")}</svg>\n`,
);
// 4. Wordmark lockup (mark + "substrate" in Inter), white on transparent
const wm = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 200">
  <g transform="translate(28,28) scale(0.5625)">${markPaths("#ffffff")}</g>
  <text x="196" y="100" dominant-baseline="central" font-family="Inter, system-ui, -apple-system, sans-serif"
        font-size="92" font-weight="500" letter-spacing="-3" fill="#ffffff">substrate</text>
</svg>\n`;
fs.writeFileSync("substrate-wordmark.svg", wm);
console.log("wrote 4 SVGs");
