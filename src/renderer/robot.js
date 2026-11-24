'use strict';

// SVG Робика. Все состояния — классы на корневом <svg> (mood-*, hat), анимации в style.css.
window.ROBOT_SVG = `
<svg id="robot" class="mood-energetic" viewBox="0 -16 200 250" xmlns="http://www.w3.org/2000/svg" aria-label="Робик">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#bff9ff"/>
      <stop offset="60%" stop-color="#7df9ff"/>
      <stop offset="100%" stop-color="#2fb7d6"/>
    </radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e2e9f1"/>
      <stop offset="100%" stop-color="#aebccc"/>
    </linearGradient>
  </defs>

  <ellipse class="shadow" cx="100" cy="226" rx="48" ry="6" fill="#000" opacity=".22"/>

  <g class="bot">
    <!-- ноги -->
    <g class="legs">
      <rect x="72" y="192" width="20" height="26" rx="8" fill="#6f7f93"/>
      <rect x="108" y="192" width="20" height="26" rx="8" fill="#6f7f93"/>
      <rect x="66" y="212" width="32" height="12" rx="6" fill="#4d5b6d"/>
      <rect x="102" y="212" width="32" height="12" rx="6" fill="#4d5b6d"/>
    </g>

    <!-- корпус -->
    <g class="torso">
      <rect x="58" y="126" width="84" height="72" rx="18" fill="url(#metal)" stroke="#5b6b7f" stroke-width="3"/>
      <rect x="72" y="142" width="56" height="30" rx="8" fill="#12202e"/>
      <g class="lights">
        <circle cx="86" cy="157" r="5" fill="#ff6b6b"/>
        <circle cx="100" cy="157" r="5" fill="#ffd166"/>
        <circle cx="114" cy="157" r="5" fill="#6bff9a"/>
      </g>
      <rect x="86" y="180" width="28" height="6" rx="3" fill="#6f7f93"/>
    </g>

    <!-- клавиатура (только в режиме фокуса) -->
    <g class="keyboard">
      <rect x="46" y="182" width="108" height="14" rx="4" fill="#3b4757"/>
      <g fill="#8aa0b8">
        <rect x="52" y="185" width="12" height="3" rx="1"/><rect x="68" y="185" width="12" height="3" rx="1"/>
        <rect x="84" y="185" width="12" height="3" rx="1"/><rect x="100" y="185" width="12" height="3" rx="1"/>
        <rect x="116" y="185" width="12" height="3" rx="1"/><rect x="132" y="185" width="12" height="3" rx="1"/>
        <rect x="60" y="190" width="80" height="3" rx="1"/>
      </g>
    </g>

    <!-- руки -->
    <g class="arm arm-l"><rect x="38" y="136" width="14" height="46" rx="7" fill="#8796aa"/><circle cx="45" cy="184" r="9" fill="#6f7f93"/></g>
    <g class="arm arm-r"><rect x="148" y="136" width="14" height="46" rx="7" fill="#8796aa"/><circle cx="155" cy="184" r="9" fill="#6f7f93"/></g>

    <!-- голова -->
    <g class="head">
      <g class="antenna">
        <line x1="100" y1="40" x2="100" y2="22" stroke="#5b6b7f" stroke-width="4" stroke-linecap="round"/>
        <circle class="bulb" cx="100" cy="17" r="7" fill="#ffd166" stroke="#5b6b7f" stroke-width="2"/>
      </g>
      <rect x="42" y="38" width="116" height="92" rx="26" fill="url(#metal)" stroke="#5b6b7f" stroke-width="3"/>
      <rect x="34" y="70" width="10" height="28" rx="5" fill="#8796aa"/>
      <rect x="156" y="70" width="10" height="28" rx="5" fill="#8796aa"/>
      <rect class="screen" x="55" y="50" width="90" height="68" rx="16" fill="#12202e"/>

      <!-- глаза -->
      <g class="eyes eyes-open">
        <g class="eye eye-l"><circle cx="80" cy="82" r="11" fill="url(#glow)"/><circle cx="84" cy="78" r="3.5" fill="#fff" opacity=".85"/></g>
        <g class="eye eye-r"><circle cx="120" cy="82" r="11" fill="url(#glow)"/><circle cx="124" cy="78" r="3.5" fill="#fff" opacity=".85"/></g>
      </g>
      <g class="eyes eyes-happy" fill="none" stroke="#7df9ff" stroke-width="5" stroke-linecap="round">
        <path d="M69 88 Q80 70 91 88"/><path d="M109 88 Q120 70 131 88"/>
      </g>
      <g class="eyes eyes-closed" fill="none" stroke="#5aa6b8" stroke-width="4" stroke-linecap="round">
        <path d="M69 84 Q80 92 91 84"/><path d="M109 84 Q120 92 131 84"/>
      </g>
      <g class="brows" fill="none" stroke="#5aa6b8" stroke-width="4" stroke-linecap="round">
        <path d="M68 76 L90 69"/><path d="M132 76 L110 69"/>
      </g>

      <!-- рот -->
      <g fill="none" stroke="#7df9ff" stroke-width="4" stroke-linecap="round">
        <path class="mouth mouth-smile" d="M88 102 Q100 111 112 102"/>
        <path class="mouth mouth-flat" d="M90 105 L110 105"/>
        <path class="mouth mouth-sad" d="M88 108 Q100 98 112 108"/>
        <path class="mouth mouth-happy" d="M84 98 Q100 118 116 98 Z" fill="#7df9ff"/>
        <ellipse class="mouth mouth-sleep" cx="100" cy="105" rx="4" ry="3"/>
      </g>

      <!-- каска -->
      <g class="hat-g">
        <path d="M46 52 Q46 18 100 16 Q154 18 154 52 Z" fill="#ffcc00" stroke="#c99a00" stroke-width="3"/>
        <rect x="40" y="48" width="120" height="9" rx="4.5" fill="#f2b800" stroke="#c99a00" stroke-width="2"/>
        <rect x="92" y="14" width="16" height="30" rx="5" fill="#f2b800" opacity=".7"/>
      </g>
    </g>
  </g>

  <!-- искры радости -->
  <g class="sparkles" fill="#ffd166">
    <path class="sp s1" d="M28 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/>
    <path class="sp s2" d="M172 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/>
    <path class="sp s3" d="M168 120 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/>
  </g>

  <!-- Zzz -->
  <g class="zzz" fill="#6aa0ff" font-family="system-ui, sans-serif" font-weight="800">
    <text class="z z1" x="150" y="40" font-size="18">z</text>
    <text class="z z2" x="164" y="22" font-size="24">z</text>
    <text class="z z3" x="180" y="2" font-size="30">Z</text>
  </g>
</svg>`;
