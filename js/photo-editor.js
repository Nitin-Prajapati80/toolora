(() => {
'use strict';

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

const tabs = [...document.querySelectorAll('.tool-tab')];

const canvas = $('photoCanvas');
const overlay = $('overlayCanvas');

const ctx = canvas.getContext('2d',{
  willReadFrequently:true
});

const octx = overlay.getContext('2d');

const stage = $('stage');
const wrap = $('canvasWrap');

let img = null;
let original = null;
let fileName = '';

let active = 'light';
let before = false;

let zoom = 1;
let panX = 0;
let panY = 0;
let fitScale = 1;

let crop = {
  x:0,
  y:0,
  w:1,
  h:1,
  ratio:'free',
  angle:0
};

let pointers = new Map();
let gesture = null;
let lastTap = 0;

let history = [];
let future = [];

let drawing = null;
let selectedLayer = -1;

let toastTimer;

const S = {

  light:{
    exposure:0,
    contrast:0,
    highlights:0,
    shadows:0,
    whites:0,
    blacks:0
  },

  color:{
    temp:0,
    tint:0,
    vibrance:0,
    saturation:0,
    hue:0,

    redH:0,
    redS:0,
    redL:0,

    orangeH:0,
    orangeS:0,
    orangeL:0,

    yellowH:0,
    yellowS:0,
    yellowL:0,

    greenH:0,
    greenS:0,
    greenL:0,

    aquaH:0,
    aquaS:0,
    aquaL:0,

    blueH:0,
    blueS:0,
    blueL:0,

    purpleH:0,
    purpleS:0,
    purpleL:0,

    magentaH:0,
    magentaS:0,
    magentaL:0,

    gradeShadow:'#2020ff',
    gradeMid:'#ffffff',
    gradeHigh:'#fff0d0',

    gradeBalance:0,
    gradeBlend:50
  },

  effects:{
    texture:0,
    clarity:0,
    dehaze:0,

    vignette:0,
    midpoint:50,
    feather:50,
    roundness:0,

    grain:0,
    grainSize:50,
    roughness:50,

    fade:0,
    glow:0,
    sepia:0,

    presetAmount:100
  },

  detail:{
    sharp:0,
    radius:1,
    detail:50,
    masking:0,
    noise:0,
    colorNoise:0
  },

  transform:{
    scale:1,
    offsetX:0,
    offsetY:0,
    perspectiveX:0,
    perspectiveY:0,
    flipX:1,
    flipY:1
  },

  mask:{
    mode:'off',

    x:.5,
    y:.5,
    size:.45,
    feather:.5,

    exposure:0,
    contrast:0,
    highlights:0,
    shadows:0,

    saturation:0,
    temp:0,
    tint:0,

    texture:0,
    clarity:0
  },

  blur:{
    mode:'radial',
    amount:0,
    focusX:50,
    focusY:50,
    size:45,
    feather:55
  },

  text:{
    value:'',
    font:'Inter',
    size:48,
    bold:false,
    italic:false,
    align:'center',
    color:'#ffffff',
    stroke:'#000000',
    strokeWidth:0,
    opacity:100,
    rotation:0
  },

  draw:{
    size:12,
    opacity:100,
    color:'#ffffff',
    smooth:70
  },

  retouch:{
    size:35,
    feather:65,
    opacity:80,
    mode:'heal',
    ops:[]
  },

  selective:{
    picked:null,
    range:30,
    hue:0,
    sat:0,
    light:0
  },

  export:{
    format:'jpg',
    quality:92,
    maxEdge:2400
  },

  guides:{
    grid:false,
    clip:false
  }
};

let layers = [];

const tools = {

  light:{
    title:'Light',
    desc:'Tune brightness, contrast, highlights and shadows.'
  },

  color:{
    title:'Color',
    desc:'Control temperature, vibrance, saturation and individual colors.'
  },

  effects:{
    title:'Effects',
    desc:'Add texture, clarity, dehaze, vignette and film character.'
  },

  detail:{
    title:'Detail',
    desc:'Sharpen fine detail and reduce luminance or color noise.'
  },

  crop:{
    title:'Crop',
    desc:'Crop, straighten, rotate, flip and transform your composition.'
  },

  retouch:{
    title:'Heal',
    desc:'Paint over small areas for a local retouching effect.'
  },

  mask:{
    title:'Mask',
    desc:'Apply local light and color adjustments with touch-friendly regions.'
  },

  text:{
    title:'Text',
    desc:'Create movable typography directly on your photo.'
  },

  draw:{
    title:'Draw',
    desc:'Draw, annotate and highlight with a touch-friendly brush.'
  },

  blur:{
    title:'Blur',
    desc:'Create focus and depth-style blur with adjustable controls.'
  },

  presets:{
    title:'Presets',
    desc:'Apply one-tap looks and control their intensity.'
  },

  layers:{
    title:'Layers',
    desc:'Manage text and drawing layers above the photo.'
  },

  export:{
    title:'Export',
    desc:'Choose format, quality and output size.'
  }
};

function deepClone(v){
  return JSON.parse(JSON.stringify(v));
}

function snapshot(){

  return {
    S:deepClone(S),
    crop:deepClone(crop),
    layers:deepClone(layers),
    img:!!img
  };

}

function restore(s){

  Object.assign(S,deepClone(s.S));

  crop = deepClone(s.crop);

  layers = deepClone(s.layers);

  render();
  renderPanel();
  updateUI();

}

function pushHistory(){

  if(!img) return;

  history.push(snapshot());

  if(history.length > 30){
    history.shift();
  }

  future = [];

  updateUI();

}

function undo(){

  if(!history.length) return;

  future.push(snapshot());

  restore(history.pop());

  toast('Undo');

}

function redo(){

  if(!future.length) return;

  history.push(snapshot());

  restore(future.pop());

  toast('Redo');

}

function toast(text){

  const el = $('toast');

  el.textContent = text;

  el.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  },1100);

}

function fmt(v){

  return `${v>0?'+':''}${Math.round(v)}`;

}

function field(
  label,
  key,
  min,
  max,
  step,
  value,
  unit=''
){

  return `
    <div class="field">

      <div class="field-head">
        <label>${label}</label>
        <span class="field-value" id="val-${key}">
          ${fmt(value)}${unit}
        </span>
      </div>

      <input
        class="range"
        data-key="${key}"
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
      >

    </div>
  `;

}

function colorInput(label,key,value){

  return `
    <div class="field">

      <div class="field-head">
        <label>${label}</label>
      </div>

      <input
        class="color"
        data-color-key="${key}"
        type="color"
        value="${value}"
      >

    </div>
  `;

}

function renderPanel(){

  const body = $('controlBody');

  let h = '';

  const info = tools[active];

  $('toolTitle').textContent = info.title;
  $('toolDesc').textContent = info.desc;

  if(active === 'light'){

    h =
      field('Exposure','light.exposure',-100,100,1,S.light.exposure) +
      field('Contrast','light.contrast',-100,100,1,S.light.contrast) +
      field('Highlights','light.highlights',-100,100,1,S.light.highlights) +
      field('Shadows','light.shadows',-100,100,1,S.light.shadows) +
      field('Whites','light.whites',-100,100,1,S.light.whites) +
      field('Blacks','light.blacks',-100,100,1,S.light.blacks) +

      `
      <div class="section">

        <div class="section-title">
          Quick actions
        </div>

        <div class="btn-row">
          <button class="soft-btn" data-action="auto">
            Auto
          </button>

          <button class="soft-btn" data-action="toneCurve">
            Tone Curve
          </button>

          <button class="soft-btn" data-action="hist">
            Histogram
          </button>
        </div>

        <canvas
          class="histogram"
          id="histogram">
        </canvas>

      </div>
      `;

  }

  else if(active === 'color'){

    h =
      field('Temperature','color.temp',-100,100,1,S.color.temp) +
      field('Tint','color.tint',-100,100,1,S.color.tint) +
      field('Vibrance','color.vibrance',-100,100,1,S.color.vibrance) +
      field('Saturation','color.saturation',-100,100,1,S.color.saturation) +
      field('Global Hue','color.hue',-180,180,1,S.color.hue) +

      `
      <div class="section">

        <div class="section-title">
          Color Mixer
        </div>

        ${
          [
            'red',
            'orange',
            'yellow',
            'green',
            'aqua',
            'blue',
            'purple',
            'magenta'
          ]
          .map(c => `
            <details>

              <summary>
                ${c[0].toUpperCase()+c.slice(1)}
              </summary>

              ${field(
                'Hue',
                `color.${c}H`,
                -100,
                100,
                1,
                S.color[c+'H']
              )}

              ${field(
                'Saturation',
                `color.${c}S`,
                -100,
                100,
                1,
                S.color[c+'S']
              )}

              ${field(
                'Luminance',
                `color.${c}L`,
                -100,
                100,
                1,
                S.color[c+'L']
              )}

            </details>
          `)
          .join('')
        }

      </div>

      <div class="section">

        <div class="section-title">
          Color Grading
        </div>

        ${colorInput(
          'Shadows',
          'color.gradeShadow',
          S.color.gradeShadow
        )}

        ${colorInput(
          'Midtones',
          'color.gradeMid',
          S.color.gradeMid
        )}

        ${colorInput(
          'Highlights',
          'color.gradeHigh',
          S.color.gradeHigh
        )}

        ${field(
          'Blend',
          'color.gradeBlend',
          0,
          100,
          1,
          S.color.gradeBlend,
          '%'
        )}

        ${field(
          'Balance',
          'color.gradeBalance',
          -100,
          100,
          1,
          S.color.gradeBalance
        )}

      </div>
      `;

  }

  else if(active === 'effects'){

    h =
      field('Texture','effects.texture',-100,100,1,S.effects.texture) +
      field('Clarity','effects.clarity',-100,100,1,S.effects.clarity) +
      field('Dehaze','effects.dehaze',-100,100,1,S.effects.dehaze) +
      field('Vignette','effects.vignette',-100,100,1,S.effects.vignette) +
      field('Midpoint','effects.midpoint',0,100,1,S.effects.midpoint) +
      field('Feather','effects.feather',0,100,1,S.effects.feather) +
      field('Roundness','effects.roundness',-100,100,1,S.effects.roundness) +
      field('Grain','effects.grain',0,100,1,S.effects.grain) +
      field('Grain Size','effects.grainSize',1,100,1,S.effects.grainSize) +
      field('Roughness','effects.roughness',0,100,1,S.effects.roughness) +
      field('Fade','effects.fade',0,100,1,S.effects.fade) +
      field('Glow','effects.glow',0,100,1,S.effects.glow) +
      field('Sepia','effects.sepia',0,100,1,S.effects.sepia);

  }

  else if(active === 'detail'){

    h =
      field('Sharpening','detail.sharp',0,100,1,S.detail.sharp) +
      field('Radius','detail.radius',0.5,3,.1,S.detail.radius) +
      field('Detail','detail.detail',0,100,1,S.detail.detail) +
      field('Masking','detail.masking',0,100,1,S.detail.masking) +
      field('Noise Reduction','detail.noise',0,100,1,S.detail.noise) +
      field('Color Noise','detail.colorNoise',0,100,1,S.detail.colorNoise);

  }

  else if(active === 'crop'){

    h = `

      <div class="section">

        <div class="section-title">
          Aspect ratio
        </div>

        <div class="crop-presets">

          ${
            [
              'free',
              '1:1',
              '4:5',
              '5:4',
              '3:4',
              '4:3',
              '9:16',
              '16:9'
            ]
            .map(r => `
              <button
                data-ratio="${r}"
                class="${crop.ratio===r?'active':''}">
                ${r}
              </button>
            `)
            .join('')
          }

        </div>

      </div>

    ` +

      field(
        'Straighten',
        'crop.angle',
        -45,
        45,
        .1,
        crop.angle,
        '°'
      ) +

      field(
        'Scale',
        'transform.scale',
        .5,
        2,
        .01,
        S.transform.scale,
        '×'
      ) +

      field(
        'Horizontal',
        'transform.offsetX',
        -100,
        100,
        1,
        S.transform.offsetX,
        '%'
      ) +

      field(
        'Vertical',
        'transform.offsetY',
        -100,
        100,
        1,
        S.transform.offsetY,
        '%'
      ) +

      field(
        'Perspective X',
        'transform.perspectiveX',
        -100,
        100,
        1,
        S.transform.perspectiveX
      ) +

      field(
        'Perspective Y',
        'transform.perspectiveY',
        -100,
        100,
        1,
        S.transform.perspectiveY
      ) +

      `

      <div class="section">

        <div class="btn-row">

          <button class="soft-btn" data-action="rotL">
            Rotate Left
          </button>

          <button class="soft-btn" data-action="rotR">
            Rotate Right
          </button>

          <button class="soft-btn" data-action="flipH">
            Flip H
          </button>

          <button class="soft-btn" data-action="flipV">
            Flip V
          </button>

          <button class="soft-btn" data-action="cropApply">
            Apply Crop
          </button>

          <button class="soft-btn" data-action="cropReset">
            Reset
          </button>

        </div>

      </div>

      <div class="hint">
        Drag the crop area on the photo.
        Use pinch or mouse wheel to zoom while viewing.
      </div>

      `;

  }

  else if(active === 'retouch'){

    h = `

      <div class="section">

        <div class="section-title">
          Retouch brush
        </div>

        <div class="btn-row">

          ${
            [
              'heal',
              'clone',
              'blur',
              'smooth',
              'dodge',
              'burn'
            ]
            .map(m => `
              <button
                class="soft-btn ${S.retouch.mode===m?'active':''}"
                data-retouch-mode="${m}">
                ${m}
              </button>
            `)
            .join('')
          }

        </div>

      </div>

    ` +

      field(
        'Size',
        'retouch.size',
        4,
        160,
        1,
        S.retouch.size,
        'px'
      ) +

      field(
        'Feather',
        'retouch.feather',
        0,
        100,
        1,
        S.retouch.feather,
        '%'
      ) +

      field(
        'Opacity',
        'retouch.opacity',
        1,
        100,
        1,
        S.retouch.opacity,
        '%'
      ) +

      `
      <div class="hint">
        Paint over the area you want to correct.
        Processing stays inside the browser.
      </div>
      `;

  }

  else if(active === 'mask'){

    h = `

      <div class="section">

        <div class="section-title">
          Local mask
        </div>

        <div class="btn-row">

          <button
            class="soft-btn ${S.mask.mode==='radial'?'active':''}"
            data-mask="radial">
            Radial
          </button>

          <button
            class="soft-btn ${S.mask.mode==='linear'?'active':''}"
            data-mask="linear">
            Linear
          </button>

          <button
            class="soft-btn ${S.mask.mode==='off'?'active':''}"
            data-mask="off">
            Off
          </button>

        </div>

      </div>

    ` +

      field('Center X','mask.x',0,100,1,S.mask.x,'%') +
      field('Center Y','mask.y',0,100,1,S.mask.y,'%') +
      field('Size','mask.size',.05,.95,.01,S.mask.size) +
      field('Feather','mask.feather',0,.95,.01,S.mask.feather) +
      field('Exposure','mask.exposure',-100,100,1,S.mask.exposure) +
      field('Contrast','mask.contrast',-100,100,1,S.mask.contrast) +
      field('Highlights','mask.highlights',-100,100,1,S.mask.highlights) +
      field('Shadows','mask.shadows',-100,100,1,S.mask.shadows) +
      field('Saturation','mask.saturation',-100,100,1,S.mask.saturation) +
      field('Temperature','mask.temp',-100,100,1,S.mask.temp) +
      field('Tint','mask.tint',-100,100,1,S.mask.tint) +
      field('Texture','mask.texture',-100,100,1,S.mask.texture) +
      field('Clarity','mask.clarity',-100,100,1,S.mask.clarity) +

      `
      <div class="hint">
        Drag the mask center directly on the photo.
      </div>
      `;

  }

  else if(active === 'text'){

    h = `

      <div class="section">

        <div class="section-title">
          Text layer
        </div>

        <textarea
          class="textarea"
          id="textValue"
          placeholder="Type your text">${escapeHtml(S.text.value)}</textarea>

      </div>

      <div class="two">

        <div class="field">

          <div class="field-head">
            <label>Font</label>
          </div>

          <select class="select" id="textFont">

            <option>Inter</option>
            <option>Arial</option>
            <option>Georgia</option>
            <option>Verdana</option>
            <option>Trebuchet MS</option>
            <option>Courier New</option>

          </select>

        </div>

        <div class="field">

          <div class="field-head">
            <label>Align</label>
          </div>

          <select class="select" id="textAlign">
            <option>left</option>
            <option>center</option>
            <option>right</option>
          </select>

        </div>

      </div>

      ${field(
        'Size',
        'text.size',
        10,
        220,
        1,
        S.text.size,
        'px'
      )}

      ${field(
        'Opacity',
        'text.opacity',
        0,
        100,
        1,
        S.text.opacity,
        '%'
      )}

      ${field(
        'Stroke',
        'text.strokeWidth',
        0,
        20,
        1,
        S.text.strokeWidth,
        'px'
      )}

      <div class="two">

        <label class="check">
          <input
            id="textBold"
            type="checkbox"
            ${S.text.bold?'checked':''}>
          Bold
        </label>

        <label class="check">
          <input
            id="textItalic"
            type="checkbox"
            ${S.text.italic?'checked':''}>
          Italic
        </label>

      </div>

      <div class="two">

        <div>

          <div class="field-head">
            <label>Text color</label>
          </div>

          <input
            class="color"
            id="textColor"
            type="color"
            value="${S.text.color}">

        </div>

        <div>

          <div class="field-head">
            <label>Stroke color</label>
          </div>

          <input
            class="color"
            id="textStroke"
            type="color"
            value="${S.text.stroke}">

        </div>

      </div>

      <div class="btn-row">

        <button
          class="soft-btn"
          data-action="addText">
          Add Text
        </button>

        <button
          class="soft-btn danger"
          data-action="deleteLayer">
          Delete Selected
        </button>

      </div>

      <div class="hint">
        After adding text, drag it directly on the photo.
      </div>

    `;

  }

  else if(active === 'draw'){

    h =
      field(
        'Brush size',
        'draw.size',
        1,
        100,
        1,
        S.draw.size,
        'px'
      ) +

      field(
        'Opacity',
        'draw.opacity',
        1,
        100,
        1,
        S.draw.opacity,
        '%'
      ) +

      field(
        'Smoothness',
        'draw.smooth',
        0,
        100,
        1,
        S.draw.smooth,
        '%'
      ) +

      `
      <div class="field-head">
        <label>Color</label>
      </div>

      <input
        class="color"
        id="drawColor"
        type="color"
        value="${S.draw.color}">

      <div class="btn-row" style="margin-top:12px">

        <button
          class="soft-btn"
          data-action="clearDraw">
          Clear Drawing
        </button>

        <button
          class="soft-btn"
          data-action="removeLastStroke">
          Remove Last
        </button>

      </div>

      <div class="hint">
        Draw with a finger, mouse or pen.
      </div>
      `;

  }

  else if(active === 'blur'){

    h = `

      <div class="section">

        <div class="section-title">
          Blur type
        </div>

        <div class="btn-row">

          <button
            class="soft-btn ${S.blur.mode==='radial'?'active':''}"
            data-blur-mode="radial">
            Radial Focus
          </button>

          <button
            class="soft-btn ${S.blur.mode==='linear'?'active':''}"
            data-blur-mode="linear">
            Linear Focus
          </button>

          <button
            class="soft-btn ${S.blur.mode==='full'?'active':''}"
            data-blur-mode="full">
            Full Blur
          </button>

        </div>

      </div>

    ` +

      field(
        'Blur',
        'blur.amount',
        0,
        30,
        1,
        S.blur.amount,
        'px'
      ) +

      field(
        'Focus X',
        'blur.focusX',
        0,
        100,
        1,
        S.blur.focusX,
        '%'
      ) +

      field(
        'Focus Y',
        'blur.focusY',
        0,
        100,
        1,
        S.blur.focusY,
        '%'
      ) +

      field(
        'Focus Size',
        'blur.size',
        5,
        100,
        1,
        S.blur.size,
        '%'
      ) +

      field(
        'Feather',
        'blur.feather',
        0,
        100,
        1,
        S.blur.feather,
        '%'
      ) +

      `
      <div class="hint">
        Drag the focus point on the photo.
      </div>
      `;

  }

  else if(active === 'presets'){

    const ps = [

      ['clean','Clean','Balanced'],
      ['warm','Warm','Golden'],
      ['cool','Cool','Crisp'],
      ['cinematic','Cinematic','Contrast'],
      ['matte','Matte','Soft blacks'],
      ['vivid','Vivid','Color pop'],
      ['portrait','Portrait','Skin-friendly'],
      ['bw','B&W','Monochrome'],
      ['noir','Noir','Deep contrast'],
      ['sunset','Sunset','Warm glow'],
      ['teal','Teal & Orange','Movie look']

    ];

    h = `

      <div class="section">

        <div class="section-title">
          Looks
        </div>

        <div class="preset-grid">

          ${
            ps.map(p => `

              <button
                class="preset"
                data-preset="${p[0]}">

                <strong>${p[1]}</strong>
                <span>${p[2]}</span>

              </button>

            `).join('')
          }

        </div>

      </div>

    ` +

      field(
        'Preset Amount',
        'effects.presetAmount',
        0,
        100,
        1,
        S.effects.presetAmount,
        '%'
      ) +

      `
      <div class="hint">
        Presets change real adjustment values.
      </div>
      `;

  }

  else if(active === 'layers'){

    h = `

      <div class="section">

        <div class="section-title">
          Layers
        </div>

        <div class="layer-list">

          ${
            layers.length
            ?
            layers.map((l,i) => `

              <div class="layer ${i===selectedLayer?'active':''}">

                <span class="dot"></span>

                <span>
                  ${escapeHtml(l.name)}
                </span>

                <button data-layer-select="${i}">
                  Select
                </button>

                <button data-layer-delete="${i}">
                  ×
                </button>

              </div>

            `).join('')

            :

            `
            <div class="hint">
              No overlay layers yet.
              Add text or draw on the photo.
            </div>
            `
          }

        </div>

      </div>

      <div class="btn-row">

        <button
          class="soft-btn danger"
          data-action="clearLayers">
          Clear All Layers
        </button>

      </div>

    `;

  }

  else if(active === 'export'){

    h = `

      <div class="section">

        <div class="section-title">
          Output
        </div>

        <div class="two">

          <div>

            <div class="field-head">
              <label>Format</label>
            </div>

            <select
              class="select"
              id="exportFormat">

              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>

            </select>

          </div>

          <div>

            <div class="field-head">
              <label>Quality</label>
            </div>

            <select
              class="select"
              id="exportQuality">

              <option value="100">Maximum</option>
              <option value="92">High</option>
              <option value="80">Good</option>
              <option value="65">Small</option>

            </select>

          </div>

        </div>

        ${field(
          'Maximum edge',
          'export.maxEdge',
          800,
          5000,
          100,
          S.export.maxEdge,
          'px'
        )}

        <div class="btn-row">

          <button
            class="primary"
            style="flex:1"
            data-action="download">
            Download Edited Photo
          </button>

        </div>

      </div>

      <div class="section">

        <div class="section-title">
          Project
        </div>

        <div class="btn-row">

          <button
            class="soft-btn"
            data-action="resetAll">
            Reset All Edits
          </button>

          <button
            class="soft-btn"
            data-action="copyState">
            Copy Settings
          </button>

        </div>

      </div>

      <div class="hint">
        All processing stays in your browser.
      </div>

    `;

  }

  body.innerHTML = h;

  bindPanel();

  syncPanelValues();

  if(active === 'light'){
    setTimeout(drawHistogram,0);
  }

}

function escapeHtml(s){

  return String(s).replace(
    /[&<>"']/g,
    c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c])
  );

}

function bindPanel(){

  document
    .querySelectorAll('.range')
    .forEach(el => {

      el.addEventListener(
        'pointerdown',
        () => pushHistory(),
        {once:true}
      );

      el.addEventListener(
        'input',
        () => {

          const key = el.dataset.key;
          const parts = key.split('.');

          if(parts[0] === 'crop'){
            crop[parts[1]] = +el.value;
          }

          else{
            S[parts[0]][parts[1]] = +el.value;
          }

          const out = $('val-'+key);

          if(out){

            out.textContent =
              fmt(el.value) +
              (
                key.includes('opacity') ||
                key.includes('Blend') ||
                key.includes('Balance')
                ? '%'
                :
                key === 'crop.angle'
                ? '°'
                :
                key === 'transform.scale'
                ? '×'
                :
                ''
              );

          }

          render();
          syncPanelValues();

        }
      );

    });

  document
    .querySelectorAll('[data-color-key]')
    .forEach(el => {

      el.addEventListener(
        'input',
        () => {

          const [a,b] =
            el.dataset.colorKey.split('.');

          S[a][b] = el.value;

          render();

        }
      );

    });

  document
    .querySelectorAll('[data-ratio]')
    .forEach(b => {

      b.onclick = () => {

        pushHistory();

        crop.ratio = b.dataset.ratio;

        setCropRatio();

        renderPanel();
        render();

      };

    });

  document
    .querySelectorAll('[data-action]')
    .forEach(b => {

      b.onclick = () =>
        action(b.dataset.action);

    });

  document
    .querySelectorAll('[data-retouch-mode]')
    .forEach(b => {

      b.onclick = () => {

        S.retouch.mode =
          b.dataset.retouchMode;

        renderPanel();

      };

    });

  document
    .querySelectorAll('[data-mask]')
    .forEach(b => {

      b.onclick = () => {

        S.mask.mode = b.dataset.mask;

        renderPanel();
        render();

      };

    });

  document
    .querySelectorAll('[data-blur-mode]')
    .forEach(b => {

      b.onclick = () => {

        S.blur.mode =
          b.dataset.blurMode;

        renderPanel();
        render();

      };

    });

  document
    .querySelectorAll('[data-preset]')
    .forEach(b => {

      b.onclick = () =>
        applyPreset(b.dataset.preset);

    });

  document
    .querySelectorAll('[data-layer-select]')
    .forEach(b => {

      b.onclick = () => {

        selectedLayer =
          +b.dataset.layerSelect;

        loadLayer();

        renderPanel();
        render();

      };

    });

  document
    .querySelectorAll('[data-layer-delete]')
    .forEach(b => {

      b.onclick = () => {

        pushHistory();

        layers.splice(
          +b.dataset.layerDelete,
          1
        );

        selectedLayer = -1;

        renderPanel();
        render();

      };

    });

  const ids = [

    'textValue',
    'textFont',
    'textAlign',
    'textBold',
    'textItalic',
    'textColor',
    'textStroke',
    'drawColor',
    'exportFormat',
    'exportQuality'

  ];

  ids.forEach(id => {

    const e = $(id);

    if(!e) return;

    e.addEventListener(
      'input',
      () => syncSpecial(e)
    );

    e.addEventListener(
      'change',
      () => syncSpecial(e)
    );

  });

}

function syncSpecial(e){

  if(e.id === 'textValue')
    S.text.value = e.value;

  if(e.id === 'textFont')
    S.text.font = e.value;

  if(e.id === 'textAlign')
    S.text.align = e.value;

  if(e.id === 'textBold')
    S.text.bold = e.checked;

  if(e.id === 'textItalic')
    S.text.italic = e.checked;

  if(e.id === 'textColor')
    S.text.color = e.value;

  if(e.id === 'textStroke')
    S.text.stroke = e.value;

  if(e.id === 'drawColor')
    S.draw.color = e.value;

  if(e.id === 'exportFormat')
    S.export.format = e.value;

  if(e.id === 'exportQuality')
    S.export.quality = +e.value;

  render();

}

function syncPanelValues(){

  document
    .querySelectorAll('.range')
    .forEach(e => {

      const k =
        e.dataset.key.split('.');

      const v =
        k[0] === 'crop'
        ? crop[k[1]]
        : S[k[0]][k[1]];

      e.value = v;

      const o =
        $('val-'+e.dataset.key);

      if(o){

        o.textContent =
          fmt(v) +
          (
            e.dataset.key.includes('opacity') ||
            e.dataset.key.includes('Blend') ||
            e.dataset.key.includes('Balance')
            ? '%'
            :
            e.dataset.key === 'crop.angle'
            ? '°'
            :
            e.dataset.key === 'transform.scale'
            ? '×'
            :
            ''
          );

      }

    });

}

function updateUI(){

  $('undoBtn').disabled =
    !history.length;

  $('redoBtn').disabled =
    !future.length;

  $('editCount').textContent =
    countEdits() + ' edits';

  tabs.forEach(t =>
    t.classList.toggle(
      'active',
      t.dataset.tool === active
    )
  );

}

function countEdits(){

  let n = 0;

  for(const group of Object.values(S)){

    for(const v of Object.values(group)){

      if(
        typeof v === 'number' &&
        Math.abs(v) > 0
      ){
        n++;
      }

    }

  }

  n += layers.length;
  n += S.retouch.ops.length;

  return n;

}

function action(a){

  if(!img && a !== 'resetAll')
    return toast('Open a photo first');

  if(
    [
      'auto',
      'toneCurve',
      'rotL',
      'rotR',
      'flipH',
      'flipV',
      'cropApply',
      'cropReset',
      'addText',
      'deleteLayer',
      'clearDraw',
      'removeLastStroke',
      'clearLayers',
      'resetAll',
      'copyState'
    ].includes(a)
  ){
    if(a !== 'copyState')
      pushHistory();
  }

  if(a === 'auto'){

    S.light.exposure = 5;
    S.light.contrast = 8;
    S.light.highlights = -12;
    S.light.shadows = 15;
    S.light.whites = 4;
    S.light.blacks = -4;

  }

  if(a === 'toneCurve'){

    S.light.contrast =
      clamp(
        S.light.contrast + 14,
        -100,
        100
      );

    S.light.highlights =
      clamp(
        S.light.highlights - 8,
        -100,
        100
      );

    S.light.shadows =
      clamp(
        S.light.shadows + 8,
        -100,
        100
      );

    toast('Tone curve look applied');

  }

  if(a === 'rotL')
    crop.angle -= 90;

  if(a === 'rotR')
    crop.angle += 90;

  if(a === 'flipH')
    S.transform.flipX *= -1;

  if(a === 'flipV')
    S.transform.flipY *= -1;

  if(a === 'cropApply')
    applyCrop();

  if(a === 'cropReset'){

    crop = {
      x:0,
      y:0,
      w:1,
      h:1,
      ratio:'free',
      angle:0
    };

    S.transform = {
      scale:1,
      offsetX:0,
      offsetY:0,
      perspectiveX:0,
      perspectiveY:0,
      flipX:1,
      flipY:1
    };

  }

  if(a === 'addText'){

    if(!S.text.value.trim())
      return toast('Enter text first');

    layers.push({

      type:'text',

      name:
        S.text.value.slice(0,22),

      x:.5,
      y:.5,

      settings:
        deepClone(S.text)

    });

    selectedLayer =
      layers.length - 1;

    S.text.value = '';

  }

  if(
    a === 'deleteLayer' &&
    selectedLayer >= 0
  ){

    layers.splice(
      selectedLayer,
      1
    );

    selectedLayer = -1;

  }

  if(a === 'clearDraw'){

    layers =
      layers.filter(
        l => l.type !== 'draw'
      );

  }

  if(a === 'removeLastStroke'){

    let i = -1;

    for(
      let j=layers.length-1;
      j>=0;
      j--
    ){

      if(layers[j].type === 'draw'){

        i = j;
        break;

      }

    }

    if(i >= 0)
      layers.splice(i,1);

  }

  if(a === 'clearLayers')
    layers = [];

  if(a === 'download')
    return exportImage();

  if(a === 'resetAll'){

    history = [];
    future = [];

    resetAll();

    return;

  }

  if(a === 'copyState'){

    navigator.clipboard
      ?.writeText(
        JSON.stringify({
          S,
          crop,
          layers
        })
      );

    toast('Settings copied');

  }

  renderPanel();
  render();
  updateUI();

}

function resetAll(){

  S.light = {
    exposure:0,
    contrast:0,
    highlights:0,
    shadows:0,
    whites:0,
    blacks:0
  };

  S.color = {
    temp:0,
    tint:0,
    vibrance:0,
    saturation:0,
    hue:0,

    redH:0,redS:0,redL:0,
    orangeH:0,orangeS:0,orangeL:0,
    yellowH:0,yellowS:0,yellowL:0,
    greenH:0,greenS:0,greenL:0,
    aquaH:0,aquaS:0,aquaL:0,
    blueH:0,blueS:0,blueL:0,
    purpleH:0,purpleS:0,purpleL:0,
    magentaH:0,magentaS:0,magentaL:0,

    gradeShadow:'#2020ff',
    gradeMid:'#ffffff',
    gradeHigh:'#fff0d0',

    gradeBalance:0,
    gradeBlend:50
  };

  S.effects = {
    texture:0,
    clarity:0,
    dehaze:0,
    vignette:0,
    midpoint:50,
    feather:50,
    roundness:0,
    grain:0,
    grainSize:50,
    roughness:50,
    fade:0,
    glow:0,
    sepia:0,
    presetAmount:100
  };

  S.detail = {
    sharp:0,
    radius:1,
    detail:50,
    masking:0,
    noise:0,
    colorNoise:0
  };

  S.transform = {
    scale:1,
    offsetX:0,
    offsetY:0,
    perspectiveX:0,
    perspectiveY:0,
    flipX:1,
    flipY:1
  };

  S.mask = {
    mode:'off',
    x:.5,
    y:.5,
    size:.45,
    feather:.5,
    exposure:0,
    contrast:0,
    highlights:0,
    shadows:0,
    saturation:0,
    temp:0,
    tint:0,
    texture:0,
    clarity:0
  };

  S.blur = {
    mode:'radial',
    amount:0,
    focusX:50,
    focusY:50,
    size:45,
    feather:55
  };

  S.text.value = '';

  S.retouch.ops = [];

  layers = [];

  selectedLayer = -1;

  crop = {
    x:0,
    y:0,
    w:1,
    h:1,
    ratio:'free',
    angle:0
  };

  renderPanel();
  render();
  updateUI();

  toast('All edits reset');

}

function loadLayer(){

  const l =
    layers[selectedLayer];

  if(
    l &&
    l.type === 'text'
  ){

    Object.assign(
      S.text,
      deepClone(l.settings)
    );

  }

}

function applyPreset(name){

  if(!img) return;

  pushHistory();

  const presets = {

    clean:
      [0,0,0,0,0,0],

    warm:
      [4,4,-10,12,2,-4],

    cool:
      [3,6,4,6,2,-5],

    cinematic:
      [-3,22,-18,12,-2,-14],

    matte:
      [3,-8,-6,18,-5,8],

    vivid:
      [2,18,-12,10,6,-5],

    portrait:
      [4,-3,-20,18,2,-2],

    bw:
      [0,18,0,0,0,-8],

    noir:
      [-4,38,-20,5,-8,-20],

    sunset:
      [5,8,-14,14,4,-3],

    teal:
      [1,20,-10,12,0,-7]

  };

  const p =
    presets[name] ||
    presets.clean;

  const amount =
    (S.effects.presetAmount || 100) / 100;

  S.light.exposure =
    p[0] * amount;

  S.light.contrast =
    p[1] * amount;

  S.light.highlights =
    p[2] * amount;

  S.light.shadows =
    p[3] * amount;

  S.light.whites =
    p[4] * amount;

  S.light.blacks =
    p[5] * amount;

  S.color.saturation =
    (
      name === 'bw'
      ? -100
      :
      name === 'vivid'
      ? 25
      :
      0
    ) * amount;

  S.color.temp =
    (
      name === 'warm' ||
      name === 'sunset'
      ? 18
      :
      name === 'cool'
      ? -18
      :
      0
    ) * amount;

  S.effects.fade =
    (
      name === 'matte' ||
      name === 'vintage'
      ? 22
      :
      0
    ) * amount;

  S.effects.grain =
    name === 'vintage'
    ? 20 * amount
    : 0;

  S.effects.vignette =
    [
      'cinematic',
      'noir',
      'portrait'
    ].includes(name)
    ? 20 * amount
    : 0;

  S.effects.sepia =
    name === 'vintage'
    ? 25 * amount
    : 0;

  toast(
    name + ' preset applied'
  );

  render();
  updateUI();

}

function openFile(file){

  if(
    !file ||
    !file.type.startsWith('image/')
  ){

    return toast(
      'Please choose an image'
    );

  }

  const reader =
    new FileReader();

  reader.onload = () => {

    const im =
      new Image();

    im.onload = () => {

      original = im;
      img = im;

      fileName = file.name;

      history = [];
      future = [];

      layers = [];
      selectedLayer = -1;

      S.retouch.ops = [];

      resetCrop();

      $('fileName').textContent =
        file.name;

      $('fileInfo').textContent =
        `${im.naturalWidth} × ${im.naturalHeight}px`;

      $('emptyState').style.display =
        'none';

      wrap.style.display =
        'block';

      fitToScreen();

      render();

      toast('Photo opened');

    };

    im.src = reader.result;

  };

  reader.readAsDataURL(file);

}

function resetCrop(){

  crop = {
    x:0,
    y:0,
    w:1,
    h:1,
    ratio:'free',
    angle:0
  };

}

function fitToScreen(){

  if(!img) return;

  const sw =
    stage.clientWidth * .9;

  const sh =
    stage.clientHeight * .88;

  fitScale =
    Math.min(
      sw / img.naturalWidth,
      sh / img.naturalHeight
    );

  zoom = 1;
  panX = 0;
  panY = 0;

  updateTransform();

}

function updateTransform(){

  if(!img) return;

  const w = canvas.width;
  const h = canvas.height;

  wrap.style.width =
    w + 'px';

  wrap.style.height =
    h + 'px';

  wrap.style.transform =
    `translate(${panX}px,${panY}px) scale(${fitScale*zoom})`;

  $('zoomLabel').textContent =
    Math.round(zoom*100) + '%';

}

function resizeCanvas(){

  if(!img) return;

  const max = 1200;

  const sc =
    Math.min(
      1,
      max /
      Math.max(
        img.naturalWidth,
        img.naturalHeight
      )
    );

  canvas.width =
    Math.max(
      1,
      Math.round(
        img.naturalWidth * sc
      )
    );

  canvas.height =
    Math.max(
      1,
      Math.round(
        img.naturalHeight * sc
      )
    );

  overlay.width =
    canvas.width;

  overlay.height =
    canvas.height;

}

function render(){

  if(!img) return;

  resizeCanvas();

  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(
    0,
    0,
    W,
    H
  );

  if(before){

    ctx.drawImage(
      original,
      0,
      0,
      W,
      H
    );

    drawOverlay();
    updateTransform();

    return;

  }

  const work =
    document.createElement('canvas');

  work.width = W;
  work.height = H;

  const wc =
    work.getContext(
      '2d',
      {willReadFrequently:true}
    );

  wc.save();

  wc.translate(
    W/2,
    H/2
  );

  wc.translate(
    S.transform.offsetX/100 * W/2,
    S.transform.offsetY/100 * H/2
  );

  wc.rotate(
    crop.angle *
    Math.PI /
    180
  );

  wc.scale(
    S.transform.scale *
    S.transform.flipX,
    S.transform.scale *
    S.transform.flipY
  );

  wc.transform(
    1,
    S.transform.perspectiveY/500,
    S.transform.perspectiveX/500,
    1,
    0,
    0
  );

  wc.drawImage(
    img,
    -W/2,
    -H/2,
    W,
    H
  );

  wc.restore();

  let data =
    wc.getImageData(
      0,
      0,
      W,
      H
    );

  processPixels(
    data,
    W,
    H
  );

  ctx.putImageData(
    data,
    0,
    0
  );

  drawOverlay();
  drawCropGuide();

  updateTransform();

  drawHistogram();

}

function processPixels(d,W,H){

  const a = d.data;

  const L = S.light;
  const C = S.color;
  const E = S.effects;
  const D = S.detail;
  const M = S.mask;
  const B = S.blur;

  const exp =
    Math.pow(
      2,
      L.exposure / 100
    );

  const contrast =
    (
      259 *
      (L.contrast + 255)
    ) /
    (
      255 *
      (259 - L.contrast)
    );

  const sat =
    1 +
    C.saturation / 100;

  for(
    let i=0;
    i<a.length;
    i+=4
  ){

    let r =
      a[i] * exp;

    let g =
      a[i+1] * exp;

    let b =
      a[i+2] * exp;

    let lum =
      .2126*r +
      .7152*g +
      .0722*b;

    const sh =
      Math.max(
        0,
        (128-lum)/128
      ) *
      (L.shadows/100);

    const hi =
      Math.max(
        0,
        (lum-128)/127
      ) *
      (L.highlights/100);

    r += sh*55 - hi*55;
    g += sh*55 - hi*55;
    b += sh*55 - hi*55;

    r =
      (r-128)*contrast+128;

    g =
      (g-128)*contrast+128;

    b =
      (b-128)*contrast+128;

    const avg =
      (r+g+b)/3;

    r =
      avg +
      (r-avg)*sat;

    g =
      avg +
      (g-avg)*sat;

    b =
      avg +
      (b-avg)*sat;

    [
      r,
      g,
      b
    ] =
      applyHslMix(
        r,
        g,
        b,
        C
      );

    const vib =
      C.vibrance/100;

    const mx =
      Math.max(r,g,b);

    const mn =
      Math.min(r,g,b);

    const vs =
      (mx-mn)/255;

    r +=
      (r-avg) *
      vib *
      (1-vs);

    g +=
      (g-avg) *
      vib *
      (1-vs);

    b +=
      (b-avg) *
      vib *
      (1-vs);

    const warm =
      C.temp/100;

    r += warm*18;
    b -= warm*18;

    g +=
      C.tint/100*5;

    [
      r,
      g,
      b
    ] =
      rotateRGB(
        r,
        g,
        b,
        C.hue
      );

    const x =
      (i/4 % W)/W;

    const y =
      Math.floor(i/4/W)/H;

    let m = 1;

    if(M.mode === 'radial'){

      const dx =
        x-M.x;

      const dy =
        y-M.y;

      const dist =
        Math.sqrt(
          dx*dx+
          dy*dy
        );

      m =
        1 -
        smoothstep(
          M.size,
          M.size *
          (1-M.feather),
          dist
        );

    }

    else if(M.mode === 'linear'){

      m =
        1 -
        smoothstep(
          .1,
          .9,
          Math.abs(
            (x-.5)*.9 +
            (y-.5)*.9
          )
        );

    }

    if(
      m > 0 &&
      M.mode !== 'off'
    ){

      const ml =
        M.exposure/100;

      r += ml*50*m;
      g += ml*50*m;
      b += ml*50*m;

      const ma =
        M.contrast/100;

      r =
        (r-128) *
        (1+ma*m) +
        128;

      g =
        (g-128) *
        (1+ma*m) +
        128;

      b =
        (b-128) *
        (1+ma*m) +
        128;

      const ms =
        1 +
        M.saturation/100*m;

      r =
        128 +
        (r-128)*ms;

      g =
        128 +
        (g-128)*ms;

      b =
        128 +
        (b-128)*ms;

    }

    const vign =
      E.vignette/100;

    if(vign !== 0){

      const dx =
        (x-.5)*1.4;

      const dy =
        (y-.5)*1.4;

      const shape =
        1 +
        E.roundness/100*.65;

      const edge =
        Math.min(
          1,
          Math.sqrt(
            Math.abs(
              dx*dx*shape
            ) +
            Math.abs(
              dy*dy/shape
            )
          )
        );

      const start =
        E.midpoint/100*.65;

      const soft =
        Math.max(
          .08,
          E.feather/100*.55
        );

      const vv =
        clamp(
          (edge-start)/soft,
          0,
          1
        );

      const v =
        1 -
        vign *
        vv *
        vv;

      r *= v;
      g *= v;
      b *= v;

    }

    if(E.glow > 0){

      const glow =
        E.glow/100;

      const br =
        Math.max(
          1,
          Math.round(
            1+glow*4
          )
        );

      r +=
        (255-r) *
        glow *
        .08 *
        br;

      g +=
        (255-g) *
        glow *
        .08 *
        br;

      b +=
        (255-b) *
        glow *
        .08 *
        br;

    }

    const clarity =
      E.clarity/100;

    if(clarity){

      const mid =
        (r+g+b)/3;

      r +=
        (r-mid) *
        clarity *
        .28;

      g +=
        (g-mid) *
        clarity *
        .28;

      b +=
        (b-mid) *
        clarity *
        .28;

    }

    const texture =
      E.texture/100;

    if(texture){

      r +=
        (r-128) *
        texture *
        .12;

      g +=
        (g-128) *
        texture *
        .12;

      b +=
        (b-128) *
        texture *
        .12;

    }

    const dehaze =
      E.dehaze/100;

    if(dehaze){

      r =
        (r-128) *
        (1+dehaze*.22) +
        128;

      g =
        (g-128) *
        (1+dehaze*.22) +
        128;

      b =
        (b-128) *
        (1+dehaze*.22) +
        128;

    }

    const fade =
      E.fade/100;

    r =
      r*(1-fade)+
      fade*24;

    g =
      g*(1-fade)+
      fade*27;

    b =
      b*(1-fade)+
      fade*31;

    [
      r,
      g,
      b
    ] =
      applyGrade(
        r,
        g,
        b,
        C
      );

    if(E.sepia){

      const q =
        E.sepia/100;

      const nr =
        r*.393 +
        g*.769 +
        b*.189;

      const ng =
        r*.349 +
        g*.686 +
        b*.168;

      const nb =
        r*.272 +
        g*.534 +
        b*.131;

      r =
        r*(1-q)+
        nr*q;

      g =
        g*(1-q)+
        ng*q;

      b =
        b*(1-q)+
        nb*q;

    }

    a[i] =
      clamp(r,0,255);

    a[i+1] =
      clamp(g,0,255);

    a[i+2] =
      clamp(b,0,255);

  }

  if(S.retouch.ops.length)
    applyRetouchOps(
      d,
      W,
      H,
      S.retouch.ops
    );

  if(
    D.sharp > 0 ||
    D.noise > 0 ||
    D.colorNoise > 0
  ){

    applyDetail(
      d,
      W,
      H
    );

  }

  if(E.grain > 0){

    addGrain(
      d,
      E.grain,
      E.grainSize,
      E.roughness
    );

  }

  if(B.amount > 0){

    applyBlurLocal(
      d,
      W,
      H
    );

  }

}

function applyHslMix(r,g,b,C){

  let [h,s,l] =
    rgbToHsl(
      r,
      g,
      b
    );

  const groups = [

    ['red',0],
    ['orange',30],
    ['yellow',60],
    ['green',120],
    ['aqua',180],
    ['blue',220],
    ['purple',275],
    ['magenta',325]

  ];

  for(
    const [name,center]
    of groups
  ){

    const d =
      Math.abs(
        (
          (h-center+180)%360
        )-180
      );

    const w =
      clamp(
        1-d/35,
        0,
        1
      );

    if(w <= 0)
      continue;

    h =
      (
        h +
        C[name+'H'] *
        w +
        360
      ) % 360;

    s =
      clamp(
        s +
        C[name+'S']/100*w,
        0,
        1
      );

    l =
      clamp(
        l +
        C[name+'L']/100*w,
        0,
        1
      );

  }

  return hslToRgb(
    h,
    s,
    l
  );

}

function rgbToHsl(r,g,b){

  r/=255;
  g/=255;
  b/=255;

  const mx =
    Math.max(r,g,b);

  const mn =
    Math.min(r,g,b);

  const d =
    mx-mn;

  let h = 0;

  const l =
    (mx+mn)/2;

  if(d){

    const s =
      d /
      (
        1 -
        Math.abs(
          2*l-1
        )
      );

    if(mx === r)
      h =
        60 *
        (
          ((g-b)/d)%6
        );

    else if(mx === g)
      h =
        60 *
        (
          (b-r)/d+2
        );

    else
      h =
        60 *
        (
          (r-g)/d+4
        );

    if(h < 0)
      h += 360;

    return [
      h,
      s,
      l
    ];

  }

  return [
    0,
    0,
    l
  ];

}

function hslToRgb(h,s,l){

  const c =
    (
      1 -
      Math.abs(
        2*l-1
      )
    ) *
    s;

  const x =
    c *
    (
      1 -
      Math.abs(
        (h/60)%2-1
      )
    );

  const m =
    l-c/2;

  let r=0;
  let g=0;
  let b=0;

  if(h < 60)
    [r,g,b]=[c,x,0];

  else if(h < 120)
    [r,g,b]=[x,c,0];

  else if(h < 180)
    [r,g,b]=[0,c,x];

  else if(h < 240)
    [r,g,b]=[0,x,c];

  else if(h < 300)
    [r,g,b]=[x,0,c];

  else
    [r,g,b]=[c,0,x];

  return [
    (r+m)*255,
    (g+m)*255,
    (b+m)*255
  ];

}

function hexRgb(hex){

  const n =
    parseInt(
      hex.slice(1),
      16
    );

  return [
    (n>>16)&255,
    (n>>8)&255,
    n&255
  ];

}

function applyGrade(r,g,b,C){

  const sh =
    hexRgb(
      C.gradeShadow
    );

  const mi =
    hexRgb(
      C.gradeMid
    );

  const hi =
    hexRgb(
      C.gradeHigh
    );

  const lum =
    (
      r*.2126+
      g*.7152+
      b*.0722
    )/255;

  let w =
    lum < .5
    ? 1-lum*2
    : 0;

  let q =
    lum > .5
    ? (lum-.5)*2
    : 0;

  let m =
    1 -
    Math.abs(
      lum-.5
    )*2;

  const bal =
    C.gradeBalance/100;

  if(bal > 0)
    w *= 1-bal;
  else
    q *= 1+bal;

  const blend =
    C.gradeBlend/100*.35;

  return [

    r +
    (sh[0]-r)*w*blend +
    (mi[0]-r)*m*blend*.65 +
    (hi[0]-r)*q*blend,

    g +
    (sh[1]-g)*w*blend +
    (mi[1]-g)*m*blend*.65 +
    (hi[1]-g)*q*blend,

    b +
    (sh[2]-b)*w*blend +
    (mi[2]-b)*m*blend*.65 +
    (hi[2]-b)*q*blend

  ];

}

function rotateRGB(r,g,b,h){

  if(!h)
    return [r,g,b];

  const mx =
    Math.max(r,g,b);

  const mn =
    Math.min(r,g,b);

  const d =
    mx-mn;

  if(d < 1)
    return [r,g,b];

  let H =
    mx === r
    ?
    60 *
    (
      (g-b)/d%6
    )
    :
    mx === g
    ?
    60 *
    (
      (b-r)/d+2
    )
    :
    60 *
    (
      (r-g)/d+4
    );

  if(H < 0)
    H += 360;

  H =
    (H+h+360)%360;

  const s =
    d/mx;

  const v =
    mx/255;

  return hsvRgb(
    H,
    s,
    v
  ).map(
    x => x*255
  );

}

function hsvRgb(h,s,v){

  const c =
    v*s;

  const x =
    c *
    (
      1 -
      Math.abs(
        h/60%2-1
      )
    );

  const m =
    v-c;

  let r=0;
  let g=0;
  let b=0;

  if(h < 60)
    [r,g,b]=[c,x,0];

  else if(h < 120)
    [r,g,b]=[x,c,0];

  else if(h < 180)
    [r,g,b]=[0,c,x];

  else if(h < 240)
    [r,g,b]=[0,x,c];

  else if(h < 300)
    [r,g,b]=[x,0,c];

  else
    [r,g,b]=[c,0,x];

  return [
    r+m,
    g+m,
    b+m
  ];

}

function smoothstep(a,b,x){

  x =
    clamp(
      (x-a)/(b-a),
      0,
      1
    );

  return (
    x*x*(3-2*x)
  );

}

function applyDetail(d,W,H){

  const src =
    new Uint8ClampedArray(
      d.data
    );

  const a =
    d.data;

  const sharp =
    S.detail.sharp/100;

  const noise =
    S.detail.noise/100;

  const colorNoise =
    S.detail.colorNoise/100;

  for(
    let y=1;
    y<H-1;
    y++
  ){

    for(
      let x=1;
      x<W-1;
      x++
    ){

      const i =
        (y*W+x)*4;

      if(sharp){

        for(
          let c=0;
          c<3;
          c++
        ){

          const n =
            (
              src[
                ((y-1)*W+x)*4+c
              ] +

              src[
                ((y+1)*W+x)*4+c
              ] +

              src[
                (y*W+x-1)*4+c
              ] +

              src[
                (y*W+x+1)*4+c
              ]
            )/4;

          a[i+c] =
            clamp(
              src[i+c] +
              (
                src[i+c]-n
              ) *
              sharp *
              1.8,
              0,
              255
            );

        }

      }

      if(noise){

        for(
          let c=0;
          c<3;
          c++
        ){

          a[i+c] =
            a[i+c] *
            (1-noise) +

            (
              src[
                ((y-1)*W+x)*4+c
              ] +

              src[
                ((y+1)*W+x)*4+c
              ] +

              src[
                (y*W+x-1)*4+c
              ] +

              src[
                (y*W+x+1)*4+c
              ]
            )/4 *
            noise;

        }

      }

      if(colorNoise){

        const avg =
          (
            a[i]+
            a[i+1]+
            a[i+2]
          )/3;

        a[i] +=
          (
            avg-a[i]
          ) *
          colorNoise *
          .5;

        a[i+1] +=
          (
            avg-a[i+1]
          ) *
          colorNoise *
          .5;

        a[i+2] +=
          (
            avg-a[i+2]
          ) *
          colorNoise *
          .5;

      }

    }

  }

}

function addGrain(
  d,
  amount,
  size,
  rough
){

  const a =
    d.data;

  const n =
    amount*1.4;

  for(
    let i=0;
    i<a.length;
    i+=4
  ){

    const g =
      (
        Math.random()-.5
      ) *
      n *
      (
        .45+
        rough/100
      );

    a[i] =
      clamp(
        a[i]+g,
        0,
        255
      );

    a[i+1] =
      clamp(
        a[i+1]+g,
        0,
        255
      );

    a[i+2] =
      clamp(
        a[i+2]+g,
        0,
        255
      );

  }

}

function applyBlurLocal(
  d,
  W,
  H
){

  const src =
    new Uint8ClampedArray(
      d.data
    );

  const a =
    d.data;

  const amt =
    Math.round(
      S.blur.amount
    );

  if(!amt)
    return;

  for(
    let y=0;
    y<H;
    y++
  ){

    for(
      let x=0;
      x<W;
      x++
    ){

      const nx =
        (
          x/W*100 -
          S.blur.focusX
        ) /
        S.blur.size;

      const ny =
        (
          y/H*100 -
          S.blur.focusY
        ) /
        S.blur.size;

      let m =
        S.blur.mode === 'full'
        ? 1
        :
        Math.min(
          1,
          Math.sqrt(
            nx*nx+
            ny*ny
          )
        );

      m =
        Math.pow(
          m,
          Math.max(
            .25,
            2 -
            S.blur.feather/60
          )
        );

      if(m < .03)
        continue;

      let rr=0;
      let gg=0;
      let bb=0;
      let cnt=0;

      const step =
        Math.max(
          1,
          Math.floor(
            amt/3
          ) || 1
        );

      for(
        let yy=-amt;
        yy<=amt;
        yy+=step
      ){

        for(
          let xx=-amt;
          xx<=amt;
          xx+=step
        ){

          const X =
            clamp(
              x+xx,
              0,
              W-1
            );

          const Y =
            clamp(
              y+yy,
              0,
              H-1
            );

          const j =
            (Y*W+X)*4;

          rr += src[j];
          gg += src[j+1];
          bb += src[j+2];

          cnt++;

        }

      }

      const i =
        (y*W+x)*4;

      a[i] =
        src[i]*(1-m) +
        rr/cnt*m;

      a[i+1] =
        src[i+1]*(1-m) +
        gg/cnt*m;

      a[i+2] =
        src[i+2]*(1-m) +
        bb/cnt*m;

    }

  }

}

function applyRetouchOps(
  d,
  W,
  H,
  ops
){

  const src =
    new Uint8ClampedArray(
      d.data
    );

  for(
    const op of ops
  ){

    const rad =
      Math.max(
        2,
        Math.round(
          op.size/2/100*
          Math.min(W,H)
        )
      );

    const q =
      clamp(
        op.opacity/100,
        0,
        1
      );

    for(
      const p of op.points || []
    ){

      const sx =
        Math.round(
          p.x*W
        );

      const sy =
        Math.round(
          p.y*H
        );

      for(
        let yy=-rad;
        yy<=rad;
        yy++
      ){

        for(
          let xx=-rad;
          xx<=rad;
          xx++
        ){

          if(
            xx*xx+
            yy*yy >
            rad*rad
          )
            continue;

          const X =
            clamp(
              sx+xx,
              0,
              W-1
            );

          const Y =
            clamp(
              sy+yy,
              0,
              H-1
            );

          const i =
            (Y*W+X)*4;

          const rx =
            clamp(
              sx-xx,
              0,
              W-1
            );

          const ry =
            clamp(
              sy-yy,
              0,
              H-1
            );

          const j =
            (ry*W+rx)*4;

          const edge =
            Math.sqrt(
              xx*xx+
              yy*yy
            ) /
            rad;

          const k =
            q *
            (1-edge) *
            (1-edge);

          if(op.mode === 'burn'){

            d.data[i] *=
              1-k*.5;

            d.data[i+1] *=
              1-k*.5;

            d.data[i+2] *=
              1-k*.5;

          }

          else if(op.mode === 'dodge'){

            d.data[i] +=
              (
                255-d.data[i]
              ) *
              k*.5;

            d.data[i+1] +=
              (
                255-d.data[i+1]
              ) *
              k*.5;

            d.data[i+2] +=
              (
                255-d.data[i+2]
              ) *
              k*.5;

          }

          else{

            d.data[i] =
              src[i]*(1-k)+
              src[j]*k;

            d.data[i+1] =
              src[i+1]*(1-k)+
              src[j+1]*k;

            d.data[i+2] =
              src[i+2]*(1-k)+
              src[j+2]*k;

          }

        }

      }

    }

  }

}

function drawOverlay(){

  octx.clearRect(
    0,
    0,
    overlay.width,
    overlay.height
  );

  for(
    const l of layers
  ){

    if(l.type === 'text')
      drawText(l);

    if(l.type === 'draw')
      drawStroke(l);

  }

  if(S.guides.grid)
    drawGrid();

}

function drawText(l){

  const t =
    l.settings ||
    S.text;

  octx.save();

  octx.translate(
    l.x*overlay.width,
    l.y*overlay.height
  );

  octx.rotate(
    (t.rotation||0) *
    Math.PI/180
  );

  octx.globalAlpha =
    (t.opacity||100)/100;

  octx.font =
    `${t.italic?'italic ':''}` +
    `${t.bold?'700 ':''}` +
    `${t.size}px ${t.font}`;

  octx.textAlign =
    t.align;

  octx.textBaseline =
    'middle';

  if(t.strokeWidth){

    octx.lineWidth =
      t.strokeWidth;

    octx.strokeStyle =
      t.stroke;

    octx.strokeText(
      l.name,
      0,
      0
    );

  }

  octx.fillStyle =
    t.color;

  octx.fillText(
    l.name,
    0,
    0
  );

  octx.restore();

}

function drawStroke(l){

  const pts =
    l.points || [];

  if(pts.length < 2)
    return;

  octx.save();

  octx.globalAlpha =
    l.opacity || 1;

  octx.strokeStyle =
    l.color;

  octx.lineWidth =
    l.size;

  octx.lineCap =
    'round';

  octx.lineJoin =
    'round';

  octx.beginPath();

  octx.moveTo(
    pts[0].x*overlay.width,
    pts[0].y*overlay.height
  );

  for(
    let i=1;
    i<pts.length;
    i++
  ){

    octx.lineTo(
      pts[i].x*overlay.width,
      pts[i].y*overlay.height
    );

  }

  octx.stroke();

  octx.restore();

}

function drawGrid(){

  octx.save();

  octx.strokeStyle =
    '#ffffff55';

  octx.lineWidth = 1;

  for(
    let i=1;
    i<3;
    i++
  ){

    octx.beginPath();

    octx.moveTo(
      overlay.width*i/3,
      0
    );

    octx.lineTo(
      overlay.width*i/3,
      overlay.height
    );

    octx.stroke();

    octx.beginPath();

    octx.moveTo(
      0,
      overlay.height*i/3
    );

    octx.lineTo(
      overlay.width,
      overlay.height*i/3
    );

    octx.stroke();

  }

  octx.restore();

}

function drawCropGuide(){

  if(active !== 'crop')
    return;

  octx.save();

  octx.fillStyle =
    '#00000066';

  octx.fillRect(
    0,
    0,
    overlay.width,
    overlay.height
  );

  let x =
    crop.x *
    overlay.width;

  let y =
    crop.y *
    overlay.height;

  let w =
    crop.w *
    overlay.width;

  let h =
    crop.h *
    overlay.height;

  if(
    crop.ratio !== 'free'
  ){

    const [
      rw,
      rh
    ] =
      crop.ratio
      .split(':')
      .map(Number);

    const target =
      rw/rh;

    let nw=w;
    let nh=w/target;

    if(nh > h){

      nh=h;
      nw=h*target;

    }

    x +=
      (w-nw)/2;

    y +=
      (h-nh)/2;

    w=nw;
    h=nh;

  }

  octx.clearRect(
    x,
    y,
    w,
    h
  );

  octx.strokeStyle =
    '#fff';

  octx.lineWidth = 2;

  octx.strokeRect(
    x,
    y,
    w,
    h
  );

  octx.strokeStyle =
    '#ffffff66';

  octx.lineWidth = 1;

  for(
    let i=1;
    i<3;
    i++
  ){

    octx.beginPath();

    octx.moveTo(
      x+w*i/3,
      y
    );

    octx.lineTo(
      x+w*i/3,
      y+h
    );

    octx.stroke();

    octx.beginPath();

    octx.moveTo(
      x,
      y+h*i/3
    );

    octx.lineTo(
      x+w,
      y+h*i/3
    );

    octx.stroke();

  }

  octx.restore();

}

function setCropRatio(){

  if(
    crop.ratio === 'free'
  )
    return;

  const [
    rw,
    rh
  ] =
    crop.ratio
    .split(':')
    .map(Number);

  let w =
    crop.w;

  let h =
    w*rh/rw;

  if(h > crop.h){

    h =
      crop.h;

    w =
      h*rw/rh;

  }

  crop.x =
    (1-w)/2;

  crop.y =
    (1-h)/2;

  crop.w =
    w;

  crop.h =
    h;

}

function applyCrop(){

  if(!img)
    return;

  const W =
    canvas.width;

  const H =
    canvas.height;

  const x =
    Math.round(
      crop.x*W
    );

  const y =
    Math.round(
      crop.y*H
    );

  const w =
    Math.round(
      crop.w*W
    );

  const h =
    Math.round(
      crop.h*H
    );

  const tmp =
    document.createElement(
      'canvas'
    );

  tmp.width =
    Math.max(1,w);

  tmp.height =
    Math.max(1,h);

  tmp.getContext('2d')
    .drawImage(
      canvas,
      x,
      y,
      w,
      h,
      0,
      0,
      w,
      h
    );

  const im =
    new Image();

  im.onload = () => {

    img = im;

    crop = {
      x:0,
      y:0,
      w:1,
      h:1,
      ratio:'free',
      angle:0
    };

    S.transform.scale = 1;
    S.transform.offsetX = 0;
    S.transform.offsetY = 0;
    S.transform.perspectiveX = 0;
    S.transform.perspectiveY = 0;
    S.transform.flipX = 1;
    S.transform.flipY = 1;

    render();
    fitToScreen();
    renderPanel();

  };

  im.src =
    tmp.toDataURL(
      'image/png'
    );

}

function pointerPos(e){

  const r =
    canvas.getBoundingClientRect();

  return {

    x:clamp(
      (e.clientX-r.left)/r.width,
      0,
      1
    ),

    y:clamp(
      (e.clientY-r.top)/r.height,
      0,
      1
    )

  };

}

function handlePointerDown(e){

  if(!img)
    return;

  e.preventDefault();

  stage.setPointerCapture?.(
    e.pointerId
  );

  pointers.set(
    e.pointerId,
    e
  );

  if(active === 'text'){

    const p =
      pointerPos(e);

    let hit = -1;

    for(
      let i=layers.length-1;
      i>=0;
      i--
    ){

      if(
        layers[i].type === 'text' &&
        Math.hypot(
          p.x-layers[i].x,
          p.y-layers[i].y
        ) < .18
      ){

        hit = i;
        break;

      }

    }

    if(hit >= 0){

      selectedLayer =
        hit;

      drawing = {

        type:'moveText',

        startX:p.x,
        startY:p.y,

        x:layers[hit].x,
        y:layers[hit].y

      };

      renderPanel();

      return;

    }

  }

  if(active === 'draw'){

    pushHistory();

    const p =
      pointerPos(e);

    const l = {

      type:'draw',

      name:'Brush stroke',

      points:[p],

      size:S.draw.size,

      opacity:
        S.draw.opacity/100,

      color:S.draw.color

    };

    layers.push(l);

    selectedLayer =
      layers.length-1;

    drawing = {
      type:'draw',
      layer:l
    };

    render();

    return;

  }

  if(active === 'retouch'){

    pushHistory();

    drawing = {

      type:'retouch',

      points:[
        pointerPos(e)
      ]

    };

    retouchAt(e);

    return;

  }

  if(active === 'mask'){

    const p =
      pointerPos(e);

    S.mask.x =
      p.x;

    S.mask.y =
      p.y;

    render();

    return;

  }

  if(active === 'blur'){

    const p =
      pointerPos(e);

    S.blur.focusX =
      p.x*100;

    S.blur.focusY =
      p.y*100;

    render();

    return;

  }

  if(active === 'crop'){

    const p =
      pointerPos(e);

    if(
      p.x >= crop.x &&
      p.x <= crop.x+crop.w &&
      p.y >= crop.y &&
      p.y <= crop.y+crop.h
    ){

      drawing = {

        type:'crop',

        sx:p.x,
        sy:p.y,

        cx:crop.x,
        cy:crop.y

      };

      return;

    }

  }

  if(pointers.size === 1){

    gesture = {

      type:'pan',

      sx:e.clientX,
      sy:e.clientY,

      px:panX,
      py:panY

    };

  }

  if(pointers.size === 2){

    const [
      a,
      b
    ] =
      [...pointers.values()];

    gesture = {

      type:'pinch',

      dist:
        distance(a,b),

      zoom,

      mid:
        midpoint(a,b),

      px:panX,
      py:panY

    };

  }

}

function handlePointerMove(e){

  if(!img)
    return;

  e.preventDefault();

  if(
    drawing?.type ===
    'moveText'
  ){

    const p =
      pointerPos(e);

    const l =
      layers[selectedLayer];

    l.x =
      clamp(
        drawing.x +
        (
          p.x-
          drawing.startX
        ),
        0,
        1
      );

    l.y =
      clamp(
        drawing.y +
        (
          p.y-
          drawing.startY
        ),
        0,
        1
      );

    render();

    return;

  }

  if(
    drawing?.type ===
    'draw'
  ){

    drawing.layer.points.push(
      pointerPos(e)
    );

    render();

    return;

  }

  if(
    drawing?.type ===
    'retouch'
  ){

    drawing.points.push(
      pointerPos(e)
    );

    retouchAt(e);

    return;

  }

  if(
    drawing?.type ===
    'crop'
  ){

    const p =
      pointerPos(e);

    crop.x =
      clamp(
        drawing.cx +
        (
          p.x-
          drawing.sx
        ),
        0,
        1-crop.w
      );

    crop.y =
      clamp(
        drawing.cy +
        (
          p.y-
          drawing.sy
        ),
        0,
        1-crop.h
      );

    render();

    return;

  }

  pointers.set(
    e.pointerId,
    e
  );

  if(
    pointers.size === 1 &&
    gesture?.type === 'pan' &&
    zoom > 1
  ){

    panX =
      gesture.px +
      e.clientX -
      gesture.sx;

    panY =
      gesture.py +
      e.clientY -
      gesture.sy;

    updateTransform();

  }

  if(
    pointers.size === 2 &&
    gesture?.type === 'pinch'
  ){

    const [
      a,
      b
    ] =
      [...pointers.values()];

    const f =
      distance(a,b) /
      gesture.dist;

    zoom =
      clamp(
        gesture.zoom*f,
        .5,
        5
      );

    const m =
      midpoint(a,b);

    panX =
      gesture.px +
      m.x -
      gesture.mid.x;

    panY =
      gesture.py +
      m.y -
      gesture.mid.y;

    if(zoom <= 1){

      panX=0;
      panY=0;

    }

    updateTransform();

  }

}

function handlePointerUp(e){

  pointers.delete(
    e.pointerId
  );

  if(
    drawing?.type ===
    'retouch'
  ){

    S.retouch.ops.push({

      mode:
        S.retouch.mode,

      size:
        S.retouch.size,

      opacity:
        S.retouch.opacity,

      points:
        drawing.points

    });

    drawing = null;

    render();

  }

  else if(
    drawing?.type ===
    'draw'
  ){

    drawing = null;

  }

  if(
    drawing?.type ===
    'moveText'
  ){

    drawing = null;

    pushHistory();

  }

  if(
    drawing?.type ===
    'crop'
  ){

    drawing = null;

    pushHistory();

  }

  if(!pointers.size)
    gesture = null;

  const now =
    Date.now();

  if(
    now-lastTap < 280 &&
    active !== 'draw' &&
    active !== 'text' &&
    active !== 'retouch' &&
    active !== 'crop'
  ){

    if(zoom > 1){

      zoom=1;
      panX=0;
      panY=0;

    }

    else{

      zoom=2;

    }

    updateTransform();

  }

  lastTap = now;

}

function distance(a,b){

  return Math.hypot(
    a.clientX-b.clientX,
    a.clientY-b.clientY
  );

}

function midpoint(a,b){

  return {

    x:
      (a.clientX+b.clientX)/2,

    y:
      (a.clientY+b.clientY)/2

  };

}

function retouchAt(e){

  const p =
    pointerPos(e);

  const W =
    canvas.width;

  const H =
    canvas.height;

  const r =
    S.retouch.size /
    Math.min(W,H);

  const rad =
    Math.max(
      2,
      r *
      Math.min(W,H)
    );

  const sx =
    Math.round(
      p.x*W
    );

  const sy =
    Math.round(
      p.y*H
    );

  const R =
    Math.round(
      rad/2
    );

  const id =
    ctx.getImageData(
      0,
      0,
      W,
      H
    );

  const d =
    id.data;

  for(
    let y=-R;
    y<=R;
    y++
  ){

    for(
      let x=-R;
      x<=R;
      x++
    ){

      if(
        x*x+y*y >
        R*R
      )
        continue;

      const X =
        clamp(
          sx+x,
          0,
          W-1
        );

      const Y =
        clamp(
          sy+y,
          0,
          H-1
        );

      const i =
        (Y*W+X)*4;

      const refX =
        clamp(
          sx-x,
          0,
          W-1
        );

      const refY =
        clamp(
          sy-y,
          0,
          H-1
        );

      const j =
        (refY*W+refX)*4;

      const q =
        S.retouch.opacity/100;

      if(
        S.retouch.mode ===
        'burn'
      ){

        d[i] *=
          1-q*.45;

        d[i+1] *=
          1-q*.45;

        d[i+2] *=
          1-q*.45;

      }

      else if(
        S.retouch.mode ===
        'dodge'
      ){

        d[i] =
          clamp(
            d[i]+
            (
              255-d[i]
            ) *
            q*.45,
            0,
            255
          );

        d[i+1] =
          clamp(
            d[i+1]+
            (
              255-d[i+1]
            ) *
            q*.45,
            0,
            255
          );

        d[i+2] =
          clamp(
            d[i+2]+
            (
              255-d[i+2]
            ) *
            q*.45,
            0,
            255
          );

      }

      else{

        d[i] =
          d[i]*(1-q)+
          d[j]*q;

        d[i+1] =
          d[i+1]*(1-q)+
          d[j+1]*q;

        d[i+2] =
          d[i+2]*(1-q)+
          d[j+2]*q;

      }

    }

  }

  ctx.putImageData(
    id,
    0,
    0
  );

  drawOverlay();

}

function drawHistogram(){

  const c =
    $('histogram');

  if(!c || !img)
    return;

  const x =
    c.getContext('2d');

  c.width =
    c.clientWidth*2;

  c.height =
    c.clientHeight*2;

  x.clearRect(
    0,
    0,
    c.width,
    c.height
  );

  const id =
    ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data;

  const h =
    new Array(64).fill(0);

  for(
    let i=0;
    i<id.length;
    i+=16
  ){

    const lum =
      id[i]*.2126 +
      id[i+1]*.7152 +
      id[i+2]*.0722;

    h[
      Math.min(
        63,
        Math.floor(
          lum/4
        )
      )
    ]++;

  }

  const max =
    Math.max(...h) || 1;

  x.fillStyle =
    '#d9e1ea';

  h.forEach(
    (v,i) => {

      const bh =
        v/max *
        c.height *
        .88;

      x.fillRect(
        i*c.width/64,
        c.height-bh,
        c.width/64-1,
        bh
      );

    }
  );

}

function exportImage(){

  if(!img)
    return toast(
      'Open a photo first'
    );

  const max =
    S.export.maxEdge;

  const scale =
    Math.min(
      1,
      max /
      Math.max(
        img.naturalWidth,
        img.naturalHeight
      )
    );

  const out =
    document.createElement(
      'canvas'
    );

  out.width =
    Math.max(
      1,
      Math.round(
        img.naturalWidth*scale
      )
    );

  out.height =
    Math.max(
      1,
      Math.round(
        img.naturalHeight*scale
      )
    );

  const ox =
    out.getContext(
      '2d',
      {willReadFrequently:true}
    );

  ox.save();

  ox.translate(
    out.width/2,
    out.height/2
  );

  ox.rotate(
    crop.angle *
    Math.PI /
    180
  );

  ox.scale(
    S.transform.scale *
    S.transform.flipX,
    S.transform.scale *
    S.transform.flipY
  );

  ox.transform(
    1,
    S.transform.perspectiveY/500,
    S.transform.perspectiveX/500,
    1,
    0,
    0
  );

  ox.drawImage(
    img,
    -out.width/2,
    -out.height/2,
    out.width,
    out.height
  );

  ox.restore();

  let id =
    ox.getImageData(
      0,
      0,
      out.width,
      out.height
    );

  processPixels(
    id,
    out.width,
    out.height
  );

  ox.putImageData(
    id,
    0,
    0
  );

  for(
    const l of layers
  ){

    if(l.type === 'text')
      drawExportText(
        ox,
        l,
        out.width,
        out.height
      );

    if(l.type === 'draw')
      drawExportStroke(
        ox,
        l,
        out.width,
        out.height
      );

  }

  const mime =
    S.export.format === 'png'
    ? 'image/png'
    :
    S.export.format === 'webp'
    ? 'image/webp'
    :
    'image/jpeg';

  out.toBlob(
    blob => {

      const a =
        document.createElement(
          'a'
        );

      a.href =
        URL.createObjectURL(
          blob
        );

      a.download =
        (
          fileName
          .replace(
            /\.[^.]+$/,
            ''
          ) ||
          'toolora-edited-photo'
        ) +
        '.' +
        S.export.format;

      a.click();

      setTimeout(
        () =>
          URL.revokeObjectURL(
            a.href
          ),
        1000
      );

      toast(
        'Photo exported'
      );

    },
    mime,
    S.export.quality/100
  );

}

function drawExportText(
  x,
  l,
  W,
  H
){

  const t =
    l.settings;

  x.save();

  x.translate(
    l.x*W,
    l.y*H
  );

  x.rotate(
    (t.rotation||0) *
    Math.PI/180
  );

  x.globalAlpha =
    t.opacity/100;

  x.font =
    `${t.italic?'italic ':''}` +
    `${t.bold?'700 ':''}` +
    `${t.size}px ${t.font}`;

  x.textAlign =
    t.align;

  x.textBaseline =
    'middle';

  if(t.strokeWidth){

    x.lineWidth =
      t.strokeWidth;

    x.strokeStyle =
      t.stroke;

    x.strokeText(
      l.name,
      0,
      0
    );

  }

  x.fillStyle =
    t.color;

  x.fillText(
    l.name,
    0,
    0
  );

  x.restore();

}

function drawExportStroke(
  x,
  l,
  W,
  H
){

  x.save();

  x.globalAlpha =
    l.opacity;

  x.strokeStyle =
    l.color;

  x.lineWidth =
    l.size;

  x.lineCap =
    'round';

  x.lineJoin =
    'round';

  x.beginPath();

  l.points.forEach(
    (p,i) => {

      if(i)
        x.lineTo(
          p.x*W,
          p.y*H
        );

      else
        x.moveTo(
          p.x*W,
          p.y*H
        );

    }
  );

  x.stroke();

  x.restore();

}

function open(){

  $('fileInput').click();

}

$('openBtn').onclick =
  open;

$('openEmpty').onclick =
  open;

$('fileInput').onchange =
  e =>
    openFile(
      e.target.files[0]
    );

$('undoBtn').onclick =
  undo;

$('redoBtn').onclick =
  redo;

$('beforeBtn').onpointerdown =
  () => {

    before = true;
    render();

  };

$('beforeBtn').onpointerup =
  () => {

    before = false;
    render();

  };

$('beforeBtn').onpointercancel =
  () => {

    before = false;
    render();

  };

$('fullscreenBtn').onclick =
  () =>
    document
      .documentElement
      .requestFullscreen?.();

$('zoomIn').onclick =
  () => {

    zoom =
      clamp(
        zoom+.25,
        .5,
        5
      );

    updateTransform();

  };

$('zoomOut').onclick =
  () => {

    zoom =
      clamp(
        zoom-.25,
        .5,
        5
      );

    if(zoom <= 1){

      panX=0;
      panY=0;

    }

    updateTransform();

  };

$('fitBtn').onclick =
  fitToScreen;

$('oneBtn').onclick =
  () => {

    zoom=1;
    panX=0;
    panY=0;

    updateTransform();

  };

$('resetTool').onclick =
  () => {

    if(!img)
      return;

    pushHistory();

    resetTool();

    renderPanel();
    render();

  };

tabs.forEach(
  t => {

    t.onclick =
      () => {

        active =
          t.dataset.tool;

        renderPanel();
        render();

      };

  }
);

stage.addEventListener(
  'pointerdown',
  handlePointerDown
);

stage.addEventListener(
  'pointermove',
  handlePointerMove
);

stage.addEventListener(
  'pointerup',
  handlePointerUp
);

stage.addEventListener(
  'pointercancel',
  handlePointerUp
);

stage.addEventListener(
  'wheel',
  e => {

    if(!img)
      return;

    e.preventDefault();

    zoom =
      clamp(
        zoom *
        (
          e.deltaY < 0
          ? 1.1
          : .9
        ),
        .5,
        5
      );

    if(zoom <= 1){

      panX=0;
      panY=0;

    }

    updateTransform();

  },
  {passive:false}
);

window.addEventListener(
  'keydown',
  e => {

    if(
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'z'
    ){

      e.preventDefault();

      e.shiftKey
        ? redo()
        : undo();

    }

    if(
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'y'
    ){

      e.preventDefault();

      redo();

    }

  }
);

stage.addEventListener(
  'dragover',
  e => {

    e.preventDefault();

    $('dropOverlay')
      .classList
      .add('show');

  }
);

stage.addEventListener(
  'dragleave',
  () => {

    $('dropOverlay')
      .classList
      .remove('show');

  }
);

stage.addEventListener(
  'drop',
  e => {

    e.preventDefault();

    $('dropOverlay')
      .classList
      .remove('show');

    openFile(
      e.dataTransfer.files[0]
    );

  }
);

function resetTool(){

  if(active === 'light'){

    Object.assign(
      S.light,
      {
        exposure:0,
        contrast:0,
        highlights:0,
        shadows:0,
        whites:0,
        blacks:0
      }
    );

  }

  if(active === 'color'){

    Object.assign(
      S.color,
      {
        temp:0,
        tint:0,
        vibrance:0,
        saturation:0,
        hue:0
      }
    );

  }

  if(active === 'effects'){

    Object.assign(
      S.effects,
      {
        texture:0,
        clarity:0,
        dehaze:0,
        vignette:0,
        midpoint:50,
        feather:50,
        roundness:0,
        grain:0,
        grainSize:50,
        roughness:50,
        fade:0,
        glow:0,
        sepia:0
      }
    );

  }

  if(active === 'detail'){

    Object.assign(
      S.detail,
      {
        sharp:0,
        radius:1,
        detail:50,
        masking:0,
        noise:0,
        colorNoise:0
      }
    );

  }

  if(active === 'crop')
    resetCrop();

  if(active === 'mask')
    S.mask.mode = 'off';

  if(active === 'blur')
    S.blur.amount = 0;

  if(active === 'text')
    S.text.value = '';

  if(active === 'draw'){

    layers =
      layers.filter(
        l => l.type !== 'draw'
      );

  }

  if(active === 'retouch'){

    S.retouch.ops = [];

  }

  if(active === 'presets'){

    toast(
      'Choose a preset to apply a new look'
    );

  }

}

renderPanel();
updateUI();

})();
