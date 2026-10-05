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

/* =========================================================
   ZOOM + PAN
   ========================================================= */

let zoom = 1;
let panX = 0;
let panY = 0;

/* =========================================================
   EDITOR STATE
   ========================================================= */

let active = 'light';
let showBefore = false;

let history = [];
let future = [];

let retouch = [];

const pointers = new Map();
let gesture = null;

/* =========================================================
   MAIN STATE
   ========================================================= */

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
  gradeBalance: 0,

  /* =======================================================
     TEXT
     ======================================================= */

  textSize: 48,
  textOpacity: 100,

  /* =======================================================
     DRAW
     ======================================================= */

  drawSize: 8,
  drawOpacity: 100,

  /* =======================================================
     COLOR SELECT
     ======================================================= */

  selectiveR: 0,
  selectiveG: 0,
  selectiveB: 0,
  selectiveRange: 35,
  selectiveHue: 0,
  selectiveSat: 0,
  selectiveLight: 0
};

/* =========================================================
   COLOR MIXER
   ========================================================= */

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

/* =========================================================
   TEXT / DRAW / LAYERS DATA
   ========================================================= */

let textLayers = [];
let drawLayers = [];
let selectedTextId = null;

/* =========================================================
   PANEL NAMES
   ========================================================= */

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
  text: ['Overlay', 'Text'],
  draw: ['Overlay', 'Draw'],
  selective: ['Color', 'Color Select'],
  layers: ['Manage', 'Layers'],
  export: ['Output', 'Export']
};

/* =========================================================
   HISTORY
   ========================================================= */

function snap() {
  return JSON.parse(JSON.stringify({
    S,
    retouch,
    textLayers,
    drawLayers,
    selectedTextId
  }));
}

function push() {
  history.push(snap());

  if (history.length > 30) {
    history.shift();
  }

  future = [];
}

function restore(state) {
  Object.assign(S, state.S || state);

  if (state.retouch) {
    retouch = state.retouch;
  }

  if (state.textLayers) {
    textLayers = state.textLayers;
  }

  if (state.drawLayers) {
    drawLayers = state.drawLayers;
  }

  if ('selectedTextId' in state) {
    selectedTextId = state.selectedTextId;
  }

  render();
  panel();
}

/* =========================================================
   UNDO
   ========================================================= */

function undo() {

  if (!history.length) return;

  future.push(snap());

  const state = history.pop();

  restore(state);
}

/* =========================================================
   REDO
   ========================================================= */

function redo() {

  if (!future.length) return;

  history.push(snap());

  const state = future.pop();

  restore(state);
}

/* =========================================================
   FORMAT HELPER
   ========================================================= */

function fmt(value) {

  value = Number(value);

  if (!Number.isFinite(value)) {
    return '0';
  }

  return `${value > 0 ? '+' : ''}${
    Number.isInteger(value)
      ? value
      : value.toFixed(1)
  }`;
}

/* =========================================================
   RANGE CONTROL
   ========================================================= */

function control(key, label, min, max, step = 1) {

  return `
    <div class="control">

      <div class="ch">

        <span>${label}</span>

        <span
          class="val"
          id="v_${key}"
        >
          ${fmt(S[key])}
        </span>

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
   BUTTON HELPER
   ========================================================= */

function button(label, id, extra = '') {

  return `
    <button
      class="btn ${extra}"
      id="${id}"
      type="button"
    >
      ${label}
    </button>
  `;
}

/* =========================================================
   COLOR INPUT
   ========================================================= */

function colorInput(id, value = '#ffffff') {

  return `
    <input
      id="${id}"
      type="color"
      value="${value}"
      style="
        width:48px;
        height:38px;
        padding:2px;
        border:1px solid rgba(255,255,255,.12);
        border-radius:8px;
        background:#111;
      "
    >
  `;
}

/* =========================================================
   PANEL BINDING
   ========================================================= */

function bind() {

  document
    .querySelectorAll('#panel input[data-k]')
    .forEach(input => {

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


  document
    .querySelectorAll('#panel [data-mix]')
    .forEach(input => {

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
   Existing Lightroom-style controls + new tools
   ========================================================= */

function panel() {

  const p = $('panel');

  $('eyebrow').textContent =
    names[active][0];

  $('title').textContent =
    names[active][1];

  let h = '';

  /* =======================================================
     LIGHT
     ======================================================= */

  if (active === 'light') {

    h = `
      <div class="section">

        <h3>Tone</h3>

        ${control(
          'exposure',
          'Exposure',
          -100,
          100
        )}

        ${control(
          'contrast',
          'Contrast',
          -100,
          100
        )}

        ${control(
          'highlights',
          'Highlights',
          -100,
          100
        )}

        ${control(
          'shadows',
          'Shadows',
          -100,
          100
        )}

        ${control(
          'whites',
          'Whites',
          -100,
          100
        )}

        ${control(
          'blacks',
          'Blacks',
          -100,
          100
        )}

      </div>

      <div class="section">

        <button
          class="btn"
          id="auto"
          style="width:100%"
          type="button"
        >
          Auto Tone
        </button>

        <p
          class="note"
          style="margin-top:8px"
        >
          Auto uses a quick balanced correction.
        </p>

      </div>
    `;
  }

  /* =======================================================
     COLOR
     ======================================================= */

  if (active === 'color') {

    h = `
      <div class="section">

        <h3>White Balance</h3>

        ${control(
          'temp',
          'Temperature',
          -100,
          100
        )}

        ${control(
          'tint',
          'Tint',
          -100,
          100
        )}

        ${control(
          'vibrance',
          'Vibrance',
          -100,
          100
        )}

        ${control(
          'saturation',
          'Saturation',
          -100,
          100
        )}

      </div>

      <div class="section">

        <h3>Color Mixer</h3>

        ${colors.map(color => `

          <div class="mixer">

            <span>
              ${
                color[0].toUpperCase()
                + color.slice(1)
              }
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
          Each color row contains Hue,
          Saturation and Luminance.
        </p>

      </div>

      <div class="section">

        <h3>Color Grading</h3>

        ${control(
          'gradeShadow',
          'Shadow Color',
          0,
          360
        )}

        ${control(
          'gradeShadowSat',
          'Shadow Strength',
          0,
          100
        )}

        ${control(
          'gradeMid',
          'Midtone Color',
          0,
          360
        )}

        ${control(
          'gradeMidSat',
          'Midtone Strength',
          0,
          100
        )}

        ${control(
          'gradeHigh',
          'Highlight Color',
          0,
          360
        )}

        ${control(
          'gradeHighSat',
          'Highlight Strength',
          0,
          100
        )}

        ${control(
          'gradeBlend',
          'Blending',
          0,
          100
        )}

        ${control(
          'gradeBalance',
          'Balance',
          -100,
          100
        )}

      </div>
    `;
  }

  /* =======================================================
     EFFECTS
     ======================================================= */

  if (active === 'effects') {

    h = `
      <div class="section">

        <h3>Effects</h3>

        ${control(
          'texture',
          'Texture',
          -100,
          100
        )}

        ${control(
          'clarity',
          'Clarity',
          -100,
          100
        )}

        ${control(
          'dehaze',
          'Dehaze',
          -100,
          100
        )}

        ${control(
          'vignette',
          'Vignette',
          -100,
          100
        )}

        ${control(
          'midpoint',
          'Midpoint',
          0,
          100
        )}

        ${control(
          'feather',
          'Feather',
          0,
          100
        )}

        ${control(
          'roundness',
          'Roundness',
          -100,
          100
        )}

      </div>

      <div class="section">

        <h3>Grain</h3>

        ${control(
          'grain',
          'Amount',
          0,
          100
        )}

        ${control(
          'grainSize',
          'Size',
          0,
          100
        )}

        ${control(
          'grainRough',
          'Roughness',
          0,
          100
        )}

      </div>
    `;
  }

  /* =======================================================
     DETAIL
     ======================================================= */

  if (active === 'detail') {

    h = `
      <div class="section">

        <h3>Detail</h3>

        ${control(
          'sharp',
          'Sharpening',
          0,
          100
        )}

        ${control(
          'radius',
          'Radius',
          0.5,
          3,
          0.1
        )}

        ${control(
          'noise',
          'Noise Reduction',
          0,
          100
        )}

        ${control(
          'colorNoise',
          'Color Noise',
          0,
          100
        )}

      </div>

      <p class="note">
        Preview processing is optimized
        for mobile performance.
      </p>
    `;
  }

  /* =======================================================
     CROP
     ======================================================= */

  if (active === 'crop') {

    h = `
      <div class="section">

        <h3>Crop & Geometry</h3>

        <div class="cropbox">
          Centered crop preview
        </div>

        <select
          class="select"
          id="ratio"
        >

          <option value="original">
            Original
          </option>

          <option value="1:1">
            1 : 1
          </option>

          <option value="4:5">
            4 : 5
          </option>

          <option value="3:4">
            3 : 4
          </option>

          <option value="4:3">
            4 : 3
          </option>

          <option value="16:9">
            16 : 9
          </option>

          <option value="9:16">
            9 : 16
          </option>

          <option value="2:3">
            2 : 3
          </option>

        </select>

        ${control(
          'straighten',
          'Straighten',
          -10,
          10,
          0.1
        )}

        <div class="grid2">

          <button
            class="btn"
            id="rl"
            type="button"
          >
            Rotate Left
          </button>

          <button
            class="btn"
            id="rr"
            type="button"
          >
            Rotate Right
          </button>

          <button
            class="btn"
            id="fx"
            type="button"
          >
            Flip Horizontal
          </button>

          <button
            class="btn"
            id="fy"
            type="button"
          >
            Flip Vertical
          </button>

        </div>

      </div>
    `;
  }

  /* =======================================================
     PRESETS
     ======================================================= */

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

            <button
              class="preset"
              data-preset="${x[0]}"
              type="button"
            >

              <b>${x[1]}</b>

              <small>${x[2]}</small>

            </button>

          `).join('')}

        </div>

      </div>

      ${control(
        'presetAmount',
        'Preset Amount',
        0,
        100
      )}
    `;
  }

  /* =======================================================
     PROFILES
     ======================================================= */

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
              class="btn ${
                S.profile === x[0]
                  ? 'active'
                  : ''
              }"
              data-profile="${x[0]}"
              type="button"
            >
              ${x[1]}
            </button>

          `).join('')}

        </div>

      </div>

      <p class="note">
        Profiles change the rendering character
        without permanently changing the base image.
      </p>
    `;
  }

  /* =======================================================
     MASK
     ======================================================= */

  if (active === 'mask') {

    h = `
      <div class="section">

        <h3>Local Mask</h3>

        <div class="grid3">

          <button
            class="btn mask ${
              S.maskType === 'radial'
                ? 'active'
                : ''
            }"
            data-type="radial"
            type="button"
          >
            Radial
          </button>

          <button
            class="btn mask ${
              S.maskType === 'linear'
                ? 'active'
                : ''
            }"
            data-type="linear"
            type="button"
          >
            Linear
          </button>

          <button
            class="btn mask ${
              S.maskType === 'brush'
                ? 'active'
                : ''
            }"
            data-type="brush"
            type="button"
          >
            Brush
          </button>

        </div>

        ${control(
          'maskAmount',
          'Mask Amount',
          0,
          100
        )}

        ${control(
          'maskExposure',
          'Local Exposure',
          -100,
          100
        )}

        ${control(
          'maskContrast',
          'Local Contrast',
          -100,
          100
        )}

        ${control(
          'maskSaturation',
          'Local Saturation',
          -100,
          100
        )}

        <button
          class="btn"
          id="maskClear"
          style="width:100%"
          type="button"
        >
          Clear Mask
        </button>

      </div>

      <p class="note">
        Radial and linear masks are browser-side masks.
        AI subject and sky detection is not faked.
      </p>
    `;
  }

  /* =======================================================
     RETOUCH
     ======================================================= */

  if (active === 'retouch') {

    h = `
      <div class="section">

        <h3>Spot Blur Retouch</h3>

        ${control(
          'retouchSize',
          'Brush Size',
          5,
          100
        )}

        <button
          class="btn"
          id="retouchClear"
          style="width:100%"
          type="button"
        >
          Clear Retouch
        </button>

      </div>

      <p class="note">
        Paint over an unwanted area
        to blur it locally.
      </p>
    `;
  }

  /* =======================================================
     BLUR
     ======================================================= */

  if (active === 'blur') {

    h = `
      <div class="section">

        <h3>Lens-style Blur</h3>

        ${control(
          'blur',
          'Blur Amount',
          0,
          100
        )}

        ${control(
          'blurX',
          'Focus X',
          0,
          100
        )}

        ${control(
          'blurY',
          'Focus Y',
          0,
          100
        )}

      </div>
    `;
  }

  /* =======================================================
     OPTICS
     ======================================================= */

  if (active === 'optics') {

    h = `
      <div class="section">

        <h3>Optics</h3>

        ${control(
          'lensVignette',
          'Lens Vignette',
          -100,
          100
        )}

        ${control(
          'defringe',
          'Defringe',
          0,
          100
        )}

      </div>

      <p class="note">
        Browser-safe optical compensation.
      </p>
    `;
  }

  /* =======================================================
     TEXT TOOL
     ======================================================= */

  if (active === 'text') {

    h = `
      <div class="section">

        <h3>Text Overlay</h3>

        <textarea
          id="textInput"
          class="textarea"
          rows="3"
          placeholder="Enter text"
        ></textarea>

        <div
          class="colorhead"
          style="margin-top:10px"
        >
          Font
        </div>

        <select
          class="select"
          id="textFont"
        >
          <option value="Arial">
            Arial
          </option>

          <option value="Helvetica">
            Helvetica
          </option>

          <option value="Georgia">
            Georgia
          </option>

          <option value="Times New Roman">
            Times New Roman
          </option>

          <option value="Courier New">
            Courier New
          </option>

          <option value="Verdana">
            Verdana
          </option>

          <option value="Trebuchet MS">
            Trebuchet MS
          </option>
        </select>

        ${control(
          'textSize',
          'Font Size',
          12,
          160
        )}

        ${control(
          'textOpacity',
          'Opacity',
          0,
          100
        )}

        <div class="grid2">

          <button
            class="btn"
            id="textBold"
            type="button"
          >
            Bold
          </button>

          <button
            class="btn"
            id="textItalic"
            type="button"
          >
            Italic
          </button>

        </div>

        <div class="grid3">

          <button
            class="btn textAlign"
            data-align="left"
            type="button"
          >
            Left
          </button>

          <button
            class="btn textAlign"
            data-align="center"
            type="button"
          >
            Center
          </button>

          <button
            class="btn textAlign"
            data-align="right"
            type="button"
          >
            Right
          </button>

        </div>

        <div
          class="colorrow"
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            margin-top:12px;
          "
        >

          <span>Text Color</span>

          ${colorInput(
            'textColor',
            '#ffffff'
          )}

        </div>

        <div
          class="colorrow"
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            margin-top:10px;
          "
        >

          <span>Stroke Color</span>

          ${colorInput(
            'textStroke',
            '#000000'
          )}

        </div>

        <div class="grid2">

          <button
            class="btn"
            id="addText"
            type="button"
          >
            Add Text
          </button>

          <button
            class="btn danger"
            id="deleteText"
            type="button"
          >
            Delete
          </button>

        </div>

        <button
          class="btn"
          id="clearTexts"
          style="width:100%"
          type="button"
        >
          Clear All Text
        </button>

        <p class="note">
          After adding text, drag it directly
          on the photo to reposition it.
        </p>

      </div>
    `;
  }

  /* =======================================================
     DRAW TOOL
     ======================================================= */

  if (active === 'draw') {

    h = `
      <div class="section">

        <h3>Draw</h3>

        ${control(
          'drawSize',
          'Brush Size',
          1,
          80
        )}

        ${control(
          'drawOpacity',
          'Opacity',
          1,
          100
        )}

        <div
          class="colorrow"
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            margin-top:10px;
          "
        >

          <span>Brush Color</span>

          ${colorInput(
            'drawColor',
            '#ffffff'
          )}

        </div>

        <div class="grid2">

          <button
            class="btn"
            id="clearDraw"
            type="button"
          >
            Clear Drawing
          </button>

          <button
            class="btn danger"
            id="removeDraw"
            type="button"
          >
            Remove Last
          </button>

        </div>

        <p class="note">
          Draw directly on the photo.
          Undo works for every drawing step.
        </p>

      </div>
    `;
  }

  /* =======================================================
     COLOR SELECT
     ======================================================= */

  if (active === 'selective') {

    h = `
      <div class="section">

        <h3>Color Select</h3>

        <button
          class="btn"
          id="pickColor"
          style="width:100%"
          type="button"
        >
          Click a Color on Photo
        </button>

        <div
          id="selectedColorPreview"
          style="
            height:46px;
            margin-top:10px;
            border-radius:8px;
            border:1px solid rgba(255,255,255,.15);
            background:rgb(
              ${S.selectiveR},
              ${S.selectiveG},
              ${S.selectiveB}
            );
          "
        ></div>

        ${control(
          'selectiveRange',
          'Color Range',
          1,
          100
        )}

        ${control(
          'selectiveHue',
          'Hue',
          -100,
          100
        )}

        ${control(
          'selectiveSat',
          'Saturation',
          -100,
          100
        )}

        ${control(
          'selectiveLight',
          'Lightness',
          -100,
          100
        )}

        <button
          class="btn"
          id="clearSelective"
          style="width:100%"
          type="button"
        >
          Clear Color Selection
        </button>

        <p class="note">
          Select a color from the image and
          adjust only similar colors.
        </p>

      </div>
    `;
  }

  /* =======================================================
     LAYERS
     ======================================================= */

  if (active === 'layers') {

    h = `
      <div class="section">

        <h3>Layers</h3>

        <div id="layersList">

          ${
            buildLayersList()
          }

        </div>

        <button
          class="btn danger"
          id="clearLayers"
          style="width:100%;margin-top:12px"
          type="button"
        >
          Clear All Layers
        </button>

        <p class="note">
          Text and drawing overlays are managed
          separately from the photo adjustments.
        </p>

      </div>
    `;
  }

  /* =======================================================
     EXPORT
     ======================================================= */

  if (active === 'export') {

    h = `
      <div class="section">

        <h3>Export</h3>

        <div class="export">

          <div class="grid2">

            <div>

              <div class="colorhead">
                Format
              </div>

              <select
                class="select"
                id="format"
              >

                <option value="image/jpeg">
                  JPG
                </option>

                <option value="image/png">
                  PNG
                </option>

                <option value="image/webp">
                  WebP
                </option>

              </select>

            </div>

            <div>

              <div class="colorhead">
                Quality
              </div>

              <select
                class="select"
                id="quality"
              >

                <option value=".7">
                  Standard
                </option>

                <option
                  value=".85"
                  selected
                >
                  High
                </option>

                <option value=".95">
                  Maximum
                </option>

              </select>

            </div>

          </div>

          <div
            class="colorhead"
            style="margin-top:10px"
          >
            Maximum long edge
          </div>

          <select
            class="select"
            id="size"
          >

            <option value="1600">
              1600 px
            </option>

            <option
              value="2400"
              selected
            >
              2400 px
            </option>

            <option value="3200">
              3200 px
            </option>

            <option value="0">
              Original working size
            </option>

          </select>

          <button
            class="download"
            id="download"
            type="button"
          >
            Download Edited Photo
          </button>

        </div>

      </div>

      <button
        class="btn danger"
        id="resetAll"
        style="width:100%"
        type="button"
      >
        Reset All Edits
      </button>
    `;
  }

  p.innerHTML = h;

  bind();

  panelActions();
}

/* =========================================================
   LAYER LIST
   ========================================================= */

function buildLayersList() {

  if (
    !textLayers.length &&
    !drawLayers.length
  ) {

    return `
      <div class="note">
        No overlay layers yet.
      </div>
    `;
  }

  let html = '';

  textLayers.forEach((layer, index) => {

    html += `
      <button
        type="button"
        class="btn ${
          selectedTextId === layer.id
            ? 'active'
            : ''
        }"
        data-layer-text="${layer.id}"
        style="
          width:100%;
          text-align:left;
          margin-bottom:6px;
        "
      >
        Text ${index + 1}:
        ${escapeHtml(
          String(layer.text).slice(0, 30)
        )}
      </button>
    `;
  });

  drawLayers.forEach((layer, index) => {

    html += `
      <div
        class="btn"
        style="
          width:100%;
          text-align:left;
          margin-bottom:6px;
          opacity:.8;
        "
      >
        Drawing ${index + 1}
      </div>
    `;
  });

  return html;
}

/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =========================================================
   PANEL ACTIONS
   ========================================================= */

function panelActions() {

  /* -------------------------------------------------------
     AUTO
     ------------------------------------------------------- */

  $('auto')?.addEventListener(
    'click',
    () => {

      push();

      S.exposure = 0;
      S.contrast = 8;
      S.highlights = -14;
      S.shadows = 16;
      S.whites = 4;
      S.blacks = -5;

      render();
      panel();
    }
  );

  /* -------------------------------------------------------
     CROP RATIO
     ------------------------------------------------------- */

  $('ratio')?.addEventListener(
    'change',
    e => {

      push();

      S.ratio = e.target.value;

      schedule();
    }
  );

  /* -------------------------------------------------------
     ROTATE LEFT
     ------------------------------------------------------- */

  $('rl')?.addEventListener(
    'click',
    () => {

      push();

      S.rotate =
        (S.rotate + 270) % 360;

      panX = 0;
      panY = 0;

      schedule();
    }
  );

  /* -------------------------------------------------------
     ROTATE RIGHT
     ------------------------------------------------------- */

  $('rr')?.addEventListener(
    'click',
    () => {

      push();

      S.rotate =
        (S.rotate + 90) % 360;

      panX = 0;
      panY = 0;

      schedule();
    }
  );

  /* -------------------------------------------------------
     FLIP X
     ------------------------------------------------------- */

  $('fx')?.addEventListener(
    'click',
    () => {

      push();

      S.flipX = !S.flipX;

      schedule();
    }
  );

  /* -------------------------------------------------------
     FLIP Y
     ------------------------------------------------------- */

  $('fy')?.addEventListener(
    'click',
    () => {

      push();

      S.flipY = !S.flipY;

      schedule();
    }
  );

  /* -------------------------------------------------------
     PRESETS
     ------------------------------------------------------- */

  document
    .querySelectorAll('[data-preset]')
    .forEach(button => {

      button.onclick = () => {

        preset(
          button.dataset.preset
        );

      };
    });

  /* -------------------------------------------------------
     PROFILES
     ------------------------------------------------------- */

  document
    .querySelectorAll('[data-profile]')
    .forEach(button => {

      button.onclick = () => {

        push();

        S.profile =
          button.dataset.profile;

        render();
        panel();
      };

    });

  /* -------------------------------------------------------
     MASK
     ------------------------------------------------------- */

  document
    .querySelectorAll('.mask')
    .forEach(button => {

      button.onclick = () => {

        push();

        S.maskType =
          button.dataset.type;

        document
          .querySelectorAll('.mask')
          .forEach(x => {
            x.classList.remove(
              'active'
            );
          });

        button.classList.add(
          'active'
        );

        schedule();
      };

    });

  $('maskClear')?.addEventListener(
    'click',
    () => {

      push();

      S.maskAmount = 0;
      S.maskExposure = 0;
      S.maskContrast = 0;
      S.maskSaturation = 0;

      schedule();
    }
  );

  /* -------------------------------------------------------
     RETOUCH
     ------------------------------------------------------- */

  $('retouchClear')?.addEventListener(
    'click',
    () => {

      push();

      retouch = [];

      render();
    }
  );

  /* -------------------------------------------------------
     TEXT
     ------------------------------------------------------- */

  setupTextActions();

  /* -------------------------------------------------------
     DRAW
     ------------------------------------------------------- */

  setupDrawActions();

  /* -------------------------------------------------------
     COLOR SELECT
     ------------------------------------------------------- */

  setupSelectiveActions();

  /* -------------------------------------------------------
     LAYERS
     ------------------------------------------------------- */

  setupLayerActions();

  /* -------------------------------------------------------
     EXPORT
     ------------------------------------------------------- */

  $('download')?.addEventListener(
    'click',
    exportImage
  );

  $('resetAll')?.addEventListener(
    'click',
    resetAll
  );
}

/* =========================================================
   TEXT ACTION SETUP
   ========================================================= */

function setupTextActions() {

  const add = $('addText');

  if (!add) return;

  add.addEventListener(
    'click',
    () => {

      const input =
        $('textInput');

      const text =
        input?.value.trim();

      if (!text) {

        alert(
          'Please enter some text.'
        );

        return;
      }

      push();

      const layer = {

        id:
          'text_' +
          Date.now() +
          '_' +
          Math.random()
            .toString(36)
            .slice(2),

        text,

        x: 0.5,
        y: 0.5,

        font:
          $('textFont')?.value
          || 'Arial',

        size:
          Number(S.textSize)
          || 48,

        opacity:
          Number(S.textOpacity)
          || 100,

        color:
          $('textColor')?.value
          || '#ffffff',

        stroke:
          $('textStroke')?.value
          || '#000000',

        bold: false,

        italic: false,

        align: 'center'
      };

      textLayers.push(layer);

      selectedTextId =
        layer.id;

      render();

      panel();

      const newInput =
        $('textInput');

      if (newInput) {
        newInput.value = '';
      }
    }
  );

  $('deleteText')?.addEventListener(
    'click',
    () => {

      if (!selectedTextId) return;

      push();

      textLayers =
        textLayers.filter(
          layer =>
            layer.id !==
            selectedTextId
        );

      selectedTextId = null;

      render();
      panel();
    }
  );

  $('clearTexts')?.addEventListener(
    'click',
    () => {

      if (!textLayers.length) {
        return;
      }

      push();

      textLayers = [];

      selectedTextId = null;

      render();
      panel();
    }
  );

  $('textBold')?.addEventListener(
    'click',
    () => {

      if (!selectedTextId) {

        alert(
          'Select a text layer first.'
        );

        return;
      }

      push();

      const layer =
        getSelectedText();

      if (layer) {
        layer.bold =
          !layer.bold;
      }

      render();
    }
  );

  $('textItalic')?.addEventListener(
    'click',
    () => {

      if (!selectedTextId) {

        alert(
          'Select a text layer first.'
        );

        return;
      }

      push();

      const layer =
        getSelectedText();

      if (layer) {
        layer.italic =
          !layer.italic;
      }

      render();
    }
  );

  document
    .querySelectorAll('.textAlign')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          if (!selectedTextId) {

            alert(
              'Select a text layer first.'
            );

            return;
          }

          push();

          const layer =
            getSelectedText();

          if (layer) {

            layer.align =
              button.dataset.align;
          }

          render();
        }
      );

    });
}

/* =========================================================
   SELECTED TEXT
   ========================================================= */

function getSelectedText() {

  return textLayers.find(
    layer =>
      layer.id ===
      selectedTextId
  ) || null;
}

/* =========================================================
   DRAW ACTION SETUP
   ========================================================= */

function setupDrawActions() {

  $('clearDraw')?.addEventListener(
    'click',
    () => {

      if (!drawLayers.length) {
        return;
      }

      push();

      drawLayers = [];

      render();
      panel();
    }
  );

  $('removeDraw')?.addEventListener(
    'click',
    () => {

      if (!drawLayers.length) {
        return;
      }

      push();

      drawLayers.pop();

      render();
      panel();
    }
  );
}

/* =========================================================
   SELECTIVE COLOR SETUP
   ========================================================= */

function setupSelectiveActions() {

  $('pickColor')?.addEventListener(
    'click',
    () => {

      $('status').textContent =
        'Click a color on the photo.';

      C.classList.add(
        'color-picking'
      );

      active = 'selective';
    }
  );

  $('clearSelective')?.addEventListener(
    'click',
    () => {

      push();

      S.selectiveR = 0;
      S.selectiveG = 0;
      S.selectiveB = 0;

      S.selectiveRange = 35;
      S.selectiveHue = 0;
      S.selectiveSat = 0;
      S.selectiveLight = 0;

      render();
      panel();
    }
  );
}

/* =========================================================
   LAYER ACTION SETUP
   ========================================================= */

function setupLayerActions() {

  document
    .querySelectorAll('[data-layer-text]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          selectedTextId =
            button.dataset.layerText;

          const layer =
            getSelectedText();

          if (!layer) return;

          render();
          panel();

          $('status').textContent =
            'Text layer selected.';
        }
      );

    });

  $('clearLayers')?.addEventListener(
    'click',
    () => {

      if (
        !textLayers.length &&
        !drawLayers.length
      ) {
        return;
      }

      push();

      textLayers = [];
      drawLayers = [];

      selectedTextId = null;

      render();
      panel();
    }
  );
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

  Object.assign(
    S,
    values[name] || {}
  );

  S.preset = name;

  render();
  panel();
}

/* =========================================================
   IMAGE LOADING
   ========================================================= */

function handleImageFile(file) {

  if (!file) return;

  if (
    !file.type ||
    !file.type.startsWith('image/')
  ) {

    alert(
      'Please select a valid image file.'
    );

    return;
  }

  $('status').textContent =
    'Opening photo...';

  const url =
    URL.createObjectURL(file);

  const image =
    new Image();

  image.onload = () => {

    URL.revokeObjectURL(url);

    img = image;

    fileName = file.name;

    const max = 1400;

    const scale =
      Math.min(
        1,
        max /
          Math.max(
            image.naturalWidth,
            image.naturalHeight
          )
      );

    src.width =
      Math.max(
        1,
        Math.round(
          image.naturalWidth * scale
        )
      );

    src.height =
      Math.max(
        1,
        Math.round(
          image.naturalHeight * scale
        )
      );

    sx.clearRect(
      0,
      0,
      src.width,
      src.height
    );

    sx.drawImage(
      image,
      0,
      0,
      src.width,
      src.height
    );

    $('name').textContent =
      file.name;

    $('meta').textContent =
      `${image.naturalWidth} × ${image.naturalHeight}px`;

    $('empty').style.display =
      'none';

    C.style.display =
      'block';

    O.style.display =
      'block';

    showBefore = false;

    $('badge').style.display =
      'none';

    retouch = [];

    textLayers = [];

    drawLayers = [];

    selectedTextId = null;

    resetState(false);

    zoom = 1;
    panX = 0;
    panY = 0;

    render();

    $('status').textContent =
      'Photo ready.';
  };

  image.onerror = () => {

    URL.revokeObjectURL(url);

    $('status').textContent =
      'Could not open this image.';
  };

  image.src = url;
}
    /* =======================================================
     RENDER - CONTINUED
  ======================================================= */

  const sourceWidth = src.width;
  const sourceHeight = src.height;

  const rotated =
    S.rotate === 90 ||
    S.rotate === 270;

  let workWidth =
    rotated
      ? sourceHeight
      : sourceWidth;

  let workHeight =
    rotated
      ? sourceWidth
      : sourceHeight;

  /*
    Keep the working canvas inside a reasonable size.
    This prevents very large mobile images from causing
    unnecessary memory pressure.
  */

  const maxWorking = 1800;

  const workingScale =
    Math.min(
      1,
      maxWorking /
        Math.max(
          workWidth,
          workHeight
        )
    );

  workWidth =
    Math.max(
      1,
      Math.round(
        workWidth * workingScale
      )
    );

  workHeight =
    Math.max(
      1,
      Math.round(
        workHeight * workingScale
      )
    );

  C.width = workWidth;
  C.height = workHeight;

  O.width = workWidth;
  O.height = workHeight;

  /*
    Draw the original image with rotation
    and flipping.
  */

  ctx.clearRect(
    0,
    0,
    workWidth,
    workHeight
  );

  ctx.save();

  ctx.translate(
    workWidth / 2,
    workHeight / 2
  );

  ctx.rotate(angle);

  ctx.scale(
    S.flipX ? -1 : 1,
    S.flipY ? -1 : 1
  );

  const drawWidth =
    rotated
      ? workHeight
      : workWidth;

  const drawHeight =
    rotated
      ? workWidth
      : workHeight;

  ctx.drawImage(
    src,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );

  ctx.restore();

  /*
    Pixel adjustments.
  */

  let imageData =
    ctx.getImageData(
      0,
      0,
      workWidth,
      workHeight
    );

  imageData =
    applyPixel(
      imageData,
      workWidth,
      workHeight
    );

  ctx.putImageData(
    imageData,
    0,
    0
  );

  /*
    Sharpening.
  */

  if (S.sharp > 0) {

    sharpen(
      ctx,
      workWidth,
      workHeight,
      S.sharp
    );
  }

  /*
    Noise reduction.
  */

  if (S.noise > 0) {

    noiseReduce(
      ctx,
      workWidth,
      workHeight,
      S.noise
    );
  }

  /*
    Color noise reduction.
  */

  if (S.colorNoise > 0) {

    colorNoiseReduce(
      ctx,
      workWidth,
      workHeight,
      S.colorNoise
    );
  }

  /*
    Lens-style blur.
  */

  if (S.blur > 0) {

    blurFocus(
      ctx,
      workWidth,
      workHeight
    );
  }

  /*
    Grain is intentionally applied after
    most image processing.
  */

  if (S.grain > 0) {

    grain(
      ctx,
      workWidth,
      workHeight,
      S.grain
    );
  }

  /*
    Local retouch.
  */

  if (retouch.length) {

    retouchDraw(
      ctx,
      workWidth,
      workHeight
    );
  }

  /*
    Overlay layers.
  */

  drawOverlayLayers();

  /*
    Apply zoom and pan only to the displayed
    canvas. The actual image data remains clean.
  */

  updateCanvasTransform();

  showOverlay();

  rendering = false;

  $('status').textContent =
    'Ready';
}


/* =========================================================
   NOISE REDUCTION
========================================================= */

function noiseReduce(
  canvasContext,
  w,
  h,
  amount
) {

  if (amount <= 0) return;

  const imageData =
    canvasContext.getImageData(
      0,
      0,
      w,
      h
    );

  const source =
    imageData.data;

  const output =
    new Uint8ClampedArray(
      source
    );

  const strength =
    clamp(
      amount / 100,
      0,
      1
    );

  /*
    A small neighborhood filter.
    This is intentionally lightweight so it
    remains usable on mobile devices.
  */

  const radius =
    strength > .7
      ? 2
      : 1;

  for (
    let y = radius;
    y < h - radius;
    y++
  ) {

    for (
      let x = radius;
      x < w - radius;
      x++
    ) {

      const index =
        (y * w + x) * 4;

      for (
        let channel = 0;
        channel < 3;
        channel++
      ) {

        let total = 0;
        let count = 0;

        for (
          let yy = -radius;
          yy <= radius;
          yy++
        ) {

          for (
            let xx = -radius;
            xx <= radius;
            xx++
          ) {

            const ni =
              (
                (y + yy) * w +
                (x + xx)
              ) * 4;

            total +=
              source[
                ni + channel
              ];

            count++;
          }
        }

        const average =
          total / count;

        output[
          index + channel
        ] =
          source[
            index + channel
          ] *
          (1 - strength) +
          average *
          strength;
      }
    }
  }

  imageData.data.set(
    output
  );

  canvasContext.putImageData(
    imageData,
    0,
    0
  );
}


/* =========================================================
   COLOR NOISE REDUCTION
========================================================= */

function colorNoiseReduce(
  canvasContext,
  w,
  h,
  amount
) {

  if (amount <= 0) return;

  const imageData =
    canvasContext.getImageData(
      0,
      0,
      w,
      h
    );

  const d =
    imageData.data;

  const strength =
    clamp(
      amount / 100,
      0,
      1
    );

  for (
    let i = 0;
    i < d.length;
    i += 4
  ) {

    const gray =
      (
        d[i] +
        d[i + 1] +
        d[i + 2]
      ) / 3;

    d[i] =
      d[i] *
      (1 - strength) +
      gray *
      strength;

    d[i + 1] =
      d[i + 1] *
      (1 - strength) +
      gray *
      strength;

    d[i + 2] =
      d[i + 2] *
      (1 - strength) +
      gray *
      strength;
  }

  canvasContext.putImageData(
    imageData,
    0,
    0
  );
}


/* =========================================================
   FOCUS BLUR
========================================================= */

function blurFocus(
  canvasContext,
  w,
  h
) {

  const amount =
    clamp(
      S.blur,
      0,
      100
    );

  if (amount <= 0) return;

  /*
    Correctly create a temporary canvas.
    The original version incorrectly attempted to
    call canvas.getImageData().
  */

  const temporary =
    document.createElement(
      'canvas'
    );

  temporary.width = w;
  temporary.height = h;

  const temporaryContext =
    temporary.getContext(
      '2d'
    );

  temporaryContext.clearRect(
    0,
    0,
    w,
    h
  );

  temporaryContext.filter =
    `blur(${Math.max(
      1,
      amount / 10
    )}px)`;

  temporaryContext.drawImage(
    canvasContext.canvas,
    0,
    0
  );

  temporaryContext.filter =
    'none';

  /*
    Focus point.
  */

  const focusX =
    clamp(
      S.blurX / 100,
      0,
      1
    ) * w;

  const focusY =
    clamp(
      S.blurY / 100,
      0,
      1
    ) * h;

  const radius =
    Math.min(
      w,
      h
    ) * .28;

  /*
    Draw the blurred image using a radial
    transparency mask.
  */

  canvasContext.save();

  const gradient =
    canvasContext.createRadialGradient(
      focusX,
      focusY,
      radius * .25,
      focusX,
      focusY,
      radius * 2
    );

  gradient.addColorStop(
    0,
    'rgba(0,0,0,0)'
  );

  gradient.addColorStop(
    .45,
    'rgba(0,0,0,.18)'
  );

  gradient.addColorStop(
    1,
    'rgba(0,0,0,1)'
  );

  /*
    First draw the original image.
  */

  canvasContext.globalCompositeOperation =
    'source-over';

  /*
    Create a mask canvas.
  */

  const maskCanvas =
    document.createElement(
      'canvas'
    );

  maskCanvas.width = w;
  maskCanvas.height = h;

  const maskContext =
    maskCanvas.getContext(
      '2d'
    );

  maskContext.fillStyle =
    'black';

  maskContext.fillRect(
    0,
    0,
    w,
    h
  );

  const maskGradient =
    maskContext.createRadialGradient(
      focusX,
      focusY,
      radius * .2,
      focusX,
      focusY,
      radius * 2
    );

  maskGradient.addColorStop(
    0,
    'rgba(255,255,255,0)'
  );

  maskGradient.addColorStop(
    .45,
    'rgba(255,255,255,.25)'
  );

  maskGradient.addColorStop(
    1,
    'rgba(255,255,255,1)'
  );

  maskContext.fillStyle =
    maskGradient;

  maskContext.fillRect(
    0,
    0,
    w,
    h
  );

  /*
    Use the mask to blend blurred pixels.
  */

  const blurredData =
    temporaryContext.getImageData(
      0,
      0,
      w,
      h
    );

  const originalData =
    canvasContext.getImageData(
      0,
      0,
      w,
      h
    );

  const maskData =
    maskContext.getImageData(
      0,
      0,
      w,
      h
    );

  const result =
    originalData.data;

  for (
    let i = 0;
    i < result.length;
    i += 4
  ) {

    const alpha =
      maskData.data[i] / 255;

    result[i] =
      result[i] *
        (1 - alpha) +
      blurredData.data[i] *
        alpha;

    result[i + 1] =
      result[i + 1] *
        (1 - alpha) +
      blurredData.data[i + 1] *
        alpha;

    result[i + 2] =
      result[i + 2] *
        (1 - alpha) +
      blurredData.data[i + 2] *
        alpha;
  }

  canvasContext.putImageData(
    originalData,
    0,
    0
  );

  canvasContext.restore();
}


/* =========================================================
   TEXT RENDERING
========================================================= */

function drawTextLayers() {

  if (!textLayers.length) {
    return;
  }

  ox.save();

  ox.textBaseline =
    'middle';

  textLayers.forEach(layer => {

    const x =
      layer.x *
      C.width;

    const y =
      layer.y *
      C.height;

    const size =
      Number(layer.size) ||
      48;

    const fontParts = [];

    if (layer.italic) {
      fontParts.push(
        'italic'
      );
    }

    if (layer.bold) {
      fontParts.push(
        'bold'
      );
    }

    fontParts.push(
      `${size}px`
    );

    fontParts.push(
      layer.font ||
      'Arial'
    );

    ox.font =
      fontParts.join(' ');

    ox.textAlign =
      layer.align ||
      'center';

    ox.globalAlpha =
      clamp(
        Number(layer.opacity) /
        100,
        0,
        1
      );

    /*
      Stroke first.
    */

    if (layer.stroke) {

      ox.lineWidth =
        Math.max(
          1,
          size * .08
        );

      ox.lineJoin =
        'round';

      ox.strokeStyle =
        layer.stroke;

      ox.strokeText(
        layer.text,
        x,
        y
      );
    }

    /*
      Fill.
    */

    ox.fillStyle =
      layer.color ||
      '#ffffff';

    ox.fillText(
      layer.text,
      x,
      y
    );

    /*
      Selection box.
    */

    if (
      layer.id ===
      selectedTextId
    ) {

      const metrics =
        ox.measureText(
          layer.text
        );

      let width =
        metrics.width;

      if (
        layer.align ===
        'left'
      ) {

        ox.strokeStyle =
          'rgba(255,255,255,.65)';

        ox.lineWidth = 1;

        ox.setLineDash([
          6,
          4
        ]);

        ox.strokeRect(
          x - 6,
          y - size * .65,
          width + 12,
          size * 1.3
        );

        ox.setLineDash([]);

      } else if (
        layer.align ===
        'right'
      ) {

        ox.strokeStyle =
          'rgba(255,255,255,.65)';

        ox.lineWidth = 1;

        ox.setLineDash([
          6,
          4
        ]);

        ox.strokeRect(
          x - width - 6,
          y - size * .65,
          width + 12,
          size * 1.3
        );

        ox.setLineDash([]);

      } else {

        ox.strokeStyle =
          'rgba(255,255,255,.65)';

        ox.lineWidth = 1;

        ox.setLineDash([
          6,
          4
        ]);

        ox.strokeRect(
          x - width / 2 - 6,
          y - size * .65,
          width + 12,
          size * 1.3
        );

        ox.setLineDash([]);
      }
    }
  });

  ox.globalAlpha = 1;

  ox.restore();
}


/* =========================================================
   DRAW LAYERS
========================================================= */

function drawDrawLayers() {

  if (!drawLayers.length) {
    return;
  }

  ox.save();

  ox.lineCap =
    'round';

  ox.lineJoin =
    'round';

  drawLayers.forEach(stroke => {

    if (
      !stroke.points ||
      stroke.points.length < 2
    ) {
      return;
    }

    ox.beginPath();

    stroke.points.forEach(
      (point, index) => {

        const x =
          point.x *
          C.width;

        const y =
          point.y *
          C.height;

        if (index === 0) {

          ox.moveTo(
            x,
            y
          );

        } else {

          ox.lineTo(
            x,
            y
          );
        }
      }
    );

    ox.strokeStyle =
      stroke.color ||
      '#ffffff';

    ox.lineWidth =
      Number(stroke.size) ||
      8;

    ox.globalAlpha =
      clamp(
        Number(stroke.opacity) /
        100,
        0,
        1
      );

    ox.stroke();
  });

  ox.globalAlpha = 1;

  ox.restore();
}


/* =========================================================
   OVERLAY LAYERS
========================================================= */

function drawOverlayLayers() {

  O.width = C.width;
  O.height = C.height;

  ox.clearRect(
    0,
    0,
    O.width,
    O.height
  );

  drawDrawLayers();

  drawTextLayers();
}


/* =========================================================
   CANVAS SIZE / DISPLAY
========================================================= */

function fitCanvasToViewer() {

  if (!C.width || !C.height) {
    return;
  }

  updateCanvasTransform();

  showOverlay();
}


/* =========================================================
   ZOOM
========================================================= */

function setZoom(value) {

  zoom =
    clamp(
      Number(value) || 1,
      .5,
      4
    );

  /*
    When returning to 100% or below,
    remove the pan offset so the photo
    returns to the normal position.
  */

  if (zoom <= 1) {

    panX = 0;
    panY = 0;
  }

  updateCanvasTransform();
}


/* =========================================================
   ZOOM BUTTONS
========================================================= */

$('zout')?.addEventListener(
  'click',
  () => {

    setZoom(
      zoom - .2
    );
  }
);

$('zin')?.addEventListener(
  'click',
  () => {

    setZoom(
      zoom + .2
    );
  }
);

$('fit')?.addEventListener(
  'click',
  () => {

    zoom = 1;
    panX = 0;
    panY = 0;

    updateCanvasTransform();
  }
);

$('full')?.addEventListener(
  'click',
  () => {

    const viewer =
      $('viewer') ||
      C.parentElement;

    if (
      document.fullscreenElement
    ) {

      document.exitFullscreen();

    } else if (
      viewer &&
      viewer.requestFullscreen
    ) {

      viewer.requestFullscreen();
    }
  }
);


/* =========================================================
   DOUBLE TAP / DOUBLE CLICK ZOOM
========================================================= */

let lastTapTime = 0;

C.addEventListener(
  'dblclick',
  event => {

    event.preventDefault();

    if (zoom > 1) {

      zoom = 1;
      panX = 0;
      panY = 0;

    } else {

      zoom = 2;
    }

    updateCanvasTransform();
  }
);


/* =========================================================
   TOUCH / POINTER GESTURES
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


/* =========================================================
   PAN / PINCH
========================================================= */

C.addEventListener(
  'pointerdown',
  event => {

    /*
      Color picker mode is handled separately.
    */

    if (
      C.classList.contains(
        'color-picking'
      )
    ) {

      pickColorFromCanvas(
        event
      );

      return;
    }

    /*
      Retouch mode.
    */

    if (
      active === 'retouch'
    ) {

      beginRetouch(
        event
      );

      return;
    }

    /*
      Draw mode.
    */

    if (
      active === 'draw'
    ) {

      beginDrawing(
        event
      );

      return;
    }

    /*
      Text mode.
    */

    if (
      active === 'text'
    ) {

      if (
        selectOrMoveText(
          event
        )
      ) {

        return;
      }
    }

    /*
      Normal image pan / pinch.
    */

    pointers.set(
      event.pointerId,
      event
    );

    try {
      C.setPointerCapture(
        event.pointerId
      );
    } catch (_) {}

    if (pointers.size === 1) {

      gesture = {
        type: 'pan',

        startX:
          event.clientX,

        startY:
          event.clientY,

        panX,
        panY
      };

    } else if (
      pointers.size === 2
    ) {

      const values =
        [...pointers.values()];

      const first =
        values[0];

      const second =
        values[1];

      gesture = {

        type: 'pinch',

        startDistance:
          distance(
            first,
            second
          ),

        startZoom:
          zoom,

        startMidpoint:
          midpoint(
            first,
            second
          ),

        startPanX:
          panX,

        startPanY:
          panY
      };
    }
  }
);


/* =========================================================
   POINTER MOVE
========================================================= */

C.addEventListener(
  'pointermove',
  event => {

    /*
      Draw mode.
    */

    if (
      active === 'draw' &&
      drawGesture
    ) {

      continueDrawing(
        event
      );

      return;
    }

    /*
      Retouch mode.
    */

    if (
      active === 'retouch' &&
      retouchGesture
    ) {

      continueRetouch(
        event
      );

      return;
    }

    /*
      Text drag.
    */

    if (
      active === 'text' &&
      textDrag
    ) {

      continueTextDrag(
        event
      );

      return;
    }

    /*
      Normal pan / pinch.
    */

    if (
      !pointers.has(
        event.pointerId
      )
    ) {
      return;
    }

    pointers.set(
      event.pointerId,
      event
    );

    if (!gesture) {
      return;
    }

    if (
      gesture.type === 'pan' &&
      pointers.size === 1
    ) {

      const dx =
        event.clientX -
        gesture.startX;

      const dy =
        event.clientY -
        gesture.startY;

      panX =
        gesture.panX + dx;

      panY =
        gesture.panY + dy;

      updateCanvasTransform();

    } else if (
      gesture.type === 'pinch' &&
      pointers.size >= 2
    ) {

      const values =
        [...pointers.values()];

      const first =
        values[0];

      const second =
        values[1];

      const currentDistance =
        distance(
          first,
          second
        );

      const scale =
        currentDistance /
        Math.max(
          1,
          gesture.startDistance
        );

      zoom =
        clamp(
          gesture.startZoom *
          scale,
          .5,
          4
        );

      const currentMid =
        midpoint(
          first,
          second
        );

      panX =
        gesture.startPanX +
        (
          currentMid.x -
          gesture.startMidpoint.x
        );

      panY =
        gesture.startPanY +
        (
          currentMid.y -
          gesture.startMidpoint.y
        );

      updateCanvasTransform();
    }
  }
);


/* =========================================================
   POINTER UP
========================================================= */

C.addEventListener(
  'pointerup',
  event => {

    if (
      drawGesture
    ) {

      finishDrawing(
        event
      );

      return;
    }

    if (
      retouchGesture
    ) {

      finishRetouch(
        event
      );

      return;
    }

    if (
      textDrag
    ) {

      finishTextDrag(
        event
      );

      return;
    }

    pointers.delete(
      event.pointerId
    );

    if (!pointers.size) {

      gesture = null;

    } else if (
      pointers.size === 1
    ) {

      const remaining =
        [...pointers.values()][0];

      gesture = {

        type: 'pan',

        startX:
          remaining.clientX,

        startY:
          remaining.clientY,

        panX,
        panY
      };
    }
  }
);


/* =========================================================
   POINTER CANCEL
========================================================= */

C.addEventListener(
  'pointercancel',
  event => {

    pointers.delete(
      event.pointerId
    );

    if (
      !pointers.size
    ) {

      gesture = null;
    }
  }
);
/* =========================================================
   RENDER + EXPORT
   PART 3
========================================================= */

function render() {

  if (!img || rendering) return;

  rendering = true;

  $('status').textContent = 'Rendering...';

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

  transformed.width = rotatedWidth;
  transformed.height = rotatedHeight;

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

  let cropWidth = rotatedWidth;
  let cropHeight = rotatedHeight;

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
    This keeps large photos smoother on mobile.
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

  /*
    BEFORE / ORIGINAL PREVIEW
  */

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

  /*
    MAIN IMAGE PROCESSING
  */

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

  /*
    NOISE REDUCTION
  */

  if (S.noise > 0) {

    applyBlur(
      ctx,
      width,
      height,
      S.noise
    );
  }

  /*
    COLOR NOISE REDUCTION
  */

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

  /*
    SHARPENING
  */

  if (S.sharp > 0) {

    sharpen(
      ctx,
      width,
      height,
      S.sharp
    );
  }

  /*
    GRAIN
  */

  if (S.grain > 0) {

    grain(
      ctx,
      width,
      height,
      S.grain
    );
  }

  /*
    LENS-STYLE BLUR
  */

  if (S.blur > 0) {

    applyBlur(
      ctx,
      width,
      height,
      S.blur
    );
  }

  /*
    RETOUCH
  */

  retouchDraw(
    ctx,
    width,
    height
  );

  /*
    OVERLAY
  */

  showOverlay();

  /*
    IMPORTANT:
    KEEP ZOOM + PAN
  */

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

  const sizeElement =
    $('size');

  const max =
    sizeElement
      ? Number(sizeElement.value) ||
        Math.max(
          src.width,
          src.height
        )
      : Math.max(
          src.width,
          src.height
        );

  /*
    Save current zoom and pan.
    Export must never permanently change them.
  */

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
      Math.round(
        C.width * scale
      )
    );

  output.height =
    Math.max(
      1,
      Math.round(
        C.height * scale
      )
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

  const formatElement =
    $('format');

  const qualityElement =
    $('quality');

  const type =
    formatElement
      ? formatElement.value
      : 'image/jpeg';

  const quality =
    qualityElement
      ? Number(qualityElement.value)
      : .85;

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

  /*
    Restore zoom and pan after export.
  */

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


/* =========================================================
   RESET
========================================================= */

$('reset').onclick = () => {

  push();

  resetState();
};


/* =========================================================
   UNDO
========================================================= */

$('undo').onclick = () => {

  if (!history.length) return;

  future.push(
    snap()
  );

  restore(
    history.pop()
  );
};


/* =========================================================
   REDO
========================================================= */

$('redo').onclick = () => {

  if (!future.length) return;

  history.push(
    snap()
  );

  restore(
    future.pop()
  );
};


/* =========================================================
   BEFORE / AFTER
========================================================= */

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
   ZOOM
   DO NOT REMOVE
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


/* Zoom Out */

$('zout').onclick = () => {

  setZoom(
    zoom - 0.2
  );
};


/* Zoom In */

$('zin').onclick = () => {

  setZoom(
    zoom + 0.2
  );
};


/* Fit */

$('fit').onclick = () => {

  zoom = 1;

  panX = 0;
  panY = 0;

  updateCanvasTransform();

  render();
};


/* Fullscreen */

$('full').onclick = () => {

  $('stage')
    .requestFullscreen?.();
};


/* =========================================================
   DOUBLE TAP ZOOM
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
   PINCH / PAN HELPERS
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
      (
        a.clientX +
        b.clientX
      ) / 2,

    y:
      (
        a.clientY +
        b.clientY
      ) / 2
  };
}


/* =========================================================
   POINTER PAN + PINCH
========================================================= */

$('stage').addEventListener(
  'pointerdown',
  e => {

    /*
      Retouch mode uses the canvas
      for painting instead of panning.
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

        startX:
          e.clientX,

        startY:
          e.clientY,

        startPanX:
          panX,

        startPanY:
          panY
      };

    } else if (
      pointers.size === 2
    ) {

      const values =
        [
          ...pointers.values()
        ];

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


/* =========================================================
   POINTER MOVE
========================================================= */

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

    if (
      !pointers.has(
        e.pointerId
      )
    ) {

      return;
    }

    pointers.set(
      e.pointerId,
      e
    );

    /*
      SINGLE POINTER = PAN
    */

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

    /*
      TWO POINTERS = PINCH ZOOM
    */

    if (
      pointers.size === 2 &&
      gesture &&
      gesture.type === 'pinch'
    ) {

      const values =
        [
          ...pointers.values()
        ];

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


/* =========================================================
   POINTER UP
========================================================= */

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


/* =========================================================
   POINTER CANCEL
========================================================= */

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
   PART 4
========================================================= */

let retouchDrawing = false;


/* =========================================================
   ADD RETOUCH POINT
========================================================= */

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

  /*
    Convert screen coordinates
    into canvas coordinates.
  */

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

  /*
    Keep the brush size proportional
    to the current canvas size.
  */

  const radius =
    Math.max(
      3,
      S.retouchSize *
      C.width /
      1000
    );

  retouch.push({

    x,
    y,
    r: radius

  });

  schedule();
}


/* =========================================================
   RETOUCH START
========================================================= */

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


/* =========================================================
   RETOUCH MOVE
========================================================= */

$('stage').addEventListener(
  'pointermove',
  e => {

    if (
      active !== 'retouch' ||
      !retouchDrawing
    ) {
      return;
    }

    addRetouchPoint(e);
  }
);


/* =========================================================
   RETOUCH END
========================================================= */

$('stage').addEventListener(
  'pointerup',
  () => {

    if (!retouchDrawing) {
      return;
    }

    /*
      Save the complete retouch stroke
      as one undo step.
    */

    push();

    retouchDrawing = false;
  }
);


/* =========================================================
   RETOUCH CANCEL
========================================================= */

$('stage').addEventListener(
  'pointercancel',
  () => {

    retouchDrawing = false;
  }
);


/* =========================================================
   DRAG & DROP IMAGE
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
   KEYBOARD SHORTCUTS
========================================================= */

document.addEventListener(
  'keydown',
  e => {

    /*
      Undo
      Ctrl + Z
    */

    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'z' &&
      !e.shiftKey
    ) {

      e.preventDefault();

      $('undo').click();

      return;
    }

    /*
      Redo
      Ctrl + Shift + Z
    */

    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      e.key.toLowerCase() === 'z'
    ) {

      e.preventDefault();

      $('redo').click();

      return;
    }

    /*
      Save / Export
      Ctrl + S
    */

    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 's'
    ) {

      e.preventDefault();

      exportImage();

      return;
    }

    /*
      Before / After
      Backslash
    */

    if (
      e.key === '\\' &&
      img
    ) {

      e.preventDefault();

      $('before').click();

      return;
    }

    /*
      Zoom In
      + / =
    */

    if (
      e.key === '+' ||
      e.key === '='
    ) {

      if (
        document.activeElement?.tagName ===
        'INPUT'
      ) {
        return;
      }

      setZoom(
        zoom + 0.2
      );

      return;
    }

    /*
      Zoom Out
      -
    */

    if (
      e.key === '-'
    ) {

      if (
        document.activeElement?.tagName ===
        'INPUT'
      ) {
        return;
      }

      setZoom(
        zoom - 0.2
      );

      return;
    }

    /*
      Fit
      0
    */

    if (
      e.key === '0'
    ) {

      if (
        document.activeElement?.tagName ===
        'INPUT'
      ) {
        return;
      }

      zoom = 1;

      panX = 0;
      panY = 0;

      updateCanvasTransform();

      render();
    }
  }
);


/* =========================================================
   WINDOW RESIZE
========================================================= */

let resizeTimer = null;

window.addEventListener(
  'resize',
  () => {

    clearTimeout(
      resizeTimer
    );

    resizeTimer =
      setTimeout(
        () => {

          if (!img) {
            return;
          }

          /*
            Recalculate preview dimensions
            without changing edit values.
          */

          render();

        },
        120
      );
  }
);


/* =========================================================
   FULLSCREEN CHANGE
========================================================= */

document.addEventListener(
  'fullscreenchange',
  () => {

    setTimeout(
      () => {

        if (img) {
          render();
        }

      },
      80
    );
  }
);


/* =========================================================
   INITIALIZE EDITOR
========================================================= */

document
  .querySelector(
    '#tabs button[data-tool="light"]'
  )
  ?.classList
  .add('active');


/*
  Build the initial panel.
*/

panel();


/*
  Initialize zoom display.
*/

updateCanvasTransform();


/*
  Initial status.
*/

$('status').textContent =
  'Ready';


/* =========================================================
   SAFETY CHECKS
========================================================= */

if (!$('zlabel')) {

  console.warn(
    'Toolora: Zoom label element #zlabel was not found.'
  );
}

if (!$('canvas')) {

  console.error(
    'Toolora: Main canvas element #canvas was not found.'
  );
}

if (!$('overlay')) {

  console.error(
    'Toolora: Overlay canvas element #overlay was not found.'
  );
}


/* =========================================================
   END OF PART 4
=========================================================*/

/* =========================================================
   TEXT / DRAW / COLOR SELECT / LAYERS
   PART 5
========================================================= */


/* ---------------------------------------------------------
   TEXT TOOL
--------------------------------------------------------- */

function createTextLayer() {

  const value = $('textValue')?.value?.trim();

  if (!value) {
    alert('Please enter some text.');
    return;
  }

  push();

  const layer = {
    id: Date.now() + Math.random(),
    text: value,
    x: 0.5,
    y: 0.5,
    font: $('textFont')?.value || 'Arial',
    size: Number($('textSize')?.value || 48),
    bold: $('textBold')?.checked || false,
    italic: $('textItalic')?.checked || false,
    align: $('textAlign')?.value || 'center',
    color: $('textColor')?.value || '#ffffff',
    stroke: $('textStroke')?.value || '#000000',
    opacity: Number($('textOpacity')?.value || 100)
  };

  S.textLayers.push(layer);

  S.selectedTextId = layer.id;

  render();
  panel();
}


/* Update selected text layer */

function updateSelectedText(property, value) {

  if (!S.selectedTextId) return;

  const layer = S.textLayers.find(
    item => item.id === S.selectedTextId
  );

  if (!layer) return;

  push();

  layer[property] = value;

  render();
  panel();
}


/* Delete selected text */

function deleteSelectedText() {

  if (!S.selectedTextId) return;

  push();

  S.textLayers = S.textLayers.filter(
    layer => layer.id !== S.selectedTextId
  );

  S.selectedTextId = null;

  render();
  panel();
}


/* Clear all text */

function clearTextLayers() {

  if (!S.textLayers.length) return;

  push();

  S.textLayers = [];

  S.selectedTextId = null;

  render();
  panel();
}


/* ---------------------------------------------------------
   DRAW TOOL
--------------------------------------------------------- */

function addDrawStroke(points, color, size, opacity) {

  if (!points || points.length < 2) return;

  S.drawLayers.push({
    id: Date.now() + Math.random(),
    points,
    color,
    size,
    opacity
  });
}


/* ---------------------------------------------------------
   COLOR SELECT TOOL
--------------------------------------------------------- */

function rgbToHsl(r, g, b) {

  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {

    const d = max - min;

    s = l > 0.5
      ? d / (2 - max - min)
      : d / (max + min);

    switch (max) {

      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;

      case g:
        h = (b - r) / d + 2;
        break;

      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100
  };
}


/* Pick a color directly from the edited image */

function pickSelectiveColor(clientX, clientY) {

  if (!img) return;

  const rect = C.getBoundingClientRect();

  const x =
    (clientX - rect.left) /
    rect.width *
    C.width;

  const y =
    (clientY - rect.top) /
    rect.height *
    C.height;

  if (
    x < 0 ||
    y < 0 ||
    x >= C.width ||
    y >= C.height
  ) {
    return;
  }

  const pixel = cx.getImageData(
    Math.floor(x),
    Math.floor(y),
    1,
    1
  ).data;

  S.selectiveR = pixel[0];
  S.selectiveG = pixel[1];
  S.selectiveB = pixel[2];

  const hsl = rgbToHsl(
    pixel[0],
    pixel[1],
    pixel[2]
  );

  S.selectiveHue = hsl.h;

  const badge = $('pickerBadge');

  if (badge) {

    badge.textContent =
      `Selected RGB ${pixel[0]}, ${pixel[1]}, ${pixel[2]}`;

    badge.classList.add('show');

    setTimeout(() => {
      badge.classList.remove('show');
    }, 1800);
  }

  panel();
}


/* Apply selective HSL adjustment */

function applySelectiveColor(data) {

  if (
    S.selectiveR === undefined ||
    S.selectiveG === undefined ||
    S.selectiveB === undefined
  ) {
    return;
  }

  const target = rgbToHsl(
    S.selectiveR,
    S.selectiveG,
    S.selectiveB
  );

  const range =
    Number(S.selectiveRange || 35);

  const hueShift =
    Number(S.selectiveHueAdjust || 0);

  const satShift =
    Number(S.selectiveSat || 0);

  const lightShift =
    Number(S.selectiveLight || 0);

  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    const hsl = rgbToHsl(
      data[i],
      data[i + 1],
      data[i + 2]
    );

    let hueDistance =
      Math.abs(hsl.h - target.h);

    if (hueDistance > 180) {
      hueDistance = 360 - hueDistance;
    }

    if (hueDistance > range) {
      continue;
    }

    const strength =
      1 - hueDistance / range;

    const adjustedSat =
      hsl.s + satShift * strength;

    const adjustedLight =
      hsl.l + lightShift * strength;

    const finalHue =
      (hsl.h + hueShift * strength + 360) % 360;

    const rgb =
      hslToRgb(
        finalHue,
        Math.max(0, Math.min(100, adjustedSat)),
        Math.max(0, Math.min(100, adjustedLight))
      );

    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }
}


/* HSL to RGB */

function hslToRgb(h, s, l) {

  h /= 360;
  s /= 100;
  l /= 100;

  if (s === 0) {

    const value = Math.round(l * 255);

    return [value, value, value];
  }

  function hueToRgb(p, q, t) {

    if (t < 0) t += 1;
    if (t > 1) t -= 1;

    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }

    if (t < 1 / 2) {
      return q;
    }

    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }

    return p;
  }

  const q =
    l < 0.5
      ? l * (1 + s)
      : l + s - l * s;

  const p =
    2 * l - q;

  const r =
    hueToRgb(p, q, h + 1 / 3);

  const g =
    hueToRgb(p, q, h);

  const b =
    hueToRgb(p, q, h - 1 / 3);

  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255)
  ];
}


/* ---------------------------------------------------------
   LAYER MANAGEMENT
--------------------------------------------------------- */

function selectTextLayer(id) {

  S.selectedTextId = id;

  panel();
  render();
}


function clearAllLayers() {

  if (
    !S.textLayers.length &&
    !S.drawLayers.length
  ) {
    return;
  }

  push();

  S.textLayers = [];
  S.drawLayers = [];
  S.selectedTextId = null;

  render();
  panel();
}


/* ---------------------------------------------------------
   DRAW OVERLAY
--------------------------------------------------------- */

function drawOverlay() {

  if (!img) return;

  O.width = C.width;
  O.height = C.height;

  ox.clearRect(
    0,
    0,
    O.width,
    O.height
  );


  /* DRAW STROKES */

  S.drawLayers.forEach(stroke => {

    if (!stroke.points.length) return;

    ox.save();

    ox.globalAlpha =
      Math.max(
        0,
        Math.min(
          1,
          Number(stroke.opacity || 100) / 100
        )
      );

    ox.strokeStyle =
      stroke.color || '#ffffff';

    ox.lineWidth =
      Number(stroke.size || 8);

    ox.lineCap = 'round';
    ox.lineJoin = 'round';

    ox.beginPath();

    stroke.points.forEach((point, index) => {

      const x = point.x * O.width;
      const y = point.y * O.height;

      if (index === 0) {
        ox.moveTo(x, y);
      } else {
        ox.lineTo(x, y);
      }
    });

    ox.stroke();

    ox.restore();
  });


  /* TEXT LAYERS */

  S.textLayers.forEach(layer => {

    const x =
      layer.x * O.width;

    const y =
      layer.y * O.height;

    ox.save();

    ox.globalAlpha =
      Math.max(
        0,
        Math.min(
          1,
          Number(layer.opacity || 100) / 100
        )
      );

    const weight =
      layer.bold ? '700' : '400';

    const style =
      layer.italic ? 'italic' : 'normal';

    ox.font =
      `${style} ${weight} ${Number(layer.size || 48)}px ${layer.font || 'Arial'}`;

    ox.textAlign =
      layer.align || 'center';

    ox.textBaseline = 'middle';

    const lines =
      String(layer.text || '').split('\n');

    const lineHeight =
      Number(layer.size || 48) * 1.2;

    const totalHeight =
      lines.length * lineHeight;

    lines.forEach((line, index) => {

      const lineY =
        y -
        totalHeight / 2 +
        lineHeight / 2 +
        index * lineHeight;

      if (layer.stroke) {

        ox.lineWidth =
          Math.max(
            2,
            Number(layer.size || 48) * 0.08
          );

        ox.strokeStyle =
          layer.stroke;

        ox.strokeText(
          line,
          x,
          lineY
        );
      }

      ox.fillStyle =
        layer.color || '#ffffff';

      ox.fillText(
        line,
        x,
        lineY
      );
    });

    /* Selected text outline */

    if (
      S.selectedTextId === layer.id
    ) {

      const metrics =
        ox.measureText(
          lines.reduce(
            (longest, line) =>
              line.length > longest.length
                ? line
                : longest,
            ''
          )
        );

      const width =
        metrics.width + 24;

      const height =
        totalHeight + 20;

      ox.strokeStyle =
        'rgba(255,255,255,.75)';

      ox.lineWidth = 1;

      ox.setLineDash([6, 5]);

      ox.strokeRect(
        x - width / 2,
        y - height / 2,
        width,
        height
      );

      ox.setLineDash([]);
    }

    ox.restore();
  });
}


/* ---------------------------------------------------------
   TEXT HIT TEST
--------------------------------------------------------- */

function hitText(clientX, clientY) {

  const rect =
    O.getBoundingClientRect();

  const x =
    (clientX - rect.left) /
    rect.width *
    O.width;

  const y =
    (clientY - rect.top) /
    rect.height *
    O.height;

  for (
    let i = S.textLayers.length - 1;
    i >= 0;
    i--
  ) {

    const layer =
      S.textLayers[i];

    const lx =
      layer.x * O.width;

    const ly =
      layer.y * O.height;

    const size =
      Number(layer.size || 48);

    const width =
      Math.max(
        size * 2,
        String(layer.text || '').length *
        size *
        0.55
      );

    const height =
      size * 1.5;

    if (
      x >= lx - width / 2 &&
      x <= lx + width / 2 &&
      y >= ly - height / 2 &&
      y <= ly + height / 2
    ) {

      return layer;
    }
  }

  return null;
}


/* ---------------------------------------------------------
   TEXT DRAG
--------------------------------------------------------- */

let textDrag = null;

function startTextDrag(event) {

  if (!img) return;

  const layer =
    hitText(
      event.clientX,
      event.clientY
    );

  if (!layer) return;

  S.selectedTextId =
    layer.id;

  const rect =
    O.getBoundingClientRect();

  textDrag = {
    layer,
    startX: event.clientX,
    startY: event.clientY,
    originalX: layer.x,
    originalY: layer.y,
    width: rect.width,
    height: rect.height
  };

  O.setPointerCapture?.(
    event.pointerId
  );

  event.preventDefault();

  panel();
  drawOverlay();
}


function moveTextDrag(event) {

  if (!textDrag) return;

  const layer =
    textDrag.layer;

  const dx =
    (event.clientX - textDrag.startX) /
    textDrag.width;

  const dy =
    (event.clientY - textDrag.startY) /
    textDrag.height;

  layer.x =
    Math.max(
      0,
      Math.min(
        1,
        textDrag.originalX + dx
      )
    );

  layer.y =
    Math.max(
      0,
      Math.min(
        1,
        textDrag.originalY + dy
      )
    );

  drawOverlay();
}


function endTextDrag() {

  if (!textDrag) return;

  pushHistoryAfterInteraction();

  textDrag = null;

  render();
}


/* ---------------------------------------------------------
   HISTORY AFTER DRAG
--------------------------------------------------------- */

function pushHistoryAfterInteraction() {

  if (
    typeof historyStack === 'undefined'
  ) {
    return;
  }

  /* Prevent unnecessary history entries. */
}


/* ---------------------------------------------------------
   POINTER HANDLING FOR TEXT
--------------------------------------------------------- */

function bindTextInteraction() {

  O.addEventListener(
    'pointerdown',
    event => {

      if (active !== 'text') {
        return;
      }

      startTextDrag(event);
    }
  );

  O.addEventListener(
    'pointermove',
    event => {

      if (!textDrag) return;

      moveTextDrag(event);
    }
  );

  O.addEventListener(
    'pointerup',
    () => {

      endTextDrag();
    }
  );

  O.addEventListener(
    'pointercancel',
    () => {

      textDrag = null;
    }
  );
}


/* ---------------------------------------------------------
   DRAW POINTER HANDLING
--------------------------------------------------------- */

let drawingStroke = null;

function bindDrawInteraction() {

  O.addEventListener(
    'pointerdown',
    event => {

      if (active !== 'draw') {
        return;
      }

      if (!img) return;

      const rect =
        O.getBoundingClientRect();

      const x =
        (event.clientX - rect.left) /
        rect.width;

      const y =
        (event.clientY - rect.top) /
        rect.height;

      drawingStroke = {
        points: [
          {
            x,
            y
          }
        ],
        color:
          $('drawColor')?.value ||
          '#ffffff',
        size:
          Number(
            $('drawSize')?.value ||
            8
          ),
        opacity:
          Number(
            $('drawOpacity')?.value ||
            100
          )
      };

      O.setPointerCapture?.(
        event.pointerId
      );

      event.preventDefault();
    }
  );


  O.addEventListener(
    'pointermove',
    event => {

      if (
        active !== 'draw' ||
        !drawingStroke
      ) {
        return;
      }

      const rect =
        O.getBoundingClientRect();

      const x =
        (event.clientX - rect.left) /
        rect.width;

      const y =
        (event.clientY - rect.top) /
        rect.height;

      drawingStroke.points.push({
        x,
        y
      });

      drawOverlay();
    }
  );


  O.addEventListener(
    'pointerup',
    event => {

      if (!drawingStroke) {
        return;
      }

      push();

      addDrawStroke(
        drawingStroke.points,
        drawingStroke.color,
        drawingStroke.size,
        drawingStroke.opacity
      );

      drawingStroke = null;

      render();
      panel();
    }
  );


  O.addEventListener(
    'pointercancel',
    () => {

      drawingStroke = null;
    }
  );
}


/* ---------------------------------------------------------
   COLOR PICK POINTER
--------------------------------------------------------- */

function bindSelectiveInteraction() {

  O.addEventListener(
    'pointerdown',
    event => {

      if (active !== 'selective') {
        return;
      }

      pickSelectiveColor(
        event.clientX,
        event.clientY
      );

      event.preventDefault();
    }
  );
}


/* ---------------------------------------------------------
   PART 5 INITIALIZATION
--------------------------------------------------------- */

function initPart5Tools() {

  if (!S.textLayers) {
    S.textLayers = [];
  }

  if (!S.drawLayers) {
    S.drawLayers = [];
  }

  if (S.selectedTextId === undefined) {
    S.selectedTextId = null;
  }

  if (S.selectiveR === undefined) {
    S.selectiveR = 0;
  }

  if (S.selectiveG === undefined) {
    S.selectiveG = 0;
  }

  if (S.selectiveB === undefined) {
    S.selectiveB = 0;
  }

  if (S.selectiveRange === undefined) {
    S.selectiveRange = 35;
  }

  if (S.selectiveHueAdjust === undefined) {
    S.selectiveHueAdjust = 0;
  }

  if (S.selectiveSat === undefined) {
    S.selectiveSat = 0;
  }

  if (S.selectiveLight === undefined) {
    S.selectiveLight = 0;
  }

  bindTextInteraction();
  bindDrawInteraction();
  bindSelectiveInteraction();
}


/* Run after the existing editor has initialized */

if (
  document.readyState === 'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    initPart5Tools,
    { once: true }
  );

} else {

  initPart5Tools();
}
/* =========================================================
   PART 6
   FINAL TOOL INTEGRATION
   TEXT + DRAW + COLOR SELECT + EXPORT
========================================================= */


/* ---------------------------------------------------------
   EXTRA COLOR SELECT STATE
--------------------------------------------------------- */

if (S.selectiveHueAdjust === undefined) {
  S.selectiveHueAdjust = 0;
}

if (S.selectiveSat === undefined) {
  S.selectiveSat = 0;
}

if (S.selectiveLight === undefined) {
  S.selectiveLight = 0;
}


/* ---------------------------------------------------------
   SAVE / RESTORE SUPPORT
   --------------------------------------------------------- */

function toolLayerSnapshot() {

  return {
    textLayers: JSON.parse(
      JSON.stringify(S.textLayers || [])
    ),

    drawLayers: JSON.parse(
      JSON.stringify(S.drawLayers || [])
    ),

    selectedTextId:
      S.selectedTextId || null,

    selectiveR:
      S.selectiveR || 0,

    selectiveG:
      S.selectiveG || 0,

    selectiveB:
      S.selectiveB || 0,

    selectiveRange:
      S.selectiveRange || 35,

    selectiveHueAdjust:
      S.selectiveHueAdjust || 0,

    selectiveSat:
      S.selectiveSat || 0,

    selectiveLight:
      S.selectiveLight || 0
  };
}


/* ---------------------------------------------------------
   DRAW FINAL OVERLAY
--------------------------------------------------------- */

function renderToolOverlay() {

  if (!img) return;

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


  /* DRAW LAYERS */

  (S.drawLayers || []).forEach(stroke => {

    if (
      !stroke.points ||
      stroke.points.length < 2
    ) {
      return;
    }

    ox.save();

    ox.globalAlpha =
      Math.max(
        0,
        Math.min(
          1,
          Number(stroke.opacity || 100) / 100
        )
      );

    ox.strokeStyle =
      stroke.color || '#ffffff';

    ox.lineWidth =
      Number(stroke.size || 8);

    ox.lineCap = 'round';
    ox.lineJoin = 'round';

    ox.beginPath();

    stroke.points.forEach(
      (point, index) => {

        const x =
          point.x * O.width;

        const y =
          point.y * O.height;

        if (index === 0) {
          ox.moveTo(x, y);
        } else {
          ox.lineTo(x, y);
        }
      }
    );

    ox.stroke();

    ox.restore();
  });


  /* TEXT LAYERS */

  (S.textLayers || []).forEach(layer => {

    const x =
      layer.x * O.width;

    const y =
      layer.y * O.height;

    const size =
      Number(layer.size || 48);

    const weight =
      layer.bold
        ? '700'
        : '400';

    const style =
      layer.italic
        ? 'italic'
        : 'normal';

    ox.save();

    ox.globalAlpha =
      Math.max(
        0,
        Math.min(
          1,
          Number(layer.opacity || 100) / 100
        )
      );

    ox.font =
      `${style} ${weight} ${size}px ${layer.font || 'Arial'}`;

    ox.textAlign =
      layer.align || 'center';

    ox.textBaseline =
      'middle';

    const lines =
      String(layer.text || '')
        .split('\n');

    const lineHeight =
      size * 1.2;

    const totalHeight =
      lines.length * lineHeight;


    lines.forEach(
      (line, index) => {

        const lineY =
          y -
          totalHeight / 2 +
          lineHeight / 2 +
          index * lineHeight;


        if (layer.stroke) {

          ox.lineWidth =
            Math.max(
              2,
              size * 0.08
            );

          ox.strokeStyle =
            layer.stroke;

          ox.strokeText(
            line,
            x,
            lineY
          );
        }


        ox.fillStyle =
          layer.color || '#ffffff';

        ox.fillText(
          line,
          x,
          lineY
        );
      }
    );


    /* SELECTED LAYER GUIDE */

    if (
      S.selectedTextId === layer.id &&
      active === 'text'
    ) {

      const longest =
        lines.reduce(
          (a, b) =>
            a.length > b.length
              ? a
              : b,
          ''
        );

      const textWidth =
        Math.max(
          size * 2,
          longest.length * size * 0.55
        );

      const boxWidth =
        textWidth + 24;

      const boxHeight =
        totalHeight + 20;

      ox.save();

      ox.strokeStyle =
        'rgba(255,255,255,.8)';

      ox.lineWidth = 1;

      ox.setLineDash([
        6,
        5
      ]);

      ox.strokeRect(
        x - boxWidth / 2,
        y - boxHeight / 2,
        boxWidth,
        boxHeight
      );

      ox.restore();
    }

    ox.restore();
  });
}


/* ---------------------------------------------------------
   SELECTIVE COLOR PROCESSING
--------------------------------------------------------- */

function applySelectiveToImageData(
  imageData
) {

  if (
    !S.selectiveR &&
    !S.selectiveG &&
    !S.selectiveB
  ) {
    return;
  }

  const target =
    rgbToHsl(
      S.selectiveR,
      S.selectiveG,
      S.selectiveB
    );

  const range =
    Math.max(
      1,
      Number(
        S.selectiveRange || 35
      )
    );

  const hueShift =
    Number(
      S.selectiveHueAdjust || 0
    );

  const saturationShift =
    Number(
      S.selectiveSat || 0
    );

  const lightShift =
    Number(
      S.selectiveLight || 0
    );

  const d =
    imageData.data;


  for (
    let i = 0;
    i < d.length;
    i += 4
  ) {

    const hsl =
      rgbToHsl(
        d[i],
        d[i + 1],
        d[i + 2]
      );


    let distance =
      Math.abs(
        hsl.h - target.h
      );

    if (distance > 180) {
      distance =
        360 - distance;
    }


    if (distance > range) {
      continue;
    }


    const strength =
      Math.max(
        0,
        1 - distance / range
      );


    const newHue =
      (
        hsl.h +
        hueShift * strength +
        360
      ) % 360;


    const newSaturation =
      Math.max(
        0,
        Math.min(
          100,
          hsl.s +
          saturationShift *
          strength
        )
      );


    const newLight =
      Math.max(
        0,
        Math.min(
          100,
          hsl.l +
          lightShift *
          strength
        )
      );


    const rgb =
      hslToRgb(
        newHue,
        newSaturation,
        newLight
      );


    d[i] =
      rgb[0];

    d[i + 1] =
      rgb[1];

    d[i + 2] =
      rgb[2];
  }
}


/* ---------------------------------------------------------
   PATCH EXISTING RENDER
--------------------------------------------------------- */

const originalRenderFunction =
  render;


/*
   Replace render with a wrapper.

   The original editor still performs:
   Light
   Color
   Effects
   Detail
   Crop
   Presets
   Profiles
   Retouch
   Blur
   Optics
   Zoom
   Pan

   This wrapper only adds the new tools.
*/

render = function () {

  originalRenderFunction();

  if (!img) {
    return;
  }

  /*
     The original render has already produced
     the edited C canvas.

     Now apply Color Select directly to
     the displayed edited pixels.
  */

  if (
    S.selectiveR ||
    S.selectiveG ||
    S.selectiveB
  ) {

    try {

      const imageData =
        cx.getImageData(
          0,
          0,
          C.width,
          C.height
        );

      applySelectiveToImageData(
        imageData
      );

      cx.putImageData(
        imageData,
        0,
        0
      );

    } catch (error) {

      console.warn(
        'Selective color processing skipped:',
        error
      );
    }
  }


  /*
     Draw Text and Draw layers
     on the overlay canvas.
  */

  renderToolOverlay();

  updateCanvasTransform();
};


/* ---------------------------------------------------------
   TEXT PANEL EVENTS
--------------------------------------------------------- */

function bindTextPanelEvents() {

  $('addText')?.addEventListener(
    'click',
    createTextLayer
  );


  $('deleteText')?.addEventListener(
    'click',
    deleteSelectedText
  );


  $('clearText')?.addEventListener(
    'click',
    clearTextLayers
  );


  $('textValue')?.addEventListener(
    'input',
    event => {

      if (!S.selectedTextId) {
        return;
      }

      const layer =
        S.textLayers.find(
          item =>
            item.id ===
            S.selectedTextId
        );

      if (!layer) return;

      layer.text =
        event.target.value;

      renderToolOverlay();
    }
  );


  $('textFont')?.addEventListener(
    'change',
    event => {

      updateSelectedText(
        'font',
        event.target.value
      );
    }
  );


  $('textSize')?.addEventListener(
    'input',
    event => {

      updateSelectedText(
        'size',
        Number(
          event.target.value
        )
      );
    }
  );


  $('textBold')?.addEventListener(
    'change',
    event => {

      updateSelectedText(
        'bold',
        event.target.checked
      );
    }
  );


  $('textItalic')?.addEventListener(
    'change',
    event => {

      updateSelectedText(
        'italic',
        event.target.checked
      );
    }
  );


  $('textAlign')?.addEventListener(
    'change',
    event => {

      updateSelectedText(
        'align',
        event.target.value
      );
    }
  );


  $('textColor')?.addEventListener(
    'input',
    event => {

      updateSelectedText(
        'color',
        event.target.value
      );
    }
  );


  $('textStroke')?.addEventListener(
    'input',
    event => {

      updateSelectedText(
        'stroke',
        event.target.value
      );
    }
  );


  $('textOpacity')?.addEventListener(
    'input',
    event => {

      updateSelectedText(
        'opacity',
        Number(
          event.target.value
        )
      );
    }
  );
}


/* ---------------------------------------------------------
   DRAW PANEL EVENTS
--------------------------------------------------------- */

function bindDrawPanelEvents() {

  $('drawClear')?.addEventListener(
    'click',
    () => {

      if (!S.drawLayers.length) {
        return;
      }

      push();

      S.drawLayers = [];

      render();
      panel();
    }
  );


  $('drawUndo')?.addEventListener(
    'click',
    () => {

      if (!S.drawLayers.length) {
        return;
      }

      push();

      S.drawLayers.pop();

      render();
      panel();
    }
  );
}


/* ---------------------------------------------------------
   COLOR SELECT PANEL EVENTS
--------------------------------------------------------- */

function bindSelectivePanelEvents() {

  $('pickColor')?.addEventListener(
    'click',
    () => {

      $('status').textContent =
        'Click a color in the photo';

      $('pickerBadge').classList.add(
        'show'
      );
    }
  );


  $('selectiveRange')?.addEventListener(
    'input',
    event => {

      S.selectiveRange =
        Number(
          event.target.value
        );

      schedule();
    }
  );


  $('selectiveHue')?.addEventListener(
    'input',
    event => {

      S.selectiveHueAdjust =
        Number(
          event.target.value
        );

      schedule();
    }
  );


  $('selectiveSat')?.addEventListener(
    'input',
    event => {

      S.selectiveSat =
        Number(
          event.target.value
        );

      schedule();
    }
  );


  $('selectiveLight')?.addEventListener(
    'input',
    event => {

      S.selectiveLight =
        Number(
          event.target.value
        );

      schedule();
    }
  );


  $('clearSelective')?.addEventListener(
    'click',
    () => {

      push();

      S.selectiveR = 0;
      S.selectiveG = 0;
      S.selectiveB = 0;

      S.selectiveRange = 35;
      S.selectiveHueAdjust = 0;
      S.selectiveSat = 0;
      S.selectiveLight = 0;

      render();
      panel();
    }
  );
}


/* ---------------------------------------------------------
   LAYER PANEL EVENTS
--------------------------------------------------------- */

function bindLayerPanelEvents() {

  document
    .querySelectorAll(
      '[data-text-layer]'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          selectTextLayer(
            Number(
              button.dataset.textLayer
            )
          );
        }
      );
    });


  $('clearLayers')?.addEventListener(
    'click',
    clearAllLayers
  );
}


/* ---------------------------------------------------------
   PANEL BINDING PATCH
--------------------------------------------------------- */

const originalPanelActions =
  panelActions;


/*
   Rebind new controls every time
   the active panel changes.
*/

panelActions = function () {

  originalPanelActions();

  bindTextPanelEvents();

  bindDrawPanelEvents();

  bindSelectivePanelEvents();

  bindLayerPanelEvents();
};


/* ---------------------------------------------------------
   EXPORT OVERLAY SUPPORT
--------------------------------------------------------- */

function exportWithLayers(
  output,
  scale
) {

  const outputContext =
    output.getContext('2d');

  /*
     Base edited image
  */

  outputContext.drawImage(
    C,
    0,
    0,
    output.width,
    output.height
  );


  /*
     Overlay is rendered at the
     same coordinates as C.

     Scaling the overlay together with
     the edited image keeps text and
     drawing in exactly the same place.
  */

  outputContext.drawImage(
    O,
    0,
    0,
    output.width,
    output.height
  );
}


/* ---------------------------------------------------------
   FINAL INITIALIZATION
--------------------------------------------------------- */

function connectPart6() {

  if (!S.textLayers) {
    S.textLayers = [];
  }

  if (!S.drawLayers) {
    S.drawLayers = [];
  }

  renderToolOverlay();
}


if (
  document.readyState === 'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    connectPart6,
    { once: true }
  );

} else {

  connectPart6();
}
/* =========================================================
   PART 7
   TEXT / DRAW / COLOR SELECT / LAYERS PANELS
   + COMPLETE HISTORY SUPPORT
========================================================= */


/* ---------------------------------------------------------
   EXTENDED HISTORY
--------------------------------------------------------- */

function completeSnapshot() {

  return {
    settings: JSON.parse(
      JSON.stringify(S)
    ),

    textLayers: JSON.parse(
      JSON.stringify(
        S.textLayers || []
      )
    ),

    drawLayers: JSON.parse(
      JSON.stringify(
        S.drawLayers || []
      )
    ),

    selectedTextId:
      S.selectedTextId || null,

    selectiveR:
      S.selectiveR || 0,

    selectiveG:
      S.selectiveG || 0,

    selectiveB:
      S.selectiveB || 0,

    selectiveRange:
      S.selectiveRange || 35,

    selectiveHueAdjust:
      S.selectiveHueAdjust || 0,

    selectiveSat:
      S.selectiveSat || 0,

    selectiveLight:
      S.selectiveLight || 0
  };
}


/* ---------------------------------------------------------
   EXTENDED RESTORE
--------------------------------------------------------- */

function restoreComplete(state) {

  if (!state) return;


  /*
     Older history entries contain only S.
     Keep compatibility with them.
  */

  if (state.settings) {

    Object.assign(
      S,
      JSON.parse(
        JSON.stringify(
          state.settings
        )
      )
    );

  } else {

    Object.assign(
      S,
      JSON.parse(
        JSON.stringify(state)
      )
    );
  }


  S.textLayers =
    JSON.parse(
      JSON.stringify(
        state.textLayers || []
      )
    );


  S.drawLayers =
    JSON.parse(
      JSON.stringify(
        state.drawLayers || []
      )
    );


  S.selectedTextId =
    state.selectedTextId || null;


  S.selectiveR =
    state.selectiveR || 0;

  S.selectiveG =
    state.selectiveG || 0;

  S.selectiveB =
    state.selectiveB || 0;


  S.selectiveRange =
    state.selectiveRange || 35;


  S.selectiveHueAdjust =
    state.selectiveHueAdjust || 0;


  S.selectiveSat =
    state.selectiveSat || 0;


  S.selectiveLight =
    state.selectiveLight || 0;


  render();
  panel();
}


/* ---------------------------------------------------------
   COMPLETE PUSH
--------------------------------------------------------- */

function pushComplete() {

  history.push(
    completeSnapshot()
  );

  /*
     Limit memory usage.
     This is especially important on mobile.
  */

  if (history.length > 50) {
    history.shift();
  }

  future = [];
}


/* ---------------------------------------------------------
   COMPLETE UNDO
--------------------------------------------------------- */

function completeUndo() {

  if (!history.length) {
    return;
  }


  future.push(
    completeSnapshot()
  );


  const previous =
    history.pop();


  restoreComplete(
    previous
  );
}


/* ---------------------------------------------------------
   COMPLETE REDO
--------------------------------------------------------- */

function completeRedo() {

  if (!future.length) {
    return;
  }


  history.push(
    completeSnapshot()
  );


  const next =
    future.pop();


  restoreComplete(
    next
  );
}


/* ---------------------------------------------------------
   REPLACE TOP UNDO / REDO BUTTONS
--------------------------------------------------------- */

if ($('undo')) {

  $('undo').onclick =
    completeUndo;
}


if ($('redo')) {

  $('redo').onclick =
    completeRedo;
}


/* ---------------------------------------------------------
   RESET WITH ALL LAYERS
--------------------------------------------------------- */

function completeReset() {

  pushComplete();


  for (
    const key of Object.keys(S)
  ) {

    if (
      key.startsWith('h_') ||
      key.startsWith('s_') ||
      key.startsWith('l_')
    ) {

      S[key] = 0;

    } else if (
      typeof S[key] === 'boolean'
    ) {

      S[key] = false;

    } else if (
      key === 'ratio'
    ) {

      S[key] =
        'original';

    } else if (
      key === 'profile'
    ) {

      S[key] =
        'natural';

    } else if (
      key === 'preset'
    ) {

      S[key] =
        'none';

    } else if (
      key === 'maskType'
    ) {

      S[key] =
        'radial';

    } else if (
      key === 'midpoint' ||
      key === 'feather' ||
      key === 'blurX' ||
      key === 'blurY'
    ) {

      S[key] = 50;

    } else if (
      key === 'grainSize'
    ) {

      S[key] = 25;

    } else if (
      key === 'radius'
    ) {

      S[key] = 1;

    } else {

      S[key] = 0;
    }
  }


  S.presetAmount =
    100;


  S.textLayers =
    [];

  S.drawLayers =
    [];

  S.selectedTextId =
    null;


  S.selectiveR = 0;
  S.selectiveG = 0;
  S.selectiveB = 0;

  S.selectiveRange =
    35;

  S.selectiveHueAdjust =
    0;

  S.selectiveSat =
    0;

  S.selectiveLight =
    0;


  retouch = [];


  history = [];
  future = [];


  zoom = 1;
  panX = 0;
  panY = 0;


  updateCanvasTransform();

  render();

  panel();
}


if ($('reset')) {

  $('reset').onclick =
    completeReset;
}


/* ---------------------------------------------------------
   TEXT PANEL
--------------------------------------------------------- */

function textToolPanel() {

  const selected =
    S.textLayers.find(
      layer =>
        layer.id ===
        S.selectedTextId
    );


  return `

    <div class="section">

      <h3>Text</h3>

      <textarea
        id="textValue"
        class="textarea"
        rows="3"
        placeholder="Enter your text"
      >${selected
        ? String(selected.text)
        : ''
      }</textarea>

      <button
        class="btn primary"
        id="addText"
        style="width:100%;margin-top:8px"
      >
        Add Text
      </button>

    </div>


    <div class="section">

      <h3>Font</h3>

      <select
        id="textFont"
        class="select"
      >

        ${[
          'Arial',
          'Helvetica',
          'Georgia',
          'Times New Roman',
          'Verdana',
          'Trebuchet MS',
          'Courier New',
          'Impact'
        ].map(font => `

          <option
            value="${font}"
            ${
              selected &&
              selected.font === font
                ? 'selected'
                : ''
            }
          >
            ${font}
          </option>

        `).join('')}

      </select>


      <div
        class="grid2"
        style="margin-top:10px"
      >

        <div>

          <div class="colorhead">
            Font Size
          </div>

          <input
            id="textSize"
            type="range"
            min="12"
            max="300"
            step="1"
            value="${
              selected
                ? selected.size
                : 48
            }"
          >

        </div>


        <div>

          <div class="colorhead">
            Opacity
          </div>

          <input
            id="textOpacity"
            type="range"
            min="0"
            max="100"
            step="1"
            value="${
              selected
                ? selected.opacity
                : 100
            }"
          >

        </div>

      </div>

    </div>


    <div class="section">

      <h3>Style</h3>

      <div class="grid2">

        <label class="check">

          <input
            id="textBold"
            type="checkbox"
            ${
              selected &&
              selected.bold
                ? 'checked'
                : ''
            }
          >

          Bold

        </label>


        <label class="check">

          <input
            id="textItalic"
            type="checkbox"
            ${
              selected &&
              selected.italic
                ? 'checked'
                : ''
            }
          >

          Italic

        </label>

      </div>


      <div
        class="colorhead"
        style="margin-top:10px"
      >
        Alignment
      </div>

      <select
        id="textAlign"
        class="select"
      >

        <option
          value="left"
          ${
            selected &&
            selected.align === 'left'
              ? 'selected'
              : ''
          }
        >
          Left
        </option>

        <option
          value="center"
          ${
            !selected ||
            selected.align === 'center'
              ? 'selected'
              : ''
          }
        >
          Center
        </option>

        <option
          value="right"
          ${
            selected &&
            selected.align === 'right'
              ? 'selected'
              : ''
          }
        >
          Right
        </option>

      </select>

    </div>


    <div class="section">

      <h3>Colors</h3>

      <div class="grid2">

        <label>

          <span class="colorhead">
            Text Color
          </span>

          <input
            id="textColor"
            type="color"
            value="${
              selected
                ? selected.color
                : '#ffffff'
            }"
          >

        </label>


        <label>

          <span class="colorhead">
            Stroke
          </span>

          <input
            id="textStroke"
            type="color"
            value="${
              selected
                ? selected.stroke
                : '#000000'
            }"
          >

        </label>

      </div>

    </div>


    <div class="section">

      <button
        class="btn"
        id="deleteText"
        style="width:100%"
      >
        Delete Selected Text
      </button>


      <button
        class="btn danger"
        id="clearText"
        style="width:100%;margin-top:8px"
      >
        Clear All Text
      </button>

    </div>


    <div class="section">

      <p class="note">
        Drag text directly on the photo to reposition it.
      </p>

    </div>
  `;
}


/* ---------------------------------------------------------
   DRAW PANEL
--------------------------------------------------------- */

function drawToolPanel() {

  return `

    <div class="section">

      <h3>Brush</h3>

      <div class="control">

        <div class="ch">

          <span>Brush Size</span>

          <span
            class="val"
            id="drawSizeValue"
          >
            ${S.drawSize || 8}
          </span>

        </div>

        <input
          id="drawSize"
          type="range"
          min="1"
          max="100"
          value="${S.drawSize || 8}"
        >

      </div>


      <div class="control">

        <div class="ch">

          <span>Opacity</span>

          <span
            class="val"
            id="drawOpacityValue"
          >
            ${S.drawOpacity || 100}
          </span>

        </div>

        <input
          id="drawOpacity"
          type="range"
          min="1"
          max="100"
          value="${S.drawOpacity || 100}"
        >

      </div>


      <div
        class="colorhead"
        style="margin-top:10px"
      >
        Brush Color
      </div>

      <input
        id="drawColor"
        type="color"
        value="${S.drawColor || '#ffffff'}"
      >

    </div>


    <div class="section">

      <button
        class="btn"
        id="drawUndo"
        style="width:100%"
      >
        Remove Last Stroke
      </button>


      <button
        class="btn danger"
        id="drawClear"
        style="width:100%;margin-top:8px"
      >
        Clear Drawing
      </button>

    </div>


    <div class="section">

      <p class="note">
        Draw directly over the photo.
      </p>

    </div>
  `;
}


/* ---------------------------------------------------------
   COLOR SELECT PANEL
--------------------------------------------------------- */

function selectiveToolPanel() {

  const hasColor =
    S.selectiveR ||
    S.selectiveG ||
    S.selectiveB;


  return `

    <div class="section">

      <h3>Color Select</h3>

      <button
        id="pickColor"
        class="btn primary"
        style="width:100%"
      >
        Pick Color From Photo
      </button>


      <div
        id="selectedColor"
        style="
          margin-top:10px;
          padding:10px;
          border-radius:10px;
          background:#181818;
        "
      >

        ${
          hasColor
            ? `
              <div
                style="
                  width:36px;
                  height:36px;
                  border-radius:8px;
                  background:rgb(
                    ${S.selectiveR},
                    ${S.selectiveG},
                    ${S.selectiveB}
                  );
                  border:1px solid #555;
                "
              ></div>

              <div
                style="
                  margin-top:7px;
                  font-size:12px;
                "
              >
                RGB
                ${S.selectiveR},
                ${S.selectiveG},
                ${S.selectiveB}
              </div>
            `
            : `
              <div
                style="
                  font-size:12px;
                  color:#999;
                "
              >
                No color selected
              </div>
            `
        }

      </div>

    </div>


    <div class="section">

      <h3>Color Range</h3>

      ${control(
        'selectiveRange',
        'Range',
        1,
        120
      )}

      ${control(
        'selectiveHueAdjust',
        'Hue',
        -180,
        180
      )}

      ${control(
        'selectiveSat',
        'Saturation',
        -100,
        100
      )}

      ${control(
        'selectiveLight',
        'Lightness',
        -100,
        100
      )}

    </div>


    <div class="section">

      <button
        id="clearSelective"
        class="btn danger"
        style="width:100%"
      >
        Clear Color Selection
      </button>

    </div>


    <div class="section">

      <p class="note">
        Pick a color from the photo, then adjust only similar colors.
      </p>

    </div>
  `;
}


/* ---------------------------------------------------------
   LAYERS PANEL
--------------------------------------------------------- */

function layersToolPanel() {

  let html = `

    <div class="section">

      <h3>Layers</h3>

  `;


  if (
    !S.textLayers.length &&
    !S.drawLayers.length
  ) {

    html += `

      <div
        style="
          padding:18px;
          text-align:center;
          color:#888;
          background:#181818;
          border-radius:10px;
        "
      >
        No layers yet.
      </div>

    `;

  }


  /* TEXT LAYERS */

  S.textLayers.forEach(
    (layer, index) => {

      const selected =
        S.selectedTextId ===
        layer.id;


      html += `

        <button
          data-text-layer="${layer.id}"
          class="layer-item ${
            selected
              ? 'active'
              : ''
          }"
          style="
            width:100%;
            text-align:left;
            padding:10px;
            margin-top:6px;
            border-radius:8px;
            border:1px solid ${
              selected
                ? '#ffffff'
                : '#333'
            };
            background:${
              selected
                ? '#252525'
                : '#151515'
            };
            color:#fff;
          "
        >

          <strong>
            Text ${index + 1}
          </strong>

          <div
            style="
              margin-top:3px;
              font-size:12px;
              opacity:.65;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
            "
          >
            ${String(layer.text)}
          </div>

        </button>

      `;
    }
  );


  /* DRAW LAYERS */

  S.drawLayers.forEach(
    (stroke, index) => {

      html += `

        <div
          style="
            padding:10px;
            margin-top:6px;
            border-radius:8px;
            background:#151515;
            border:1px solid #333;
            font-size:13px;
          "
        >

          Drawing Stroke ${index + 1}

        </div>

      `;
    }
  );


  html += `

      </div>


      <div class="section">

        <button
          id="clearLayers"
          class="btn danger"
          style="width:100%"
        >
          Clear All Layers
        </button>

      </div>

  `;


  return html;
}


/* ---------------------------------------------------------
   EXTEND EXISTING PANEL
--------------------------------------------------------- */

const originalPanelFunction =
  panel;


/*
   IMPORTANT:
   We do not replace the existing editor panels.
   We add the new panels only for the new tools.
*/

panel = function () {

  /*
     Existing tools keep their
     original UI.
  */

  if (
    active !== 'text' &&
    active !== 'draw' &&
    active !== 'selective' &&
    active !== 'layers'
  ) {

    originalPanelFunction();

    return;
  }


  const p =
    $('panel');


  if (!p) return;


  if (
    names[active]
  ) {

    $('eyebrow').textContent =
      names[active][0];

    $('title').textContent =
      names[active][1];

  }


  if (active === 'text') {

    p.innerHTML =
      textToolPanel();

  }


  if (active === 'draw') {

    p.innerHTML =
      drawToolPanel();

  }


  if (active === 'selective') {

    p.innerHTML =
      selectiveToolPanel();

  }


  if (active === 'layers') {

    p.innerHTML =
      layersToolPanel();

  }


  bindNewToolPanel();
};


/* ---------------------------------------------------------
   NEW PANEL BINDING
--------------------------------------------------------- */

function bindNewToolPanel() {

  /* TEXT */

  $('addText')?.addEventListener(
    'click',
    () => {

      pushComplete();

      const value =
        $('textValue')
          ?.value
          ?.trim();

      if (!value) {

        alert(
          'Please enter some text.'
        );

        return;
      }


      const layer = {

        id:
          Date.now() +
          Math.random(),

        text:
          value,

        x: 0.5,

        y: 0.5,

        font:
          $('textFont')
            ?.value ||
          'Arial',

        size:
          Number(
            $('textSize')
              ?.value ||
            48
          ),

        bold:
          $('textBold')
            ?.checked ||
          false,

        italic:
          $('textItalic')
            ?.checked ||
          false,

        align:
          $('textAlign')
            ?.value ||
          'center',

        color:
          $('textColor')
            ?.value ||
          '#ffffff',

        stroke:
          $('textStroke')
            ?.value ||
          '#000000',

        opacity:
          Number(
            $('textOpacity')
              ?.value ||
            100
          )
      };


      S.textLayers.push(
        layer
      );


      S.selectedTextId =
        layer.id;


      render();

      panel();
    }
  );


  /* DRAW */

  $('drawSize')
    ?.addEventListener(
      'input',
      event => {

        S.drawSize =
          Number(
            event.target.value
          );

        const label =
          $('drawSizeValue');

        if (label) {
          label.textContent =
            S.drawSize;
        }
      }
    );


  $('drawOpacity')
    ?.addEventListener(
      'input',
      event => {

        S.drawOpacity =
          Number(
            event.target.value
          );

        const label =
          $('drawOpacityValue');

        if (label) {
          label.textContent =
            S.drawOpacity;
        }
      }
    );


  $('drawColor')
    ?.addEventListener(
      'input',
      event => {

        S.drawColor =
          event.target.value;
      }
    );


  $('drawUndo')
    ?.addEventListener(
      'click',
      () => {

        if (
          !S.drawLayers.length
        ) {
          return;
        }

        pushComplete();

        S.drawLayers.pop();

        render();

        panel();
      }
    );


  $('drawClear')
    ?.addEventListener(
      'click',
      () => {

        if (
          !S.drawLayers.length
        ) {
          return;
        }

        pushComplete();

        S.drawLayers = [];

        render();

        panel();
      }
    );


  /* COLOR SELECT */

  $('pickColor')
    ?.addEventListener(
      'click',
      () => {

        $('status').textContent =
          'Click a color in the photo';

        $('pickerBadge')
          ?.classList
          .add('show');
      }
    );


  $('selectiveRange')
    ?.addEventListener(
      'input',
      event => {

        S.selectiveRange =
          Number(
            event.target.value
          );

        schedule();
      }
    );


  $('selectiveHueAdjust')
    ?.addEventListener(
      'input',
      event => {

        S.selectiveHueAdjust =
          Number(
            event.target.value
          );

        schedule();
      }
    );


  $('selectiveSat')
    ?.addEventListener(
      'input',
      event => {

        S.selectiveSat =
          Number(
            event.target.value
          );

        schedule();
      }
    );


  $('selectiveLight')
    ?.addEventListener(
      'input',
      event => {

        S.selectiveLight =
          Number(
            event.target.value
          );

        schedule();
      }
    );


  $('clearSelective')
    ?.addEventListener(
      'click',
      () => {

        pushComplete();

        S.selectiveR = 0;
        S.selectiveG = 0;
        S.selectiveB = 0;

        S.selectiveRange = 35;
        S.selectiveHueAdjust = 0;
        S.selectiveSat = 0;
        S.selectiveLight = 0;

        render();

        panel();
      }
    );


  /* LAYERS */

  document
    .querySelectorAll(
      '[data-text-layer]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            S.selectedTextId =
              Number(
                button.dataset.textLayer
              );

            panel();

            render();
          }
        );
      }
    );


  $('clearLayers')
    ?.addEventListener(
      'click',
      () => {

        if (
          !S.textLayers.length &&
          !S.drawLayers.length
        ) {
          return;
        }

        pushComplete();

        S.textLayers = [];
        S.drawLayers = [];

        S.selectedTextId =
          null;

        render();

        panel();
      }
    );


  /* TEXT CONTROLS */

  $('textFont')
    ?.addEventListener(
      'change',
      event => {

        const layer =
          S.textLayers.find(
            item =>
              item.id ===
              S.selectedTextId
          );

        if (!layer) return;

        pushComplete();

        layer.font =
          event.target.value;

        render();
      }
    );


  $('textSize')
    ?.addEventListener(
      'change',
      event => {

        const layer =
          S.textLayers.find(
            item =>
              item.id ===
              S.selectedTextId
          );

        if (!layer) return;

        pushComplete();

        layer.size =
          Number(
            event.target.value
          );

        render();
      }
    );


  $('textBold')
    ?.addEventListener(
      'change',
      event => {

        const layer =
          S.textLayers.find(
            item =>
              item.id ===
              S.selectedTextId
          );

        if (!layer) return;

        pushComplete();

        layer.bold =
          event.target.checked;

        render();
      }
    );


  $('textItalic')
    ?.addEventListener(
      'change',
      event => {

        const layer =
          S.textLayers.find(
            item =>
              item.id ===
              S.selectedTextId
          );

        if (!layer) return;

        pushComplete();

        layer.italic =
          event.target.checked;

        render();
      }
    );


  $('textAlign')
    ?.addEventListener(
      'change',
      event => {

        const layer =
          S.textLayers.find(
            item =>
              item.id ===
              S.selectedTextId
          );

        if (!layer) return;

        pushComplete();

        layer.align =
          event.target.value;

        render();
      }
    );


  $('textColor')
    ?.addEventListener(
      'input',
      event => {

        const layer =
          S.textLayers.find(
            item =>
              item.id ===
              S.selectedTextId
          );

        if (!layer) return;

        layer.color =
          event.target.value;

        renderToolOverlay();
      }
    );


  $('textStroke')
    ?.addEventListener(
      'input',
      event => {

        const layer =
          S.textLayers.find(
            item =>
              item.id ===
              S.selectedTextId
          );

        if (!layer) return;

        layer.stroke =
          event.target.value;

        renderToolOverlay();
      }
    );


  $('textOpacity')
    ?.addEventListener(
      'input',
      event => {

        const layer =
          S.textLayers.find(
            item =>
              item.id ===
              S.selectedTextId
          );

        if (!layer) return;

        layer.opacity =
          Number(
            event.target.value
          );

        renderToolOverlay();
      }
    );


  $('deleteText')
    ?.addEventListener(
      'click',
      () => {

        if (
          !S.selectedTextId
        ) {
          return;
        }

        pushComplete();

        S.textLayers =
          S.textLayers.filter(
            layer =>
              layer.id !==
              S.selectedTextId
          );

        S.selectedTextId =
          null;

        render();

        panel();
      }
    );


  $('clearText')
    ?.addEventListener(
      'click',
      () => {

        if (
          !S.textLayers.length
        ) {
          return;
        }

        pushComplete();

        S.textLayers = [];

        S.selectedTextId =
          null;

        render();

        panel();
      }
    );
}


/* ---------------------------------------------------------
   INITIALIZE NEW STATE
--------------------------------------------------------- */

function initializePart7() {

  if (!S.textLayers) {
    S.textLayers = [];
  }

  if (!S.drawLayers) {
    S.drawLayers = [];
  }

  if (
    S.selectedTextId ===
    undefined
  ) {
    S.selectedTextId =
      null;
  }

  if (
    S.drawSize ===
    undefined
  ) {
    S.drawSize = 8;
  }

  if (
    S.drawOpacity ===
    undefined
  ) {
    S.drawOpacity = 100;
  }

  if (
    S.drawColor ===
    undefined
  ) {
    S.drawColor =
      '#ffffff';
  }

  if (
    S.selectiveRange ===
    undefined
  ) {
    S.selectiveRange =
      35;
  }

  if (
    S.selectiveHueAdjust ===
    undefined
  ) {
    S.selectiveHueAdjust =
      0;
  }

  if (
    S.selectiveSat ===
    undefined
  ) {
    S.selectiveSat =
      0;
  }

  if (
    S.selectiveLight ===
    undefined
  ) {
    S.selectiveLight =
      0;
  }
}


initializePart7();
/* =========================================================
   PART 8
   EXPORT + OVERLAY LAYERS
========================================================= */

/*
   This section keeps the original export system intact
   while adding Text and Draw layers to the exported image.
*/


function drawFinalOverlayOnCanvas(targetCanvas) {

  const ctx = targetCanvas.getContext('2d');

  if (!ctx) return;


  const scaleX =
    targetCanvas.width /
    C.width;

  const scaleY =
    targetCanvas.height /
    C.height;


  /* -------------------------------------------------------
     DRAW STROKES
  ------------------------------------------------------- */

  if (
    typeof drawLayers !== 'undefined' &&
    Array.isArray(drawLayers)
  ) {

    ctx.save();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';


    drawLayers.forEach(stroke => {

      if (
        !stroke ||
        !Array.isArray(stroke.points) ||
        stroke.points.length < 2
      ) {
        return;
      }


      ctx.beginPath();


      stroke.points.forEach(
        (point, index) => {

          const x =
            point.x *
            targetCanvas.width;

          const y =
            point.y *
            targetCanvas.height;


          if (index === 0) {

            ctx.moveTo(x, y);

          } else {

            ctx.lineTo(x, y);
          }
        }
      );


      ctx.strokeStyle =
        stroke.color ||
        '#ffffff';

      ctx.globalAlpha =
        typeof stroke.opacity === 'number'
          ? stroke.opacity / 100
          : 1;

      ctx.lineWidth =
        Math.max(
          1,
          (stroke.size || 8) *
          ((scaleX + scaleY) / 2)
        );


      ctx.stroke();
    });


    ctx.restore();
  }


  /* -------------------------------------------------------
     TEXT LAYERS
  ------------------------------------------------------- */

  if (
    typeof textLayers !== 'undefined' &&
    Array.isArray(textLayers)
  ) {

    textLayers.forEach(layer => {

      if (!layer || !layer.text) {
        return;
      }


      const x =
        Number(layer.x || 0) *
        targetCanvas.width;

      const y =
        Number(layer.y || 0) *
        targetCanvas.height;


      const size =
        Math.max(
          8,
          Number(layer.size || 48) *
          ((scaleX + scaleY) / 2)
        );


      const font =
        layer.font ||
        'Arial';


      const weight =
        layer.bold
          ? '700'
          : '400';


      const style =
        layer.italic
          ? 'italic'
          : 'normal';


      ctx.save();


      ctx.globalAlpha =
        typeof layer.opacity === 'number'
          ? layer.opacity / 100
          : 1;


      ctx.font =
        `${style} ${weight} ${size}px ${font}`;


      ctx.textAlign =
        layer.align ||
        'left';

      ctx.textBaseline =
        'middle';


      /* Stroke */

      if (
        layer.stroke &&
        layer.strokeWidth > 0
      ) {

        ctx.lineWidth =
          Math.max(
            1,
            Number(layer.strokeWidth) *
            ((scaleX + scaleY) / 2)
          );

        ctx.strokeStyle =
          layer.stroke;

        ctx.strokeText(
          layer.text,
          x,
          y
        );
      }


      /* Fill */

      ctx.fillStyle =
        layer.color ||
        '#ffffff';

      ctx.fillText(
        layer.text,
        x,
        y
      );


      ctx.restore();
    });
  }
}


/* =========================================================
   EXPORT WITH TOOLORA OVERLAYS
========================================================= */

function exportImageWithLayers() {

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


  try {

    /*
       Zoom and Pan affect only the editor view.
       They must never change the exported photo.
    */

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
      document.createElement(
        'canvas'
      );


    output.width =
      Math.max(
        1,
        Math.round(
          C.width * scale
        )
      );


    output.height =
      Math.max(
        1,
        Math.round(
          C.height * scale
        )
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


    /*
       Add Text and Draw layers
       after the edited image has
       been rendered.
    */

    drawFinalOverlayOnCanvas(
      output
    );


    const type =
      $('format').value;


    const quality =
      Number(
        $('quality').value
      );


    const extension =
      type === 'image/png'
        ? 'png'
        : type === 'image/webp'
          ? 'webp'
          : 'jpg';


    const link =
      document.createElement(
        'a'
      );


    link.download =
      `toolora-edited-${Date.now()}.${extension}`;


    link.href =
      output.toDataURL(
        type,
        quality
      );


    document.body.appendChild(
      link
    );


    link.click();


    link.remove();


    $('status').textContent =
      'Export complete';


  } catch (error) {

    console.error(
      'Toolora export error:',
      error
    );


    $('status').textContent =
      'Export failed';


    alert(
      'Export failed. Please try again.'
    );


  } finally {

    /*
       Restore the user's current
       zoom and pan position.
    */

    zoom = oldZoom;
    panX = oldPanX;
    panY = oldPanY;


    render();

    updateCanvasTransform();
  }
}


/* =========================================================
   REPLACE EXPORT BUTTON ACTION
========================================================= */

const exportButton =
  $('export');


if (exportButton) {

  exportButton.onclick =
    function () {

      exportImageWithLayers();

    };
}


/* =========================================================
   PART 8 READY
========================================================= */

console.log(
  'Toolora Part 8 loaded successfully.'
);
/* =========================================================
   PART 9
   ADVANCED HISTORY + STATE SAFETY
========================================================= */


/*
   Part 9 extends the existing history system.

   Important:
   - Zoom is NOT stored in edit history.
   - Pan is NOT stored in edit history.
   - Undo/Redo restores editing changes only.
   - Current zoom and pan remain untouched.
*/


function toolStateSnapshot() {

  return {
    textLayers:
      typeof textLayers !== 'undefined'
        ? JSON.parse(
            JSON.stringify(textLayers)
          )
        : [],

    drawLayers:
      typeof drawLayers !== 'undefined'
        ? JSON.parse(
            JSON.stringify(drawLayers)
          )
        : [],

    selectedTextId:
      typeof selectedTextId !== 'undefined'
        ? selectedTextId
        : null,

    S:
      JSON.parse(
        JSON.stringify(S)
      ),

    retouch:
      typeof retouch !== 'undefined'
        ? JSON.parse(
            JSON.stringify(retouch)
          )
        : []
  };
}


/* =========================================================
   RESTORE TOOL STATE
========================================================= */

function restoreToolState(state) {

  if (!state) return;


  if (
    typeof textLayers !== 'undefined' &&
    Array.isArray(state.textLayers)
  ) {

    textLayers.length = 0;

    state.textLayers.forEach(
      item => {

        textLayers.push(
          JSON.parse(
            JSON.stringify(item)
          )
        );

      }
    );
  }


  if (
    typeof drawLayers !== 'undefined' &&
    Array.isArray(state.drawLayers)
  ) {

    drawLayers.length = 0;

    state.drawLayers.forEach(
      item => {

        drawLayers.push(
          JSON.parse(
            JSON.stringify(item)
          )
        );

      }
    );
  }


  if (
    typeof selectedTextId !== 'undefined'
  ) {

    selectedTextId =
      state.selectedTextId ?? null;
  }


  if (
    typeof retouch !== 'undefined' &&
    Array.isArray(state.retouch)
  ) {

    retouch.length = 0;

    state.retouch.forEach(
      item => {

        retouch.push(
          JSON.parse(
            JSON.stringify(item)
          )
        );

      }
    );
  }


  if (state.S) {

    Object.keys(state.S)
      .forEach(key => {

        S[key] =
          JSON.parse(
            JSON.stringify(
              state.S[key]
            )
          );

      });
  }


  render();

  updateCanvasTransform();

  if (
    typeof panel === 'function'
  ) {

    panel();
  }
}


/* =========================================================
   SAFE HISTORY ENTRY
========================================================= */

function saveToolHistory() {

  if (
    typeof history === 'undefined'
  ) {
    return;
  }


  history.push(
    toolStateSnapshot()
  );


  if (
    typeof future !== 'undefined'
  ) {

    future.length = 0;
  }


  /*
     Prevent unlimited memory growth
     when many small edits are made.
  */

  const MAX_HISTORY =
    60;


  if (
    history.length >
    MAX_HISTORY
  ) {

    history.splice(
      0,
      history.length -
      MAX_HISTORY
    );
  }
}


/* =========================================================
   SAFE TOOL UNDO
========================================================= */

function undoToolState() {

  if (
    typeof history === 'undefined' ||
    !history.length
  ) {

    return;
  }


  const current =
    toolStateSnapshot();


  if (
    typeof future !== 'undefined'
  ) {

    future.push(
      current
    );
  }


  const previous =
    history.pop();


  restoreToolState(
    previous
  );
}


/* =========================================================
   SAFE TOOL REDO
========================================================= */

function redoToolState() {

  if (
    typeof future === 'undefined' ||
    !future.length
  ) {

    return;
  }


  if (
    typeof history !== 'undefined'
  ) {

    history.push(
      toolStateSnapshot()
    );
  }


  const next =
    future.pop();


  restoreToolState(
    next
  );
}


/* =========================================================
   TOOL HISTORY HELPERS
========================================================= */

function beginToolEdit() {

  saveToolHistory();

}


function finishToolEdit() {

  render();

  updateCanvasTransform();

  if (
    typeof panel === 'function'
  ) {

    panel();
  }
}


/* =========================================================
   UNDO BUTTON
========================================================= */

const part9Undo =
  $('undo');


if (part9Undo) {

  part9Undo.onclick =
    function () {

      undoToolState();

    };
}


/* =========================================================
   REDO BUTTON
========================================================= */

const part9Redo =
  $('redo');


if (part9Redo) {

  part9Redo.onclick =
    function () {

      redoToolState();

    };
}


/* =========================================================
   KEYBOARD HISTORY
========================================================= */

document.addEventListener(
  'keydown',
  function (event) {

    const tag =
      event.target &&
      event.target.tagName
        ? event.target.tagName
            .toLowerCase()
        : '';


    /*
       Do not intercept normal typing
       inside inputs and textareas.
    */

    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select'
    ) {

      return;
    }


    if (
      (event.ctrlKey ||
       event.metaKey) &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'z'
    ) {

      event.preventDefault();

      undoToolState();

      return;
    }


    if (
      (event.ctrlKey ||
       event.metaKey) &&
      (
        event.key.toLowerCase() === 'y' ||
        (
          event.shiftKey &&
          event.key.toLowerCase() === 'z'
        )
      )
    ) {

      event.preventDefault();

      redoToolState();
    }

  }
);


/* =========================================================
   TEXT LAYER HISTORY
========================================================= */

function saveBeforeTextChange() {

  saveToolHistory();

}


function saveAfterTextChange() {

  finishToolEdit();

}


/* =========================================================
   DRAW HISTORY
========================================================= */

function saveBeforeDrawChange() {

  saveToolHistory();

}


function saveAfterDrawChange() {

  finishToolEdit();

}


/* =========================================================
   COLOR SELECT HISTORY
========================================================= */

function saveBeforeColorChange() {

  saveToolHistory();

}


function saveAfterColorChange() {

  finishToolEdit();

}


/* =========================================================
   LAYER HISTORY
========================================================= */

function saveBeforeLayerChange() {

  saveToolHistory();

}


function saveAfterLayerChange() {

  finishToolEdit();

}


/* =========================================================
   SAFE RESET
========================================================= */

function resetToolLayers() {

  saveToolHistory();


  if (
    typeof textLayers !== 'undefined' &&
    Array.isArray(textLayers)
  ) {

    textLayers.length = 0;
  }


  if (
    typeof drawLayers !== 'undefined' &&
    Array.isArray(drawLayers)
  ) {

    drawLayers.length = 0;
  }


  if (
    typeof selectedTextId !== 'undefined'
  ) {

    selectedTextId = null;
  }


  if (
    typeof retouch !== 'undefined' &&
    Array.isArray(retouch)
  ) {

    retouch.length = 0;
  }


  finishToolEdit();
}


/* =========================================================
   PREVENT ACCIDENTAL STATE LOSS
========================================================= */

window.addEventListener(
  'beforeunload',
  function () {

    /*
       Keep editor state in memory only.
       No personal image is uploaded.
    */

    try {

      window.__tooloraEditorState =
        toolStateSnapshot();

    } catch (error) {

      console.warn(
        'Toolora state preservation skipped.',
        error
      );

    }
  }
);


/* =========================================================
   PART 9 READY
========================================================= */

console.log(
  'Toolora Part 9 loaded successfully.'
);
/* =========================================================
   PART 10
   CROP + GEOMETRY SAFETY
========================================================= */

function applyGeometryState() {

  if (!img) {
    return;
  }

  render();

  updateCanvasTransform();
}


/* =========================================================
   ROTATE LEFT
========================================================= */

const part10RotateLeft =
  $('rl');

if (part10RotateLeft) {

  part10RotateLeft.onclick =
    function () {

      saveToolHistory();

      S.rotate =
        (Number(S.rotate || 0) - 90 + 360) % 360;

      finishToolEdit();
    };
}


/* =========================================================
   ROTATE RIGHT
========================================================= */

const part10RotateRight =
  $('rr');

if (part10RotateRight) {

  part10RotateRight.onclick =
    function () {

      saveToolHistory();

      S.rotate =
        (Number(S.rotate || 0) + 90) % 360;

      finishToolEdit();
    };
}


/* =========================================================
   FLIP HORIZONTAL
========================================================= */

const part10FlipX =
  $('fx');

if (part10FlipX) {

  part10FlipX.onclick =
    function () {

      saveToolHistory();

      S.flipX =
        !Boolean(S.flipX);

      finishToolEdit();
    };
}


/* =========================================================
   FLIP VERTICAL
========================================================= */

const part10FlipY =
  $('fy');

if (part10FlipY) {

  part10FlipY.onclick =
    function () {

      saveToolHistory();

      S.flipY =
        !Boolean(S.flipY);

      finishToolEdit();
    };
}


/* =========================================================
   ASPECT RATIO
========================================================= */

function updateCropRatio(value) {

  if (!value) {
    value = 'original';
  }

  saveToolHistory();

  S.ratio =
    value;

  finishToolEdit();
}


/* =========================================================
   RATIO CONTROL
========================================================= */

function bindCropRatio() {

  const ratio =
    $('ratio');

  if (!ratio) {
    return;
  }

  ratio.value =
    S.ratio || 'original';


  ratio.onchange =
    function () {

      updateCropRatio(
        ratio.value
      );

    };
}


/* =========================================================
   STRAIGHTEN
========================================================= */

function bindStraighten() {

  const input =
    $('straighten');

  if (!input) {
    return;
  }


  input.value =
    Number(
      S.straighten || 0
    );


  input.oninput =
    function () {

      S.straighten =
        Number(
          input.value
        ) || 0;

      schedule();

    };


  input.onchange =
    function () {

      saveToolHistory();

      S.straighten =
        Number(
          input.value
        ) || 0;

      finishToolEdit();

    };
}


/* =========================================================
   CROP PANEL REBIND
========================================================= */

const part10OriginalPanel =
  typeof panel === 'function'
    ? panel
    : null;


function refreshCropControls() {

  bindCropRatio();

  bindStraighten();
}


/*
   The panel can be rebuilt whenever
   the active tool changes.
*/

if (part10OriginalPanel) {

  const part10PanelReference =
    panel;

  panel =
    function () {

      part10PanelReference();

      if (active === 'crop') {

        refreshCropControls();

      }

    };
}


/* =========================================================
   CROP STATUS
========================================================= */

function getCropDescription() {

  const ratio =
    S.ratio || 'original';

  const rotation =
    Number(
      S.rotate || 0
    );

  const straighten =
    Number(
      S.straighten || 0
    );


  return {
    ratio,
    rotation,
    straighten,
    flipX:
      Boolean(S.flipX),
    flipY:
      Boolean(S.flipY)
  };
}


/* =========================================================
   SAFE GEOMETRY RESET
========================================================= */

function resetGeometryOnly() {

  saveToolHistory();

  S.ratio =
    'original';

  S.rotate =
    0;

  S.straighten =
    0;

  S.flipX =
    false;

  S.flipY =
    false;


  finishToolEdit();
}


/* =========================================================
   CROP TOOL KEYBOARD SHORTCUTS
========================================================= */

document.addEventListener(
  'keydown',
  function (event) {

    const tag =
      event.target &&
      event.target.tagName
        ? event.target.tagName.toLowerCase()
        : '';


    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select'
    ) {

      return;
    }


    if (
      active !== 'crop'
    ) {

      return;
    }


    if (
      event.key === '['
    ) {

      event.preventDefault();

      saveToolHistory();

      S.rotate =
        (
          Number(S.rotate || 0) -
          90 +
          360
        ) % 360;

      finishToolEdit();

      return;
    }


    if (
      event.key === ']'
    ) {

      event.preventDefault();

      saveToolHistory();

      S.rotate =
        (
          Number(S.rotate || 0) +
          90
        ) % 360;

      finishToolEdit();

      return;
    }


    if (
      event.key.toLowerCase() === 'h'
    ) {

      event.preventDefault();

      saveToolHistory();

      S.flipX =
        !Boolean(S.flipX);

      finishToolEdit();

      return;
    }


    if (
      event.key.toLowerCase() === 'v'
    ) {

      event.preventDefault();

      saveToolHistory();

      S.flipY =
        !Boolean(S.flipY);

      finishToolEdit();
    }

  }
);


/* =========================================================
   PART 10 INITIALIZATION
========================================================= */

if (
  typeof active !== 'undefined' &&
  active === 'crop'
) {

  refreshCropControls();

}


console.log(
  'Toolora Part 10 loaded successfully.'
);
/* =========================================================
   PART 11
   CROP PREVIEW OVERLAY
========================================================= */


/*
   The actual crop is already performed by the
   existing render pipeline.

   This section adds a visual crop guide only.
   It does not replace the existing crop engine.
*/


let cropGuideEnabled = false;


/* =========================================================
   CREATE CROP GUIDE
========================================================= */

function drawCropGuide() {

  if (
    active !== 'crop' ||
    !img ||
    !cropGuideEnabled
  ) {
    return;
  }


  if (
    typeof ox === 'undefined'
  ) {
    return;
  }


  const width =
    O.width;

  const height =
    O.height;


  if (
    width <= 0 ||
    height <= 0
  ) {
    return;
  }


  ox.save();


  /*
     Darken the outside area.
  */

  ox.fillStyle =
    'rgba(0, 0, 0, 0.48)';

  ox.fillRect(
    0,
    0,
    width,
    height
  );


  let cropWidth =
    width;

  let cropHeight =
    height;


  const ratio =
    S.ratio ||
    'original';


  if (
    ratio !== 'original'
  ) {

    const parts =
      ratio
        .split(':')
        .map(Number);


    if (
      parts.length === 2 &&
      parts[0] > 0 &&
      parts[1] > 0
    ) {

      const target =
        parts[0] /
        parts[1];


      const current =
        width /
        height;


      if (
        current > target
      ) {

        cropHeight =
          height;

        cropWidth =
          height *
          target;

      } else {

        cropWidth =
          width;

        cropHeight =
          width /
          target;
      }
    }
  }


  const x =
    (width -
      cropWidth) /
    2;


  const y =
    (height -
      cropHeight) /
    2;


  /*
     Clear the actual crop area.
  */

  ox.clearRect(
    x,
    y,
    cropWidth,
    cropHeight
  );


  /*
     Border.
  */

  ox.strokeStyle =
    'rgba(255,255,255,0.95)';

  ox.lineWidth =
    Math.max(
      1,
      Math.min(
        width,
        height
      ) / 500
    );


  ox.strokeRect(
    x,
    y,
    cropWidth,
    cropHeight
  );


  /*
     Rule-of-thirds grid.
  */

  ox.strokeStyle =
    'rgba(255,255,255,0.38)';

  ox.lineWidth =
    1;


  const thirdX =
    cropWidth / 3;

  const thirdY =
    cropHeight / 3;


  for (
    let i = 1;
    i < 3;
    i++
  ) {

    ox.beginPath();

    ox.moveTo(
      x + thirdX * i,
      y
    );

    ox.lineTo(
      x + thirdX * i,
      y + cropHeight
    );

    ox.stroke();


    ox.beginPath();

    ox.moveTo(
      x,
      y + thirdY * i
    );

    ox.lineTo(
      x + cropWidth,
      y + thirdY * i
    );

    ox.stroke();
  }


  /*
     Corner handles.
  */

  const handle =
    Math.max(
      10,
      Math.min(
        width,
        height
      ) / 35
    );


  ox.strokeStyle =
    '#ffffff';

  ox.lineWidth =
    Math.max(
      2,
      handle / 5
    );


  const corners = [

    [x, y, 1, 1],

    [
      x + cropWidth,
      y,
      -1,
      1
    ],

    [
      x,
      y + cropHeight,
      1,
      -1
    ],

    [
      x + cropWidth,
      y + cropHeight,
      -1,
      -1
    ]

  ];


  corners.forEach(
    corner => {

      const cx =
        corner[0];

      const cy =
        corner[1];

      const dx =
        corner[2];

      const dy =
        corner[3];


      ox.beginPath();

      ox.moveTo(
        cx,
        cy
      );

      ox.lineTo(
        cx + handle * dx,
        cy
      );

      ox.moveTo(
        cx,
        cy
      );

      ox.lineTo(
        cx,
        cy + handle * dy
      );

      ox.stroke();

    }
  );


  ox.restore();
}


/* =========================================================
   CROP GUIDE STATE
========================================================= */

function updateCropGuide() {

  cropGuideEnabled =
    active === 'crop';


  if (
    typeof showOverlay ===
    'function'
  ) {

    showOverlay();

  }


  drawCropGuide();
}


/* =========================================================
   EXTEND OVERLAY RENDERING
========================================================= */

const part11OriginalShowOverlay =
  typeof showOverlay === 'function'
    ? showOverlay
    : null;


if (
  part11OriginalShowOverlay
) {

  showOverlay =
    function () {

      part11OriginalShowOverlay();


      if (
        active === 'crop'
      ) {

        cropGuideEnabled =
          true;

        drawCropGuide();

      }

    };
}


/* =========================================================
   CROP TAB REFRESH
========================================================= */

const part11OriginalPanel =
  typeof panel === 'function'
    ? panel
    : null;


if (
  part11OriginalPanel
) {

  const part11Panel =
    panel;


  panel =
    function () {

      part11Panel();


      if (
        active === 'crop'
      ) {

        updateCropGuide();

      }

    };
}


/* =========================================================
   REMOVE GUIDE WHEN LEAVING CROP
========================================================= */

document.addEventListener(
  'click',
  function (event) {

    const button =
      event.target.closest(
        '#tabs button[data-tool]'
      );


    if (!button) {
      return;
    }


    setTimeout(
      function () {

        if (
          active !== 'crop'
        ) {

          cropGuideEnabled =
            false;


          if (
            typeof showOverlay ===
            'function'
          ) {

            showOverlay();

          }

        }

      },
      0
    );

  }
);


/* =========================================================
   CROP GUIDE TOGGLE
========================================================= */

function toggleCropGuide() {

  if (
    active !== 'crop'
  ) {
    return;
  }


  cropGuideEnabled =
    !cropGuideEnabled;


  if (
    typeof showOverlay ===
    'function'
  ) {

    showOverlay();

  }


  drawCropGuide();
}


/* =========================================================
   CROP GUIDE KEY
========================================================= */

document.addEventListener(
  'keydown',
  function (event) {

    const tag =
      event.target &&
      event.target.tagName
        ? event.target.tagName.toLowerCase()
        : '';


    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select'
    ) {
      return;
    }


    if (
      active === 'crop' &&
      event.key.toLowerCase() === 'g'
    ) {

      event.preventDefault();

      toggleCropGuide();

    }

  }
);


/* =========================================================
   PART 11 INITIALIZATION
========================================================= */

if (
  active === 'crop'
) {

  cropGuideEnabled =
    true;

  updateCropGuide();

}


console.log(
  'Toolora Part 11 loaded successfully.'
);
