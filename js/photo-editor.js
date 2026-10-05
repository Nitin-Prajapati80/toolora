(() => {
'use strict';

const $ = id => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const C = $('canvas');
const ctx = C.getContext('2d', { willReadFrequently: true });

const O = $('overlay');
const ox = O.getContext('2d');

const src = document.createElement('canvas');
const sx = src.getContext('2d', { willReadFrequently: true });

let img = null;
let fileName = '';

let renderQueued = false;
let rendering = false;

let zoom = 1;
let panX = 0;
let panY = 0;

let active = 'light';
let showBefore = false;

let history = [];
let future = [];

let retouch = [];

const pointers = new Map();
let gesture = null;

const S = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,

  temp: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,

  texture: 0,
  clarity: 0,
  dehaze: 0,
  vignette: 0,
  midpoint: 50,
  feather: 50,
  roundness: 0,

  grain: 0,
  grainSize: 25,
  grainRough: 50,

  sharp: 0,
  radius: 1,
  noise: 0,
  colorNoise: 0,

  ratio: 'original',
  rotate: 0,
  straighten: 0,
  flipX: false,
  flipY: false,

  profile: 'natural',
  preset: 'none',
  presetAmount: 100,

  blur: 0,
  blurX: 50,
  blurY: 50,

  lensVignette: 0,
  defringe: 0,

  maskType: 'radial',
  maskAmount: 0,
  maskExposure: 0,
  maskContrast: 0,
  maskSaturation: 0,

  retouchSize: 30,

  gradeShadow: 0,
  gradeShadowSat: 0,
  gradeMid: 0,
  gradeMidSat: 0,
  gradeHigh: 0,
  gradeHighSat: 0,
  gradeBlend: 50,
  gradeBalance: 0
};

const colors = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta'
];

colors.forEach(color => {
  S['h_' + color] = 0;
  S['s_' + color] = 0;
  S['l_' + color] = 0;
});

const names = {
  light: ['Adjust', 'Light'],
  color: ['Adjust', 'Color'],
  effects: ['Adjust', 'Effects'],
  detail: ['Adjust', 'Detail'],
  crop: ['Transform', 'Crop'],
  presets: ['Looks', 'Presets'],
  profiles: ['Looks', 'Profiles'],
  mask: ['Local', 'Mask'],
  retouch: ['Retouch', 'Spot Blur'],
  blur: ['Effects', 'Blur'],
  optics: ['Lens', 'Optics'],
  export: ['Output', 'Export']
};


/* =========================================================
   HISTORY
========================================================= */

function snap() {
  return JSON.parse(JSON.stringify(S));
}

function push() {
  history.push(snap());

  if (history.length > 30) {
    history.shift();
  }

  future = [];
}

function restore(state) {
  Object.assign(S, state);
  retouch = [];
  render();
  panel();
}


/* =========================================================
   UI HELPERS
========================================================= */

function fmt(value) {
  value = Number(value);

  if (!Number.isFinite(value)) {
    return '0';
  }

  return `${value > 0 ? '+' : ''}${
    Number.isInteger(value) ? value : value.toFixed(1)
  }`;
}

function control(key, label, min, max, step = 1) {
  return `
    <div class="control">
      <div class="ch">
        <span>${label}</span>
        <span class="val" id="v_${key}">${fmt(S[key])}</span>
      </div>

      <input
        data-k="${key}"
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${S[key]}"
      >
    </div>
  `;
}


/* =========================================================
   PANEL BINDING
========================================================= */

function bind() {

  document.querySelectorAll('#panel input[data-k]').forEach(input => {

    input.addEventListener('input', () => {

      const key = input.dataset.k;
      S[key] = Number(input.value);

      const value = $('v_' + key);

      if (value) {
        value.textContent = fmt(input.value);
      }

      schedule();
    });

    input.addEventListener('change', () => {
      push();
    });
  });


  document.querySelectorAll('#panel [data-mix]').forEach(input => {

    input.addEventListener('input', () => {

      const key = input.dataset.mix;

      S[key] = Number(input.value);

      schedule();
    });

    input.addEventListener('change', () => {
      push();
    });
  });
}


/* =========================================================
   PANEL
========================================================= */

function panel() {

  const p = $('panel');

  $('eyebrow').textContent = names[active][0];
  $('title').textContent = names[active][1];

  let h = '';


  /* LIGHT */

  if (active === 'light') {

    h = `
      <div class="section">
        <h3>Tone</h3>

        ${control('exposure', 'Exposure', -100, 100)}
        ${control('contrast', 'Contrast', -100, 100)}
        ${control('highlights', 'Highlights', -100, 100)}
        ${control('shadows', 'Shadows', -100, 100)}
        ${control('whites', 'Whites', -100, 100)}
        ${control('blacks', 'Blacks', -100, 100)}
      </div>

      <div class="section">
        <button class="btn" id="auto" style="width:100%">
          Auto Tone
        </button>

        <p class="note" style="margin-top:8px">
          Auto uses a quick balanced correction.
        </p>
      </div>
    `;
  }


  /* COLOR */

  if (active === 'color') {

    h = `
      <div class="section">
        <h3>White Balance</h3>

        ${control('temp', 'Temperature', -100, 100)}
        ${control('tint', 'Tint', -100, 100)}
        ${control('vibrance', 'Vibrance', -100, 100)}
        ${control('saturation', 'Saturation', -100, 100)}
      </div>

      <div class="section">
        <h3>Color Mixer</h3>

        ${colors.map(color => `
          <div class="mixer">
            <span>
              ${color[0].toUpperCase() + color.slice(1)}
            </span>

            <input
              data-mix="h_${color}"
              type="range"
              min="-30"
              max="30"
              value="${S['h_' + color]}"
              title="Hue"
            >

            <input
              data-mix="s_${color}"
              type="range"
              min="-100"
              max="100"
              value="${S['s_' + color]}"
              title="Saturation"
            >

            <input
              data-mix="l_${color}"
              type="range"
              min="-100"
              max="100"
              value="${S['l_' + color]}"
              title="Luminance"
            >
          </div>
        `).join('')}

        <p class="note">
          Each color row contains Hue, Saturation and Luminance.
        </p>
      </div>

      <div class="section">
        <h3>Color Grading</h3>

        ${control('gradeShadow', 'Shadow Color', 0, 360)}
        ${control('gradeShadowSat', 'Shadow Strength', 0, 100)}

        ${control('gradeMid', 'Midtone Color', 0, 360)}
        ${control('gradeMidSat', 'Midtone Strength', 0, 100)}

        ${control('gradeHigh', 'Highlight Color', 0, 360)}
        ${control('gradeHighSat', 'Highlight Strength', 0, 100)}

        ${control('gradeBlend', 'Blending', 0, 100)}
        ${control('gradeBalance', 'Balance', -100, 100)}
      </div>
    `;
  }


  /* EFFECTS */

  if (active === 'effects') {

    h = `
      <div class="section">
        <h3>Effects</h3>

        ${control('texture', 'Texture', -100, 100)}
        ${control('clarity', 'Clarity', -100, 100)}
        ${control('dehaze', 'Dehaze', -100, 100)}
        ${control('vignette', 'Vignette', -100, 100)}
        ${control('midpoint', 'Midpoint', 0, 100)}
        ${control('feather', 'Feather', 0, 100)}
        ${control('roundness', 'Roundness', -100, 100)}
      </div>

      <div class="section">
        <h3>Grain</h3>

        ${control('grain', 'Amount', 0, 100)}
        ${control('grainSize', 'Size', 0, 100)}
        ${control('grainRough', 'Roughness', 0, 100)}
      </div>
    `;
  }


  /* DETAIL */

  if (active === 'detail') {

    h = `
      <div class="section">
        <h3>Detail</h3>

        ${control('sharp', 'Sharpening', 0, 100)}
        ${control('radius', 'Radius', 0.5, 3, 0.1)}
        ${control('noise', 'Noise Reduction', 0, 100)}
        ${control('colorNoise', 'Color Noise', 0, 100)}
      </div>

      <p class="note">
        Preview processing is optimized for mobile performance.
      </p>
    `;
  }


  /* CROP */

  if (active === 'crop') {

    h = `
      <div class="section">

        <h3>Crop & Geometry</h3>

        <div class="cropbox">
          Centered crop preview
        </div>

        <select class="select" id="ratio">
          <option value="original">Original</option>
          <option value="1:1">1 : 1</option>
          <option value="4:5">4 : 5</option>
          <option value="3:4">3 : 4</option>
          <option value="4:3">4 : 3</option>
          <option value="16:9">16 : 9</option>
          <option value="9:16">9 : 16</option>
          <option value="2:3">2 : 3</option>
        </select>

        ${control('straighten', 'Straighten', -10, 10, 0.1)}

        <div class="grid2">
          <button class="btn" id="rl">Rotate Left</button>
          <button class="btn" id="rr">Rotate Right</button>
          <button class="btn" id="fx">Flip Horizontal</button>
          <button class="btn" id="fy">Flip Vertical</button>
        </div>

      </div>
    `;
  }


  /* PRESETS */

  if (active === 'presets') {

    h = `
      <div class="section">

        <h3>Toolora Presets</h3>

        <div class="presets">

          ${[
            ['clean', 'Clean', 'Balanced'],
            ['warm', 'Warm', 'Soft warm'],
            ['cool', 'Cool', 'Clean cool'],
            ['cinematic', 'Cinematic', 'Moody'],
            ['matte', 'Matte', 'Soft film'],
            ['vivid', 'Vivid', 'Color punch'],
            ['portrait', 'Portrait', 'Soft portrait'],
            ['bw', 'B&W', 'Monochrome']
          ].map(x => `
            <button class="preset" data-preset="${x[0]}">
              <b>${x[1]}</b>
              <small>${x[2]}</small>
            </button>
          `).join('')}

        </div>

      </div>

      ${control('presetAmount', 'Preset Amount', 0, 100)}
    `;
  }


  /* PROFILES */

  if (active === 'profiles') {

    h = `
      <div class="section">

        <h3>Profiles</h3>

        <div class="grid2">

          ${[
            ['natural', 'Natural'],
            ['neutral', 'Neutral'],
            ['vivid', 'Vivid'],
            ['modern', 'Modern'],
            ['film', 'Film'],
            ['mono', 'Monochrome']
          ].map(x => `
            <button
              class="btn ${S.profile === x[0] ? 'active' : ''}"
              data-profile="${x[0]}"
            >
              ${x[1]}
            </button>
          `).join('')}

        </div>

      </div>

      <p class="note">
        Profiles change the rendering character without permanently changing the base image.
      </p>
    `;
  }


  /* MASK */

  if (active === 'mask') {

    h = `
      <div class="section">

        <h3>Local Mask</h3>

        <div class="grid3">

          <button class="btn mask ${S.maskType === 'radial' ? 'active' : ''}" data-type="radial">
            Radial
          </button>

          <button class="btn mask ${S.maskType === 'linear' ? 'active' : ''}" data-type="linear">
            Linear
          </button>

          <button class="btn mask ${S.maskType === 'brush' ? 'active' : ''}" data-type="brush">
            Brush
          </button>

        </div>

        ${control('maskAmount', 'Mask Amount', 0, 100)}
        ${control('maskExposure', 'Local Exposure', -100, 100)}
        ${control('maskContrast', 'Local Contrast', -100, 100)}
        ${control('maskSaturation', 'Local Saturation', -100, 100)}

        <button class="btn" id="maskClear" style="width:100%">
          Clear Mask
        </button>

      </div>

      <p class="note">
        Radial and linear masks are browser-side masks. AI subject and sky detection is not faked.
      </p>
    `;
  }


  /* RETOUCH */

  if (active === 'retouch') {

    h = `
      <div class="section">

        <h3>Spot Blur Retouch</h3>

        ${control('retouchSize', 'Brush Size', 5, 100)}

        <button class="btn" id="retouchClear" style="width:100%">
          Clear Retouch
        </button>

      </div>

      <p class="note">
        Paint over an unwanted area to blur it locally.
      </p>
    `;
  }


  /* BLUR */

  if (active === 'blur') {

    h = `
      <div class="section">

        <h3>Lens-style Blur</h3>

        ${control('blur', 'Blur Amount', 0, 100)}
        ${control('blurX', 'Focus X', 0, 100)}
        ${control('blurY', 'Focus Y', 0, 100)}

      </div>
    `;
  }


  /* OPTICS */

  if (active === 'optics') {

    h = `
      <div class="section">

        <h3>Optics</h3>

        ${control('lensVignette', 'Lens Vignette', -100, 100)}
        ${control('defringe', 'Defringe', 0, 100)}

      </div>

      <p class="note">
        Browser-safe optical compensation.
      </p>
    `;
  }


  /* EXPORT */

  if (active === 'export') {

    h = `
      <div class="section">

        <h3>Export</h3>

        <div class="export">

          <div class="grid2">

            <div>
              <div class="colorhead">Format</div>

              <select class="select" id="format">
                <option value="image/jpeg">JPG</option>
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
              </select>
            </div>

            <div>
              <div class="colorhead">Quality</div>

              <select class="select" id="quality">
                <option value=".7">Standard</option>
                <option value=".85" selected>High</option>
                <option value=".95">Maximum</option>
              </select>
            </div>

          </div>

          <div class="colorhead" style="margin-top:10px">
            Maximum long edge
          </div>

          <select class="select" id="size">
            <option value="1600">1600 px</option>
            <option value="2400" selected>2400 px</option>
            <option value="3200">3200 px</option>
            <option value="0">Original working size</option>
          </select>

          <button class="download" id="download">
            Download Edited Photo
          </button>

        </div>

      </div>

      <button class="btn danger" id="resetAll" style="width:100%">
        Reset All Edits
      </button>
    `;
  }

  p.innerHTML = h;

  bind();
  panelActions();
}


/* =========================================================
   PANEL ACTIONS
========================================================= */

function panelActions() {

  $('auto')?.addEventListener('click', () => {

    push();

    S.exposure = 0;
    S.contrast = 8;
    S.highlights = -14;
    S.shadows = 16;
    S.whites = 4;
    S.blacks = -5;

    render();
    panel();
  });


  $('ratio')?.addEventListener('change', e => {

    push();

    S.ratio = e.target.value;

    schedule();
  });


  $('rl')?.addEventListener('click', () => {

    push();

    S.rotate = (S.rotate + 270) % 360;

    panX = 0;
    panY = 0;

    schedule();
  });


  $('rr')?.addEventListener('click', () => {

    push();

    S.rotate = (S.rotate + 90) % 360;

    panX = 0;
    panY = 0;

    schedule();
  });


  $('fx')?.addEventListener('click', () => {

    push();

    S.flipX = !S.flipX;

    schedule();
  });


  $('fy')?.addEventListener('click', () => {

    push();

    S.flipY = !S.flipY;

    schedule();
  });


  document.querySelectorAll('[data-preset]').forEach(button => {

    button.onclick = () => preset(button.dataset.preset);

  });


  document.querySelectorAll('[data-profile]').forEach(button => {

    button.onclick = () => {

      push();

      S.profile = button.dataset.profile;

      render();
      panel();
    };
  });


  document.querySelectorAll('.mask').forEach(button => {

    button.onclick = () => {

      S.maskType = button.dataset.type;

      document.querySelectorAll('.mask').forEach(x => {
        x.classList.remove('active');
      });

      button.classList.add('active');

      schedule();
    };
  });


  $('maskClear')?.addEventListener('click', () => {

    push();

    S.maskAmount = 0;
    S.maskExposure = 0;
    S.maskContrast = 0;
    S.maskSaturation = 0;

    schedule();
  });


  $('retouchClear')?.addEventListener('click', () => {

    push();

    retouch = [];

    render();
  });


  $('download')?.addEventListener('click', exportImage);

  $('resetAll')?.addEventListener('click', resetAll);
}


/* =========================================================
   PRESETS
========================================================= */

function preset(name) {

  push();

  const values = {

    clean: {
      exposure: 4,
      contrast: 5,
      shadows: 8,
      vibrance: 10,
      texture: 8
    },

    warm: {
      temp: 16,
      contrast: 4,
      highlights: -8,
      shadows: 8,
      vibrance: 8
    },

    cool: {
      temp: -16,
      contrast: 5,
      shadows: 6,
      vibrance: 8
    },

    cinematic: {
      contrast: 12,
      highlights: -15,
      blacks: -12,
      clarity: 10,
      dehaze: 7,
      vignette: 18,
      saturation: -5
    },

    matte: {
      contrast: -8,
      highlights: -12,
      shadows: 15,
      blacks: 18,
      clarity: -4,
      saturation: -4,
      vignette: 8
    },

    vivid: {
      contrast: 7,
      vibrance: 28,
      saturation: 5,
      clarity: 6
    },

    portrait: {
      exposure: 5,
      highlights: -8,
      shadows: 12,
      temp: 5,
      vibrance: 8,
      texture: -10,
      clarity: -5
    },

    bw: {
      contrast: 10,
      highlights: -8,
      shadows: 8,
      blacks: -12,
      saturation: -100,
      clarity: 8
    }
  };

  Object.assign(S, values[name] || {});

  S.preset = name;

  render();
  panel();
}


/* =========================================================
   IMAGE LOADING
========================================================= */

function handleImageFile(file) {

  if (!file) return;

  if (!file.type || !file.type.startsWith('image/')) {

    alert('Please select a valid image file.');

    return;
  }

  $('status').textContent = 'Opening photo...';

  const url = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {

    URL.revokeObjectURL(url);

    img = image;
    fileName = file.name;

    const max = 1400;

    const scale = Math.min(
      1,
      max / Math.max(image.naturalWidth, image.naturalHeight)
    );

    src.width = Math.max(1, Math.round(image.naturalWidth * scale));
    src.height = Math.max(1, Math.round(image.naturalHeight * scale));

    sx.clearRect(0, 0, src.width, src.height);

    sx.drawImage(
      image,
      0,
      0,
      src.width,
      src.height
    );

    $('name').textContent = file.name;

    $('meta').textContent =
      `${image.naturalWidth} × ${image.naturalHeight}px`;

    $('empty').style.display = 'none';

    C.style.display = 'block';
    O.style.display = 'block';

    showBefore = false;

    $('badge').style.display = 'none';

    retouch = [];

    resetState(false);

    zoom = 1;
    panX = 0;
    panY = 0;

    render();

    $('status').textContent = 'Ready';
  };

  image.onerror = () => {

    URL.revokeObjectURL(url);

    $('status').textContent = 'Ready';

    alert(
      'The selected image could not be opened. Please try another image.'
    );
  };

  image.src = url;
}


const fileInput = $('fileInput');

$('openTop').addEventListener(
  'click',
  () => fileInput.click()
);

$('openEmpty').addEventListener(
  'click',
  () => fileInput.click()
);

fileInput.addEventListener(
  'change',
  e => {

    handleImageFile(
      e.target.files && e.target.files[0]
    );

    e.target.value = '';
  }
);


/* =========================================================
   RESET
========================================================= */

function resetState() {

  for (const key of Object.keys(S)) {

    if (
      key.startsWith('h_') ||
      key.startsWith('s_') ||
      key.startsWith('l_')
    ) {

      S[key] = 0;

    } else if (typeof S[key] === 'boolean') {

      S[key] = false;

    } else if (key === 'ratio') {

      S[key] = 'original';

    } else if (key === 'profile') {

      S[key] = 'natural';

    } else if (key === 'preset') {

      S[key] = 'none';

    } else if (key === 'maskType') {

      S[key] = 'radial';

    } else if (
      key === 'midpoint' ||
      key === 'feather' ||
      key === 'blurX' ||
      key === 'blurY'
    ) {

      S[key] = 50;

    } else if (key === 'grainSize') {

      S[key] = 25;

    } else if (key === 'radius') {

      S[key] = 1;

    } else {

      S[key] = 0;
    }
  }

  S.presetAmount = 100;

  history = [];
  future = [];

  zoom = 1;
  panX = 0;
  panY = 0;

  panel();

  schedule();
}


function resetAll() {

  push();

  resetState();
}


/* =========================================================
   FAST RENDER QUEUE
========================================================= */

function schedule() {

  if (renderQueued) return;

  renderQueued = true;

  requestAnimationFrame(() => {

    renderQueued = false;

    render();
  });
}


/* =========================================================
   PROFILE
   IMPORTANT: DOES NOT MUTATE S
========================================================= */

function getProfileValues() {

  const p = { ...S };

  if (p.profile === 'vivid') {

    p.vibrance += 12;
    p.saturation += 5;
    p.contrast += 5;

  } else if (p.profile === 'neutral') {

    p.contrast -= 3;
    p.saturation -= 3;

  } else if (p.profile === 'modern') {

    p.contrast += 5;
    p.clarity += 7;
    p.vibrance += 7;

  } else if (p.profile === 'film') {

    p.contrast += 4;
    p.saturation -= 5;
    p.temp += 4;
    p.grain += 5;

  } else if (p.profile === 'mono') {

    p.saturation = -100;
  }

  return p;
}


/* =========================================================
   COLOR FUNCTIONS
========================================================= */

function rgbh(r, g, b) {

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const d = max - min;

  let h = 0;

  const s = max ? d / max : 0;

  if (d) {

    if (max === r) {

      h =
        ((g - b) / d +
          (g < b ? 6 : 0)) / 6;

    } else if (max === g) {

      h =
        ((b - r) / d + 2) / 6;

    } else {

      h =
        ((r - g) / d + 4) / 6;
    }
  }

  return [h, s, max];
}


function hsv(h, s, v) {

  let i = Math.floor(h * 6);

  const f = h * 6 - i;

  const p = v * (1 - s);

  const q = v * (1 - f * s);

  const t =
    v * (1 - (1 - f) * s);

  return [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q]
  ][i % 6];
}


function band(h) {

  if (h < .04 || h > .96) return 'red';
  if (h < .11) return 'orange';
  if (h < .19) return 'yellow';
  if (h < .43) return 'green';
  if (h < .53) return 'aqua';
  if (h < .70) return 'blue';
  if (h < .85) return 'purple';

  return 'magenta';
}


/* =========================================================
   PIXEL PROCESSING
========================================================= */

function applyPixel(imageData, w, h) {

  const d = imageData.data;

  const p = getProfileValues();

  const exposure =
    Math.pow(2, p.exposure / 50);

  const contrast =
    (100 + p.contrast) / 100;

  const saturation =
    (100 + p.saturation) / 100;

  const vibrance =
    p.vibrance / 100;


  for (let i = 0; i < d.length; i += 4) {

    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    r *= exposure;
    g *= exposure;
    b *= exposure;


    const lum =
      .2126 * r +
      .7152 * g +
      .0722 * b;


    const hi =
      p.highlights / 120;

    const sh =
      p.shadows / 120;


    if (lum > .5) {

      r += hi * (r - .5);
      g += hi * (g - .5);
      b += hi * (b - .5);

    } else {

      r += sh * (.5 - r);
      g += sh * (.5 - g);
      b += sh * (.5 - b);
    }


    const whiteBlack =
      p.whites / 255 +
      p.blacks / 255;


    r += whiteBlack;
    g += whiteBlack;
    b += whiteBlack;


    r = (r - .5) * contrast + .5;
    g = (g - .5) * contrast + .5;
    b = (b - .5) * contrast + .5;


    r += p.temp * .0009;
    b -= p.temp * .0009;

    g += p.tint * .00045;


    const gray =
      .299 * r +
      .587 * g +
      .114 * b;


    const boost =
      1 +
      vibrance *
      (1 - Math.abs(2 * lum - 1)) *
      .7;


    r =
      gray +
      (r - gray) *
      saturation *
      boost;

    g =
      gray +
      (g - gray) *
      saturation *
      boost;

    b =
      gray +
      (b - gray) *
      saturation *
      boost;


    /* Texture / clarity */

    const effect =
      (p.texture + p.clarity) / 900;

    const average =
      (r + g + b) / 3;

    r += (r - average) * effect;
    g += (g - average) * effect;
    b += (b - average) * effect;


    /* Dehaze */

    if (p.dehaze) {

      const amount =
        p.dehaze / 140;

      r =
        (r - .5) *
        (1 + amount) +
        .5;

      g =
        (g - .5) *
        (1 + amount) +
        .5;

      b =
        (b - .5) *
        (1 + amount) +
        .5;
    }


    /* HSL mixer */

    const safeR = clamp(r, 0, 1);
    const safeG = clamp(g, 0, 1);
    const safeB = clamp(b, 0, 1);

    let [hh, ss, vv] =
      rgbh(
        safeR,
        safeG,
        safeB
      );

    const colorBand = band(hh);

    const hueShift =
      S['h_' + colorBand];

    const satShift =
      S['s_' + colorBand];

    const lumShift =
      S['l_' + colorBand];


    if (
      hueShift ||
      satShift ||
      lumShift
    ) {

      [r, g, b] =
        hsv(
          (hh + hueShift / 360 + 1) % 1,
          clamp(
            ss * (1 + satShift / 100),
            0,
            1
          ),
          clamp(
            vv * (1 + lumShift / 100),
            0,
            1
          )
        );
    }


    /* Color grading */

    const gradeLum =
      .2126 * r +
      .7152 * g +
      .0722 * b;


    let gradeHue;
    let gradeSat;


    if (gradeLum < .35) {

      gradeHue = S.gradeShadow;
      gradeSat = S.gradeShadowSat;

    } else if (gradeLum > .65) {

      gradeHue = S.gradeHigh;
      gradeSat = S.gradeHighSat;

    } else {

      gradeHue = S.gradeMid;
      gradeSat = S.gradeMidSat;
    }


    if (gradeSat) {

      const gradeColor =
        hsv(
          gradeHue / 360,
          gradeSat / 100,
          Math.max(.25, gradeLum)
        );

      const blend =
        (S.gradeBlend / 100) * .35;

      r =
        r * (1 - blend) +
        gradeColor[0] * blend;

      g =
        g * (1 - blend) +
        gradeColor[1] * blend;

      b =
        b * (1 - blend) +
        gradeColor[2] * blend;
    }


    /* Vignette */

    const px =
      (i / 4 % w) / w - .5;

    const py =
      Math.floor(i / 4 / w) / h - .5;

    let distance =
      Math.sqrt(px * px + py * py) *
      1.414;


    if (p.vignette) {

      const start =
        p.midpoint / 100 * .65;

      const softness =
        Math.max(
          .05,
          p.feather / 100
        );

      const edge =
        clamp(
          (distance - start) /
          softness,
          0,
          1
        );

      const factor =
        1 -
        p.vignette / 100 *
        edge *
        edge;

      r *= factor;
      g *= factor;
      b *= factor;
    }


    /* Local mask */

    if (p.maskAmount) {

      let mask = 0;

      if (p.maskType === 'radial') {

        mask =
          1 -
          clamp(
            Math.sqrt(px * px + py * py) * 2.1,
            0,
            1
          );

      } else if (p.maskType === 'linear') {

        mask =
          clamp(
            1 - Math.abs(py) * 2,
            0,
            1
          );

      } else {

        mask = 1;
      }


      mask *= p.maskAmount / 100;


      const local =
        p.maskExposure / 250 *
        mask;


      r += local;
      g += local;
      b += local;


      const localContrast =
        1 +
        mask *
        p.maskContrast / 100;


      r =
        (r - .5) *
        localContrast +
        .5;

      g =
        (g - .5) *
        localContrast +
        .5;

      b =
        (b - .5) *
        localContrast +
        .5;


      const localGray =
        .299 * r +
        .587 * g +
        .114 * b;


      const localSat =
        1 +
        mask *
        p.maskSaturation / 100;


      r =
        localGray +
        (r - localGray) *
        localSat;

      g =
        localGray +
        (g - localGray) *
        localSat;

      b =
        localGray +
        (b - localGray) *
        localSat;
    }


    d[i] =
      clamp(r * 255, 0, 255);

    d[i + 1] =
      clamp(g * 255, 0, 255);

    d[i + 2] =
      clamp(b * 255, 0, 255);

    d[i + 3] = 255;
  }

  return imageData;
}


/* =========================================================
   SHARPEN
========================================================= */

function sharpen(canvasContext, w, h, amount) {

  if (amount < 1) return;

  const source =
    canvasContext.getImageData(
      0,
      0,
      w,
      h
    );

  const output =
    canvasContext.createImageData(
      w,
      h
    );

  const d = source.data;
  const q = output.data;

  q.set(d);

  const strength =
    amount / 100 * .7;


  for (
    let y = 1;
    y < h - 1;
    y++
  ) {

    for (
      let x = 1;
      x < w - 1;
      x++
    ) {

      const i =
        (y * w + x) * 4;

      for (
        let channel = 0;
        channel < 3;
        channel++
      ) {

        q[i + channel] =
          clamp(
            d[i + channel] *
              (1 + 4 * strength) -

            strength *
              (
                d[i - 4 + channel] +
                d[i + 4 + channel] +
                d[i - w * 4 + channel] +
                d[i + w * 4 + channel]
              ),
            0,
            255
          );
      }

      q[i + 3] = 255;
    }
  }

  canvasContext.putImageData(
    output,
    0,
    0
  );
}


/* =========================================================
   GRAIN
========================================================= */

function grain(canvasContext, w, h, amount) {

  if (amount <= 0) return;

  const imageData =
    canvasContext.getImageData(
      0,
      0,
      w,
      h
    );

  const d = imageData.data;

  const size =
    Math.max(
      .2,
      S.grainSize / 25
    );

  const rough =
    S.grainRough / 100;

  const strength =
    amount / 100 * 28;


  for (
    let i = 0;
    i < d.length;
    i += 4
  ) {

    const random =
      (
        Math.random() -
        .5
      ) *
      strength *
      size *
      (0.6 + rough);


    d[i] =
      clamp(
        d[i] + random,
        0,
        255
      );

    d[i + 1] =
      clamp(
        d[i + 1] + random,
        0,
        255
      );

    d[i + 2] =
      clamp(
        d[i + 2] + random,
        0,
        255
      );
  }

  canvasContext.putImageData(
    imageData,
    0,
    0
  );
}


/* =========================================================
   FAST BLUR
========================================================= */

function applyBlur(canvasContext, w, h, amount) {

  if (amount <= 0) return;

  const temp =
    document.createElement('canvas');

  temp.width = w;
  temp.height = h;

  const tctx =
    temp.getContext('2d');

  tctx.filter =
    `blur(${Math.min(8, amount / 12)}px)`;

  tctx.drawImage(
    canvasContext.canvas,
    0,
    0
  );

  canvasContext.clearRect(
    0,
    0,
    w,
    h
  );

  canvasContext.drawImage(
    temp,
    0,
    0
  );
}


/* =========================================================
   RETOUCH
   ONE BLURRING PASS INSTEAD OF ONE PASS PER DOT
========================================================= */

function retouchDraw(canvasContext, w, h) {

  if (!retouch.length) return;

  const blurred =
    document.createElement('canvas');

  blurred.width = w;
  blurred.height = h;

  const bctx =
    blurred.getContext('2d');

  bctx.filter =
    'blur(4px)';

  bctx.drawImage(
    canvasContext.canvas,
    0,
    0
  );


  canvasContext.save();

  for (const point of retouch) {

    const radius =
      point.r;

    canvasContext.save();

    canvasContext.beginPath();

    canvasContext.arc(
      point.x,
      point.y,
      radius,
      0,
      Math.PI * 2
    );

    canvasContext.clip();

    canvasContext.globalAlpha = .9;

    canvasContext.drawImage(
      blurred,
      0,
      0
    );

    canvasContext.restore();
  }

  canvasContext.restore();
}


/* =========================================================
   OVERLAY
========================================================= */

function showOverlay() {

  O.width = C.width;
  O.height = C.height;

  ox.clearRect(
    0,
    0,
    O.width,
    O.height
  );

  O.style.width =
    C.clientWidth + 'px';

  O.style.height =
    C.clientHeight + 'px';
}


/* =========================================================
   CANVAS TRANSFORM
   ZOOM + PAN
========================================================= */

function updateCanvasTransform() {

  const transform =
    `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;

  C.style.transform = transform;
  O.style.transform = transform;

  $('zlabel').textContent =
    `${Math.round(zoom * 100)}%`;
}


/* =========================================================
   RENDER
========================================================= */

function render() {

  if (!img || rendering) return;

  rendering = true;

  $('status').textContent =
    'Rendering...';


  const angle =
    (
      S.rotate +
      S.straighten
    ) *
    Math.PI /
    180;


  const W = src.width;
  const H = src.height;


  const rotatedWidth =
    S.rotate % 180 ? H : W;

  const rotatedHeight =
    S.rotate % 180 ? W : H;


  const transformed =
    document.createElement('canvas');

  transformed.width =
    rotatedWidth;

  transformed.height =
    rotatedHeight;


  const tctx =
    transformed.getContext('2d');


  tctx.translate(
    rotatedWidth / 2,
    rotatedHeight / 2
  );

  tctx.rotate(angle);

  tctx.scale(
    S.flipX ? -1 : 1,
    S.flipY ? -1 : 1
  );

  tctx.drawImage(
    src,
    -W / 2,
    -H / 2
  );


  let cropWidth =
    rotatedWidth;

  let cropHeight =
    rotatedHeight;

  let cropX = 0;
  let cropY = 0;


  if (S.ratio !== 'original') {

    const parts =
      S.ratio
        .split(':')
        .map(Number);

    const targetRatio =
      parts[0] / parts[1];

    const currentRatio =
      rotatedWidth /
      rotatedHeight;


    if (currentRatio > targetRatio) {

      cropWidth =
        Math.round(
          rotatedHeight *
          targetRatio
        );

      cropX =
        (rotatedWidth -
          cropWidth) /
        2;

    } else {

      cropHeight =
        Math.round(
          rotatedWidth /
          targetRatio
        );

      cropY =
        (rotatedHeight -
          cropHeight) /
        2;
    }
  }


  /*
    Keep preview processing lightweight.
    This is the main speed improvement.
  */

  const maxPreview =
    window.innerWidth < 700
      ? 600
      : 1000;


  const scale =
    Math.min(
      1,
      maxPreview /
      Math.max(
        cropWidth,
        cropHeight
      )
    );


  const width =
    Math.max(
      1,
      Math.round(
        cropWidth * scale
      )
    );

  const height =
    Math.max(
      1,
      Math.round(
        cropHeight * scale
      )
    );


  C.width = width;
  C.height = height;


  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  ctx.drawImage(
    transformed,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    width,
    height
  );


  if (showBefore) {

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    ctx.drawImage(
      transformed,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height
    );

    showOverlay();

    updateCanvasTransform();

    $('status').textContent =
      'Original';

    rendering = false;

    return;
  }


  let data =
    ctx.getImageData(
      0,
      0,
      width,
      height
    );


  data =
    applyPixel(
      data,
      width,
      height
    );


  ctx.putImageData(
    data,
    0,
    0
  );


  if (S.noise > 0) {

    applyBlur(
      ctx,
      width,
      height,
      S.noise
    );
  }


  if (S.colorNoise > 0) {

    const imageData =
      ctx.getImageData(
        0,
        0,
        width,
        height
      );

    const d =
      imageData.data;

    const strength =
      S.colorNoise / 100;


    for (
      let i = 0;
      i < d.length;
      i += 4
    ) {

      const gray =
        .299 * d[i] +
        .587 * d[i + 1] +
        .114 * d[i + 2];


      d[i] =
        d[i] * (1 - strength) +
        gray * strength;

      d[i + 1] =
        d[i + 1] * (1 - strength) +
        gray * strength;

      d[i + 2] =
        d[i + 2] * (1 - strength) +
        gray * strength;
    }


    ctx.putImageData(
      imageData,
      0,
      0
    );
  }


  if (S.sharp > 0) {

    sharpen(
      ctx,
      width,
      height,
      S.sharp
    );
  }


  if (S.grain > 0) {

    grain(
      ctx,
      width,
      height,
      S.grain
    );
  }


  if (S.blur > 0) {

    applyBlur(
      ctx,
      width,
      height,
      S.blur
    );
  }


  retouchDraw(
    ctx,
    width,
    height
  );


  showOverlay();

  updateCanvasTransform();

  $('status').textContent =
    'Ready';

  rendering = false;
}


/* =========================================================
   EXPORT
========================================================= */

function exportImage() {

  if (!img) {

    alert(
      'Please open a photo first.'
    );

    return;
  }


  $('status').textContent =
    'Exporting...';


  const max =
    Number($('size').value) ||
    Math.max(
      src.width,
      src.height
    );


  const oldZoom = zoom;

  const oldPanX = panX;
  const oldPanY = panY;


  zoom = 1;
  panX = 0;
  panY = 0;


  render();


  const scale =
    Math.min(
      1,
      max /
      Math.max(
        C.width,
        C.height
      )
    );


  const output =
    document.createElement('canvas');


  output.width =
    Math.max(
      1,
      Math.round(C.width * scale)
    );

  output.height =
    Math.max(
      1,
      Math.round(C.height * scale)
    );


  const outputContext =
    output.getContext('2d');


  outputContext.drawImage(
    C,
    0,
    0,
    output.width,
    output.height
  );


  const type =
    $('format').value;

  const quality =
    Number($('quality').value);


  const extension =
    type === 'image/png'
      ? 'png'
      : type === 'image/webp'
        ? 'webp'
        : 'jpg';


  const link =
    document.createElement('a');


  link.download =
    `toolora-edited-${Date.now()}.${extension}`;

  link.href =
    output.toDataURL(
      type,
      quality
    );

  link.click();


  zoom = oldZoom;

  panX = oldPanX;
  panY = oldPanY;

  render();

  $('status').textContent =
    'Export complete';
}


/* =========================================================
   TOP CONTROLS
========================================================= */

$('tabs').addEventListener(
  'click',
  e => {

    const button =
      e.target.closest(
        '[data-tool]'
      );

    if (!button) return;

    active =
      button.dataset.tool;


    document
      .querySelectorAll(
        '#tabs button'
      )
      .forEach(item => {

        item.classList.toggle(
          'active',
          item === button
        );
      });


    panel();
  }
);


$('reset').onclick = () => {

  push();

  resetState();
};


$('undo').onclick = () => {

  if (!history.length) return;

  future.push(
    snap()
  );

  restore(
    history.pop()
  );
};


$('redo').onclick = () => {

  if (!future.length) return;

  history.push(
    snap()
  );

  restore(
    future.pop()
  );
};


$('before').onclick = () => {

  showBefore =
    !showBefore;

  $('badge').style.display =
    showBefore
      ? 'block'
      : 'none';

  render();
};


/* =========================================================
   ZOOM BUTTONS
========================================================= */

function setZoom(value) {

  zoom =
    clamp(
      value,
      0.5,
      4
    );

  if (zoom <= 1) {

    panX = 0;
    panY = 0;
  }

  updateCanvasTransform();

  schedule();
}


$('zout').onclick = () => {

  setZoom(
    zoom - 0.2
  );
};


$('zin').onclick = () => {

  setZoom(
    zoom + 0.2
  );
};


$('fit').onclick = () => {

  zoom = 1;

  panX = 0;
  panY = 0;

  updateCanvasTransform();

  render();
};


$('full').onclick = () => {

  $('stage')
    .requestFullscreen?.();
};


/* =========================================================
   DOUBLE TAP
========================================================= */

let lastTap = 0;

$('stage').addEventListener(
  'pointerup',
  e => {

    if (
      active === 'retouch' ||
      active === 'mask'
    ) {
      return;
    }

    const now =
      Date.now();

    if (
      now - lastTap <
      280
    ) {

      if (zoom > 1) {

        zoom = 1;
        panX = 0;
        panY = 0;

      } else {

        zoom = 2;
      }

      updateCanvasTransform();

      render();
    }

    lastTap = now;
  }
);


/* =========================================================
   TOUCH / MOUSE PAN + PINCH ZOOM
========================================================= */

function distance(a, b) {

  return Math.hypot(
    a.clientX - b.clientX,
    a.clientY - b.clientY
  );
}


function midpoint(a, b) {

  return {
    x:
      (a.clientX +
        b.clientX) / 2,

    y:
      (a.clientY +
        b.clientY) / 2
  };
}


$('stage').addEventListener(
  'pointerdown',
  e => {

    /*
      Retouch uses the same stage.
      Do not start normal pan in that mode.
    */

    if (
      active === 'retouch' &&
      img
    ) {

      addRetouchPoint(e);

      return;
    }


    pointers.set(
      e.pointerId,
      e
    );

    $('stage').setPointerCapture(
      e.pointerId
    );


    if (pointers.size === 1) {

      gesture = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panX,
        startPanY: panY
      };

    } else if (pointers.size === 2) {

      const values =
        [...pointers.values()];

      gesture = {

        type: 'pinch',

        startDistance:
          distance(
            values[0],
            values[1]
          ),

        startZoom:
          zoom,

        startPanX:
          panX,

        startPanY:
          panY,

        startMid:
          midpoint(
            values[0],
            values[1]
          )
      };
    }
  }
);


$('stage').addEventListener(
  'pointermove',
  e => {

    if (
      active === 'retouch'
    ) {

      if (
        e.buttons ||
        e.pressure
      ) {

        addRetouchPoint(e);
      }

      return;
    }


    if (!pointers.has(e.pointerId)) {
      return;
    }


    pointers.set(
      e.pointerId,
      e
    );


    if (
      pointers.size === 1 &&
      gesture &&
      gesture.type === 'pan'
    ) {

      if (zoom <= 1) {
        return;
      }


      panX =
        gesture.startPanX +
        (
          e.clientX -
          gesture.startX
        );

      panY =
        gesture.startPanY +
        (
          e.clientY -
          gesture.startY
        );


      updateCanvasTransform();

      return;
    }


    if (
      pointers.size === 2 &&
      gesture &&
      gesture.type === 'pinch'
    ) {

      const values =
        [...pointers.values()];

      const currentDistance =
        distance(
          values[0],
          values[1]
        );


      if (
        gesture.startDistance <= 0
      ) {
        return;
      }


      const factor =
        currentDistance /
        gesture.startDistance;


      zoom =
        clamp(
          gesture.startZoom *
          factor,
          0.5,
          4
        );


      const currentMid =
        midpoint(
          values[0],
          values[1]
        );


      panX =
        gesture.startPanX +
        (
          currentMid.x -
          gesture.startMid.x
        );

      panY =
        gesture.startPanY +
        (
          currentMid.y -
          gesture.startMid.y
        );


      if (zoom <= 1) {

        panX = 0;
        panY = 0;
      }


      updateCanvasTransform();
    }
  }
);


$('stage').addEventListener(
  'pointerup',
  e => {

    pointers.delete(
      e.pointerId
    );

    if (
      pointers.size === 0
    ) {

      gesture = null;
    }
  }
);


$('stage').addEventListener(
  'pointercancel',
  e => {

    pointers.delete(
      e.pointerId
    );

    if (
      pointers.size === 0
    ) {

      gesture = null;
    }
  }
);


/* =========================================================
   RETOUCH POINTER
========================================================= */

let retouchDrawing = false;


function addRetouchPoint(e) {

  if (!img) return;

  const rect =
    C.getBoundingClientRect();


  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return;
  }


  const x =
    (
      e.clientX -
      rect.left
    ) /
    rect.width *
    C.width;


  const y =
    (
      e.clientY -
      rect.top
    ) /
    rect.height *
    C.height;


  retouch.push({

    x,
    y,

    r:
      Math.max(
        3,
        S.retouchSize *
        C.width /
        1000
      )
  });


  schedule();
}


$('stage').addEventListener(
  'pointerdown',
  e => {

    if (
      active !== 'retouch' ||
      !img
    ) {
      return;
    }

    retouchDrawing = true;

    $('stage').setPointerCapture(
      e.pointerId
    );

    addRetouchPoint(e);
  }
);


$('stage').addEventListener(
  'pointermove',
  e => {

    if (
      active === 'retouch' &&
      retouchDrawing
    ) {

      addRetouchPoint(e);
    }
  }
);


$('stage').addEventListener(
  'pointerup',
  () => {

    if (retouchDrawing) {

      push();

      retouchDrawing = false;
    }
  }
);


$('stage').addEventListener(
  'pointercancel',
  () => {

    retouchDrawing = false;
  }
);


/* =========================================================
   DRAG & DROP
========================================================= */

$('stage').addEventListener(
  'dragover',
  e => {

    e.preventDefault();

    $('stage')
      .classList
      .add('dragover');
  }
);


$('stage').addEventListener(
  'dragleave',
  () => {

    $('stage')
      .classList
      .remove('dragover');
  }
);


$('stage').addEventListener(
  'drop',
  e => {

    e.preventDefault();

    $('stage')
      .classList
      .remove('dragover');

    handleImageFile(
      e.dataTransfer.files &&
      e.dataTransfer.files[0]
    );
  }
);


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
  'keydown',
  e => {

    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'z'
    ) {

      e.preventDefault();

      $('undo').click();

      return;
    }


    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      e.key.toLowerCase() === 'z'
    ) {

      e.preventDefault();

      $('redo').click();
    }
  }
);


/* =========================================================
   INITIALIZE
========================================================= */

document
  .querySelector(
    '#tabs button[data-tool="light"]'
  )
  .classList
  .add('active');


panel();

updateCanvasTransform();

})();
