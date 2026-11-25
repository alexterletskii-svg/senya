'use strict';

const HEART = 'M0 9 C-20 -5 -18 -21 -7 -21 C-3 -21 0 -18 0 -14 C0 -18 3 -21 7 -21 C18 -21 20 -5 0 9Z';

window.ROBOT_SVG = `
<svg id="robot" class="mood-energetic" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-label="Сеня">
  <defs>
    <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--shell-top)"/>
      <stop offset="1" style="stop-color:var(--shell-bot)"/>
    </linearGradient>
    <linearGradient id="eyeglow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--eye-top)"/>
      <stop offset="1" style="stop-color:var(--eye-bot)"/>
    </linearGradient>
    <clipPath id="screenclip"><rect x="48" y="84" width="144" height="92" rx="32"/></clipPath>
  </defs>

  <g class="hop"><g class="bot"><g class="head">
    <g class="fin fin-l"><ellipse cx="26" cy="132" rx="11" ry="21" style="fill:var(--shell-dark)"/><rect x="16" y="124" width="8" height="5" rx="2.5" style="fill:var(--eye)" opacity=".9"/></g>
    <g class="fin fin-r"><ellipse cx="214" cy="132" rx="11" ry="21" style="fill:var(--shell-dark)"/><rect x="216" y="124" width="8" height="5" rx="2.5" style="fill:var(--eye)" opacity=".9"/></g>

    <g class="antenna">
      <line x1="120" y1="72" x2="120" y2="56" style="stroke:var(--shell-dark)" stroke-width="4" stroke-linecap="round"/>
      <circle class="bulb" cx="120" cy="49" r="7" style="fill:var(--eye);stroke:var(--shell-dark)" stroke-width="2"/>
    </g>

    <rect x="34" y="68" width="172" height="124" rx="46" fill="url(#shell)"/>
    <path d="M62 80 Q120 64 178 80" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".35"/>
    <rect class="screen" x="48" y="84" width="144" height="92" rx="32" fill="#0a0f14"/>

    <g clip-path="url(#screenclip)">
      <rect class="scan" x="48" y="84" width="144" height="7" style="fill:var(--eye)" opacity=".16"/>
      <path class="tear" d="M80 140 q-6 10 0 14 q6 -4 0 -14z" fill="#6ad7ff"/>
    </g>

    <g class="look">
      <g class="eyes eyes-open">
        <g class="eye eye-l"><rect x="76" y="100" width="30" height="46" rx="10" fill="url(#eyeglow)"/><rect x="82" y="105" width="8" height="13" rx="4" fill="#fff" opacity=".7"/></g>
        <g class="eye eye-r"><rect x="134" y="100" width="30" height="46" rx="10" fill="url(#eyeglow)"/><rect x="140" y="105" width="8" height="13" rx="4" fill="#fff" opacity=".7"/></g>
      </g>
      <g class="lids" fill="#0a0f14">
        <polygon points="70,94 100,94 70,128"/><polygon points="170,94 140,94 170,128"/>
      </g>
      <g class="eyes eyes-happy" fill="none" style="stroke:var(--eye)" stroke-width="9" stroke-linecap="round">
        <path d="M75 140 Q91 106 107 140"/><path d="M133 140 Q149 106 165 140"/>
      </g>
      <g class="eyes eyes-closed" fill="none" style="stroke:var(--eye)" stroke-width="6" stroke-linecap="round" opacity=".55">
        <path d="M76 128 H106"/><path d="M134 128 H164"/>
      </g>
      <g class="eyes eyes-love">
        <g transform="translate(91 134) scale(1.2)"><path class="heart" d="${HEART}" fill="#ff5c8a"/></g>
        <g transform="translate(149 134) scale(1.2)"><path class="heart" d="${HEART}" fill="#ff5c8a"/></g>
      </g>
    </g>

    <g class="hat-g">
      <path d="M50 74 Q50 22 120 20 Q190 22 190 74 Z" fill="#ffcc00" stroke="#c99a00" stroke-width="3"/>
      <rect x="40" y="68" width="160" height="10" rx="5" fill="#f2b800" stroke="#c99a00" stroke-width="2"/>
      <rect x="110" y="18" width="20" height="38" rx="6" fill="#f2b800" opacity=".7"/>
    </g>
  </g></g></g>

  <g class="hearts" fill="#ff5c8a">
    <g transform="translate(34 70) scale(.7)"><path class="fh fh1" d="${HEART}"/></g>
    <g transform="translate(206 62) scale(.9)"><path class="fh fh2" d="${HEART}"/></g>
    <g transform="translate(120 36) scale(.6)"><path class="fh fh3" d="${HEART}"/></g>
  </g>

  <g class="sparkles" fill="#ffd166">
    <path class="sp s1" d="M26 56 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/>
    <path class="sp s2" d="M206 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/>
    <path class="sp s3" d="M210 176 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/>
  </g>

  <g class="zzz" fill="#8fb0ff" font-family="system-ui, sans-serif" font-weight="800">
    <text class="z z1" x="186" y="72" font-size="18">z</text>
    <text class="z z2" x="198" y="52" font-size="24">z</text>
    <text class="z z3" x="210" y="28" font-size="30">Z</text>
  </g>
</svg>`;
