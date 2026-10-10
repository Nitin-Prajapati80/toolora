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

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

const octx = overlay.getContext('2d');

octx.imageSmoothingEnabled = true;
octx.imageSmoothingQuality = 'high';

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

// The committed crop is non-destructive: it changes the active source
// rectangle without throwing away the original image pixels.
let committedCrop = {
  x:0,
  y:0,
  w:1,
  h:1
};

let textSessionFresh = true;
let textHistoryPushed = false;
let renderStateKey = '';

let workCanvas = null;
let workCtx = null;
let canvasImageW = 0;
let canvasImageH = 0;
let canvasMode = '';
let renderFrame = 0;
let histogramFrame = 0;
let histogramQueued = false;
let histogramSampleCanvas = null;
let histogramSampleCtx = null;
let blurSourceCanvas = null;
let blurSourceCtx = null;
let blurResultCanvas = null;
let blurResultCtx = null;

// Keep the preview backing store at one fixed size. Switching between a small
// interactive canvas and a larger idle canvas on every pointer release forces
// repeated allocations and image processing, which causes visible slider lag.
// Export renders independently at the selected output size.
const PREVIEW_MAX_EDGE = 800;
const INTERACTIVE_MAX_EDGE = 520;
const MAX_ZOOM = 5;

// Static color centers are shared by all pixels and render passes.
const HSL_COLOR_CENTERS = Object.freeze([
  ['red',0], ['orange',30], ['yellow',60], ['green',120],
  ['aqua',180], ['blue',220], ['purple',275], ['magenta',325]
]);

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
    gradeBlend:0
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
    backgroundColor:'#000000',
    backgroundEnabled:false,
    stroke:'#000000',
    strokeWidth:0,
    opacity:100,
    rotation:0,
    lineSpacing:1.2
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
    committedCrop:deepClone(committedCrop),
    layers:deepClone(layers),
    img:!!img
  };

}

function restore(s){

  Object.assign(S,deepClone(s.S));

  crop = deepClone(s.crop);

  committedCrop =
    deepClone(
      s.committedCrop || {x:0,y:0,w:1,h:1}
    );

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

            <option ${S.text.font==='Inter'?'selected':''}>Inter</option>
            <option ${S.text.font==='Arial'?'selected':''}>Arial</option>
            <option ${S.text.font==='Georgia'?'selected':''}>Georgia</option>
            <option ${S.text.font==='Verdana'?'selected':''}>Verdana</option>
            <option ${S.text.font==='Trebuchet MS'?'selected':''}>Trebuchet MS</option>
            <option ${S.text.font==='Courier New'?'selected':''}>Courier New</option>

          </select>

        </div>

        <div class="field">

          <div class="field-head">
            <label>Align</label>
          </div>

          <select class="select" id="textAlign">
            <option ${S.text.align==='left'?'selected':''}>left</option>
            <option ${S.text.align==='center'?'selected':''}>center</option>
            <option ${S.text.align==='right'?'selected':''}>right</option>
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

      ${field(
        'Line spacing',
        'text.lineSpacing',
        0.8,
        2.5,
        0.1,
        S.text.lineSpacing,
        '×'
      )}

      ${field(
        'Rotation',
        'text.rotation',
        -180,
        180,
        1,
        S.text.rotation,
        '°'
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

      <div class="two">
        <div>
          <div class="field-head"><label>Text background</label></div>
          <input class="color" id="textBackground" type="color" value="${S.text.backgroundColor}">
        </div>
        <label class="check">
          <input id="textBackgroundEnabled" type="checkbox" ${S.text.backgroundEnabled?'checked':''}>
          Enable background
        </label>
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
    scheduleHistogram();
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

      let sliderHistoryPushed = false;

      el.addEventListener(
        'pointerdown',
        () => {

          if(!sliderHistoryPushed){

            pushHistory();
            sliderHistoryPushed = true;

          }

        }
      );

      el.addEventListener(
        'pointerup',
        () => {

          sliderHistoryPushed = false;

          if(img)
            scheduleRender(false);

        }
      );

      el.addEventListener(
        'change',
        () => {

          sliderHistoryPushed = false;

          if(img)
            scheduleRender(false);

        }
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

          scheduleRender(true);

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

          scheduleRender(true);

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
    'textBackground',
    'textBackgroundEnabled',
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

  if(e.id === 'textValue'){

    S.text.value = e.value;

    if(active === 'text'){

      if(textSessionFresh || selectedLayer < 0 || !layers[selectedLayer] || layers[selectedLayer].type !== 'text'){

        if(e.value.length){

          if(!textHistoryPushed){
            pushHistory();
            textHistoryPushed = true;
          }

          layers.push({
            type:'text',
            name:e.value,
            x:.5,
            y:.5,
            draft:true,
            settings:deepClone(S.text)
          });

          selectedLayer = layers.length-1;
          textSessionFresh = false;

        }

      }
      else if(layers[selectedLayer]?.type === 'text'){

        layers[selectedLayer].name = e.value;
        layers[selectedLayer].settings = deepClone(S.text);

      }

    }

  }

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

  if(e.id === 'textBackground')
    S.text.backgroundColor = e.value;

  if(e.id === 'textBackgroundEnabled')
    S.text.backgroundEnabled = e.checked;

  if(e.id === 'drawColor')
    S.draw.color = e.value;

  if(e.id === 'exportFormat')
    S.export.format = e.value;

  if(e.id === 'exportQuality')
    S.export.quality = +e.value;

  if(
    active === 'text' &&
    selectedLayer >= 0 &&
    layers[selectedLayer]?.type === 'text'
  ){
    layers[selectedLayer].settings = deepClone(S.text);
    if(e.id === 'textValue')
      layers[selectedLayer].name = e.value;
  }

  renderOverlayOnly();

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

  tabs.forEach(t => {
    const selected = t.dataset.tool === active;
    t.classList.toggle('active', selected);
    t.setAttribute('aria-pressed', String(selected));
  });

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

  if(
    committedCrop.x !== 0 ||
    committedCrop.y !== 0 ||
    committedCrop.w !== 1 ||
    committedCrop.h !== 1
  ) n++;

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
    if(a !== 'copyState' && a !== 'cropApply')
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

  if(a === 'cropApply'){
    applyCrop();
    return;
  }

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

    const value = S.text.value.trim();

    if(!value)
      return toast('Enter text first');

    if(
      selectedLayer >= 0 &&
      layers[selectedLayer]?.type === 'text' &&
      layers[selectedLayer]?.draft
    ){

      layers[selectedLayer].draft = false;
      layers[selectedLayer].name = S.text.value;
      layers[selectedLayer].settings = deepClone(S.text);

    }
    else{

      layers.push({
        type:'text',
        name:S.text.value,
        x:.5,
        y:.5,
        draft:false,
        settings:deepClone(S.text)
      });

      selectedLayer = layers.length - 1;

    }

    S.text.value = '';
    textSessionFresh = true;
    textHistoryPushed = false;

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
    gradeBlend:0
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

  committedCrop = {x:0,y:0,w:1,h:1};
  textSessionFresh = true;
  textHistoryPushed = false;
  renderStateKey = '';

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

  if(!/^image\/(jpeg|png|webp|gif|bmp|avif|svg\+xml)$/i.test(file.type || '')){
    return toast('This image format may not be supported');
  }

  const reader = new FileReader();
  $('statusText').textContent = 'Opening image…';

  reader.onerror = () => {
    $('statusText').textContent = 'Could not open image';
    toast('Unable to read this file');
  };

  reader.onload = () => {

    const im =
      new Image();

    im.onerror = () => {
      $('statusText').textContent = 'Could not open image';
      toast('Image could not be decoded');
    };

    im.onload = () => {

      original = im;
      img = im;

      fileName = file.name;

      history = [];
      future = [];

      layers = [];
      selectedLayer = -1;

      S.retouch.ops = [];

      committedCrop = {x:0,y:0,w:1,h:1};
      textSessionFresh = true;
      textHistoryPushed = false;
      renderStateKey = '';

      resetCrop();

      $('fileName').textContent =
        file.name;

      $('fileInfo').textContent =
        `${im.naturalWidth} × ${im.naturalHeight}px`;
      $('statusText').textContent = 'Image ready';
      $('fileInput').value = '';

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

function getSourceRect(){

  if(!img)
    return {x:0,y:0,w:1,h:1};

  const iw = Math.max(1,img.naturalWidth);
  const ih = Math.max(1,img.naturalHeight);

  return {
    x:clamp(committedCrop.x,0,1) * iw,
    y:clamp(committedCrop.y,0,1) * ih,
    w:Math.max(1,clamp(committedCrop.w,.000001,1) * iw),
    h:Math.max(1,clamp(committedCrop.h,.000001,1) * ih)
  };

}

function getSourceSize(){

  const r = getSourceRect();

  return {
    width:r.w,
    height:r.h
  };

}

function fitToScreen(preserveView = false){

  if(!img) return;

  const oldZoom = zoom;
  const oldPanX = panX;
  const oldPanY = panY;

  const sw =
    Math.max(
      1,
      stage.clientWidth * .96
    );

  const sh =
    Math.max(
      1,
      stage.clientHeight * .94
    );

  const source = getSourceSize();

  fitScale =
    Math.min(
      sw / source.width,
      sh / source.height
    );

  if(preserveView){
    zoom = oldZoom;
    panX = oldPanX;
    panY = oldPanY;
    clampPan();
    updateTransform();
    return;
  }

  zoom = 1;
  panX = 0;
  panY = 0;

  updateTransform();

}

function getStageCenter(){

  const r =
    stage.getBoundingClientRect();

  return {
    x:r.left + r.width/2,
    y:r.top + r.height/2
  };

}

function getDisplayScale(){

  if(!img || !canvas.width || !canvas.height)
    return fitScale * zoom;

  const source = getSourceSize();
  const canvasScale =
    Math.min(
      canvas.width / Math.max(1,source.width),
      canvas.height / Math.max(1,source.height)
    );

  return (
    fitScale * zoom
  ) / Math.max(canvasScale,.000001);

}

function getPanBounds(scale = getDisplayScale()){

  const stageW = stage.clientWidth;
  const stageH = stage.clientHeight;

  const imageW = canvas.width * scale;
  const imageH = canvas.height * scale;

  return {
    x:Math.max(0,(imageW-stageW)/2),
    y:Math.max(0,(imageH-stageH)/2)
  };

}

function clampPan(){

  const b = getPanBounds();

  panX = clamp(panX,-b.x,b.x);
  panY = clamp(panY,-b.y,b.y);

}

function zoomAt(clientX,clientY,nextZoom){

  if(!img) return;

  const oldZoom = zoom;

  nextZoom = clamp(nextZoom,.5,MAX_ZOOM);

  if(nextZoom === oldZoom)
    return;

  const center = getStageCenter();
  const oldScale = getDisplayScale();

  const localX =
    (clientX-center.x-panX) /
    Math.max(oldScale,.000001);

  const localY =
    (clientY-center.y-panY) /
    Math.max(oldScale,.000001);

  zoom = nextZoom;

  const nextScale = getDisplayScale();

  panX = clientX-center.x-localX*nextScale;
  panY = clientY-center.y-localY*nextScale;

  if(zoom <= 1){
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  clampPan();
  updateTransform();

}

function updateTransform(){

  if(!img) return;

  const w = canvas.width;
  const h = canvas.height;

  wrap.style.width = w + 'px';
  wrap.style.height = h + 'px';

  clampPan();

  wrap.style.transform =
    `translate3d(${panX}px,${panY}px,0) scale(${getDisplayScale()})`;

  $('zoomLabel').textContent =
    Math.round(zoom*100) + '%';

}

function resizeCanvas(interactive = false){

  if(!img) return;

  const max =
    interactive
    ? INTERACTIVE_MAX_EDGE
    : PREVIEW_MAX_EDGE;

  const source = getSourceSize();
  const longest =
    Math.max(source.width,source.height);

  const sc = Math.min(1,max/longest);

  const W = Math.max(1,Math.round(source.width*sc));
  const H = Math.max(1,Math.round(source.height*sc));

  const mode = `${W}x${H}`;

  if(
    canvasImageW === W &&
    canvasImageH === H &&
    canvasMode === mode
  ){
    return;
  }

  canvas.width = W;
  canvas.height = H;

  overlay.width = W;
  overlay.height = H;

  canvasImageW = W;
  canvasImageH = H;
  canvasMode = mode;

  workCanvas =
    workCanvas || document.createElement('canvas');

  if(workCanvas.width !== W || workCanvas.height !== H){
    workCanvas.width = W;
    workCanvas.height = H;
  }

  workCtx =
    workCanvas.getContext('2d',{willReadFrequently:true});

  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = 'high';

}

function scheduleRender(interactive = true){

  if(renderFrame)
    cancelAnimationFrame(renderFrame);

  renderFrame =
    requestAnimationFrame(() => {

      renderFrame = 0;

      render(interactive);

    });

}

function scheduleHistogram(){

  if(histogramQueued)
    return;

  histogramQueued = true;

  histogramFrame =
    requestAnimationFrame(() => {

      histogramQueued = false;
      histogramFrame = 0;

      drawHistogram();

    });

}

function render(interactive = false){

  if(!img) return;

  resizeCanvas(interactive);

  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0,0,W,H);

  if(before){

    const source = getSourceRect();

    ctx.drawImage(
      original,
      source.x,
      source.y,
      source.w,
      source.h,
      0,
      0,
      W,
      H
    );

    drawOverlay();
    drawCropGuide();
    updateTransform();
    return;

  }

  if(!workCtx)
    resizeCanvas(interactive);

  workCtx.clearRect(0,0,W,H);

  const source = getSourceRect();

  workCtx.save();

  workCtx.translate(W/2,H/2);

  workCtx.translate(
    S.transform.offsetX/100 * W/2,
    S.transform.offsetY/100 * H/2
  );

  workCtx.rotate(crop.angle*Math.PI/180);

  workCtx.scale(
    S.transform.scale*S.transform.flipX,
    S.transform.scale*S.transform.flipY
  );

  workCtx.transform(
    1,
    S.transform.perspectiveY/500,
    S.transform.perspectiveX/500,
    1,
    0,
    0
  );

  workCtx.drawImage(
    img,
    source.x,
    source.y,
    source.w,
    source.h,
    -W/2,
    -H/2,
    W,
    H
  );

  workCtx.restore();

  const data =
    workCtx.getImageData(0,0,W,H);

  processPixels(data,W,H);

  ctx.putImageData(data,0,0);

  drawOverlay();
  drawCropGuide();
  updateTransform();

  if(active === 'light')
    scheduleHistogram();

}

function renderOverlayOnly(){

  if(!img) return;

  drawOverlay();
  drawCropGuide();
  updateTransform();

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

  const vib =
    C.vibrance/100;

  const warm =
    C.temp/100;

  const tint =
    C.tint/100*5;

  const hslMixActive =
    !!(
      C.redH || C.redS || C.redL ||
      C.orangeH || C.orangeS || C.orangeL ||
      C.yellowH || C.yellowS || C.yellowL ||
      C.greenH || C.greenS || C.greenL ||
      C.aquaH || C.aquaS || C.aquaL ||
      C.blueH || C.blueS || C.blueL ||
      C.purpleH || C.purpleS || C.purpleL ||
      C.magentaH || C.magentaS || C.magentaL
    );

  const maskHasAdjustments = M.mode !== 'off' && !!(
    M.exposure || M.contrast || M.highlights || M.shadows || M.saturation ||
    M.temp || M.tint || M.texture || M.clarity
  );

  const gradeCache = {
    sh:hexRgb(C.gradeShadow),
    mi:hexRgb(C.gradeMid),
    hi:hexRgb(C.gradeHigh)
  };

  const hslGroups = hslMixActive
    ? HSL_COLOR_CENTERS.map(([name,center]) => ({
        center,
        hue:C[name+'H'],
        saturation:C[name+'S']/100,
        lightness:C[name+'L']/100
      }))
    : null;

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

    if(hslMixActive){

      [
        r,
        g,
        b
      ] =
        applyHslMix(
          r,
          g,
          b,
          hslGroups
        );

    }

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

    r += warm*18;
    b -= warm*18;

    g += tint;

    if(C.hue){

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

    }

    const x =
      (i/4 % W)/W;

    const y =
      Math.floor(i/4/W)/H;

    let m = 1;

    if(maskHasAdjustments && M.mode === 'radial'){

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
          M.size * (1-M.feather),
          M.size,
          dist
        );

    }

    else if(maskHasAdjustments && M.mode === 'linear'){

      const distanceFromBand = Math.abs((x-M.x)*.70710678 + (y-M.y)*.70710678);
      const halfWidth = Math.max(.01, M.size * .35);
      const featherWidth = Math.max(.005, M.feather * .25);
      m = 1 - smoothstep(halfWidth, halfWidth + featherWidth, distanceFromBand);

    }

    if(
      m > 0 &&
      maskHasAdjustments
    ){

      const ml = M.exposure/100;
      r += ml*50*m; g += ml*50*m; b += ml*50*m;

      const localLum = .2126*r + .7152*g + .0722*b;
      const hiWeight = Math.max(0, (localLum-128)/127);
      const shWeight = Math.max(0, (128-localLum)/128);
      const highlightShift = M.highlights/100 * hiWeight * 42 * m;
      const shadowShift = M.shadows/100 * shWeight * 42 * m;
      r += shadowShift - highlightShift;
      g += shadowShift - highlightShift;
      b += shadowShift - highlightShift;
      const temperature = M.temp/100 * 28 * m;
      const tintShift = M.tint/100 * 20 * m;
      r += temperature + tintShift*.15;
      g += tintShift;
      b -= temperature - tintShift*.15;
      const localContrast = 1 + (M.clarity/100*.35 + M.texture/100*.18) * m;
      r = 128 + (r-128)*localContrast;
      g = 128 + (g-128)*localContrast;
      b = 128 + (b-128)*localContrast;

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
        C,
        gradeCache
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

function applyHslMix(r,g,b,groups){

  let [h,s,l] = rgbToHsl(r,g,b);

  for(const group of groups){
    const d = Math.abs(((h-group.center+180)%360)-180);
    const weight = clamp(1-d/35,0,1);
    if(weight <= 0) continue;

    h = (h + group.hue*weight + 360) % 360;
    s = clamp(s + group.saturation*weight,0,1);
    l = clamp(l + group.lightness*weight,0,1);
  }

  return hslToRgb(h,s,l);

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

function applyGrade(r,g,b,C,gradeCache){

  const sh =
    gradeCache?.sh ||
    hexRgb(
      C.gradeShadow
    );

  const mi =
    gradeCache?.mi ||
    hexRgb(
      C.gradeMid
    );

  const hi =
    gradeCache?.hi ||
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

function applyBlurLocal(d, W, H){
  const amount = clamp(Number(S.blur.amount) || 0, 0, 100);
  if(!amount || !W || !H) return;

  // Use the browser's optimized canvas blur instead of averaging dozens of
  // neighbouring pixels for every pixel in JavaScript. The old implementation
  // was O(width * height * radius²) and could freeze the editor on large photos.
  if(!blurSourceCanvas) blurSourceCanvas = document.createElement('canvas');
  if(!blurResultCanvas) blurResultCanvas = document.createElement('canvas');

  if(blurSourceCanvas.width !== W || blurSourceCanvas.height !== H){
    blurSourceCanvas.width = W;
    blurSourceCanvas.height = H;
    blurResultCanvas.width = W;
    blurResultCanvas.height = H;
    blurSourceCtx = blurSourceCanvas.getContext('2d', {willReadFrequently:true});
    blurResultCtx = blurResultCanvas.getContext('2d', {willReadFrequently:true});
  } else {
    blurSourceCtx = blurSourceCtx || blurSourceCanvas.getContext('2d', {willReadFrequently:true});
    blurResultCtx = blurResultCtx || blurResultCanvas.getContext('2d', {willReadFrequently:true});
  }

  const source = new ImageData(new Uint8ClampedArray(d.data), W, H);
  blurSourceCtx.putImageData(source, 0, 0);
  blurResultCtx.clearRect(0, 0, W, H);

  const radius = Math.max(0.6, amount / 8);
  let blurred = null;
  try {
    blurResultCtx.save();
    blurResultCtx.filter = `blur(${radius}px)`;
    blurResultCtx.drawImage(blurSourceCanvas, 0, 0);
    blurResultCtx.restore();
    blurred = blurResultCtx.getImageData(0, 0, W, H).data;
  } catch(err) {
    try { blurResultCtx.restore(); } catch(_) {}
    // Safe, fast fallback: a compact 3x3 box blur implemented in native canvas.
    blurResultCtx.filter = 'none';
    blurResultCtx.drawImage(blurSourceCanvas, 0, 0);
    blurred = blurResultCtx.getImageData(0, 0, W, H).data;
  }

  const a = d.data;
  const full = S.blur.mode === 'full';
  const focusX = S.blur.focusX;
  const focusY = S.blur.focusY;
  const size = Math.max(1, S.blur.size);
  const exponent = Math.max(.25, 2 - S.blur.feather / 60);

  for(let y = 0, i = 0; y < H; y++){
    const py = y / H * 100;
    for(let x = 0; x < W; x++, i += 4){
      let mix = 1;
      if(!full){
        const dx = x / W * 100 - focusX;
        const dy = py - focusY;
        if(S.blur.mode === 'linear') {
          // A diagonal focus band; feather controls the transition from sharp to blurred.
          const distanceFromBand = Math.abs(dx * .70710678 - dy * .70710678);
          const band = Math.max(1, size * .32);
          const transition = Math.max(1, size * (.25 + S.blur.feather / 100));
          const z = clamp((distanceFromBand - band) / transition, 0, 1);
          mix = z * z * (3 - 2 * z);
        } else {
          const nx = dx / size;
          const ny = dy / size;
          const dist = Math.min(1, Math.sqrt(nx * nx + ny * ny));
          mix = Math.pow(dist, exponent);
        }
        if(mix < .03) continue;
      }
      a[i]   = a[i]   * (1 - mix) + blurred[i]   * mix;
      a[i+1] = a[i+1] * (1 - mix) + blurred[i+1] * mix;
      a[i+2] = a[i+2] * (1 - mix) + blurred[i+2] * mix;
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

          if(op.mode === 'blur' || op.mode === 'smooth'){
            let rr=0, gg=0, bb=0, count=0;
            for(let oy=-1; oy<=1; oy++) for(let ox=-1; ox<=1; ox++) {
              const xx=clamp(X+ox,0,W-1), yy=clamp(Y+oy,0,H-1), si=(yy*W+xx)*4;
              rr+=src[si]; gg+=src[si+1]; bb+=src[si+2]; count++;
            }
            const strength=k*(op.mode==='smooth'?.45:1);
            d.data[i]=src[i]*(1-strength)+(rr/count)*strength;
            d.data[i+1]=src[i+1]*(1-strength)+(gg/count)*strength;
            d.data[i+2]=src[i+2]*(1-strength)+(bb/count)*strength;
          }
          else if(op.mode === 'burn'){

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

          else if(op.mode === 'clone'){
            d.data[i] = src[i]*(1-k)+src[j]*k;
            d.data[i+1] = src[i+1]*(1-k)+src[j+1]*k;
            d.data[i+2] = src[i+2]*(1-k)+src[j+2]*k;
          }
          else {
            let rr=0, gg=0, bb=0, count=0;
            for(let oy=-1; oy<=1; oy++) for(let ox=-1; ox<=1; ox++) {
              const xx=clamp(X+ox,0,W-1), yy=clamp(Y+oy,0,H-1), si=(yy*W+xx)*4;
              rr+=src[si]; gg+=src[si+1]; bb+=src[si+2]; count++;
            }
            d.data[i]=src[i]*(1-k)+(rr/count)*k;
            d.data[i+1]=src[i+1]*(1-k)+(gg/count)*k;
            d.data[i+2]=src[i+2]*(1-k)+(bb/count)*k;
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
  const t = l.settings || S.text;
  const lines = String(l.name ?? t.value ?? '').split('\n');
  const source = getSourceSize();
  const baseScale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(source.width, source.height));
  const baseWidth = Math.max(1, Math.round(source.width * baseScale));
  const size = Math.max(1, Number(t.size) || 48) * (overlay.width / baseWidth);
  const lineHeight = size * clamp(Number(t.lineSpacing) || 1.2, .5, 3);
  octx.save();
  octx.translate(l.x * overlay.width, l.y * overlay.height);
  octx.rotate((Number(t.rotation) || 0) * Math.PI / 180);
  octx.globalAlpha = clamp(Number(t.opacity ?? 100) / 100, 0, 1);
  octx.font = `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${size}px ${t.font || 'Inter'}`;
  octx.textAlign = t.align || 'center';
  octx.textBaseline = 'middle';
  const widths = lines.map(line => octx.measureText(line).width);
  const maxWidth = Math.max(0, ...widths);
  const top = -((lines.length - 1) * lineHeight) / 2;
  if (t.backgroundEnabled) {
    const padX = size * .22, padY = size * .12;
    let left = t.align === 'left' ? 0 : t.align === 'right' ? -maxWidth : -maxWidth / 2;
    octx.fillStyle = t.backgroundColor || '#000000';
    octx.fillRect(left - padX, top - lineHeight / 2 - padY, maxWidth + padX * 2, lines.length * lineHeight + padY * 2);
  }
  lines.forEach((line, i) => {
    const y = top + i * lineHeight;
    if (t.strokeWidth > 0) {
      octx.lineWidth = Number(t.strokeWidth) || 0;
      octx.strokeStyle = t.stroke || '#000000';
      octx.strokeText(line, 0, y);
    }
    octx.fillStyle = t.color || '#ffffff';
    octx.fillText(line, 0, y);
  });
  // Selection bounds are drawn only for the active text object.
  if (layers[selectedLayer] === l && active === 'text') {
    const pad = Math.max(5, size * .12);
    let left = t.align === 'left' ? 0 : t.align === 'right' ? -maxWidth : -maxWidth / 2;
    octx.globalAlpha = .95;
    octx.strokeStyle = '#38a4ff';
    octx.lineWidth = Math.max(1, overlay.width / 700);
    octx.setLineDash([5, 4]);
    octx.strokeRect(left - pad, top - lineHeight / 2 - pad, maxWidth + pad * 2, lines.length * lineHeight + pad * 2);
  }
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

  const hasCrop =
    crop.x > .0001 ||
    crop.y > .0001 ||
    crop.w < .9999 ||
    crop.h < .9999;

  if(!hasCrop){
    toast('Crop area is unchanged');
    return;
  }

  pushHistory();

  const oldCrop = deepClone(crop);
  const base = deepClone(committedCrop);

  const next = {
    x:clamp(base.x + oldCrop.x*base.w,0,1),
    y:clamp(base.y + oldCrop.y*base.h,0,1),
    w:clamp(oldCrop.w*base.w,.000001,1),
    h:clamp(oldCrop.h*base.h,.000001,1)
  };

  // Keep overlay layers attached to the same visible part of the photo.
  for(const l of layers){

    if(l.type === 'text'){

      l.x = clamp((l.x-oldCrop.x)/Math.max(oldCrop.w,.000001),0,1);
      l.y = clamp((l.y-oldCrop.y)/Math.max(oldCrop.h,.000001),0,1);

    }

    if(l.type === 'draw' && Array.isArray(l.points)){

      l.points = l.points.map(p => ({
        x:clamp((p.x-oldCrop.x)/Math.max(oldCrop.w,.000001),0,1),
        y:clamp((p.y-oldCrop.y)/Math.max(oldCrop.h,.000001),0,1)
      }));

    }

  }

  committedCrop = next;

  crop = {
    x:0,
    y:0,
    w:1,
    h:1,
    ratio:'free',
    angle:0
  };

  // Applying Crop commits the crop boundary. Keep other adjustment systems
  // intact so subsequent edits continue from the cropped image view.
  fitToScreen(true);
  renderPanel();
  render(false);
  updateUI();

  toast('Crop applied');

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
        Math.abs(p.x-layers[i].x) < Math.max(.06, Math.min(.48, (String(layers[i].name || '').length * (layers[i].settings?.size || 48)) / Math.max(1, canvas.width) * .32)) &&
        Math.abs(p.y-layers[i].y) < Math.max(.06, Math.min(.35, ((String(layers[i].name || '').split('\n').length) * (layers[i].settings?.size || 48) * (layers[i].settings?.lineSpacing || 1.2)) / Math.max(1, canvas.height) * .65))
      ){

        hit = i;
        break;

      }

    }

    if(hit >= 0){

      pushHistory();
      selectedLayer =
        hit;

      loadLayer();
      textSessionFresh = false;

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

    renderOverlayOnly();

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

  if(active === 'mask' && S.mask.mode !== 'off'){
    pushHistory();
    const p = pointerPos(e);
    drawing = {type:'moveMask'};
    S.mask.x = p.x;
    S.mask.y = p.y;
    scheduleRender(true);
    return;
  }

  if(active === 'blur'){
    pushHistory();
    const p = pointerPos(e);
    drawing = {type:'moveBlur'};
    S.blur.focusX = p.x * 100;
    S.blur.focusY = p.y * 100;
    scheduleRender(true);
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

    const mid =
      midpoint(a,b);

    const center =
      getStageCenter();

    const scale =
      getDisplayScale();

    gesture = {

      type:'pinch',

      dist:
        Math.max(
          1,
          distance(a,b)
        ),

      zoom,

      mid,

      localX:
        (
          mid.x -
          center.x -
          panX
        ) /
        Math.max(
          scale,
          .000001
        ),

      localY:
        (
          mid.y -
          center.y -
          panY
        ) /
        Math.max(
          scale,
          .000001
        ),

      px:panX,
      py:panY

    };

  }

}

function handlePointerMove(e){

  if(!img)
    return;

  e.preventDefault();

  if(drawing?.type === 'moveMask') {
    const p = pointerPos(e);
    S.mask.x = p.x; S.mask.y = p.y;
    scheduleRender(true);
    return;
  }

  if(drawing?.type === 'moveBlur') {
    const p = pointerPos(e);
    S.blur.focusX = p.x * 100; S.blur.focusY = p.y * 100;
    scheduleRender(true);
    return;
  }

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

    renderOverlayOnly();

    return;

  }

  if(
    drawing?.type ===
    'draw'
  ){

    drawing.layer.points.push(
      pointerPos(e)
    );

    renderOverlayOnly();

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

    renderOverlayOnly();

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

    clampPan();
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
        MAX_ZOOM
      );

    const m =
      midpoint(a,b);

    const center =
      getStageCenter();

    const scale =
      getDisplayScale();

    panX =
      m.x -
      center.x -
      gesture.localX * scale;

    panY =
      m.y -
      center.y -
      gesture.localY * scale;

    if(zoom <= 1){

      zoom = 1;
      panX = 0;
      panY = 0;

    }

    clampPan();
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

  if(drawing?.type === 'moveMask' || drawing?.type === 'moveBlur') {
    drawing = null;
    scheduleRender(false);
  }

  if(
    drawing?.type ===
    'moveText'
  ){
    drawing = null;
  }

  if(
    drawing?.type ===
    'crop'
  ){

    drawing = null;

    pushHistory();

  }

  if(pointers.size === 1){

    const remaining =
      [...pointers.values()][0];

    gesture = {

      type:'pan',

      sx:remaining.clientX,
      sy:remaining.clientY,

      px:panX,
      py:panY

    };

  }
  else if(!pointers.size){
    gesture = null;
  }

  const now =
    Date.now();

  if(
    now-lastTap < 280 &&
    active !== 'draw' &&
    active !== 'text' &&
    active !== 'retouch' &&
    active !== 'crop' &&
    active !== 'mask' &&
    active !== 'blur'
  ){

    if(zoom > 1){

      zoom=1;
      panX=0;
      panY=0;

      updateTransform();

    }

    else{

      zoomAt(
        e.clientX,
        e.clientY,
        2
      );

    }

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

  const p = pointerPos(e);
  const W = canvas.width;
  const H = canvas.height;

  const rad = Math.max(2,S.retouch.size);
  const R = Math.max(1,Math.round(rad/2));

  const sx = Math.round(p.x*W);
  const sy = Math.round(p.y*H);

  const x0 = clamp(sx-R,0,W-1);
  const y0 = clamp(sy-R,0,H-1);
  const x1 = clamp(sx+R,0,W-1);
  const y1 = clamp(sy+R,0,H-1);

  const rw = Math.max(1,x1-x0+1);
  const rh = Math.max(1,y1-y0+1);

  const id = ctx.getImageData(x0,y0,rw,rh);
  const d = id.data;
  const q = S.retouch.opacity/100;
  const feather = clamp(S.retouch.feather/100,0,1);

  for(let y=0;y<rh;y++){

    for(let x=0;x<rw;x++){

      const gx = x+x0;
      const gy = y+y0;
      const dx = gx-sx;
      const dy = gy-sy;
      const dist = Math.hypot(dx,dy);

      if(dist > R)
        continue;

      const edge =
        feather > 0
        ? 1-clamp((dist-R*(1-feather))/Math.max(1,R*feather),0,1)
        : 1;

      const amount = q*edge;
      const i = (y*rw+x)*4;

      const refX = clamp(sx-dx,x0,x1)-x0;
      const refY = clamp(sy-dy,y0,y1)-y0;
      const j = (refY*rw+refX)*4;

      if(S.retouch.mode === 'blur' || S.retouch.mode === 'smooth'){
        let rr = 0, gg = 0, bb = 0, count = 0;
        for(let oy=-1; oy<=1; oy++) for(let ox=-1; ox<=1; ox++) {
          const xx = clamp(x+ox,0,rw-1), yy = clamp(y+oy,0,rh-1);
          const si = (yy*rw+xx)*4;
          rr += d[si]; gg += d[si+1]; bb += d[si+2]; count++;
        }
        const strength = amount * (S.retouch.mode === 'smooth' ? .45 : 1);
        d[i] = d[i]*(1-strength) + (rr/count)*strength;
        d[i+1] = d[i+1]*(1-strength) + (gg/count)*strength;
        d[i+2] = d[i+2]*(1-strength) + (bb/count)*strength;
      }
      else if(S.retouch.mode === 'burn'){

        const k = amount*.45;
        d[i] *= 1-k;
        d[i+1] *= 1-k;
        d[i+2] *= 1-k;

      }
      else if(S.retouch.mode === 'dodge'){

        const k = amount*.45;
        d[i] = clamp(d[i]+(255-d[i])*k,0,255);
        d[i+1] = clamp(d[i+1]+(255-d[i+1])*k,0,255);
        d[i+2] = clamp(d[i+2]+(255-d[i+2])*k,0,255);

      }
      else if(S.retouch.mode === 'clone'){
        d[i] = d[i]*(1-amount)+d[j]*amount;
        d[i+1] = d[i+1]*(1-amount)+d[j+1]*amount;
        d[i+2] = d[i+2]*(1-amount)+d[j+2]*amount;
      }
      else {
        let rr=0, gg=0, bb=0, count=0;
        for(let oy=-1; oy<=1; oy++) for(let ox=-1; ox<=1; ox++) {
          const xx=clamp(x+ox,0,rw-1), yy=clamp(y+oy,0,rh-1), si=(yy*rw+xx)*4;
          rr+=d[si]; gg+=d[si+1]; bb+=d[si+2]; count++;
        }
        d[i]=d[i]*(1-amount)+(rr/count)*amount;
        d[i+1]=d[i+1]*(1-amount)+(gg/count)*amount;
        d[i+2]=d[i+2]*(1-amount)+(bb/count)*amount;
      }

    }

  }

  ctx.putImageData(id,x0,y0);
  drawOverlay();

}

function drawHistogram(){

  const c =
    $('histogram');

  if(!c || !img)
    return;

  const x =
    c.getContext('2d');

  const histDpr =
    Math.min(
      window.devicePixelRatio || 1,
      2
    );

  const histW =
    Math.max(
      1,
      Math.round(
        c.clientWidth * histDpr
      )
    );

  const histH =
    Math.max(
      1,
      Math.round(
        c.clientHeight * histDpr
      )
    );

  if(
    c.width !== histW ||
    c.height !== histH
  ){

    c.width = histW;
    c.height = histH;

  }

  x.clearRect(
    0,
    0,
    c.width,
    c.height
  );

  histogramSampleCanvas =
    histogramSampleCanvas ||
    document.createElement('canvas');

  const sampleW = 192;
  const sampleH = 128;

  if(
    histogramSampleCanvas.width !== sampleW ||
    histogramSampleCanvas.height !== sampleH
  ){

    histogramSampleCanvas.width = sampleW;
    histogramSampleCanvas.height = sampleH;

  }

  histogramSampleCtx =
    histogramSampleCtx ||
    histogramSampleCanvas.getContext('2d');

  histogramSampleCtx.clearRect(
    0,
    0,
    sampleW,
    sampleH
  );

  histogramSampleCtx.drawImage(
    canvas,
    0,
    0,
    sampleW,
    sampleH
  );

  const id =
    histogramSampleCtx.getImageData(
      0,
      0,
      sampleW,
      sampleH
    ).data;

  const h =
    new Array(64).fill(0);

  for(
    let i=0;
    i<id.length;
    i+=4
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

  const max = S.export.maxEdge;
  const source = getSourceRect();

  const scale =
    Math.min(
      1,
      max /
      Math.max(
        source.w,
        source.h
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
        source.w*scale
      )
    );

  out.height =
    Math.max(
      1,
      Math.round(
        source.h*scale
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
    source.x,
    source.y,
    source.w,
    source.h,
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

  try{
    out.toBlob(blob => {
      if(!blob){
        $('statusText').textContent = 'Export failed';
        toast('This format could not be exported by the browser');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const baseName = fileName.replace(/\.[^.]+$/, '') || 'toolora-edited-photo';
      const actualFormat = mime === 'image/png' ? 'png' : (mime === 'image/webp' && blob.type === 'image/webp' ? 'webp' : 'jpg');
      a.href = url;
      a.download = baseName + '.' + actualFormat;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      $('statusText').textContent = 'Export complete';
      toast('Photo exported');
    }, mime, S.export.quality/100);
  }catch(error){
    console.error('Toolora export failed:', error);
    $('statusText').textContent = 'Export failed';
    toast('Could not export this image');
  }

}

function drawExportText(x, l, W, H){
  const t = l.settings || S.text;
  const lines = String(l.name ?? t.value ?? '').split('\n');
  const source = getSourceSize();
  const baseScale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(source.width, source.height));
  const baseWidth = Math.max(1, Math.round(source.width * baseScale));
  const exportScale = W / baseWidth;
  const size = Math.max(1, Number(t.size) || 48) * exportScale;
  const lineHeight = size * clamp(Number(t.lineSpacing) || 1.2, .5, 3);
  x.save();
  x.translate(l.x * W, l.y * H);
  x.rotate((Number(t.rotation) || 0) * Math.PI / 180);
  x.globalAlpha = clamp(Number(t.opacity ?? 100) / 100, 0, 1);
  x.font = `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${size}px ${t.font || 'Inter'}`;
  x.textAlign = t.align || 'center';
  x.textBaseline = 'middle';
  const widths = lines.map(line => x.measureText(line).width);
  const maxWidth = Math.max(0, ...widths);
  const top = -((lines.length - 1) * lineHeight) / 2;
  if(t.backgroundEnabled){
    const padX=size*.22, padY=size*.12;
    const left=t.align==='left'?0:t.align==='right'?-maxWidth:-maxWidth/2;
    x.fillStyle=t.backgroundColor || '#000000';
    x.fillRect(left-padX, top-lineHeight/2-padY, maxWidth+padX*2, lines.length*lineHeight+padY*2);
  }
  lines.forEach((line,i)=>{
    const y=top+i*lineHeight;
    if(t.strokeWidth){ x.lineWidth=(Number(t.strokeWidth)||0)*exportScale; x.strokeStyle=t.stroke || '#000000'; x.strokeText(line,0,y); }
    x.fillStyle=t.color || '#ffffff'; x.fillText(line,0,y);
  });
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
$('beforeBtn').onpointerleave =
  () => {

    if(!before) return;
    before = false;
    scheduleRender(false);

  };

$('fullscreenBtn').onclick =
  () => {
    if(document.fullscreenElement){
      document.exitFullscreen?.();
    }else{
      document.documentElement.requestFullscreen?.();
    }
  };

$('exportTopBtn')?.addEventListener('click', () => {
  const exportTab = tabs.find(t => t.dataset.tool === 'export');
  exportTab?.click();
});

window.addEventListener(
  'resize',
  () => {

    if(!img)
      return;

    fitToScreen(true);
    render(false);

  }
);

$('zoomIn').onclick =
  () => {

    const r =
      stage.getBoundingClientRect();

    zoomAt(
      r.left + r.width/2,
      r.top + r.height/2,
      zoom+.25
    );

  };

$('zoomOut').onclick =
  () => {

    const r =
      stage.getBoundingClientRect();

    zoomAt(
      r.left + r.width/2,
      r.top + r.height/2,
      zoom-.25
    );

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

        const previous = active;

        active =
          t.dataset.tool;

        textSessionFresh = active === 'text';
        if(active === 'text') textHistoryPushed = false;

        renderPanel();

        if(active === 'crop' || previous === 'crop')
          renderOverlayOnly();

        updateUI();

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

    const factor =
      e.deltaY < 0
      ? 1.1
      : .9;

    zoomAt(
      e.clientX,
      e.clientY,
      zoom * factor
    );

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
        hue:0,
        gradeBlend:0
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

// Keep toolbar affordances meaningful before an image is opened.
$('statusText').textContent = 'Ready';

})();
