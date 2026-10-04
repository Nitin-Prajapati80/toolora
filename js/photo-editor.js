(() => {

'use strict';


/* =========================================================
   BASIC HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const clamp = (n, a, b) =>
  Math.max(a, Math.min(b, n));


/* =========================================================
   CANVAS SETUP
========================================================= */

const C = $('canvas');

const ctx = C.getContext('2d', {
  willReadFrequently: true
});

const O = $('overlay');

const ox = O.getContext('2d');

const src = document.createElement('canvas');

const sx = src.getContext('2d', {
  willReadFrequently: true
});


/* =========================================================
   APPLICATION STATE
========================================================= */

let img = null;

let fileName = '';

let active = 'light';

let showBefore = false;

let zoom = 1;

let renderQueued = false;

let rendering = false;

let history = [];

let future = [];

let retouch = [];

let maskStrokes = [];


/* =========================================================
   EDITING STATE
========================================================= */

const S = {

  /* LIGHT */

  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,


  /* COLOR */

  temp: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,


  /* EFFECTS */

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


  /* DETAIL */

  sharp: 0,
  radius: 1,
  detail: 50,

  noise: 0,
  colorNoise: 0,


  /* CROP */

  ratio: 'original',
  rotate: 0,
  straighten: 0,
  flipX: false,
  flipY: false,


  /* LOOKS */

  profile: 'natural',
  preset: 'none',
  presetAmount: 100,


  /* BLUR */

  blur: 0,
  blurX: 50,
  blurY: 50,


  /* OPTICS */

  lensVignette: 0,
  defringe: 0,


  /* MASK */

  maskType: 'radial',
  maskAmount: 0,

  maskExposure: 0,
  maskContrast: 0,
  maskSaturation: 0,

  maskSize: 50,
  maskFeather: 50,


  /* RETOUCH */

  retouchSize: 30,


  /* EXPORT */

  quality: 90,


  /* COLOR GRADING */

  gradeShadow: 0,
  gradeShadowSat: 0,

  gradeMid: 0,
  gradeMidSat: 0,

  gradeHigh: 0,
  gradeHighSat: 0,

  gradeBlend: 50,
  gradeBalance: 0

};


/* =========================================================
   HSL MIXER
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
   TOOL NAMES
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

  export: ['Output', 'Export']

};


/* =========================================================
   PRESETS
========================================================= */

const presetDefs = {

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
    shadows: 8,
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


/* =========================================================
   HISTORY
========================================================= */

function snap() {

  return JSON.parse(JSON.stringify(S));

}


function push() {

  history.push({

    state: snap(),

    retouch:
      JSON.parse(JSON.stringify(retouch)),

    mask:
      JSON.parse(JSON.stringify(maskStrokes))

  });

  if (history.length > 30) {
    history.shift();
  }

  future = [];

}


function restore(item) {

  Object.assign(S, item.state);

  retouch = item.retouch || [];

  maskStrokes = item.mask || [];

  panel();

  schedule();

}


/* =========================================================
   UI HELPERS
========================================================= */

function fmt(value) {

  value = Number(value);

  return `${value > 0 ? '+' : ''}${
    Number.isInteger(value)
      ? value
      : value.toFixed(1)
  }`;

}


function control(
  key,
  label,
  min,
  max,
  step = 1
) {

  return `

    <div class="control">

      <div class="ch">

        <span>${label}</span>

        <span
          class="val"
          id="v_${key}">
          ${fmt(S[key])}
        </span>

      </div>

      <input
        data-k="${key}"
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${S[key]}">

    </div>

  `;

}


function select(
  key,
  label,
  items
) {

  return `

    <div class="control">

      <div class="ch">

        <span>${label}</span>

      </div>

      <select
        class="select"
        data-select="${key}">

        ${items.map(item => `

          <option
            value="${item[0]}"
            ${S[key] === item[0] ? 'selected' : ''}>

            ${item[1]}

          </option>

        `).join('')}

      </select>

    </div>

  `;

}


function button(
  label,
  action,
  cls = 'btn'
) {

  return `

    <button
      type="button"
      class="${cls}"
      data-action="${action}">

      ${label}

    </button>

  `;

}


function section(
  title,
  body
) {

  return `

    <section class="section">

      <h3>${title}</h3>

      ${body}

    </section>

  `;

}


/* =========================================================
   PANEL
========================================================= */

function panel() {

  $('eyebrow').textContent =
    names[active][0];

  $('title').textContent =
    names[active][1];


  let html = '';


  /* ================= LIGHT ================= */

  if (active === 'light') {

    html += section(
      'Tone',

      control(
        'exposure',
        'Exposure',
        -100,
        100
      ) +

      control(
        'contrast',
        'Contrast',
        -100,
        100
      ) +

      control(
        'highlights',
        'Highlights',
        -100,
        100
      ) +

      control(
        'shadows',
        'Shadows',
        -100,
        100
      ) +

      control(
        'whites',
        'Whites',
        -100,
        100
      ) +

      control(
        'blacks',
        'Blacks',
        -100,
        100
      )

    );


    html += section(

      'Auto',

      button(
        'Auto Tone',
        'autoTone'
      ) +

      `

      <div class="note">

        Auto adjusts the main light and
        color controls from the image.

      </div>

      `

    );

  }


  /* ================= COLOR ================= */

  else if (active === 'color') {

    html += section(

      'White Balance & Color',

      control(
        'temp',
        'Temperature',
        -100,
        100
      ) +

      control(
        'tint',
        'Tint',
        -100,
        100
      ) +

      control(
        'vibrance',
        'Vibrance',
        -100,
        100
      ) +

      control(
        'saturation',
        'Saturation',
        -100,
        100
      )

    );


    html += section(

      'Color Mixer',

      colors.map(color => `

        <div class="mixer">

          <span>
            ${color[0].toUpperCase() +
              color.slice(1)}
          </span>

          <input
            data-mix="${color}"
            data-channel="h"
            type="range"
            min="-100"
            max="100"
            value="${S['h_' + color]}">

          <input
            data-mix="${color}"
            data-channel="s"
            type="range"
            min="-100"
            max="100"
            value="${S['s_' + color]}">

          <input
            data-mix="${color}"
            data-channel="l"
            type="range"
            min="-100"
            max="100"
            value="${S['l_' + color]}">

        </div>

      `).join('')

    );


    html += section(

      'Color Grading',

      control(
        'gradeShadow',
        'Shadows Hue',
        0,
        360
      ) +

      control(
        'gradeShadowSat',
        'Shadows Saturation',
        0,
        100
      ) +

      control(
        'gradeMid',
        'Midtones Hue',
        0,
        360
      ) +

      control(
        'gradeMidSat',
        'Midtones Saturation',
        0,
        100
      ) +

      control(
        'gradeHigh',
        'Highlights Hue',
        0,
        360
      ) +

      control(
        'gradeHighSat',
        'Highlights Saturation',
        0,
        100
      ) +

      control(
        'gradeBlend',
        'Blending',
        0,
        100
      ) +

      control(
        'gradeBalance',
        'Balance',
        -100,
        100
      )

    );

  }


  /* ================= EFFECTS ================= */

  else if (active === 'effects') {

    html += section(

      'Effects',

      control(
        'texture',
        'Texture',
        -100,
        100
      ) +

      control(
        'clarity',
        'Clarity',
        -100,
        100
      ) +

      control(
        'dehaze',
        'Dehaze',
        -100,
        100
      ) +

      control(
        'vignette',
        'Vignette',
        -100,
        100
      ) +

      control(
        'midpoint',
        'Midpoint',
        0,
        100
      ) +

      control(
        'feather',
        'Feather',
        0,
        100
      ) +

      control(
        'roundness',
        'Roundness',
        -100,
        100
      )

    );


    html += section(

      'Grain',

      control(
        'grain',
        'Amount',
        0,
        100
      ) +

      control(
        'grainSize',
        'Size',
        1,
        100
      ) +

      control(
        'grainRough',
        'Roughness',
        0,
        100
      )

    );

  }


  /* ================= DETAIL ================= */

  else if (active === 'detail') {

    html += section(

      'Sharpening',

      control(
        'sharp',
        'Amount',
        0,
        100
      ) +

      control(
        'radius',
        'Radius',
        0.1,
        3,
        0.1
      ) +

      control(
        'detail',
        'Detail',
        0,
        100
      )

    );


    html += section(

      'Noise Reduction',

      control(
        'noise',
        'Luminance',
        0,
        100
      ) +

      control(
        'colorNoise',
        'Color',
        0,
        100
      )

    );

  }


  /* ================= CROP ================= */

  else if (active === 'crop') {

    html += section(

      'Aspect Ratio',

      select(

        'ratio',

        'Ratio',

        [

          ['original','Original'],

          ['1:1','Square 1:1'],

          ['4:5','Portrait 4:5'],

          ['5:4','Landscape 5:4'],

          ['4:3','4:3'],

          ['3:4','3:4'],

          ['16:9','16:9'],

          ['9:16','9:16']

        ]

      ) +

      `

      <div class="grid2">

        ${button(
          'Rotate Left',
          'rotateLeft'
        )}

        ${button(
          'Rotate Right',
          'rotateRight'
        )}

        ${button(
          'Flip Horizontal',
          'flipX'
        )}

        ${button(
          'Flip Vertical',
          'flipY'
        )}

      </div>

      ` +

      control(
        'straighten',
        'Straighten',
        -15,
        15,
        0.1
      )

    );


    html += `

      <div class="cropbox">

        Crop is centered and previewed instantly.
        Use the aspect ratio to prepare social
        or print formats.

      </div>

    `;

  }


  /* ================= PRESETS ================= */

  else if (active === 'presets') {

    html += section(

      'Preset Amount',

      control(
        'presetAmount',
        'Amount',
        0,
        100
      )

    );


    html += section(

      'Looks',

      `

      <div class="presets">

        <button
          type="button"
          class="preset"
          data-preset="clean">

          <b>Clean</b>
          <small>Balanced</small>

        </button>


        <button
          type="button"
          class="preset"
          data-preset="warm">

          <b>Warm</b>
          <small>Warm skin tones</small>

        </button>


        <button
          type="button"
          class="preset"
          data-preset="cool">

          <b>Cool</b>
          <small>Cool shadows</small>

        </button>


        <button
          type="button"
          class="preset"
          data-preset="cinematic">

          <b>Cinematic</b>
          <small>Contrast & mood</small>

        </button>


        <button
          type="button"
          class="preset"
          data-preset="matte">

          <b>Matte</b>
          <small>Soft blacks</small>

        </button>


        <button
          type="button"
          class="preset"
          data-preset="vivid">

          <b>Vivid</b>
          <small>Strong color</small>

        </button>


        <button
          type="button"
          class="preset"
          data-preset="portrait">

          <b>Portrait</b>
          <small>Soft skin tone</small>

        </button>


        <button
          type="button"
          class="preset"
          data-preset="bw">

          <b>B&W</b>
          <small>Monochrome</small>

        </button>

      </div>

      `

    );

  }


  /* ================= PROFILES ================= */

  else if (active === 'profiles') {

    html += section(

      'Profile',

      select(

        'profile',

        'Profile',

        [

          ['natural','Natural'],

          ['neutral','Neutral'],

          ['vivid','Vivid'],

          ['modern','Modern'],

          ['film','Film Inspired'],

          ['mono','Monochrome']

        ]

      ) +

      `

      <div class="note">

        Profiles provide a starting rendering
        style. They remain editable with every
        control.

      </div>

      `

    );

  }


  /* ================= MASK ================= */

  else if (active === 'mask') {

    html += section(

      'Local Mask',

      select(

        'maskType',

        'Mask Type',

        [

          ['radial','Radial Gradient'],

          ['linear','Linear Gradient'],

          ['brush','Brush']

        ]

      ) +

      control(
        'maskAmount',
        'Amount',
        0,
        100
      ) +

      control(
        'maskExposure',
        'Exposure',
        -100,
        100
      ) +

      control(
        'maskContrast',
        'Contrast',
        -100,
        100
      ) +

      control(
        'maskSaturation',
        'Saturation',
        -100,
        100
      ) +

      control(
        'maskSize',
        'Size',
        1,
        100
      ) +

      control(
        'maskFeather',
        'Feather',
        0,
        100
      )

    );


    html += section(

      'Masking',

      button(
        'Clear Mask Strokes',
        'clearMask'
      ) +

      `

      <div class="note">

        Radial and linear masks are automatic.
        Brush mode lets you paint a local
        adjustment directly over the photo.

      </div>

      `

    );

  }


  /* ================= RETOUCH ================= */

  else if (active === 'retouch') {

    html += section(

      'Spot Blur / Retouch',

      control(
        'retouchSize',
        'Brush Size',
        5,
        100
      ) +

      button(
        'Clear Retouch Strokes',
        'clearRetouch'
      ) +

      `

      <div class="note">

        Paint over an area to soften small
        distractions. This browser version
        uses local blur rather than AI
        content-aware healing.

      </div>

      `

    );

  }


  /* ================= BLUR ================= */

  else if (active === 'blur') {

    html += section(

      'Lens Blur',

      control(
        'blur',
        'Blur Amount',
        0,
        100
      ) +

      control(
        'blurX',
        'Focus X',
        0,
        100
      ) +

      control(
        'blurY',
        'Focus Y',
        0,
        100
      ) +

      `

      <div class="note">

        The blur falls off around the selected
        focus point. This is a browser-side
        depth-style effect, not AI depth
        detection.

      </div>

      `

    );

  }


  /* ================= OPTICS ================= */

  else if (active === 'optics') {

    html += section(

      'Optical Corrections',

      control(
        'lensVignette',
        'Lens Vignette',
        -100,
        100
      ) +

      control(
        'defringe',
        'Defringe',
        0,
        100
      ) +

      `

      <div class="note">

        Lens controls are lightweight browser
        approximations. They do not use
        camera-specific lens profiles.

      </div>

      `

    );

  }


  /* ================= EXPORT ================= */

  else if (active === 'export') {

    html += section(

      'Export',

      `

      <div class="export">

        ${select(

          'format',

          'Format',

          [

            ['image/jpeg','JPG'],

            ['image/png','PNG'],

            ['image/webp','WebP']

          ]

        )}

        ${control(
          'quality',
          'Quality',
          10,
          100
        )}

        ${select(

          'size',

          'Maximum Long Edge',

          [

            ['1200','1200 px'],

            ['1600','1600 px'],

            ['2000','2000 px'],

            ['3000','3000 px'],

            ['4000','4000 px'],

            ['6000','6000 px']

          ]

        )}

        <button
          type="button"
          class="download"
          data-action="export">

          Download Photo

        </button>

      </div>

      <div class="note">

        Export is processed locally in
        your browser.

      </div>

      `

    );

  }


  $('panel').innerHTML = html;

  bind();


  document
    .querySelectorAll('#tabs button')
    .forEach(button => {

      button.classList.toggle(
        'active',
        button.dataset.tool === active
      );

    });

}


/* =========================================================
   PANEL BINDINGS
========================================================= */

function bind() {


  document
    .querySelectorAll(
      '#panel input[data-k]'
    )
    .forEach(input => {

      input.addEventListener(
        'input',
        () => {

          S[input.dataset.k] =
            Number(input.value);

          const value =
            $('v_' + input.dataset.k);

          if (value) {

            value.textContent =
              fmt(input.value);

          }

          schedule();

        }
      );


      input.addEventListener(
        'change',
        push
      );

    });


  document
    .querySelectorAll(
      '#panel input[data-mix]'
    )
    .forEach(input => {

      input.addEventListener(
        'input',
        () => {

          const key =
            `${input.dataset.channel}_${input.dataset.mix}`;

          S[key] =
            Number(input.value);

          schedule();

        }
      );


      input.addEventListener(
        'change',
        push
      );

    });


  document
    .querySelectorAll(
      '#panel select[data-select]'
    )
    .forEach(selectElement => {

      selectElement.addEventListener(
        'change',
        () => {

          push();

          S[
            selectElement.dataset.select
          ] =
            selectElement.value;

          schedule();

          panel();

        }
      );

    });


  document
    .querySelectorAll(
      '#panel [data-preset]'
    )
    .forEach(buttonElement => {

      buttonElement.addEventListener(
        'click',
        () =>
          applyPreset(
            buttonElement.dataset.preset
          )
      );

    });


  document
    .querySelectorAll(
      '#panel [data-action]'
    )
    .forEach(buttonElement => {

      buttonElement.addEventListener(
        'click',
        () =>
          action(
            buttonElement.dataset.action
          )
      );

    });

}


/* =========================================================
   ACTIONS
========================================================= */

function action(actionName) {


  if (actionName === 'autoTone') {

    autoTone();

    return;

  }


  if (actionName === 'rotateLeft') {

    push();

    S.rotate =
      (S.rotate - 90) % 360;

    schedule();

    return;

  }


  if (actionName === 'rotateRight') {

    push();

    S.rotate =
      (S.rotate + 90) % 360;

    schedule();

    return;

  }


  if (actionName === 'flipX') {

    push();

    S.flipX =
      !S.flipX;

    schedule();

    return;

  }


  if (actionName === 'flipY') {

    push();

    S.flipY =
      !S.flipY;

    schedule();

    return;

  }


  if (actionName === 'clearRetouch') {

    push();

    retouch = [];

    schedule();

    return;

  }


  if (actionName === 'clearMask') {

    push();

    maskStrokes = [];

    schedule();

    return;

  }


  if (actionName === 'export') {

    exportImage();

  }

}


/* =========================================================
   RESET
========================================================= */

function resetState() {


  Object.keys(S).forEach(key => {


    if (
      key.startsWith('h_') ||
      key.startsWith('s_') ||
      key.startsWith('l_')
    ) {

      S[key] = 0;

      return;

    }


    if (
      typeof S[key] === 'boolean'
    ) {

      S[key] = false;

      return;

    }


    if (key === 'ratio') {

      S[key] = 'original';

      return;

    }


    if (key === 'profile') {

      S[key] = 'natural';

      return;

    }


    if (key === 'preset') {

      S[key] = 'none';

      return;

    }


    if (key === 'maskType') {

      S[key] = 'radial';

      return;

    }


    if (
      [
        'midpoint',
        'feather',
        'maskSize',
        'maskFeather',
        'gradeBlend'
      ].includes(key)
    ) {

      S[key] = 50;

      return;

    }


    if (key === 'grainSize') {

      S[key] = 25;

      return;

    }


    if (
      key === 'grainRough' ||
      key === 'blurX' ||
      key === 'blurY'
    ) {

      S[key] = 50;

      return;

    }


    if (key === 'radius') {

      S[key] = 1;

      return;

    }


    S[key] = 0;

  });


  S.presetAmount = 100;

  S.quality = 90;


  retouch = [];

  maskStrokes = [];


  history = [];

  future = [];


  zoom = 1;

  showBefore = false;


  panel();

  schedule();

}


/* =========================================================
   PRESET
========================================================= */

function applyPreset(name) {

  push();

  const target =
    presetDefs[name] || {};

  const amount =
    S.presetAmount / 100;


  Object.keys(target)
    .forEach(key => {

      S[key] =
        target[key] * amount;

    });


  S.preset = name;

  schedule();

  panel();

}


/* =========================================================
   PROFILE
========================================================= */

function profileValues() {

  const p = {
    ...S
  };


  if (S.profile === 'vivid') {

    p.vibrance += 12;

    p.saturation += 5;

    p.contrast += 5;

  }


  if (S.profile === 'neutral') {

    p.contrast -= 3;

    p.saturation -= 3;

  }


  if (S.profile === 'modern') {

    p.contrast += 5;

    p.clarity += 7;

    p.vibrance += 7;

  }


  if (S.profile === 'film') {

    p.contrast += 4;

    p.saturation -= 5;

    p.temp += 4;

    p.grain += 5;

  }


  if (S.profile === 'mono') {

    p.saturation = -100;

  }


  return p;

}


/* =========================================================
   COLOR MATH
========================================================= */

function rgbToHsv(
  r,
  g,
  b
) {

  const max =
    Math.max(r, g, b);

  const min =
    Math.min(r, g, b);

  const d =
    max - min;

  let h = 0;


  if (d) {

    if (max === r) {

      h =
        (
          (g - b) / d +
          (g < b ? 6 : 0)
        ) / 6;

    }

    else if (max === g) {

      h =
        (
          (b - r) / d +
          2
        ) / 6;

    }

    else {

      h =
        (
          (r - g) / d +
          4
        ) / 6;

    }

  }


  return [
    h,
    max ? d / max : 0,
    max
  ];

}


function hsvToRgb(
  h,
  s,
  v
) {

  const i =
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
    [v,t,p],
    [q,v,p],
    [p,v,t],
    [p,q,v],
    [t,p,v],
    [v,p,q]
  ][i % 6];

}


function hueBand(h) {

  if (h < .04 || h > .96)
    return 'red';

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
   AUTO TONE
========================================================= */

function autoTone() {

  if (!img)
    return;


  push();


  const width =
    Math.min(src.width, 500);

  const height =
    Math.max(
      1,
      Math.round(
        src.height *
        width /
        src.width
      )
    );


  const temp =
    document.createElement(
      'canvas'
    );

  temp.width = width;
  temp.height = height;


  const c =
    temp.getContext('2d');


  c.drawImage(
    src,
    0,
    0,
    width,
    height
  );


  const data =
    c.getImageData(
      0,
      0,
      width,
      height
    ).data;


  let sum = 0;

  let square = 0;

  const count =
    data.length / 4;


  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    const luminance =
      (
        .2126 * data[i] +
        .7152 * data[i + 1] +
        .0722 * data[i + 2]
      ) / 255;


    sum += luminance;

    square +=
      luminance *
      luminance;

  }


  const mean =
    sum / count;


  const deviation =
    Math.sqrt(
      Math.max(
        0,
        square / count -
        mean * mean
      )
    );


  S.exposure =
    clamp(
      (0.5 - mean) * 85,
      -45,
      45
    );


  S.contrast =
    clamp(
      (deviation - .20) * 180,
      -35,
      35
    );


  S.shadows =
    clamp(
      (.42 - mean) * 55,
      -30,
      30
    );


  S.highlights =
    clamp(
      (.62 - mean) * -45,
      -30,
      30
    );


  S.whites =
    clamp(
      (.55 - mean) * 25,
      -20,
      20
    );


  S.blacks =
    clamp(
      (.45 - mean) * -25,
      -20,
      20
    );


  S.vibrance =
    clamp(
      (.24 - deviation) * 35,
      -12,
      20
    );


  schedule();

  panel();

}


/* =========================================================
   MAIN PIXEL PROCESSOR
========================================================= */

function applyPixel(
  data,
  width,
  height
) {

  const pixels =
    data.data;

  const p =
    profileValues();


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


  const grainAmount =
    p.grain / 100 * 28;


  const grainScale =
    Math.max(
      1,
      Math.round(
        1 + p.grainSize / 8
      )
    );


  const roughness =
    p.grainRough / 100;


  for (
    let i = 0;
    i < pixels.length;
    i += 4
  ) {


    let r =
      pixels[i] / 255;

    let g =
      pixels[i + 1] / 255;

    let b =
      pixels[i + 2] / 255;


    /* EXPOSURE */

    r *= exposure;
    g *= exposure;
    b *= exposure;


    const luminance =
      .2126 * r +
      .7152 * g +
      .0722 * b;


    /* HIGHLIGHTS / SHADOWS */

    const highlight =
      p.highlights / 120;

    const shadow =
      p.shadows / 120;


    if (luminance > .5) {

      r += highlight * (r - .5);
      g += highlight * (g - .5);
      b += highlight * (b - .5);

    }

    else {

      r += shadow * (.5 - r);
      g += shadow * (.5 - g);
      b += shadow * (.5 - b);

    }


    /* WHITES / BLACKS */

    const wb =
      p.whites / 255 +
      p.blacks / 255;


    r += wb;
    g += wb;
    b += wb;


    /* CONTRAST */

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


    /* WHITE BALANCE */

    r += p.temp * .0009;

    b -= p.temp * .0009;

    g += p.tint * .00045;


    /* VIBRANCE / SATURATION */

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
          2 * luminance - 1
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


    /* TEXTURE / CLARITY */

    const effect =
      (
        p.texture +
        p.clarity
      ) / 900;


    r += (r - gray) * effect;

    g += (g - gray) * effect;

    b += (b - gray) * effect;


    /* DEHAZE */

    if (p.dehaze) {

      const haze =
        p.dehaze / 140;


      r =
        (r - .5) *
        (1 + haze) +
        .5;

      g =
        (g - .5) *
        (1 + haze) +
        .5;

      b =
        (b - .5) *
        (1 + haze) +
        .5;

    }


    /* HSL */

    let [
      hue,
      sat,
      value
    ] =
      rgbToHsv(
        clamp(r,0,1),
        clamp(g,0,1),
        clamp(b,0,1)
      );


    const band =
      hueBand(hue);


    const hueChange =
      p['h_' + band];

    const satChange =
      p['s_' + band];

    const lightChange =
      p['l_' + band];


    if (
      hueChange ||
      satChange ||
      lightChange
    ) {

      [
        r,
        g,
        b
      ] =
        hsvToRgb(

          (
            hue +
            hueChange / 360 +
            1
          ) % 1,

          clamp(
            sat *
            (
              1 +
              satChange / 100
            ),
            0,
            1
          ),

          clamp(
            value *
            (
              1 +
              lightChange / 100
            ),
            0,
            1
          )

        );

    }


    /* COLOR GRADING */

    const luminance2 =
      .2126 * r +
      .7152 * g +
      .0722 * b;


    let gradeHue;

    let gradeSat;


    if (luminance2 < .35) {

      gradeHue =
        p.gradeShadow;

      gradeSat =
        p.gradeShadowSat;

    }

    else if (luminance2 > .65) {

      gradeHue =
        p.gradeHigh;

      gradeSat =
        p.gradeHighSat;

    }

    else {

      gradeHue =
        p.gradeMid;

      gradeSat =
        p.gradeMidSat;

    }


    if (gradeSat) {

      const graded =
        hsvToRgb(
          (gradeHue % 360) / 360,
          gradeSat / 100,
          Math.max(.2,luminance2)
        );


      let zone =
        luminance2 < .35
          ? -1
          : luminance2 > .65
            ? 1
            : 0;


      const balance =
        (
          p.gradeBalance /
          100
        ) *
        zone;


      const blend =
        (
          p.gradeBlend /
          100
        ) *
        .45 *
        (
          1 -
          Math.abs(balance)
        );


      r =
        r * (1 - blend) +
        graded[0] * blend;

      g =
        g * (1 - blend) +
        graded[1] * blend;

      b =
        b * (1 - blend) +
        graded[2] * blend;

    }


    /* POSITION */

    const x =
      (
        (i / 4) %
        width
      ) / width - .5;


    const y =
      Math.floor(
        (i / 4) /
        width
      ) / height - .5;


    const distance =
      Math.sqrt(
        x * x +
        y * y
      ) * 1.414;


    /* VIGNETTE */

    if (p.vignette) {

      let edge =
        clamp(
          (
            distance -
            p.midpoint /
            100 *
            .65
          ) /
          Math.max(
            .05,
            p.feather / 100
          ),
          0,
          1
        );


      const round =
        1 +
        (
          p.roundness /
          100
        ) *
        .35;


      edge =
        clamp(
          Math.pow(
            edge,
            round
          ),
          0,
          1
        );


      const vignette =
        1 -
        p.vignette /
        100 *
        edge *
        edge;


      r *= vignette;
      g *= vignette;
      b *= vignette;

    }


    /* OPTICS VIGNETTE */

    if (p.lensVignette) {

      const edge =
        clamp(
          distance / .75,
          0,
          1
        );


      const v =
        1 -
        p.lensVignette /
        100 *
        edge *
        edge;


      r *= v;
      g *= v;
      b *= v;

    }


    /* DEFRINGE */

    if (p.defringe) {

      const edge =
        clamp(
          distance / .9,
          0,
          1
        );


      const amount =
        p.defringe /
        100 *
        .018;


      r += amount * edge;

      b -= amount * edge;

    }


    /* MASK */

    if (p.maskAmount) {

      let mask;


      if (
        p.maskType ===
        'radial'
      ) {

        const dx =
          (x * 2) /
          (
            p.maskSize /
            50
          );

        const dy =
          (y * 2) /
          (
            p.maskSize /
            50
          );


        mask =
          1 -
          clamp(
            Math.sqrt(
              dx * dx +
              dy * dy
            ),
            0,
            1
          );

      }

      else if (
        p.maskType ===
        'linear'
      ) {

        mask =
          1 -
          clamp(
            (y + .5) * 2,
            0,
            1
          );

      }

      else {

        mask =
          brushMask(
            x,
            y,
            width,
            height
          );

      }


      mask =
        Math.pow(
          clamp(mask,0,1),
          Math.max(
            .1,
            1 -
            p.maskFeather /
            120
          )
        ) *
        p.maskAmount /
        100;


      r +=
        mask *
        p.maskExposure /
        250;

      g +=
        mask *
        p.maskExposure /
        250;

      b +=
        mask *
        p.maskExposure /
        250;


      const maskContrast =
        1 +
        mask *
        p.maskContrast /
        100;


      r =
        (r - .5) *
        maskContrast +
        .5;

      g =
        (g - .5) *
        maskContrast +
        .5;

      b =
        (b - .5) *
        maskContrast +
        .5;


      const maskGray =
        .299 * r +
        .587 * g +
        .114 * b;


      const maskSaturation =
        1 +
        mask *
        p.maskSaturation /
        100;


      r =
        maskGray +
        (r - maskGray) *
        maskSaturation;

      g =
        maskGray +
        (g - maskGray) *
        maskSaturation;

      b =
        maskGray +
        (b - maskGray) *
        maskSaturation;

    }


    /* GRAIN */

    if (grainAmount) {

      const pixelX =
        Math.floor(
          (
            (i / 4) %
            width
          ) /
          grainScale
        );


      const pixelY =
        Math.floor(
          Math.floor(
            (i / 4) /
            width
          ) /
          grainScale
        );


      const random =
        (
          Math.sin(
            pixelX * 12.9898 +
            pixelY * 78.233
          ) *
          43758.5453
        ) % 1;


      const grain =
        (
          random -
          .5
        ) *
        grainAmount *
        (
          .35 +
          roughness *
          .65
        );


      r += grain / 255;

      g += grain / 255;

      b += grain / 255;

    }


    pixels[i] =
      clamp(
        r * 255,
        0,
        255
      );

    pixels[i + 1] =
      clamp(
        g * 255,
        0,
        255
      );

    pixels[i + 2] =
      clamp(
        b * 255,
        0,
        255
      );

  }


  return data;

}


/* =========================================================
   BRUSH MASK
========================================================= */

function brushMask(
  x,
  y,
  width,
  height
) {

  let best = 0;


  for (
    const stroke of maskStrokes
  ) {

    const dx =
      (
        x -
        stroke.x / width
      ) *
      width;


    const dy =
      (
        y -
        stroke.y / height
      ) *
      height;


    const distance =
      Math.sqrt(
        dx * dx +
        dy * dy
      );


    if (
      distance <
      stroke.r
    ) {

      best =
        Math.max(
          best,
          1 -
          distance /
          stroke.r
        );

    }

  }


  return best;

}


/* =========================================================
   SHARPENING
========================================================= */

function sharpenCanvas(
  canvas,
  width,
  height,
  amount,
  radius,
  detail
) {

  if (amount <= 0)
    return;


  const source =
    canvas.getImageData(
      0,
      0,
      width,
      height
    );


  const d =
    source.data;


  const output =
    canvas.createImageData(
      width,
      height
    );


  const o =
    output.data;


  o.set(d);


  const strength =
    (
      amount / 100
    ) *
    (
      .25 +
      .75 *
      detail /
      100
    ) *
    Math.min(
      2,
      radius
    );


  for (
    let y = 1;
    y < height - 1;
    y++
  ) {

    for (
      let x = 1;
      x < width - 1;
      x++
    ) {

      const index =
        (
          y *
          width +
          x
        ) *
        4;


      for (
        let channel = 0;
        channel < 3;
        channel++
      ) {

        const average =
          (
            d[
              index -
              4 +
              channel
            ] +

            d[
              index +
              4 +
              channel
            ] +

            d[
              index -
              width * 4 +
              channel
            ] +

            d[
              index +
              width * 4 +
              channel
            ]
          ) / 4;


        o[
          index +
          channel
        ] =
          clamp(
            d[
              index +
              channel
            ] +

            (
              d[
                index +
                channel
              ] -
              average
            ) *
            strength *
            2,

            0,
            255
          );

      }

    }

  }


  canvas.putImageData(
    output,
    0,
    0
  );

}


/* =========================================================
   NOISE REDUCTION
========================================================= */

function noiseReduce(
  canvas,
  width,
  height,
  amount,
  colorAmount
) {

  if (
    amount <= 0 &&
    colorAmount <= 0
  ) {

    return;

  }


  const temp =
    document.createElement(
      'canvas'
    );


  temp.width = width;

  temp.height = height;


  const tc =
    temp.getContext('2d');


  tc.drawImage(
    canvas,
    0,
    0
  );


  const blur =
    Math.min(
      2.2,
      amount / 45
    );


  if (blur > 0) {

    canvas.save();

    canvas.filter =
      `blur(${blur}px)`;

    canvas.drawImage(
      temp,
      0,
      0
    );

    canvas.restore();

  }


  if (colorAmount > 0) {

    const image =
      canvas.getImageData(
        0,
        0,
        width,
        height
      );


    const pixels =
      image.data;


    const amountValue =
      colorAmount /
      100 *
      .55;


    for (
      let i = 0;
      i < pixels.length;
      i += 4
    ) {

      const luminance =
        .299 * pixels[i] +
        .587 * pixels[i + 1] +
        .114 * pixels[i + 2];


      pixels[i] =
        pixels[i] *
        (1 - amountValue) +
        luminance *
        amountValue;


      pixels[i + 1] =
        pixels[i + 1] *
        (1 - amountValue) +
        luminance *
        amountValue;


      pixels[i + 2] =
        pixels[i + 2] *
        (1 - amountValue) +
        luminance *
        amountValue;

    }


    canvas.putImageData(
      image,
      0,
      0
    );

  }

}


/* =========================================================
   FOCUS BLUR
========================================================= */

function blurFocus(
  canvas,
  width,
  height,
  amount,
  focusX,
  focusY
) {

  if (amount <= 0)
    return;


  const temp =
    document.createElement(
      'canvas'
    );


  temp.width = width;

  temp.height = height;


  const tc =
    temp.getContext('2d');


  tc.filter =
    `blur(${Math.min(
      18,
      amount / 5
    )}px)`;


  tc.drawImage(
    canvas,
    0,
    0
  );


  const original =
    canvas.getImageData(
      0,
      0,
      width,
      height
    );


  const blurred =
    tc.getImageData(
      0,
      0,
      width,
      height
    );


  const a =
    original.data;


  const b =
    blurred.data;


  const focusPixelX =
    focusX /
    100 *
    width;


  const focusPixelY =
    focusY /
    100 *
    height;


  const maximum =
    Math.max(
      width,
      height
    ) *
    .9;


  const falloff =
    Math.max(
      1,
      amount /
      100 *
      maximum *
      .65
    );


  for (
    let y = 0;
    y < height;
    y++
  ) {

    for (
      let x = 0;
      x < width;
      x++
    ) {

      const index =
        (
          y *
          width +
          x
        ) *
        4;


      const dx =
        x -
        focusPixelX;


      const dy =
        y -
        focusPixelY;


      const distance =
        Math.sqrt(
          dx * dx +
          dy * dy
        );


      const mix =
        Math.pow(
          clamp(
            distance /
            falloff,
            0,
            1
          ),
          2
        );


      for (
        let channel = 0;
        channel < 3;
        channel++
      ) {

        a[
          index +
          channel
        ] =

          a[
            index +
            channel
          ] *
          (1 - mix) +

          b[
            index +
            channel
          ] *
          mix;

      }

    }

  }


  canvas.putImageData(
    original,
    0,
    0
  );

}


/* =========================================================
   RETOUCH
========================================================= */

function applyRetouch(
  canvas,
  width,
  height
) {

  if (!retouch.length)
    return;


  const original =
    document.createElement(
      'canvas'
    );


  original.width =
    width;

  original.height =
    height;


  original
    .getContext('2d')
    .drawImage(
      canvas,
      0,
      0
    );


  for (
    const stroke of retouch
  ) {

    const radius =
      stroke.r;


    const area =
      document.createElement(
        'canvas'
      );


    const size =
      Math.ceil(
        radius * 2 +
        8
      );


    area.width =
      size;

    area.height =
      size;


    const ac =
      area.getContext(
        '2d'
      );


    ac.filter =
      `blur(${Math.max(
        2,
        radius * .18
      )}px)`;


    ac.drawImage(
      original,
      stroke.x -
        radius -
        4,

      stroke.y -
        radius -
        4,

      size,
      size,

      0,
      0,
      size,
      size
    );


    canvas.save();

    canvas.beginPath();

    canvas.arc(
      stroke.x,
      stroke.y,
      radius,
      0,
      Math.PI * 2
    );

    canvas.clip();

    canvas.globalAlpha =
      .88;


    canvas.drawImage(
      area,
      stroke.x -
        radius -
        4,

      stroke.y -
        radius -
        4
    );


    canvas.restore();

  }

}


/* =========================================================
   TRANSFORM
========================================================= */

function getTransformedCanvas() {

  const angle =
    (
      S.rotate +
      S.straighten
    ) *
    Math.PI /
    180;


  const width =
    src.width;


  const height =
    src.height;


  const transformedWidth =
    Math.abs(
      Math.cos(angle)
    ) *
    width +

    Math.abs(
      Math.sin(angle)
    ) *
    height;


  const transformedHeight =
    Math.abs(
      Math.sin(angle)
    ) *
    width +

    Math.abs(
      Math.cos(angle)
    ) *
    height;


  const canvas =
    document.createElement(
      'canvas'
    );


  canvas.width =
    Math.max(
      1,
      Math.ceil(
        transformedWidth
      )
    );


  canvas.height =
    Math.max(
      1,
      Math.ceil(
        transformedHeight
      )
    );


  const context =
    canvas.getContext(
      '2d'
    );


  context.translate(
    canvas.width / 2,
    canvas.height / 2
  );


  context.rotate(angle);


  context.scale(
    S.flipX ? -1 : 1,
    S.flipY ? -1 : 1
  );


  context.drawImage(
    src,
    -width / 2,
    -height / 2
  );


  return canvas;

}


/* =========================================================
   CROP
========================================================= */

function cropCanvas(canvas) {

  let cropWidth =
    canvas.width;

  let cropHeight =
    canvas.height;

  let cropX = 0;

  let cropY = 0;


  if (
    S.ratio !==
    'original'
  ) {

    const [
      ratioWidth,
      ratioHeight
    ] =
      S.ratio
        .split(':')
        .map(Number);


    const targetRatio =
      ratioWidth /
      ratioHeight;


    const currentRatio =
      canvas.width /
      canvas.height;


    if (
      currentRatio >
      targetRatio
    ) {

      cropWidth =
        Math.round(
          canvas.height *
          targetRatio
        );


      cropX =
        (
          canvas.width -
          cropWidth
        ) / 2;

    }

    else {

      cropHeight =
        Math.round(
          canvas.width /
          targetRatio
        );


      cropY =
        (
          canvas.height -
          cropHeight
        ) / 2;

    }

  }


  return {

    cw: cropWidth,

    ch: cropHeight,

    cx: cropX,

    cy: cropY

  };

}


/* =========================================================
   MAIN RENDER
========================================================= */

function render() {

  if (
    !img ||
    rendering
  ) {

    return;

  }


  rendering = true;

  $('status').textContent =
    'Rendering…';


  requestAnimationFrame(
    () => {

      try {


        const transformed =
          getTransformedCanvas();


        const crop =
          cropCanvas(
            transformed
          );


        const maximum =
          innerWidth < 700
            ? 760
            : 1200;


        const scale =
          Math.min(
            1,
            maximum /
            Math.max(
              crop.cw,
              crop.ch
            )
          );


        const width =
          Math.max(
            1,
            Math.round(
              crop.cw *
              scale
            )
          );


        const height =
          Math.max(
            1,
            Math.round(
              crop.ch *
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


        /* BEFORE */

        if (showBefore) {

          ctx.drawImage(
            src,
            0,
            0,
            width,
            height
          );


          C.style.transform =
            `scale(${zoom})`;


          syncOverlay();


          $('status').textContent =
            'Original';


          rendering = false;

          return;

        }


        /* TRANSFORMED IMAGE */

        ctx.drawImage(

          transformed,

          crop.cx,
          crop.cy,

          crop.cw,
          crop.ch,

          0,
          0,

          width,
          height

        );


        /* COLOR PROCESSING */

        let imageData =
          ctx.getImageData(
            0,
            0,
            width,
            height
          );


        imageData =
          applyPixel(
            imageData,
            width,
            height
          );


        ctx.putImageData(
          imageData,
          0,
          0
        );


        /* DETAIL */

        noiseReduce(
          ctx,
          width,
          height,
          S.noise,
          S.colorNoise
        );


        sharpenCanvas(
          ctx,
          width,
          height,
          S.sharp,
          S.radius,
          S.detail
        );


        /* BLUR */

        blurFocus(
          ctx,
          width,
          height,
          S.blur,
          S.blurX,
          S.blurY
        );


        /* RETOUCH */

        applyRetouch(
          ctx,
          width,
          height
        );


        C.style.transform =
          `scale(${zoom})`;


        syncOverlay();


        $('status').textContent =
          'Ready';


      }

      finally {

        rendering =
          false;

      }

    }

  );

}


/* =========================================================
   SCHEDULE RENDER
========================================================= */

function schedule() {

  if (renderQueued)
    return;


  renderQueued = true;


  requestAnimationFrame(
    () => {

      renderQueued =
        false;

      render();

    }
  );

}


/* =========================================================
   OVERLAY
========================================================= */

function syncOverlay() {

  O.width =
    C.width;

  O.height =
    C.height;


  O.style.width =
    C.clientWidth +
    'px';


  O.style.height =
    C.clientHeight +
    'px';


  ox.clearRect(
    0,
    0,
    O.width,
    O.height
  );


  if (
    active ===
    'retouch' &&
    img
  ) {

    for (
      const stroke of retouch
    ) {

      ox.beginPath();


      ox.arc(
        stroke.x,
        stroke.y,
        stroke.r,
        0,
        Math.PI * 2
      );


      ox.strokeStyle =
        'rgba(255,255,255,.65)';


      ox.lineWidth =
        1;


      ox.stroke();

    }

  }

}


/* =========================================================
   OPEN IMAGE
========================================================= */

function handleImageFile(
  file
) {

  if (!file)
    return;


  if (
    !file.type ||
    !file.type.startsWith(
      'image/'
    )
  ) {

    alert(
      'Please select a valid image file.'
    );

    return;

  }


  $('status').textContent =
    'Opening photo…';


  const url =
    URL.createObjectURL(
      file
    );


  const image =
    new Image();


  image.onload =
    () => {

      URL.revokeObjectURL(
        url
      );


      img =
        image;


      fileName =
        file.name;


      /* Resize source for speed */

      const maximum =
        1800;


      const scale =
        Math.min(
          1,
          maximum /
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


      showBefore =
        false;


      $('badge').style.display =
        'none';


      retouch = [];

      maskStrokes = [];


      history = [];

      future = [];


      resetState();


      history = [];

      future = [];


      zoom = 1;


      $('zlabel').textContent =
        'Fit';


      render();

    };


  image.onerror =
    () => {

      URL.revokeObjectURL(
        url
      );


      $('status').textContent =
        'Ready';


      alert(
        'The selected image could not be opened. Please try another image.'
      );

    };


  image.src =
    url;

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
    'Preparing export…';


  const format =
    $('format')?.value ||
    'image/jpeg';


  const quality =
    (
      Number(
        $('quality')?.value ||
        90
      ) /
      100
    );


  const maxEdge =
    Number(
      $('size')?.value ||
      3000
    );


  const oldZoom =
    zoom;


  const oldBefore =
    showBefore;


  zoom = 1;

  showBefore = false;


  render();


  setTimeout(
    () => {

      const scale =
        Math.min(
          1,
          maxEdge /
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


      const extension =
        format === 'image/png'
          ? 'png'
          : format === 'image/webp'
            ? 'webp'
            : 'jpg';


      output.toBlob(

        blob => {

          if (!blob) {

            $('status').textContent =
              'Export failed';

            return;

          }


          const url =
            URL.createObjectURL(
              blob
            );


          const link =
            document.createElement(
              'a'
            );


          link.href =
            url;


          link.download =
            `toolora-edited-${Date.now()}.${extension}`;


          document.body.appendChild(
            link
          );


          link.click();

          link.remove();


          setTimeout(
            () =>
              URL.revokeObjectURL(
                url
              ),
            1000
          );


          $('status').textContent =
            'Export complete';


          zoom =
            oldZoom;


          showBefore =
            oldBefore;


          render();

        },

        format,

        quality

      );

    },

    40

  );

}


/* =========================================================
   TOP BUTTONS
========================================================= */

$('openTop')
  .addEventListener(
    'click',
    () =>
      $('fileInput').click()
  );


$('openEmpty')
  .addEventListener(
    'click',
    () =>
      $('fileInput').click()
  );


$('fileInput')
  .addEventListener(
    'change',
    event => {

      handleImageFile(
        event.target.files?.[0]
      );


      event.target.value =
        '';

    }
  );


/* =========================================================
   DRAG & DROP
========================================================= */

$('stage')
  .addEventListener(
    'dragover',
    event => {

      event.preventDefault();

      $('stage')
        .classList
        .add('dragover');

    }
  );


$('stage')
  .addEventListener(
    'dragleave',
    () =>
      $('stage')
        .classList
        .remove('dragover')
  );


$('stage')
  .addEventListener(
    'drop',
    event => {

      event.preventDefault();

      $('stage')
        .classList
        .remove('dragover');


      handleImageFile(
        event.dataTransfer
          .files?.[0]
      );

    }
  );


/* =========================================================
   TOOL TABS
========================================================= */

$('tabs')
  .addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-tool]'
        );


      if (!button)
        return;


      active =
        button.dataset.tool;


      panel();


      if (
        active === 'retouch' ||
        active === 'mask'
      ) {

        syncOverlay();

      }

    }
  );


/* =========================================================
   RESET BUTTON
========================================================= */

$('reset')
  .addEventListener(
    'click',
    () => {

      if (!img)
        return;


      push();

      resetState();

    }
  );


/* =========================================================
   UNDO
========================================================= */

$('undo')
  .addEventListener(
    'click',
    () => {

      if (!history.length)
        return;


      future.push({

        state: snap(),

        retouch:
          JSON.parse(
            JSON.stringify(
              retouch
            )
          ),

        mask:
          JSON.parse(
            JSON.stringify(
              maskStrokes
            )
          )

      });


      restore(
        history.pop()
      );

    }
  );


/* =========================================================
   REDO
========================================================= */

$('redo')
  .addEventListener(
    'click',
    () => {

      if (!future.length)
        return;


      history.push({

        state: snap(),

        retouch:
          JSON.parse(
            JSON.stringify(
              retouch
            )
          ),

        mask:
          JSON.parse(
            JSON.stringify(
              maskStrokes
            )
          )

      });


      restore(
        future.pop()
      );

    }
  );


/* =========================================================
   BEFORE / AFTER
========================================================= */

$('before')
  .addEventListener(
    'click',
    () => {

      if (!img)
        return;


      showBefore =
        !showBefore;


      $('badge').style.display =
        showBefore
          ? 'block'
          : 'none';


      schedule();

    }
  );


/* =========================================================
   ZOOM
========================================================= */

$('zout')
  .addEventListener(
    'click',
    () => {

      zoom =
        clamp(
          zoom - .1,
          .5,
          2.5
        );


      $('zlabel').textContent =
        `${Math.round(
          zoom * 100
        )}%`;


      schedule();

    }
  );


$('zin')
  .addEventListener(
    'click',
    () => {

      zoom =
        clamp(
          zoom + .1,
          .5,
          2.5
        );


      $('zlabel').textContent =
        `${Math.round(
          zoom * 100
        )}%`;


      schedule();

    }
  );


$('fit')
  .addEventListener(
    'click',
    () => {

      zoom = 1;

      $('zlabel').textContent =
        'Fit';


      schedule();

    }
  );


/* =========================================================
   FULLSCREEN
========================================================= */

$('full')
  .addEventListener(
    'click',
    () => {

      $('stage')
        .requestFullscreen?.();

    }
  );


/* =========================================================
   KEYBOARD SHORTCUTS
========================================================= */

document.addEventListener(
  'keydown',
  event => {

    if (
      (event.ctrlKey ||
       event.metaKey) &&
      event.key.toLowerCase() === 'z'
    ) {

      event.preventDefault();

      $('undo').click();

    }

    else if (
      (event.ctrlKey ||
       event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'z'
    ) {

      event.preventDefault();

      $('redo').click();

    }

  }
);


/* =========================================================
   RETOUCH + MASK DRAWING
========================================================= */

let drawing = false;

let lastPaint = 0;


$('stage')
  .addEventListener(
    'pointerdown',
    event => {

      if (
        !img ||
        showBefore
      ) {

        return;

      }


      if (
        active ===
        'retouch'
      ) {

        drawing = true;


        $('stage')
          .setPointerCapture(
            event.pointerId
          );


        paintRetouch(
          event
        );

      }


      else if (
        active ===
        'mask' &&
        S.maskType ===
        'brush'
      ) {

        drawing = true;


        $('stage')
          .setPointerCapture(
            event.pointerId
          );


        paintMask(
          event
        );

      }

    }
  );


$('stage')
  .addEventListener(
    'pointermove',
    event => {

      if (!drawing)
        return;


      const now =
        performance.now();


      if (
        now -
        lastPaint <
        18
      ) {

        return;

      }


      lastPaint =
        now;


      if (
        active ===
        'retouch'
      ) {

        paintRetouch(
          event
        );

      }

      else if (
        active ===
        'mask'
      ) {

        paintMask(
          event
        );

      }

    }
  );


[
  'pointerup',
  'pointercancel',
  'lostpointercapture'
]
.forEach(
  eventName => {

    $('stage')
      .addEventListener(
        eventName,
        () => {

          if (drawing) {

            drawing = false;

            push();

          }

        }
      );

  }
);


/* =========================================================
   STAGE COORDINATES
========================================================= */

function stagePoint(event) {

  const rect =
    C.getBoundingClientRect();


  return {

    x:
      clamp(
        (
          event.clientX -
          rect.left
        ) /
        rect.width,
        0,
        1
      ),

    y:
      clamp(
        (
          event.clientY -
          rect.top
        ) /
        rect.height,
        0,
        1
      )

  };

}


/* =========================================================
   RETOUCH PAINT
========================================================= */

function paintRetouch(
  event
) {

  const point =
    stagePoint(event);


  const radius =
    Math.max(
      3,
      S.retouchSize *
      C.width /
      1000
    );


  retouch.push({

    x:
      point.x *
      C.width,

    y:
      point.y *
      C.height,

    r:
      radius

  });


  schedule();

}


/* =========================================================
   MASK PAINT
========================================================= */

function paintMask(
  event
) {

  const point =
    stagePoint(event);


  const radius =
    Math.max(
      3,
      S.maskSize *
      C.width /
      100
    );


  maskStrokes.push({

    x:
      point.x *
      C.width,

    y:
      point.y *
      C.height,

    r:
      radius

  });


  schedule();

}


/* =========================================================
   DOUBLE CLICK BEFORE
========================================================= */

$('stage')
  .addEventListener(
    'dblclick',
    () => {

      if (img)
        $('before').click();

    }
  );


/* =========================================================
   INITIALIZE
========================================================= */

function init() {

  panel();

}


init();


})();
