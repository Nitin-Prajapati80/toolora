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
let zoom = 1;
let active = 'light';
let showBefore = false;

let history = [];
let future = [];

let retouch = [];

let pickMode = false;
let drawingTool = false;
let draggingText = null;
let dragDX = 0;
let dragDY = 0;

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

  /* TEXT */
  textSize: 48,
  textOpacity: 100,

  /* DRAW */
  drawSize: 8,
  drawOpacity: 100,

  /* COLOR SELECT */
  selectiveR: 0,
  selectiveG: 0,
  selectiveB: 0,
  selectiveRange: 35,
  selectiveHue: 0,
  selectiveSat: 0,
  selectiveLight: 0,

  /* OVERLAY LAYERS */
  textLayers: [],
  drawLayers: [],
  selectedTextId: null
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
  export: ['Output', 'Export'],

  /* FIXED TOOLS */
  text: ['Overlay', 'Text'],
  draw: ['Overlay', 'Draw'],
  selective: ['Color', 'Color Select'],
  layers: ['Manage', 'Layers']
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
    Number.isInteger(value)
      ? value
      : value.toFixed(1)
  }`;
}

function control(key, label, min, max, step = 1) {
  return `
    <div class="control">
      <div class="ch">
        <span>${label}</span>
        <span class="val" id="v_${key}">
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
========================================================= */

function panel() {

  const p = $('panel');

  $('eyebrow').textContent =
    names[active][0];

  $('title').textContent =
    names[active][1];

  let h = '';


  /* =======================================================
     EXISTING LIGHT
  ======================================================= */

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

        <button
          class="btn"
          id="auto"
          style="width:100%"
        >
          Auto Tone
        </button>

      </div>
    `;
  }


  /* =======================================================
     EXISTING COLOR
  ======================================================= */

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

      </div>
    `;
  }


  /* =======================================================
     EXISTING EFFECTS
  ======================================================= */

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


  /* =======================================================
     EXISTING DETAIL
  ======================================================= */

  if (active === 'detail') {

    h = `
      <div class="section">

        <h3>Detail</h3>

        ${control('sharp', 'Sharpening', 0, 100)}
        ${control('radius', 'Radius', .5, 3, .1)}
        ${control('noise', 'Noise Reduction', 0, 100)}
        ${control('colorNoise', 'Color Noise', 0, 100)}

      </div>
    `;
  }


  /* =======================================================
     EXISTING CROP
  ======================================================= */

  if (active === 'crop') {

    h = `
      <div class="section">

        <h3>Crop & Geometry</h3>

        <div class="cropbox">
          Centered crop preview
        </div>

        <select class="select" id="ratio">

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
          .1
        )}

        <div class="grid2">

          <button class="btn" id="rl">
            Rotate Left
          </button>

          <button class="btn" id="rr">
            Rotate Right
          </button>

          <button class="btn" id="fx">
            Flip Horizontal
          </button>

          <button class="btn" id="fy">
            Flip Vertical
          </button>

        </div>

      </div>
    `;
  }


  /* =======================================================
     EXISTING PRESETS
  ======================================================= */

  if (active === 'presets') {

    h = `
      <div class="section">

        <h3>Toolora Presets</h3>

        <div class="presets">

          <button class="preset" data-preset="clean">
            <b>Clean</b>
            <small>Balanced</small>
          </button>

          <button class="preset" data-preset="warm">
            <b>Warm</b>
            <small>Soft warm</small>
          </button>

          <button class="preset" data-preset="cool">
            <b>Cool</b>
            <small>Clean cool</small>
          </button>

          <button class="preset" data-preset="cinematic">
            <b>Cinematic</b>
            <small>Moody</small>
          </button>

          <button class="preset" data-preset="matte">
            <b>Matte</b>
            <small>Soft film</small>
          </button>

          <button class="preset" data-preset="vivid">
            <b>Vivid</b>
            <small>Color punch</small>
          </button>

          <button class="preset" data-preset="portrait">
            <b>Portrait</b>
            <small>Soft portrait</small>
          </button>

          <button class="preset" data-preset="bw">
            <b>B&W</b>
            <small>Monochrome</small>
          </button>

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
     TEXT — FIXED
  ======================================================= */

  if (active === 'text') {

    h = `
      <div class="section">

        <h3>Text</h3>

        <div class="control">

          <div class="ch">
            <span>Text</span>
          </div>

          <textarea
            id="textValue"
            class="select"
            rows="3"
            placeholder="Enter text"
          ></textarea>

        </div>


        <div class="control">

          <div class="ch">
            <span>Font</span>
          </div>

          <select
            id="textFont"
            class="select"
          >

            <option>Arial</option>
            <option>Georgia</option>
            <option>Verdana</option>
            <option>Trebuchet MS</option>
            <option>Courier New</option>
            <option>Impact</option>
            <option>Times New Roman</option>
            <option>Tahoma</option>
            <option>Palatino Linotype</option>

          </select>

        </div>


        ${control(
          'textSize',
          'Font Size',
          10,
          200
        )}


        <div class="grid2">

          <button
            class="btn"
            id="textBold"
          >
            Bold
          </button>

          <button
            class="btn"
            id="textItalic"
          >
            Italic
          </button>

          <button
            class="btn"
            id="textLeft"
          >
            Left
          </button>

          <button
            class="btn"
            id="textCenter"
          >
            Center
          </button>

        </div>


        <div class="grid2">

          <label class="colorhead">
            Text Color

            <input
              id="textColor"
              type="color"
              value="#ffffff"
              style="width:100%;height:36px"
            >

          </label>


          <label class="colorhead">
            Stroke Color

            <input
              id="textStroke"
              type="color"
              value="#000000"
              style="width:100%;height:36px"
            >

          </label>

        </div>


        ${control(
          'textOpacity',
          'Opacity',
          0,
          100
        )}


        <div class="grid2">

          <button
            class="btn"
            id="addText"
          >
            Add Text
          </button>

          <button
            class="btn danger"
            id="deleteText"
          >
            Delete
          </button>

        </div>


        <button
          class="btn"
          id="clearText"
          style="width:100%"
        >
          Clear Text
        </button>

      </div>
    `;
  }


  /* =======================================================
     DRAW — FIXED
  ======================================================= */

  if (active === 'draw') {

    h = `
      <div class="section">

        <h3>Draw</h3>

        ${control(
          'drawSize',
          'Brush Size',
          1,
          100
        )}

        ${control(
          'drawOpacity',
          'Opacity',
          0,
          100
        )}


        <label class="colorhead">

          Brush Color

          <input
            id="drawColor"
            type="color"
            value="#ffffff"
            style="width:100%;height:36px"
          >

        </label>


        <div class="grid2">

          <button
            class="btn"
            id="clearDraw"
          >
            Clear Drawing
          </button>

          <button
            class="btn"
            id="undoDraw"
          >
            Remove Last
          </button>

        </div>

      </div>
    `;
  }


  /* =======================================================
     COLOR SELECT — FIXED
  ======================================================= */

  if (active === 'selective') {

    h = `
      <div class="section">

        <h3>Color Select</h3>

        <button
          class="btn"
          id="pickColor"
          style="width:100%"
        >
          Pick Color From Photo
        </button>


        <div
          id="pickedColor"
          class="colorhead"
          style="margin-top:10px"
        >
          No color selected
        </div>


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
          id="clearColorSelect"
          style="width:100%"
        >
          Clear Color Selection
        </button>

      </div>
    `;
  }


  /* =======================================================
     LAYERS — FIXED
  ======================================================= */

  if (active === 'layers') {

    h = `
      <div class="section">

        <h3>Layers</h3>

        <div id="layerList"></div>


        <button
          class="btn"
          id="clearLayers"
          style="width:100%;margin-top:8px"
        >
          Clear All Layers
        </button>

      </div>
    `;
  }


  /* =======================================================
     EXISTING EXPORT
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
          >
            Download Edited Photo
          </button>

        </div>

      </div>


      <button
        class="btn danger"
        id="resetAll"
        style="width:100%"
      >
        Reset All Edits
      </button>
    `;
  }


  p.innerHTML = h;

  bind();
  panelActions();

  bindOverlayTools();

  if (active === 'layers') {
    renderLayerList();
  }
}


/* =========================================================
   FIXED TOOL CONTROLS
========================================================= */

function bindOverlayTools() {

  /* TEXT */

  if (active === 'text') {

    const applyTextSettings = () => {

      const text = S.textLayers.find(
        item => item.id === S.selectedTextId
      );

      if (!text) return;

      text.text =
        $('textValue').value;

      text.font =
        $('textFont').value;

      text.size =
        Number($('textSize').value);

      text.opacity =
        Number($('textOpacity').value);

      text.color =
        $('textColor').value;

      text.stroke =
        $('textStroke').value;

      text.bold =
        $('textBold').classList.contains('active');

      text.italic =
        $('textItalic').classList.contains('active');

      text.align =
        $('textCenter').classList.contains('active')
          ? 'center'
          : 'left';

      showOverlay();
    };


    $('addText').onclick = () => {

      push();

      const text = {

        id:
          Date.now() +
          Math.random(),

        text: 'Text',

        x: .5,
        y: .5,

        font: 'Arial',

        size: 48,

        opacity: 100,

        color: '#ffffff',

        stroke: '#000000',

        bold: false,

        italic: false,

        align: 'center'
      };


      S.textLayers.push(text);

      S.selectedTextId =
        text.id;

      panel();
      render();
    };


    $('deleteText').onclick = () => {

      if (
        S.selectedTextId === null
      ) {
        return;
      }

      push();

      S.textLayers =
        S.textLayers.filter(
          item =>
            item.id !==
            S.selectedTextId
        );

      S.selectedTextId =
        null;

      panel();
      render();
    };


    $('clearText').onclick = () => {

      if (!S.textLayers.length) {
        return;
      }

      push();

      S.textLayers = [];

      S.selectedTextId =
        null;

      panel();
      render();
    };


    [
      'textValue',
      'textFont',
      'textSize',
      'textOpacity',
      'textColor',
      'textStroke'
    ].forEach(id => {

      $(id)?.addEventListener(
        'input',
        applyTextSettings
      );

    });


    [
      'textBold',
      'textItalic',
      'textLeft',
      'textCenter'
    ].forEach(id => {

      $(id)?.addEventListener(
        'click',
        e => {

          e.currentTarget.classList.toggle(
            'active'
          );


          if (
            id === 'textLeft' &&
            e.currentTarget.classList.contains('active')
          ) {
            $('textCenter')
              .classList
              .remove('active');
          }


          if (
            id === 'textCenter' &&
            e.currentTarget.classList.contains('active')
          ) {
            $('textLeft')
              .classList
              .remove('active');
          }


          applyTextSettings();
        }
      );

    });


    const selected =
      S.textLayers.find(
        item =>
          item.id ===
          S.selectedTextId
      );


    if (selected) {

      $('textValue').value =
        selected.text;

      $('textFont').value =
        selected.font;

      $('textSize').value =
        selected.size;

      $('textOpacity').value =
        selected.opacity;

      $('textColor').value =
        selected.color;

      $('textStroke').value =
        selected.stroke;

      $('textBold')
        .classList
        .toggle(
          'active',
          selected.bold
        );

      $('textItalic')
        .classList
        .toggle(
          'active',
          selected.italic
        );

      $('textCenter')
        .classList
        .toggle(
          'active',
          selected.align === 'center'
        );

      $('textLeft')
        .classList
        .toggle(
          'active',
          selected.align !== 'center'
        );
    }
  }


  /* DRAW */

  if (active === 'draw') {

    $('clearDraw').onclick = () => {

      if (!S.drawLayers.length) {
        return;
      }

      push();

      S.drawLayers = [];

      render();
    };


    $('undoDraw').onclick = () => {

      if (!S.drawLayers.length) {
        return;
      }

      push();

      S.drawLayers.pop();

      render();
    };
  }


  /* COLOR SELECT */

  if (active === 'selective') {

    $('pickColor').onclick = () => {

      if (!img) {

        alert(
          'Please open a photo first.'
        );

        return;
      }

      $('status').textContent =
        'Click a color in the photo';

      pickMode = true;

      $('pickerBadge').style.display =
        'block';
    };


    $('clearColorSelect').onclick = () => {

      push();

      S.selectiveR = 0;
      S.selectiveG = 0;
      S.selectiveB = 0;

      S.selectiveHue = 0;
      S.selectiveSat = 0;
      S.selectiveLight = 0;

      S.selectiveRange = 35;

      pickMode = false;

      $('pickerBadge').style.display =
        'none';

      schedule();
    };
  }


  /* LAYERS */

  if (active === 'layers') {

    $('clearLayers').onclick = () => {

      if (
        !S.textLayers.length &&
        !S.drawLayers.length
      ) {
        return;
      }

      push();

      S.textLayers = [];
      S.drawLayers = [];

      S.selectedTextId =
        null;

      renderLayerList();
      render();
    };
  }
}


/* =========================================================
   LAYER LIST
========================================================= */

function renderLayerList() {

  const list =
    $('layerList');

  if (!list) return;

  list.innerHTML = '';


  if (
    !S.textLayers.length &&
    !S.drawLayers.length
  ) {

    list.innerHTML =
      '<p class="note">No layers yet.</p>';

    return;
  }


  S.textLayers
    .slice()
    .reverse()
    .forEach(text => {

      const button =
        document.createElement('button');

      button.className =
        'btn';

      button.style.width =
        '100%';

      button.style.marginBottom =
        '6px';

      button.textContent =
        `Text: ${text.text || 'Text'}`;


      button.onclick = () => {

        S.selectedTextId =
          text.id;

        active = 'text';

        document
          .querySelectorAll('#tabs button')
          .forEach(item => {

            item.classList.toggle(
              'active',
              item.dataset.tool === 'text'
            );

          });

        panel();
      };


      list.appendChild(button);
    });


  S.drawLayers
    .slice()
    .reverse()
    .forEach((draw, index) => {

      const button =
        document.createElement('button');

      button.className =
        'btn';

      button.style.width =
        '100%';

      button.style.marginBottom =
        '6px';

      button.textContent =
        `Drawing ${S.drawLayers.length - index}`;

      list.appendChild(button);
    });
}


/* =========================================================
   PANEL ACTIONS
========================================================= */

function panelActions() {

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


  $('ratio')?.addEventListener(
    'change',
    e => {

      push();

      S.ratio =
        e.target.value;

      schedule();
    }
  );


  $('rl')?.addEventListener(
    'click',
    () => {

      push();

      S.rotate =
        (S.rotate + 270) % 360;

      schedule();
    }
  );


  $('rr')?.addEventListener(
    'click',
    () => {

      push();

      S.rotate =
        (S.rotate + 90) % 360;

      schedule();
    }
  );


  $('fx')?.addEventListener(
    'click',
    () => {

      push();

      S.flipX =
        !S.flipX;

      schedule();
    }
  );


  $('fy')?.addEventListener(
    'click',
    () => {

      push();

      S.flipY =
        !S.flipY;

      schedule();
    }
  );


  document
    .querySelectorAll('[data-preset]')
    .forEach(button => {

      button.onclick = () =>
        preset(
          button.dataset.preset
        );

    });


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


  document
    .querySelectorAll('.mask')
    .forEach(button => {

      button.onclick = () => {

        S.maskType =
          button.dataset.type;

        document
          .querySelectorAll('.mask')
          .forEach(item =>
            item.classList.remove('active')
          );

        button.classList.add('active');

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


  $('retouchClear')?.addEventListener(
    'click',
    () => {

      push();

      retouch = [];

      render();
    }
  );


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
          image.naturalWidth *
          scale
        )
      );


    src.height =
      Math.max(
        1,
        Math.round(
          image.naturalHeight *
          scale
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

    resetState(false);

    zoom = 1;

    render();

    $('status').textContent =
      'Ready';
  };


  image.onerror = () => {

    URL.revokeObjectURL(url);

    $('status').textContent =
      'Ready';

    alert(
      'The selected image could not be opened. Please try another image.'
    );
  };


  image.src = url;
}


const fileInput =
  $('fileInput');


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
      e.target.files &&
      e.target.files[0]
    );

    e.target.value = '';
  }
);


/* =========================================================
   RESET
========================================================= */

function resetState() {

  for (
    const key of Object.keys(S)
  ) {

    if (Array.isArray(S[key])) {

      S[key] = [];

    } else if (
      key === 'selectedTextId'
    ) {

      S[key] = null;

    } else if (
      key.startsWith('h_') ||
      key.startsWith('s_') ||
      key.startsWith('l_')
    ) {

      S[key] = 0;

    } else if (
      typeof S[key] === 'boolean'
    ) {

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

    } else if (key === 'grainRough') {

      S[key] = 50;

    } else if (
      key === 'selectiveRange'
    ) {

      S[key] = 35;

    } else if (
      key === 'drawOpacity' ||
      key === 'textOpacity'
    ) {

      S[key] = 100;

    } else if (key === 'drawSize') {

      S[key] = 8;

    } else if (key === 'textSize') {

      S[key] = 48;

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

  if (renderQueued) {
    return;
  }

  renderQueued = true;

  requestAnimationFrame(
    () => {

      renderQueued = false;

      render();
    }
  );
}


/* =========================================================
   PROFILE
========================================================= */

function getProfileValues() {

  const p = {
    ...S
  };


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

  const max =
    Math.max(r, g, b);

  const min =
    Math.min(r, g, b);

  const d =
    max - min;

  let h = 0;

  const s =
    max
      ? d / max
      : 0;


  if (d) {

    if (max === r) {

      h =
        (
          (g - b) / d +
          (g < b ? 6 : 0)
        ) / 6;

    } else if (max === g) {

      h =
        (
          (b - r) / d +
          2
        ) / 6;

    } else {

      h =
        (
          (r - g) / d +
          4
        ) / 6;
    }
  }


  return [
    h,
    s,
    max
  ];
}


function hsv(h, s, v) {

  let i =
    Math.floor(h * 6);

  const f =
    h * 6 - i;

  const p =
    v * (1 - s);

  const q =
    v * (1 - f * s);

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

  if (
    h < .04 ||
    h > .96
  ) return 'red';

  if (h < .11)
    return 'orange';

  if (h < .19)
    return 'yellow';

  if (h < .43)
    return 'green';

  if (h < .53)
    return 'aqua';

  if (h < .70)
    return 'blue';

  if (h < .85)
    return 'purple';

  return 'magenta';
}


/* =========================================================
   PIXEL PROCESSING
========================================================= */

function applyPixel(
  imageData,
  w,
  h
) {

  const d =
    imageData.data;

  const p =
    getProfileValues();


  const exposure =
    Math.pow(
      2,
      p.exposure / 50
    );


  const contrast =
    (100 + p.contrast) / 100;


  const saturation =
    (100 + p.saturation) / 100;


  const vibrance =
    p.vibrance / 100;


  for (
    let i = 0;
    i < d.length;
    i += 4
  ) {

    let r =
      d[i] / 255;

    let g =
      d[i + 1] / 255;

    let b =
      d[i + 2] / 255;


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

      r +=
        hi * (r - .5);

      g +=
        hi * (g - .5);

      b +=
        hi * (b - .5);

    } else {

      r +=
        sh * (.5 - r);

      g +=
        sh * (.5 - g);

      b +=
        sh * (.5 - b);
    }


    const whiteBlack =
      p.whites / 255 +
      p.blacks / 255;


    r += whiteBlack;
    g += whiteBlack;
    b += whiteBlack;


    r =
      (r - .5) *
      contrast +
      .5;

    g =
      (g - .5) *
      contrast +
      .5;

    b =
      (b - .5) *
      contrast +
      .5;


    r +=
      p.temp * .0009;

    b -=
      p.temp * .0009;

    g +=
      p.tint * .00045;


    const gray =
      .299 * r +
      .587 * g +
      .114 * b;


    const boost =
      1 +
      vibrance *
      (
        1 -
        Math.abs(
          2 * lum - 1
        )
      ) *
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


    const effect =
      (
        p.texture +
        p.clarity
      ) / 900;

    const average =
      (r + g + b) / 3;


    r +=
      (r - average) *
      effect;

    g +=
      (g - average) *
      effect;

    b +=
      (b - average) *
      effect;


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


    const safeR =
      clamp(r, 0, 1);

    const safeG =
      clamp(g, 0, 1);

    const safeB =
      clamp(b, 0, 1);


    let [
      hh,
      ss,
      vv
    ] =
      rgbh(
        safeR,
        safeG,
        safeB
      );


    const colorBand =
      band(hh);


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

      [
        r,
        g,
        b
      ] =
        hsv(
          (
            hh +
            hueShift / 360 +
            1
          ) % 1,

          clamp(
            ss *
            (
              1 +
              satShift / 100
            ),
            0,
            1
          ),

          clamp(
            vv *
            (
              1 +
              lumShift / 100
            ),
            0,
            1
          )
        );
    }


    /* =====================================================
       COLOR SELECT
    ===================================================== */

    if (
      S.selectiveR ||
      S.selectiveG ||
      S.selectiveB
    ) {

      const sr =
        S.selectiveR / 255;

      const sg =
        S.selectiveG / 255;

      const sb =
        S.selectiveB / 255;


      const distance =
        Math.sqrt(
          (r - sr) ** 2 +
          (g - sg) ** 2 +
          (b - sb) ** 2
        );


      const radius =
        Math.max(
          .01,
          S.selectiveRange /
          100 *
          .9
        );


      const mask =
        clamp(
          1 -
          distance / radius,
          0,
          1
        );


      if (mask > 0) {

        let [
          currentHue,
          currentSat,
          currentValue
        ] =
          rgbh(
            clamp(r, 0, 1),
            clamp(g, 0, 1),
            clamp(b, 0, 1)
          );


        const targetHue =
          (
            currentHue +
            mask *
            S.selectiveHue /
            200 +
            1
          ) % 1;


        const targetSat =
          clamp(
            currentSat *
            (
              1 +
              mask *
              S.selectiveSat /
              100
            ),
            0,
            1
          );


        const targetValue =
          clamp(
            currentValue *
            (
              1 +
              mask *
              S.selectiveLight /
              100
            ),
            0,
            1
          );


        const changed =
          hsv(
            targetHue,
            targetSat,
            targetValue
          );


        r =
          r *
          (1 - mask) +
          changed[0] *
          mask;

        g =
          g *
          (1 - mask) +
          changed[1] *
          mask;

        b =
          b *
          (1 - mask) +
          changed[2] *
          mask;
      }
    }


    const gradeLum =
      .2126 * r +
      .7152 * g +
      .0722 * b;


    const gradeHue =
      gradeLum < .35
        ? S.gradeShadow
        : gradeLum > .65
          ? S.gradeHigh
          : S.gradeMid;


    const gradeSat =
      gradeLum < .35
        ? S.gradeShadowSat
        : gradeLum > .65
          ? S.gradeHighSat
          : S.gradeMidSat;


    if (gradeSat) {

      const gradeColor =
        hsv(
          gradeHue / 360,
          gradeSat / 100,
          Math.max(
            .25,
            gradeLum
          )
        );


      const blend =
        (
          S.gradeBlend / 100
        ) * .35;


      r =
        r *
        (1 - blend) +
        gradeColor[0] *
        blend;

      g =
        g *
        (1 - blend) +
        gradeColor[1] *
        blend;

      b =
        b *
        (1 - blend) +
        gradeColor[2] *
        blend;
    }


    const px =
      (i / 4 % w) /
      w -
      .5;

    const py =
      Math.floor(
        i / 4 / w
      ) /
      h -
      .5;


    const distance =
      Math.sqrt(
        px * px +
        py * py
      ) *
      1.414;


    if (p.vignette) {

      const start =
        p.midpoint /
        100 *
        .65;

      const softness =
        Math.max(
          .05,
          p.feather /
          100
        );


      const edge =
        clamp(
          (
            distance -
            start
          ) /
          softness,
          0,
          1
        );


      const factor =
        1 -
        p.vignette /
        100 *
        edge *
        edge;


      r *= factor;
      g *= factor;
      b *= factor;
    }


    if (p.maskAmount) {

      let mask = 0;


      if (
        p.maskType ===
        'radial'
      ) {

        mask =
          1 -
          clamp(
            Math.sqrt(
              px * px +
              py * py
            ) * 2.1,
            0,
            1
          );

      } else if (
        p.maskType ===
        'linear'
      ) {

        mask =
          clamp(
            1 -
            Math.abs(py) * 2,
            0,
            1
          );

      } else {

        mask = 1;
      }


      mask *=
        p.maskAmount / 100;


      const local =
        p.maskExposure /
        250 *
        mask;


      r += local;
      g += local;
      b += local;


      const localContrast =
        1 +
        mask *
        p.maskContrast /
        100;


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
        p.maskSaturation /
        100;


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
      clamp(
        r * 255,
        0,
        255
      );

    d[i + 1] =
      clamp(
        g * 255,
        0,
        255
      );

    d[i + 2] =
      clamp(
        b * 255,
        0,
        255
      );

    d[i + 3] = 255;
  }


  return imageData;
}


/* =========================================================
   SHARPEN
========================================================= */

function sharpen(
  canvasContext,
  w,
  h,
  amount
) {

  if (amount < 1) {
    return;
  }


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


  const d =
    source.data;

  const q =
    output.data;


  q.set(d);


  const strength =
    amount /
    100 *
    .7;


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
        (
          y * w +
          x
        ) * 4;


      for (
        let channel = 0;
        channel < 3;
        channel++
      ) {

        q[i + channel] =
          clamp(
            d[i + channel] *
            (
              1 +
              4 *
              strength
            ) -

            strength *
            (
              d[
                i -
                4 +
                channel
              ] +

              d[
                i +
                4 +
                channel
              ] +

              d[
                i -
                w * 4 +
                channel
              ] +

              d[
                i +
                w * 4 +
                channel
              ]
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

function grain(
  canvasContext,
  w,
  h,
  amount
) {

  if (amount <= 0) {
    return;
  }


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
    amount /
    100 *
    28;


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
      strength;


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
   RETOUCH
========================================================= */

function retouchDraw(
  canvasContext,
  w,
  h
) {

  if (!retouch.length) {
    return;
  }


  for (
    const point of retouch
  ) {

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


    const temp =
      document.createElement(
        'canvas'
      );

    temp.width = w;
    temp.height = h;


    const tctx =
      temp.getContext('2d');

    tctx.filter =
      `blur(${Math.max(
        2,
        radius / 5
      )}px)`;


    tctx.drawImage(
      canvasContext.canvas,
      0,
      0
    );


    canvasContext.drawImage(
      temp,
      0,
      0
    );


    canvasContext.restore();
  }
}


/* =========================================================
   OVERLAY RENDER
========================================================= */

function showOverlay() {

  O.width =
    C.width;

  O.height =
    C.height;


  ox.clearRect(
    0,
    0,
    O.width,
    O.height
  );


  O.style.width =
    C.clientWidth +
    'px';

  O.style.height =
    C.clientHeight +
    'px';


  /* DRAW LAYERS */

  S.drawLayers.forEach(
    stroke => {

      if (
        stroke.points.length <
        2
      ) {
        return;
      }


      ox.save();

      ox.globalAlpha =
        stroke.opacity /
        100;

      ox.strokeStyle =
        stroke.color;

      ox.lineWidth =
        stroke.size;

      ox.lineCap =
        'round';

      ox.lineJoin =
        'round';


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


      ox.stroke();

      ox.restore();
    }
  );


  /* TEXT LAYERS */

  S.textLayers.forEach(
    text => {

      ox.save();


      ox.globalAlpha =
        text.opacity /
        100;


      ox.font =
        `${text.italic ? 'italic ' : ''}` +
        `${text.bold ? 'bold ' : ''}` +
        `${text.size}px ${text.font}`;


      ox.textAlign =
        text.align ||
        'center';

      ox.textBaseline =
        'middle';


      const x =
        text.x *
        C.width;

      const y =
        text.y *
        C.height;


      ox.lineWidth =
        Math.max(
          1,
          text.size *
          .08
        );


      ox.strokeStyle =
        text.stroke;

      ox.fillStyle =
        text.color;


      ox.strokeText(
        text.text,
        x,
        y
      );


      ox.fillText(
        text.text,
        x,
        y
      );


      /* selected text border */

      if (
        text.id ===
        S.selectedTextId &&
        active === 'text'
      ) {

        ox.strokeStyle =
          'rgba(255,255,255,.65)';

        ox.lineWidth = 1;


        const metrics =
          ox.measureText(
            text.text
          );


        ox.strokeRect(
          x -
          (
            text.align ===
            'center'
              ? metrics.width / 2
              : 0
          ) -
          8,

          y -
          text.size /
          2 -
          8,

          metrics.width +
          16,

          text.size +
          16
        );
      }


      ox.restore();
    }
  );
}


/* =========================================================
   IMAGE RENDER
========================================================= */

function render() {

  if (!img) {
    return;
  }


  $('status').textContent =
    'Rendering...';


  const angle =
    (
      S.rotate +
      S.straighten
    ) *
    Math.PI /
    180;


  const W =
    src.width;

  const H =
    src.height;


  const rotatedWidth =
    S.rotate % 180
      ? H
      : W;

  const rotatedHeight =
    S.rotate % 180
      ? W
      : H;


  const transformed =
    document.createElement(
      'canvas'
    );


  transformed.width =
    rotatedWidth;

  transformed.height =
    rotatedHeight;


  const tctx =
    transformed.getContext(
      '2d'
    );


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


  if (
    S.ratio !==
    'original'
  ) {

    const parts =
      S.ratio
        .split(':')
        .map(Number);


    const targetRatio =
      parts[0] /
      parts[1];


    const currentRatio =
      rotatedWidth /
      rotatedHeight;


    if (
      currentRatio >
      targetRatio
    ) {

      cropWidth =
        Math.round(
          rotatedHeight *
          targetRatio
        );

      cropX =
        (
          rotatedWidth -
          cropWidth
        ) / 2;

    } else {

      cropHeight =
        Math.round(
          rotatedWidth /
          targetRatio
        );

      cropY =
        (
          rotatedHeight -
          cropHeight
        ) / 2;
    }
  }


  const maxPreview =
    window.innerWidth < 700
      ? 720
      : 1100;


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
        cropWidth *
        scale
      )
    );


  const height =
    Math.max(
      1,
      Math.round(
        cropHeight *
        scale
      )
    );


  C.width =
    width;

  C.height =
    height;


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

    $('status').textContent =
      'Original';

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


  if (S.sharp > 0) {

    sharpen(
      ctx,
      width,
      height,
      S.sharp
    );
  }


  if (S.noise > 0) {

    ctx.filter =
      `blur(${S.noise / 50}px)`;

    const temp =
      document.createElement(
        'canvas'
      );

    temp.width =
      width;

    temp.height =
      height;

    temp
      .getContext('2d')
      .drawImage(
        C,
        0,
        0
      );

    ctx.filter =
      'none';

    ctx.drawImage(
      temp,
      0,
      0
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

    ctx.filter =
      `blur(${Math.min(
        10,
        S.blur / 10
      )}px)`;


    const temp =
      document.createElement(
        'canvas'
      );

    temp.width =
      width;

    temp.height =
      height;


    temp
      .getContext('2d')
      .drawImage(
        C,
        0,
        0
      );


    ctx.filter =
      'none';

    ctx.clearRect(
      0,
      0,
      width,
      height
    );


    ctx.drawImage(
      temp,
      0,
      0
    );
  }


  retouchDraw(
    ctx,
    width,
    height
  );


  showOverlay();


  C.style.transform =
    `scale(${zoom})`;

  O.style.transform =
    `scale(${zoom})`;


  $('status').textContent =
    'Ready';
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
    Number(
      $('size').value
    ) ||
    Math.max(
      src.width,
      src.height
    );


  const oldZoom =
    zoom;


  zoom = 1;

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
        C.width *
        scale
      )
    );


  output.height =
    Math.max(
      1,
      Math.round(
        C.height *
        scale
      )
    );


  const outputContext =
    output.getContext(
      '2d'
    );


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


  link.click();


  zoom =
    oldZoom;


  render();


  $('status').textContent =
    'Export complete';
}


/* =========================================================
   TEXT / DRAW / COLOR SELECT POINTER SYSTEM
========================================================= */

function stagePoint(e) {

  const rect =
    C.getBoundingClientRect();


  return {

    x:
      clamp(
        (
          e.clientX -
          rect.left
        ) /
        rect.width,
        0,
        1
      ),

    y:
      clamp(
        (
          e.clientY -
          rect.top
        ) /
        rect.height,
        0,
        1
      )
  };
}


function rgbToHex(r, g, b) {

  return '#' +
    [r, g, b]
      .map(
        value =>
          Math.round(value)
            .toString(16)
            .padStart(2, '0')
      )
      .join('');
}


/* POINTER DOWN */

$('stage').addEventListener(
  'pointerdown',
  e => {

    if (!img) {
      return;
    }


    const point =
      stagePoint(e);


    /* COLOR SELECT */

    if (
      active === 'selective' &&
      pickMode
    ) {

      const pixel =
        ctx.getImageData(
          Math.round(
            point.x *
            C.width
          ),

          Math.round(
            point.y *
            C.height
          ),

          1,
          1
        ).data;


      push();


      S.selectiveR =
        pixel[0];

      S.selectiveG =
        pixel[1];

      S.selectiveB =
        pixel[2];


      if ($('pickedColor')) {

        $('pickedColor')
          .textContent =
          `Selected: ${
            rgbToHex(
              pixel[0],
              pixel[1],
              pixel[2]
            )
          }`;
      }


      pickMode = false;


      $('pickerBadge')
        .style
        .display =
        'none';


      panel();

      schedule();

      return;
    }


    /* DRAW */

    if (
      active === 'draw'
    ) {

      e.preventDefault();

      push();

      drawingTool =
        true;


      $('stage')
        .setPointerCapture(
          e.pointerId
        );


      const stroke = {

        points: [
          point
        ],

        size:
          Number(
            S.drawSize
          ) || 8,

        opacity:
          Number(
            S.drawOpacity
          ) || 100,

        color:
          $('drawColor')?.value ||
          '#ffffff'
      };


      S.drawLayers.push(
        stroke
      );


      showOverlay();

      return;
    }


    /* TEXT */

    if (
      active === 'text'
    ) {

      const hit =
        S.textLayers
          .slice()
          .reverse()
          .find(
            text => {

              const dx =
                point.x -
                text.x;

              const dy =
                point.y -
                text.y;


              return (
                Math.abs(dx) <
                .35 &&
                Math.abs(dy) <
                .12
              );
            }
          );


      if (hit) {

        push();

        S.selectedTextId =
          hit.id;

        draggingText =
          hit;


        dragDX =
          point.x -
          hit.x;

        dragDY =
          point.y -
          hit.y;


        $('stage')
          .setPointerCapture(
            e.pointerId
          );


        panel();

        showOverlay();
      }
    }
  }
);


/* POINTER MOVE */

$('stage').addEventListener(
  'pointermove',
  e => {

    const point =
      stagePoint(e);


    /* DRAW */

    if (
      active === 'draw' &&
      drawingTool
    ) {

      const stroke =
        S.drawLayers[
          S.drawLayers.length - 1
        ];


      if (stroke) {

        stroke.points.push(
          point
        );
      }


      showOverlay();

      return;
    }


    /* TEXT */

    if (
      active === 'text' &&
      draggingText
    ) {

      draggingText.x =
        clamp(
          point.x -
          dragDX,
          0,
          1
        );


      draggingText.y =
        clamp(
          point.y -
          dragDY,
          0,
          1
        );


      showOverlay();
    }
  }
);


/* POINTER UP */

$('stage').addEventListener(
  'pointerup',
  () => {

    if (drawingTool) {

      drawingTool =
        false;

      panel();
      render();
    }


    if (draggingText) {

      draggingText =
        null;

      panel();
      render();
    }
  }
);


$('stage').addEventListener(
  'pointercancel',
  () => {

    drawingTool =
      false;

    draggingText =
      null;
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
   TOP CONTROLS
========================================================= */

$('tabs').addEventListener(
  'click',
  e => {

    const button =
      e.target.closest(
        '[data-tool]'
      );


    if (!button) {
      return;
    }


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


$('reset').onclick =
  () => {

    push();

    resetState();
  };


$('undo').onclick =
  () => {

    if (!history.length) {
      return;
    }


    future.push(
      snap()
    );


    restore(
      history.pop()
    );
  };


$('redo').onclick =
  () => {

    if (!future.length) {
      return;
    }


    history.push(
      snap()
    );


    restore(
      future.pop()
    );
  };


$('before').onclick =
  () => {

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
========================================================= */

$('zout').onclick =
  () => {

    zoom =
      clamp(
        zoom - .1,
        .5,
        2.5
      );

    render();
  };


$('zin').onclick =
  () => {

    zoom =
      clamp(
        zoom + .1,
        .5,
        2.5
      );

    render();
  };


$('fit').onclick =
  () => {

    zoom = 1;

    render();
  };


$('full').onclick =
  () => {

    $('stage')
      .requestFullscreen?.();
  };


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

})();
