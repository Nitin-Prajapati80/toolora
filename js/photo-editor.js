(()=>{
'use strict';


/* =========================================================
   BASIC HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const clamp = (n,min,max) =>
  Math.max(min,Math.min(max,n));

const fmt = n => {
  n = Number(n);

  return `${n > 0 ? '+' : ''}${
    Number.isInteger(n)
      ? n
      : n.toFixed(1)
  }`;
};


/* =========================================================
   CANVAS
========================================================= */

const canvas = $('canvas');

const ctx = canvas.getContext(
  '2d',
  {
    willReadFrequently:true
  }
);

const overlay = $('overlay');

const ox = overlay.getContext('2d');

const source =
  document.createElement('canvas');

const sx =
  source.getContext(
    '2d',
    {
      willReadFrequently:true
    }
);


/* =========================================================
   GLOBAL STATE
========================================================= */

let image = null;

let zoom = 1;

let active = 'light';

let showBefore = false;

let renderQueued = false;

let history = [];

let future = [];

let historyTimer = null;

let drawing = false;

let dragText = null;

let picking = false;

let selectedTextId = null;


/* =========================================================
   EDIT STATE
========================================================= */

const S = {

  exposure:0,
  contrast:0,
  highlights:0,
  shadows:0,
  whites:0,
  blacks:0,

  temp:0,
  tint:0,
  vibrance:0,
  saturation:0,

  texture:0,
  clarity:0,
  dehaze:0,

  vignette:0,
  midpoint:50,
  feather:50,

  grain:0,
  grainSize:25,
  grainRough:50,

  blur:0,
  blurX:50,
  blurY:50,

  sharp:0,
  radius:1,

  noise:0,
  colorNoise:0,

  ratio:'original',

  rotate:0,
  straighten:0,

  flipX:false,
  flipY:false,

  gradeShadow:0,
  gradeShadowSat:0,

  gradeMid:0,
  gradeMidSat:0,

  gradeHigh:0,
  gradeHighSat:0,

  gradeBlend:50,
  gradeBalance:0,

  selectiveRadius:24,
  selectiveHue:0,
  selectiveSat:0,
  selectiveLight:0,

  brushSize:20,
  brushOpacity:100,
  brushColor:'#ffffff',

  textSize:56,
  textColor:'#ffffff',
  textStroke:'#000000',
  textOpacity:100,

  presetAmount:100

};


/* =========================================================
   COLOR BANDS
========================================================= */

const bands = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta'
];

bands.forEach(color=>{
  S[`h_${color}`] = 0;
  S[`s_${color}`] = 0;
  S[`l_${color}`] = 0;
});


/* =========================================================
   SELECTED COLOR
========================================================= */

let selectedColor = {

  r:255,
  g:255,
  b:255,

  h:0,
  s:0,
  v:1,

  hex:'#ffffff'

};


/* =========================================================
   DRAWING + TEXT
========================================================= */

let strokes = [];

let texts = [];


/* =========================================================
   TOOL NAMES
========================================================= */

const names = {

  light:[
    'Adjust',
    'Light'
  ],

  color:[
    'Adjust',
    'Color'
  ],

  effects:[
    'Adjust',
    'Effects'
  ],

  detail:[
    'Adjust',
    'Detail'
  ],

  crop:[
    'Transform',
    'Crop'
  ],

  text:[
    'Overlay',
    'Text'
  ],

  draw:[
    'Overlay',
    'Draw'
  ],

  selective:[
    'Color',
    'Color Select'
  ],

  presets:[
    'Looks',
    'Presets'
  ],

  layers:[
    'Manage',
    'Layers'
  ],

  export:[
    'Output',
    'Export'
  ]

};


/* =========================================================
   HISTORY
========================================================= */

function snapshot(){

  return JSON.stringify({

    S,

    texts,

    strokes,

    selectedColor,

    selectedTextId

  });

}


function restoreSnapshot(raw){

  const x =
    JSON.parse(raw);

  Object.assign(
    S,
    x.S
  );

  texts =
    x.texts || [];

  strokes =
    x.strokes || [];

  selectedColor =
    x.selectedColor ||
    selectedColor;

  selectedTextId =
    x.selectedTextId ??
    texts[0]?.id ??
    null;

  panel();

  schedule();

}


function push(){

  history.push(
    snapshot()
  );

  if(history.length > 50){
    history.shift();
  }

  future = [];

}


function setStatus(text){

  $('status').textContent = text;

}


function schedule(){

  if(renderQueued){
    return;
  }

  renderQueued = true;

  requestAnimationFrame(()=>{
    renderQueued = false;

    render();
  });

}


/* =========================================================
   CONTROL HTML
========================================================= */

function control(
  key,
  label,
  min,
  max,
  step=1
){

  return `

    <div class="control">

      <div class="control-head">

        <span>${label}</span>

        <span
          class="value"
          id="v_${key}"
        >
          ${fmt(S[key])}
        </span>

      </div>

      <input
        class="range"
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


function selectHTML(
  id,
  value,
  items
){

  return `

    <select
      class="select"
      id="${id}"
    >

      ${items.map(item=>`

        <option
          value="${item[0]}"
          ${String(item[0]) === String(value)
            ? 'selected'
            : ''}
        >
          ${item[1]}
        </option>

      `).join('')}

    </select>

  `;

}


/* =========================================================
   PANEL
========================================================= */

function panel(){

  const p = $('panel');

  $('eyebrow').textContent =
    names[active][0];

  $('title').textContent =
    names[active][1];


  let h = '';


  /* -------------------------------------------------------
     LIGHT
  ------------------------------------------------------- */

  if(active === 'light'){

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
        >
          Auto Tone
        </button>

        <p class="note">
          Applies a quick balanced
          browser-side tone correction.
        </p>

      </div>

    `;

  }


  /* -------------------------------------------------------
     COLOR
  ------------------------------------------------------- */

  if(active === 'color'){

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

        ${bands.map(color=>`

          <div class="mixer-row">

            <span>
              ${
                color[0].toUpperCase()
                +
                color.slice(1)
              }
            </span>

            <input
              class="mini-range"
              data-mix="h"
              data-color="${color}"
              type="range"
              min="-30"
              max="30"
              value="${S[`h_${color}`]}"
              title="Hue"
            >

            <input
              class="mini-range"
              data-mix="s"
              data-color="${color}"
              type="range"
              min="-100"
              max="100"
              value="${S[`s_${color}`]}"
              title="Saturation"
            >

            <input
              class="mini-range"
              data-mix="l"
              data-color="${color}"
              type="range"
              min="-100"
              max="100"
              value="${S[`l_${color}`]}"
              title="Luminance"
            >

          </div>

        `).join('')}

        <p class="note">
          Hue, saturation and luminance
          can be adjusted independently.
        </p>

      </div>


      <div class="section">

        <h3>Color Grading</h3>

        ${control(
          'gradeShadow',
          'Shadow Hue',
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
          'Midtone Hue',
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
          'Highlight Hue',
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


  /* -------------------------------------------------------
     EFFECTS
  ------------------------------------------------------- */

  if(active === 'effects'){

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
          'Vignette Midpoint',
          0,
          100
        )}

        ${control(
          'feather',
          'Vignette Feather',
          1,
          100
        )}

      </div>


      <div class="section">

        <h3>Lens Blur</h3>

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

        <p class="note">
          Browser-side lens-style blur.
          This is not AI depth detection.
        </p>

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
          1,
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


  /* -------------------------------------------------------
     DETAIL
  ------------------------------------------------------- */

  if(active === 'detail'){

    h = `

      <div class="section">

        <h3>Sharpening</h3>

        ${control(
          'sharp',
          'Amount',
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

      </div>


      <div class="section">

        <h3>Noise Reduction</h3>

        ${control(
          'noise',
          'Luminance',
          0,
          100
        )}

        ${control(
          'colorNoise',
          'Color',
          0,
          100
        )}

      </div>


      <p class="note">
        Preview processing is optimized
        for large photos.
      </p>

    `;

  }


  /* -------------------------------------------------------
     CROP
  ------------------------------------------------------- */

  if(active === 'crop'){

    h = `

      <div class="section">

        <h3>Crop & Geometry</h3>

        ${selectHTML(
          'ratio',
          S.ratio,
          [
            ['original','Original'],
            ['1:1','1 : 1'],
            ['4:5','4 : 5'],
            ['3:4','3 : 4'],
            ['4:3','4 : 3'],
            ['16:9','16 : 9'],
            ['9:16','9 : 16'],
            ['2:3','2 : 3']
          ]
        )}

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
            id="rotateLeft"
          >
            Rotate Left
          </button>

          <button
            class="btn"
            id="rotateRight"
          >
            Rotate Right
          </button>

          <button
            class="btn"
            id="flipX"
          >
            Flip Horizontal
          </button>

          <button
            class="btn"
            id="flipY"
          >
            Flip Vertical
          </button>

        </div>

        <p class="note">
          Aspect-ratio crop is applied
          while keeping the photo area fixed.
        </p>

      </div>

    `;

  }


  /* -------------------------------------------------------
     TEXT
  ------------------------------------------------------- */

  if(active === 'text'){

    const t =
      getSelectedText();


    h = `

      <div class="section">

        <h3>Text Layer</h3>

        <textarea
          class="text-area"
          id="textValue"
          placeholder="Type your text"
        >${escapeHTML(t?.text || '')}</textarea>

        <div style="height:8px"></div>

        <button
          class="btn"
          id="addText"
          style="width:100%"
        >
          Add Text Layer
        </button>

      </div>


      <div class="section">

        <h3>Typography</h3>

        ${selectHTML(
          'font',
          t?.font || 'Arial',
          [
            ['Arial','Arial'],
            ['Georgia','Georgia'],
            ['Verdana','Verdana'],
            ['Trebuchet MS','Trebuchet MS'],
            ['Courier New','Courier New'],
            ['Impact','Impact'],
            ['Times New Roman','Times New Roman'],
            ['Tahoma','Tahoma'],
            ['Palatino Linotype','Palatino Linotype']
          ]
        )}

        ${control(
          'textSize',
          'Font Size',
          12,
          180,
          1
        )}

        <div class="grid2">

          <button
            class="btn ${t?.bold ? 'active':''}"
            id="textBold"
          >
            Bold
          </button>

          <button
            class="btn ${t?.italic ? 'active':''}"
            id="textItalic"
          >
            Italic
          </button>

          <button
            class="btn ${t?.align === 'left' ? 'active':''}"
            id="textLeft"
          >
            Align Left
          </button>

          <button
            class="btn ${t?.align !== 'left' ? 'active':''}"
            id="textCenter"
          >
            Center
          </button>

        </div>

        <div style="height:9px"></div>

        <label class="small-label">
          Text Color
        </label>

        <div class="color-row">

          <span
            class="note"
            style="margin:0"
          >
            Choose text color
          </span>

          <input
            id="textColor"
            class="color-input"
            type="color"
            value="${t?.color || S.textColor}"
          >

        </div>


        <div style="height:8px"></div>

        <label class="small-label">
          Stroke Color
        </label>

        <div class="color-row">

          <span
            class="note"
            style="margin:0"
          >
            Choose outline color
          </span>

          <input
            id="textStroke"
            class="color-input"
            type="color"
            value="${t?.stroke || S.textStroke}"
          >

        </div>


        ${control(
          'textOpacity',
          'Opacity',
          0,
          100
        )}


        <button
          class="btn danger"
          id="deleteText"
          style="width:100%;margin-top:4px"
        >
          Delete Selected Text
        </button>

      </div>


      <p class="note">
        Tap a text layer on the photo to select it.
        Drag it anywhere on the image.
      </p>

    `;

  }


  /* -------------------------------------------------------
     DRAW
  ------------------------------------------------------- */

  if(active === 'draw'){

    h = `

      <div class="section">

        <h3>Brush</h3>

        ${control(
          'brushSize',
          'Brush Size',
          1,
          120
        )}

        ${control(
          'brushOpacity',
          'Opacity',
          1,
          100
        )}

        <label class="small-label">
          Brush Color
        </label>

        <input
          id="brushColor"
          class="color-input"
          style="width:100%;height:40px"
          type="color"
          value="${S.brushColor}"
        >

        <div style="height:8px"></div>

        <div class="grid2">

          <button
            class="btn"
            id="undoStroke"
          >
            Remove Last
          </button>

          <button
            class="btn danger"
            id="clearDraw"
          >
            Clear Drawing
          </button>

        </div>

      </div>


      <p class="note">
        Draw directly over the photo.
        Each stroke is one undo step.
      </p>

    `;

  }


  /* -------------------------------------------------------
     SELECTIVE COLOR
  ------------------------------------------------------- */

  if(active === 'selective'){

    h = `

      <div class="section">

        <h3>Point Color</h3>

        <button
          class="btn"
          id="pickColor"
          style="width:100%"
        >
          Pick Color From Photo
        </button>

        <div style="height:9px"></div>

        <div class="selected-color">

          <div
            id="colorSample"
            class="sample"
          ></div>

          <span id="colorHex">
            ${selectedColor.hex}
          </span>

        </div>

        ${control(
          'selectiveRadius',
          'Color Range',
          4,
          70
        )}

        ${control(
          'selectiveHue',
          'Hue Shift',
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

        <div
          class="swatches"
          id="quickSwatches"
        ></div>

        <button
          class="btn"
          id="clearSelective"
          style="width:100%;margin-top:8px"
        >
          Clear Color Selection
        </button>

      </div>


      <p class="note">
        Click a color in the photo,
        then change nearby colors.
      </p>

    `;

  }


  /* -------------------------------------------------------
     PRESETS
  ------------------------------------------------------- */

  if(active === 'presets'){

    h = `

      <div class="section">

        <h3>Toolora Presets</h3>

        <div class="presets">

          ${[
            ['clean','Clean','Balanced'],
            ['warm','Warm','Warm tone'],
            ['cool','Cool','Cool tone'],
            ['cinematic','Cinematic','Moody contrast'],
            ['matte','Matte','Soft film'],
            ['vivid','Vivid','Color punch'],
            ['portrait','Portrait','Soft portrait'],
            ['bw','Black & White','Monochrome']
          ].map(x=>`

            <button
              class="preset-card ${S.preset === x[0] ? 'active':''}"
              data-preset="${x[0]}"
            >

              <b>${x[1]}</b>

              <span>${x[2]}</span>

            </button>

          `).join('')}

        </div>

        ${control(
          'presetAmount',
          'Preset Amount',
          0,
          100
        )}

      </div>

    `;

  }


  /* -------------------------------------------------------
     LAYERS
  ------------------------------------------------------- */

  if(active === 'layers'){

    h = `

      <div class="section">

        <h3>Layers</h3>

        ${
          texts.length

          ?

          texts.map(t=>`

            <div class="layer">

              <div class="layer-main">

                <strong>
                  ${escapeHTML(t.text || 'Text')}
                </strong>

                <small>
                  ${t.font} · ${t.size}px
                </small>

              </div>


              <button
                data-select-layer="${t.id}"
                title="Select"
              >
                ✓
              </button>


              <button
                data-delete-layer="${t.id}"
                title="Delete"
              >
                ×
              </button>

            </div>

          `).join('')

          :

          `<p class="note">
            No text layers yet.
          </p>`
        }

      </div>


      <div class="section">

        <button
          class="btn danger"
          id="clearOverlays"
          style="width:100%"
        >
          Clear All Overlays
        </button>

      </div>

    `;

  }


  /* -------------------------------------------------------
     EXPORT
  ------------------------------------------------------- */

  if(active === 'export'){

    h = `

      <div class="section">

        <h3>Export</h3>

        <div class="export-box">

          <div class="grid2">

            <div>

              <label class="small-label">
                Format
              </label>

              ${selectHTML(
                'format',
                'image/jpeg',
                [
                  ['image/jpeg','JPG'],
                  ['image/png','PNG'],
                  ['image/webp','WebP']
                ]
              )}

            </div>


            <div>

              <label class="small-label">
                Quality
              </label>

              ${selectHTML(
                'quality',
                '.9',
                [
                  ['.7','Standard'],
                  ['.9','High'],
                  ['.98','Maximum']
                ]
              )}

            </div>

          </div>


          <div style="height:10px"></div>


          <label class="small-label">
            Maximum long edge
          </label>

          ${selectHTML(
            'exportSize',
            '2400',
            [
              ['1600','1600 px'],
              ['2400','2400 px'],
              ['3200','3200 px'],
              ['0','Working size']
            ]
          )}


          <button
            class="download-btn"
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


      <p class="note">
        Exports use the current edit state
        and overlays. Processing stays local.
      </p>

    `;

  }


  p.innerHTML = h;

  bindPanel();

  panelActions();

  updateSelectedTextControls();

  updateColorPanel();

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value){

  return String(value).replace(
    /[&<>"']/g,
    char=>({

      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'

    }[char])
  );

}


/* =========================================================
   TEXT HELPERS
========================================================= */

function getSelectedText(){

  return texts.find(
    t=>t.id === selectedTextId
  ) || null;

}


function updateSelectedText(patch){

  const t =
    getSelectedText();

  if(!t){
    return;
  }

  push();

  Object.assign(
    t,
    patch
  );

  schedule();

  panel();

}


function updateSelectedTextFromState(key){

  const t =
    getSelectedText();

  if(!t){
    return;
  }

  const map = {

    textSize:'size',

    textOpacity:'opacity'

  };

  if(map[key]){

    t[map[key]] =
      S[key];

  }

  schedule();

}


function updateSelectedTextControls(){

  const t =
    getSelectedText();

  if(!t){
    return;
  }


  if($('textSize')){

    $('textSize').value =
      t.size;

    const value =
      $('v_textSize');

    if(value){

      value.textContent =
        fmt(t.size);

    }

  }


  if($('textOpacity')){

    $('textOpacity').value =
      t.opacity;

    const value =
      $('v_textOpacity');

    if(value){

      value.textContent =
        fmt(t.opacity);

    }

  }


  if($('font')){

    $('font').value =
      t.font || 'Arial';

  }


  if($('textColor')){

    $('textColor').value =
      t.color || '#ffffff';

  }


  if($('textStroke')){

    $('textStroke').value =
      t.stroke || '#000000';

  }

}


/* =========================================================
   COLOR PANEL
========================================================= */

function updateColorPanel(){

  if(!$('colorSample')){
    return;
  }

  $('colorSample').style.background =
    selectedColor.hex;

  $('colorHex').textContent =
    selectedColor.hex;


  const swatches = [

    '#ff3b30',
    '#ff9500',
    '#ffcc00',
    '#34c759',
    '#00c7be',
    '#007aff',
    '#5856d6',
    '#af52de'

  ];


  $('quickSwatches').innerHTML =
    swatches.map(color=>`

      <button
        class="swatch"
        data-sw="${color}"
        style="background:${color}"
        aria-label="${color}"
      ></button>

    `).join('');


  document
    .querySelectorAll('[data-sw]')
    .forEach(button=>{

      button.onclick = ()=>{

        const rgb =
          hexToRgb(button.dataset.sw);

        selectedColor = {

          ...rgb,

          ...rgbToHsv(
            rgb.r,
            rgb.g,
            rgb.b
          ),

          hex:
            button.dataset.sw

        };

        schedule();

        panel();

      };

    });

}


/* =========================================================
   PANEL BINDING
========================================================= */

function bindPanel(){

  document
    .querySelectorAll(
      '#panel input[data-k]'
    )
    .forEach(element=>{

      let started = false;


      element.addEventListener(
        'pointerdown',
        ()=>{

          if(!started){

            push();

            started = true;

          }

        }
      );


      element.addEventListener(
        'input',
        ()=>{

          S[element.dataset.k] =
            Number(element.value);


          const value =
            $(`v_${element.dataset.k}`);


          if(value){

            value.textContent =
              fmt(element.value);

          }


          if(
            element.dataset.k
              .startsWith('text')
          ){

            updateSelectedTextFromState(
              element.dataset.k
            );

          }


          schedule();

        }
      );


      element.addEventListener(
        'change',
        ()=>{

          started = false;

        }
      );

    });


  document
    .querySelectorAll(
      '#panel input[data-mix]'
    )
    .forEach(element=>{

      let started = false;


      element.addEventListener(
        'pointerdown',
        ()=>{

          if(!started){

            push();

            started = true;

          }

        }
      );


      element.addEventListener(
        'input',
        ()=>{

          S[
            `${element.dataset.mix}_${element.dataset.color}`
          ] =
            Number(element.value);

          schedule();

        }
      );


      element.addEventListener(
        'change',
        ()=>{

          started = false;

        }
      );

    });


  $('font')?.addEventListener(
    'change',
    event=>{

      updateSelectedText({
        font:event.target.value
      });

    }
  );


  $('textValue')?.addEventListener(
    'input',
    event=>{

      const t =
        getSelectedText();

      if(t){

        t.text =
          event.target.value;

        schedule();

      }

    }
  );


  $('textColor')?.addEventListener(
    'input',
    event=>{

      updateSelectedText({
        color:event.target.value
      });

    }
  );


  $('textStroke')?.addEventListener(
    'input',
    event=>{

      updateSelectedText({
        stroke:event.target.value
      });

    }
  );


  $('brushColor')?.addEventListener(
    'input',
    event=>{

      S.brushColor =
        event.target.value;

    }
  );

}


/* =========================================================
   PANEL ACTIONS
========================================================= */

function panelActions(){

  $('auto')?.addEventListener(
    'click',
    ()=>{

      push();

      Object.assign(
        S,
        {
          exposure:0,
          contrast:8,
          highlights:-14,
          shadows:16,
          whites:4,
          blacks:-5
        }
      );

      schedule();

    }
  );


  $('ratio')?.addEventListener(
    'change',
    event=>{

      push();

      S.ratio =
        event.target.value;

      schedule();

    }
  );


  $('rotateLeft')?.addEventListener(
    'click',
    ()=>{

      push();

      S.rotate =
        (S.rotate + 270) % 360;

      schedule();

    }
  );


  $('rotateRight')?.addEventListener(
    'click',
    ()=>{

      push();

      S.rotate =
        (S.rotate + 90) % 360;

      schedule();

    }
  );


  $('flipX')?.addEventListener(
    'click',
    ()=>{

      push();

      S.flipX =
        !S.flipX;

      schedule();

    }
  );


  $('flipY')?.addEventListener(
    'click',
    ()=>{

      push();

      S.flipY =
        !S.flipY;

      schedule();

    }
  );


  /* ADD TEXT */

  $('addText')?.addEventListener(
    'click',
    ()=>{

      push();

      const text =
        $('textValue')?.value.trim()
        || 'ABC XYZ';


      const t = {

        id:
          Date.now()
          +
          Math.random(),

        text,

        x:.5,
        y:.5,

        font:'Arial',

        size:56,

        bold:false,

        italic:false,

        align:'center',

        color:'#ffffff',

        stroke:'#000000',

        opacity:100

      };


      texts.push(t);

      selectedTextId =
        t.id;

      S.textSize =
        t.size;

      S.textOpacity =
        t.opacity;

      panel();

      schedule();

    }
  );


  $('textBold')?.addEventListener(
    'click',
    ()=>{

      const t =
        getSelectedText();

      if(!t){
        return;
      }

      push();

      t.bold =
        !t.bold;

      panel();

      schedule();

    }
  );


  $('textItalic')?.addEventListener(
    'click',
    ()=>{

      const t =
        getSelectedText();

      if(!t){
        return;
      }

      push();

      t.italic =
        !t.italic;

      panel();

      schedule();

    }
  );


  $('textLeft')?.addEventListener(
    'click',
    ()=>{

      const t =
        getSelectedText();

      if(!t){
        return;
      }

      push();

      t.align =
        'left';

      panel();

      schedule();

    }
  );


  $('textCenter')?.addEventListener(
    'click',
    ()=>{

      const t =
        getSelectedText();

      if(!t){
        return;
      }

      push();

      t.align =
        'center';

      panel();

      schedule();

    }
  );


  $('deleteText')?.addEventListener(
    'click',
    ()=>{

      if(!getSelectedText()){
        return;
      }

      push();

      texts =
        texts.filter(
          t=>t.id !== selectedTextId
        );

      selectedTextId =
        texts.at(-1)?.id || null;

      panel();

      schedule();

    }
  );


  /* DRAW */

  $('undoStroke')?.addEventListener(
    'click',
    ()=>{

      if(!strokes.length){
        return;
      }

      push();

      strokes.pop();

      schedule();

    }
  );


  $('clearDraw')?.addEventListener(
    'click',
    ()=>{

      if(!strokes.length){
        return;
      }

      push();

      strokes = [];

      schedule();

    }
  );


  /* SELECT COLOR */

  $('pickColor')?.addEventListener(
    'click',
    ()=>{

      if(!image){

        alert(
          'Please open a photo first.'
        );

        return;

      }

      picking = true;

      $('pickerBadge').style.display =
        'block';

      setStatus(
        'Click a color in the photo'
      );

    }
  );


  $('clearSelective')?.addEventListener(
    'click',
    ()=>{

      push();

      S.selectiveHue = 0;
      S.selectiveSat = 0;
      S.selectiveLight = 0;

      selectedColor = {

        r:255,
        g:255,
        b:255,

        h:0,
        s:0,
        v:1,

        hex:'#ffffff'

      };

      panel();

      schedule();

    }
  );


  /* PRESETS */

  document
    .querySelectorAll('[data-preset]')
    .forEach(button=>{

      button.onclick =
        () =>
          applyPreset(
            button.dataset.preset
          );

    });


  /* LAYERS */

  document
    .querySelectorAll('[data-select-layer]')
    .forEach(button=>{

      button.onclick = ()=>{

        selectedTextId =
          Number(
            button.dataset.selectLayer
          );

        active = 'text';

        syncTabs();

        panel();

      };

    });


  document
    .querySelectorAll('[data-delete-layer]')
    .forEach(button=>{

      button.onclick = ()=>{

        push();

        texts =
          texts.filter(
            t =>
              String(t.id)
              !==
              button.dataset.deleteLayer
          );

        if(
          String(selectedTextId)
          ===
          button.dataset.deleteLayer
        ){

          selectedTextId =
            texts.at(-1)?.id || null;

        }

        panel();

        schedule();

      };

    });


  $('clearOverlays')?.addEventListener(
    'click',
    ()=>{

      if(
        !texts.length &&
        !strokes.length
      ){

        return;

      }

      push();

      texts = [];

      strokes = [];

      selectedTextId = null;

      schedule();

      panel();

    }
  );


  $('download')?.addEventListener(
    'click',
    exportImage
  );


  $('resetAll')?.addEventListener(
    'click',
    ()=>resetAll(true)
  );

}


/* =========================================================
   PRESETS
========================================================= */

function applyPreset(name){

  push();


  const presets = {

    clean:{
      exposure:4,
      contrast:4,
      shadows:7,
      vibrance:8,
      texture:5
    },

    warm:{
      temp:18,
      contrast:4,
      highlights:-8,
      shadows:8,
      vibrance:8
    },

    cool:{
      temp:-18,
      contrast:5,
      shadows:6,
      vibrance:7
    },

    cinematic:{
      contrast:13,
      highlights:-16,
      blacks:-12,
      clarity:10,
      dehaze:7,
      vignette:18,
      saturation:-5
    },

    matte:{
      contrast:-8,
      highlights:-12,
      shadows:15,
      blacks:18,
      clarity:-4,
      saturation:-4,
      vignette:8
    },

    vivid:{
      contrast:7,
      vibrance:28,
      saturation:6,
      clarity:6
    },

    portrait:{
      exposure:4,
      highlights:-8,
      shadows:12,
      temp:5,
      vibrance:8,
      texture:-10,
      clarity:-5
    },

    bw:{
      contrast:10,
      highlights:-8,
      shadows:8,
      blacks:-12,
      saturation:-100,
      clarity:7
    }

  };


  const base = {

    exposure:0,
    contrast:0,
    highlights:0,
    shadows:0,
    whites:0,
    blacks:0,

    temp:0,
    tint:0,

    vibrance:0,
    saturation:0,

    texture:0,
    clarity:0,
    dehaze:0,

    vignette:0,
    grain:0

  };


  Object.assign(
    S,
    base,
    presets[name] || {}
  );


  S.preset =
    name;


  schedule();

  panel();

}


/* =========================================================
   RESET
========================================================= */

function resetAll(
  addHistory=true
){

  if(addHistory){
    push();
  }


  for(
    const key of Object.keys(S)
  ){

    if(
      key.startsWith('h_') ||
      key.startsWith('s_') ||
      key.startsWith('l_')
    ){

      S[key] = 0;

    }

    else if(
      typeof S[key] === 'boolean'
    ){

      S[key] = false;

    }

    else if(key === 'ratio'){

      S[key] = 'original';

    }

    else if(
      key === 'midpoint' ||
      key === 'feather'
    ){

      S[key] = 50;

    }

    else if(key === 'grainSize'){

      S[key] = 25;

    }

    else if(key === 'grainRough'){

      S[key] = 50;

    }

    else if(key === 'radius'){

      S[key] = 1;

    }

    else if(key === 'selectiveRadius'){

      S[key] = 24;

    }

    else if(key === 'brushSize'){

      S[key] = 20;

    }

    else if(
      key === 'brushOpacity' ||
      key === 'textOpacity'
    ){

      S[key] = 100;

    }

    else if(key === 'brushColor'){

      S[key] = '#ffffff';

    }

    else if(key === 'textColor'){

      S[key] = '#ffffff';

    }

    else if(key === 'textStroke'){

      S[key] = '#000000';

    }

    else{

      S[key] = 0;

    }

  }


  S.presetAmount = 100;


  texts = [];

  strokes = [];

  selectedTextId = null;

  showBefore = false;

  zoom = 1;

  panel();

  schedule();

}


/* =========================================================
   IMAGE LOADING
========================================================= */

function loadImage(file){

  if(
    !file ||
    !file.type.startsWith('image/')
  ){

    alert(
      'Please select a valid image file.'
    );

    return;

  }


  setStatus(
    'Opening photo…'
  );


  const url =
    URL.createObjectURL(file);

  const im =
    new Image();


  im.onload = ()=>{

    URL.revokeObjectURL(url);

    image = im;


    const max = 1800;


    const scale =
      Math.min(
        1,
        max /
        Math.max(
          im.naturalWidth,
          im.naturalHeight
        )
      );


    source.width =
      Math.max(
        1,
        Math.round(
          im.naturalWidth * scale
        )
      );


    source.height =
      Math.max(
        1,
        Math.round(
          im.naturalHeight * scale
        )
      );


    sx.clearRect(
      0,
      0,
      source.width,
      source.height
    );


    sx.drawImage(
      im,
      0,
      0,
      source.width,
      source.height
    );


    $('name').textContent =
      file.name;


    $('meta').textContent =
      `${im.naturalWidth} × ${im.naturalHeight}px`;


    $('empty').style.display =
      'none';


    canvas.style.display =
      'block';


    overlay.style.display =
      'block';


    showBefore = false;


    $('beforeBadge').style.display =
      'none';


    texts = [];

    strokes = [];

    selectedTextId = null;


    resetEditsWithoutHistory();


    zoom = 1;


    render();


    setStatus('Ready');

  };


  im.onerror = ()=>{

    URL.revokeObjectURL(url);

    setStatus('Ready');

    alert(
      'The selected image could not be opened. Please try another image.'
    );

  };


  im.src = url;

}


/* =========================================================
   RESET WITHOUT HISTORY
========================================================= */

function resetEditsWithoutHistory(){

  for(
    const key of Object.keys(S)
  ){

    if(
      key.startsWith('h_') ||
      key.startsWith('s_') ||
      key.startsWith('l_')
    ){

      S[key] = 0;

    }

    else if(
      typeof S[key] === 'boolean'
    ){

      S[key] = false;

    }

    else if(key === 'ratio'){

      S[key] = 'original';

    }

    else if(
      key === 'midpoint' ||
      key === 'feather'
    ){

      S[key] = 50;

    }

    else if(key === 'grainSize'){

      S[key] = 25;

    }

    else if(key === 'grainRough'){

      S[key] = 50;

    }

    else if(key === 'radius'){

      S[key] = 1;

    }

    else if(key === 'selectiveRadius'){

      S[key] = 24;

    }

    else if(key === 'brushSize'){

      S[key] = 20;

    }

    else if(
      key === 'brushOpacity' ||
      key === 'textOpacity'
    ){

      S[key] = 100;

    }

    else if(key === 'brushColor'){

      S[key] = '#ffffff';

    }

    else if(key === 'textColor'){

      S[key] = '#ffffff';

    }

    else if(key === 'textStroke'){

      S[key] = '#000000';

    }

    else{

      S[key] = 0;

    }

  }


  S.presetAmount = 100;

  history = [];

  future = [];

}


/* =========================================================
   COLOR MATH
========================================================= */

function rgbToHsv(
  r,
  g,
  b
){

  r /= 255;
  g /= 255;
  b /= 255;


  const max =
    Math.max(r,g,b);

  const min =
    Math.min(r,g,b);

  const d =
    max - min;


  let h = 0;


  if(d){

    if(max === r){

      h =
        (
          (g-b)/d
          +
          (g<b ? 6 : 0)
        ) / 6;

    }

    else if(max === g){

      h =
        (
          (b-r)/d
          +
          2
        ) / 6;

    }

    else{

      h =
        (
          (r-g)/d
          +
          4
        ) / 6;

    }

  }


  return {

    h,

    s:
      max
      ?
      d/max
      :
      0,

    v:max

  };

}


function hsvToRgb(
  h,
  s,
  v
){

  h =
    ((h % 1)+1)%1;

  s =
    clamp(s,0,1);

  v =
    clamp(v,0,1);


  const i =
    Math.floor(h*6);

  const f =
    h*6-i;

  const p =
    v*(1-s);

  const q =
    v*(1-f*s);

  const t =
    v*(1-(1-f)*s);


  const values =
    [
      [v,t,p],
      [q,v,p],
      [p,v,t],
      [p,q,v],
      [t,p,v],
      [v,p,q]
    ][i%6];


  return {

    r:Math.round(values[0]*255),

    g:Math.round(values[1]*255),

    b:Math.round(values[2]*255)

  };

}


function hexToRgb(hex){

  const value =
    hex.replace('#','');


  return {

    r:parseInt(
      value.slice(0,2),
      16
    ),

    g:parseInt(
      value.slice(2,4),
      16
    ),

    b:parseInt(
      value.slice(4,6),
      16
    )

  };

}


function rgbToHex(
  r,
  g,
  b
){

  return '#' +
    [r,g,b]
      .map(
        value =>
          Math.round(value)
            .toString(16)
            .padStart(2,'0')
      )
      .join('');

}


function hueDistance(a,b){

  const d =
    Math.abs(a-b);

  return Math.min(
    d,
    1-d
  );

}


function colorBand(h){

  if(
    h < .04 ||
    h > .96
  ){
    return 'red';
  }

  if(h < .11){
    return 'orange';
  }

  if(h < .19){
    return 'yellow';
  }

  if(h < .43){
    return 'green';
  }

  if(h < .53){
    return 'aqua';
  }

  if(h < .70){
    return 'blue';
  }

  if(h < .85){
    return 'purple';
  }

  return 'magenta';

}


/* =========================================================
   PIXEL PROCESSING
========================================================= */

function applyPixels(
  data,
  width,
  height
){

  const d =
    data.data;


  const exposure =
    Math.pow(
      2,
      S.exposure/100
    );


  const contrast =
    (100+S.contrast)/100;


  const saturation =
    (100+S.saturation)/100;


  const vibrance =
    S.vibrance/100;


  for(
    let i=0;
    i<d.length;
    i+=4
  ){

    let r =
      d[i]/255;

    let g =
      d[i+1]/255;

    let b =
      d[i+2]/255;


    r *= exposure;
    g *= exposure;
    b *= exposure;


    let luminance =
      .2126*r+
      .7152*g+
      .0722*b;


    const highlight =
      S.highlights/120;

    const shadow =
      S.shadows/120;


    if(luminance>.5){

      r +=
        highlight*(r-.5);

      g +=
        highlight*(g-.5);

      b +=
        highlight*(b-.5);

    }

    else{

      r +=
        shadow*(.5-r);

      g +=
        shadow*(.5-g);

      b +=
        shadow*(.5-b);

    }


    const whiteBlack =
      S.whites/255+
      S.blacks/255;


    r += whiteBlack;
    g += whiteBlack;
    b += whiteBlack;


    r =
      (r-.5)*contrast+.5;

    g =
      (g-.5)*contrast+.5;

    b =
      (b-.5)*contrast+.5;


    r +=
      S.temp*.001;

    b -=
      S.temp*.001;

    g +=
      S.tint*.0005;


    const gray =
      .299*r+
      .587*g+
      .114*b;


    const vibranceBoost =
      1+
      vibrance*
      (1-Math.abs(
        2*luminance-1
      ))*
      .75;


    r =
      gray+
      (r-gray)*
      saturation*
      vibranceBoost;

    g =
      gray+
      (g-gray)*
      saturation*
      vibranceBoost;

    b =
      gray+
      (b-gray)*
      saturation*
      vibranceBoost;


    const effect =
      (
        S.texture+
        S.clarity
      )/1000;


    const average =
      (r+g+b)/3;


    r +=
      (r-average)*effect;

    g +=
      (g-average)*effect;

    b +=
      (b-average)*effect;


    if(S.dehaze){

      const amount =
        S.dehaze/150;


      r =
        (r-.5)*
        (1+amount)+
        .5;

      g =
        (g-.5)*
        (1+amount)+
        .5;

      b =
        (b-.5)*
        (1+amount)+
        .5;

    }


    r =
      clamp(r,0,1);

    g =
      clamp(g,0,1);

    b =
      clamp(b,0,1);


    let hsv =
      rgbToHsv(
        r*255,
        g*255,
        b*255
      );


    const band =
      colorBand(hsv.h);


    const hue =
      S[`h_${band}`];

    const sat =
      S[`s_${band}`];

    const light =
      S[`l_${band}`];


    if(
      hue ||
      sat ||
      light
    ){

      hsv.h =
        (
          hsv.h+
          hue/360+
          1
        )%1;


      hsv.s =
        clamp(
          hsv.s*
          (1+sat/100),
          0,
          1
        );


      hsv.v =
        clamp(
          hsv.v*
          (1+light/100),
          0,
          1
        );


      const rgb =
        hsvToRgb(
          hsv.h,
          hsv.s,
          hsv.v
        );


      r = rgb.r/255;
      g = rgb.g/255;
      b = rgb.b/255;

    }


    const lum =
      .2126*r+
      .7152*g+
      .0722*b;


    const gradeHue =
      lum < .35
        ? S.gradeShadow
        : lum > .65
          ? S.gradeHigh
          : S.gradeMid;


    const gradeSat =
      lum < .35
        ? S.gradeShadowSat
        : lum > .65
          ? S.gradeHighSat
          : S.gradeMidSat;


    if(gradeSat){

      const rgb =
        hsvToRgb(
          gradeHue/360,
          gradeSat/100,
          Math.max(.25,lum)
        );


      const blend =
        (S.gradeBlend/100)*.35;


      r =
        r*(1-blend)
        +
        (rgb.r/255)*blend;

      g =
        g*(1-blend)
        +
        (rgb.g/255)*blend;

      b =
        b*(1-blend)
        +
        (rgb.b/255)*blend;

    }


    const x =
      ((i/4)%width)/width-.5;

    const y =
      Math.floor(
        (i/4)/width
      )/height-.5;


    const distance =
      Math.sqrt(
        x*x+y*y
      )*1.414;


    if(S.vignette){

      const edge =
        clamp(
          (
            distance-
            S.midpoint/100*.65
          )
          /
          Math.max(
            .05,
            S.feather/100
          ),
          0,
          1
        );


      const vignette =
        1-
        S.vignette/100*
        edge*
        edge;


      r *= vignette;
      g *= vignette;
      b *= vignette;

    }


    /* Lens-style blur */

    if(S.blur>0){

      const dx =
        x-
        (
          S.blurX/100-.5
        );

      const dy =
        y-
        (
          S.blurY/100-.5
        );


      const focus =
        clamp(
          Math.sqrt(
            dx*dx+
            dy*dy
          )*2,
          0,
          1
        );


      const fade =
        focus*
        S.blur/100;


      const avg =
        (r+g+b)/3;


      r =
        r*(1-fade*.12)
        +
        avg*fade*.12;

      g =
        g*(1-fade*.12)
        +
        avg*fade*.12;

      b =
        b*(1-fade*.12)
        +
        avg*fade*.12;

    }


    /* Selective color */

    if(selectedColor){

      const distance =
        hueDistance(
          hsv.h,
          selectedColor.h
        );


      const range =
        S.selectiveRadius/360;


      const weight =
        distance<range
          ?
          Math.pow(
            1-distance/range,
            2
          )
          *
          clamp(
            hsv.s/.15,
            0,
            1
          )
          :
          0;


      if(weight){

        const rgb =
          hsvToRgb(
            (
              hsv.h+
              S.selectiveHue/360*
              weight+
              1
            )%1,

            clamp(
              hsv.s+
              (S.selectiveSat/100)*
              weight,
              0,
              1
            ),

            clamp(
              hsv.v+
              (S.selectiveLight/100)*
              weight,
              0,
              1
            )
          );


        r = rgb.r/255;
        g = rgb.g/255;
        b = rgb.b/255;

      }

    }


    d[i] =
      clamp(
        r*255,
        0,
        255
      );

    d[i+1] =
      clamp(
        g*255,
        0,
        255
      );

    d[i+2] =
      clamp(
        b*255,
        0,
        255
      );

  }


  return data;

}


/* =========================================================
   DETAIL EFFECTS
========================================================= */

function applyBlur(
  context,
  width,
  height,
  amount
){

  if(amount<=0){
    return;
  }


  const temp =
    document.createElement(
      'canvas'
    );


  temp.width =
    width;

  temp.height =
    height;


  const tc =
    temp.getContext('2d');


  tc.filter =
    `blur(${Math.min(
      14,
      amount/7
    )}px)`;


  tc.drawImage(
    context.canvas,
    0,
    0
  );


  context.clearRect(
    0,
    0,
    width,
    height
  );


  context.drawImage(
    temp,
    0,
    0
  );

}


function applyNoiseReduction(
  context,
  width,
  height,
  amount
){

  if(amount<=0){
    return;
  }


  const temp =
    document.createElement(
      'canvas'
    );


  temp.width =
    width;

  temp.height =
    height;


  const tc =
    temp.getContext('2d');


  tc.filter =
    `blur(${Math.min(
      2,
      amount/45
    )}px)`;


  tc.drawImage(
    context.canvas,
    0,
    0
  );


  context.save();

  context.globalAlpha =
    amount/100;


  context.drawImage(
    temp,
    0,
    0
  );


  context.restore();

}


function sharpen(
  context,
  width,
  height,
  amount
){

  if(amount<1){
    return;
  }


  const sourceData =
    context.getImageData(
      0,
      0,
      width,
      height
    );


  const output =
    context.createImageData(
      width,
      height
    );


  const d =
    sourceData.data;

  const q =
    output.data;


  q.set(d);


  const strength =
    amount/100*.65;


  for(
    let y=1;
    y<height-1;
    y++
  ){

    for(
      let x=1;
      x<width-1;
      x++
    ){

      const i =
        (y*width+x)*4;


      for(
        let channel=0;
        channel<3;
        channel++
      ){

        q[i+channel] =
          clamp(

            d[i+channel]*
            (1+4*strength)

            -

            strength*
            (
              d[i-4+channel]+
              d[i+4+channel]+
              d[i-width*4+channel]+
              d[i+width*4+channel]
            ),

            0,
            255

          );

      }

    }

  }


  context.putImageData(
    output,
    0,
    0
  );

}


function grain(
  context,
  width,
  height,
  amount
){

  if(amount<=0){
    return;
  }


  const data =
    context.getImageData(
      0,
      0,
      width,
      height
    );


  const d =
    data.data;


  const size =
    Math.max(
      1,
      S.grainSize/25
    );


  const roughness =
    S.grainRough/100;


  const noiseAmount =
    amount/100*28;


  const step =
    Math.max(
      1,
      Math.round(size)
    );


  for(
    let y=0;
    y<height;
    y+=step
  ){

    for(
      let x=0;
      x<width;
      x+=step
    ){

      const noise =
        (
          Math.random()-.5
        )*
        noiseAmount*
        (
          .5+
          roughness
        );


      for(
        let yy=0;
        yy<step &&
        y+yy<height;
        yy++
      ){

        for(
          let xx=0;
          xx<step &&
          x+xx<width;
          xx++
        ){

          const i =
            (
              (y+yy)*
              width+
              x+xx
            )*4;


          d[i] =
            clamp(
              d[i]+noise,
              0,
              255
            );


          d[i+1] =
            clamp(
              d[i+1]+noise,
              0,
              255
            );


          d[i+2] =
            clamp(
              d[i+2]+noise,
              0,
              255
            );

        }

      }

    }

  }


  context.putImageData(
    data,
    0,
    0
  );

}


/* =========================================================
   GEOMETRY
========================================================= */

function geometryCanvas(){

  const width =
    source.width;

  const height =
    source.height;


  const rotation =
    S.rotate*
    Math.PI/
    180;


  const swap =
    Math.abs(S.rotate)%180 === 90;


  const stageWidth =
    swap
      ? height
      : width;


  const stageHeight =
    swap
      ? width
      : height;


  const temp =
    document.createElement(
      'canvas'
    );


  temp.width =
    stageWidth;

  temp.height =
    stageHeight;


  const tc =
    temp.getContext('2d');


  tc.translate(
    stageWidth/2,
    stageHeight/2
  );


  tc.rotate(
    rotation+
    S.straighten*
    Math.PI/
    180
  );


  tc.scale(
    S.flipX?-1:1,
    S.flipY?-1:1
  );


  tc.drawImage(
    source,
    -width/2,
    -height/2
  );


  let cropWidth =
    stageWidth;

  let cropHeight =
    stageHeight;

  let cropX = 0;

  let cropY = 0;


  if(
    S.ratio !==
    'original'
  ){

    const parts =
      S.ratio
        .split(':')
        .map(Number);


    const targetRatio =
      parts[0]/
      parts[1];


    const currentRatio =
      stageWidth/
      stageHeight;


    if(
      currentRatio >
      targetRatio
    ){

      cropWidth =
        Math.round(
          stageHeight*
          targetRatio
        );


      cropX =
        (
          stageWidth-
          cropWidth
        )/2;

    }

    else{

      cropHeight =
        Math.round(
          stageWidth/
          targetRatio
        );


      cropY =
        (
          stageHeight-
          cropHeight
        )/2;

    }

  }


  return {

    canvas:temp,

    width:cropWidth,

    height:cropHeight,

    x:cropX,

    y:cropY

  };

}


/* =========================================================
   OVERLAYS
========================================================= */

function drawOverlays(
  context,
  width,
  height
){

  /* DRAW STROKES */

  for(
    const stroke of strokes
  ){

    context.save();

    context.globalAlpha =
      stroke.opacity/100;

    context.strokeStyle =
      stroke.color;

    context.lineWidth =
      Math.max(
        1,
        stroke.size*
        width/
        1000
      );

    context.lineCap =
      'round';

    context.lineJoin =
      'round';


    context.beginPath();


    stroke.points.forEach(
      (point,index)=>{

        if(index===0){

          context.moveTo(
            point.x*width,
            point.y*height
          );

        }

        else{

          context.lineTo(
            point.x*width,
            point.y*height
          );

        }

      }
    );


    context.stroke();

    context.restore();

  }


  /* TEXT */

  for(
    const text of texts
  ){

    context.save();

    context.globalAlpha =
      text.opacity/100;


    context.font =

      `${text.italic ? 'italic ' : ''}` +

      `${text.bold ? '700 ' : '400 '}` +

      `${text.size}px "${text.font}"`;


    context.textAlign =
      text.align ||
      'center';

    context.textBaseline =
      'middle';

    context.lineJoin =
      'round';


    const x =
      text.x*
      width;

    const y =
      text.y*
      height;


    context.lineWidth =
      Math.max(
        2,
        text.size*.08
      );


    context.strokeStyle =
      text.stroke;


    context.strokeText(
      text.text,
      x,
      y
    );


    context.fillStyle =
      text.color;


    context.fillText(
      text.text,
      x,
      y
    );


    context.restore();

  }

}


/* =========================================================
   RENDER
========================================================= */

function renderToCanvas(
  maxEdge=1100,
  includeOverlays=true
){

  if(!image){
    return null;
  }


  const geometry =
    geometryCanvas();


  const scale =
    Math.min(
      1,
      maxEdge/
      Math.max(
        geometry.width,
        geometry.height
      )
    );


  const width =
    Math.max(
      1,
      Math.round(
        geometry.width*
        scale
      )
    );


  const height =
    Math.max(
      1,
      Math.round(
        geometry.height*
        scale
      )
    );


  const output =
    document.createElement(
      'canvas'
    );


  output.width =
    width;

  output.height =
    height;


  const context =
    output.getContext(
      '2d',
      {
        willReadFrequently:true
      }
    );


  context.drawImage(

    geometry.canvas,

    geometry.x,
    geometry.y,

    geometry.width,
    geometry.height,

    0,
    0,

    width,
    height

  );


  let data =
    context.getImageData(
      0,
      0,
      width,
      height
    );


  data =
    applyPixels(
      data,
      width,
      height
    );


  context.putImageData(
    data,
    0,
    0
  );


  applyNoiseReduction(
    context,
    width,
    height,
    S.noise
  );


  sharpen(
    context,
    width,
    height,
    S.sharp
  );


  grain(
    context,
    width,
    height,
    S.grain
  );


  applyBlur(
    context,
    width,
    height,
    S.blur*.55
  );


  if(includeOverlays){

    drawOverlays(
      context,
      width,
      height
    );

  }


  return output;

}


function render(){

  if(!image){
    return;
  }


  setStatus(
    'Rendering…'
  );


  if(showBefore){

    const geometry =
      geometryCanvas();


    const scale =
      Math.min(
        1,
        1100/
        Math.max(
          geometry.width,
          geometry.height
        )
      );


    const width =
      Math.max(
        1,
        Math.round(
          geometry.width*
          scale
        )
      );


    const height =
      Math.max(
        1,
        Math.round(
          geometry.height*
          scale
        )
      );


    canvas.width =
      width;

    canvas.height =
      height;


    ctx.clearRect(
      0,
      0,
      width,
      height
    );


    ctx.drawImage(

      geometry.canvas,

      geometry.x,
      geometry.y,

      geometry.width,
      geometry.height,

      0,
      0,

      width,
      height

    );


    canvas.style.transform =
      `scale(${zoom})`;


    overlay.style.display =
      'none';


    setStatus(
      'Original'
    );


    return;

  }


  const output =
    renderToCanvas(
      window.innerWidth<700
        ? 720
        : 1100,
      true
    );


  canvas.width =
    output.width;

  canvas.height =
    output.height;


  ctx.clearRect(
    0,
    0,
    output.width,
    output.height
  );


  ctx.drawImage(
    output,
    0,
    0
  );


  canvas.style.transform =
    `scale(${zoom})`;


  overlay.style.display =
    'none';


  $('zlabel').textContent =
    `${Math.round(
      zoom*100
    )}%`;


  setStatus(
    'Ready'
  );

}


/* =========================================================
   STAGE COORDINATES
========================================================= */

function stagePoint(event){

  const rect =
    canvas.getBoundingClientRect();


  return {

    x:clamp(
      (
        event.clientX-
        rect.left
      )/
      rect.width,
      0,
      1
    ),

    y:clamp(
      (
        event.clientY-
        rect.top
      )/
      rect.height,
      0,
      1
    )

  };

}


/* =========================================================
   TEXT HIT TEST
========================================================= */

function textAt(
  x,
  y
){

  for(
    let i=texts.length-1;
    i>=0;
    i--
  ){

    const t =
      texts[i];


    const dx =
      Math.abs(
        x-t.x
      );


    const dy =
      Math.abs(
        y-t.y
      );


    const box =
      Math.max(
        .06,
        t.size/
        Math.max(
          canvas.width,
          canvas.height
        )*
        3
      );


    if(
      dx<box &&
      dy<box
    ){

      return t;

    }

  }


  return null;

}


/* =========================================================
   FILE INPUT
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
    event=>{

      loadImage(
        event.target.files?.[0]
      );

      event.target.value = '';

    }
  );


/* =========================================================
   DRAG & DROP
========================================================= */

$('stage')
  .addEventListener(
    'dragover',
    event=>{

      event.preventDefault();

      $('stage')
        .classList
        .add('dragover');

    }
  );


$('stage')
  .addEventListener(
    'dragleave',
    ()=>
      $('stage')
        .classList
        .remove('dragover')
  );


$('stage')
  .addEventListener(
    'drop',
    event=>{

      event.preventDefault();

      $('stage')
        .classList
        .remove('dragover');

      loadImage(
        event.dataTransfer.files?.[0]
      );

    }
  );


/* =========================================================
   PHOTO POINTER EVENTS
========================================================= */

$('stage')
  .addEventListener(
    'pointerdown',
    event=>{

      if(!image){
        return;
      }


      const point =
        stagePoint(event);


      /* COLOR PICKER */

      if(picking){

        const x =
          Math.round(
            point.x*
            (canvas.width-1)
          );


        const y =
          Math.round(
            point.y*
            (canvas.height-1)
          );


        const pixel =
          ctx.getImageData(
            x,
            y,
            1,
            1
          ).data;


        const hsv =
          rgbToHsv(
            pixel[0],
            pixel[1],
            pixel[2]
          );


        selectedColor = {

          r:pixel[0],
          g:pixel[1],
          b:pixel[2],

          ...hsv,

          hex:
            rgbToHex(
              pixel[0],
              pixel[1],
              pixel[2]
            )

        };


        picking = false;


        $('pickerBadge')
          .style
          .display =
          'none';


        active =
          'selective';


        syncTabs();

        panel();

        schedule();

        return;

      }


      /* TEXT */

      if(active === 'text'){

        const text =
          textAt(
            point.x,
            point.y
          );


        if(text){

          selectedTextId =
            text.id;


          dragText = {

            text,

            dx:
              point.x-
              text.x,

            dy:
              point.y-
              text.y

          };


          push();


          panel();


          event.currentTarget
            .setPointerCapture(
              event.pointerId
            );


          return;

        }

      }


      /* DRAW */

      if(active === 'draw'){

        push();

        drawing = true;


        event.currentTarget
          .setPointerCapture(
            event.pointerId
          );


        strokes.push({

          points:[
            point
          ],

          size:
            S.brushSize,

          opacity:
            S.brushOpacity,

          color:
            S.brushColor

        });


        schedule();

        return;

      }

    }
  );


$('stage')
  .addEventListener(
    'pointermove',
    event=>{

      if(!image){
        return;
      }


      const point =
        stagePoint(event);


      if(dragText){

        dragText.text.x =
          clamp(
            point.x-
            dragText.dx,
            0,
            1
          );


        dragText.text.y =
          clamp(
            point.y-
            dragText.dy,
            0,
            1
          );


        schedule();

      }


      else if(
        drawing &&
        strokes.length
      ){

        strokes
          .at(-1)
          .points
          .push(point);

        schedule();

      }

    }
  );


$('stage')
  .addEventListener(
    'pointerup',
    ()=>{
      dragText = null;
      drawing = false;
    }
  );


$('stage')
  .addEventListener(
    'pointercancel',
    ()=>{
      dragText = null;
      drawing = false;
    }
  );


/* =========================================================
   TOOL TABS
========================================================= */

$('tabs')
  .addEventListener(
    'click',
    event=>{

      const button =
        event.target.closest(
          '[data-tool]'
        );


      if(!button){
        return;
      }


      active =
        button.dataset.tool;


      syncTabs();

      panel();

    }
  );


function syncTabs(){

  document
    .querySelectorAll(
      '#tabs button'
    )
    .forEach(button=>{

      button.classList.toggle(
        'active',
        button.dataset.tool ===
        active
      );

    });

}


/* =========================================================
   UNDO / REDO
========================================================= */

$('undo')
  .addEventListener(
    'click',
    ()=>{

      if(!history.length){
        return;
      }


      future.push(
        snapshot()
      );


      restoreSnapshot(
        history.pop()
      );

    }
  );


$('redo')
  .addEventListener(
    'click',
    ()=>{

      if(!future.length){
        return;
      }


      history.push(
        snapshot()
      );


      restoreSnapshot(
        future.pop()
      );

    }
  );


/* =========================================================
   BEFORE
========================================================= */

$('before')
  .addEventListener(
    'click',
    ()=>{

      showBefore =
        !showBefore;


      $('beforeBadge')
        .style
        .display =
        showBefore
          ? 'block'
          : 'none';


      render();

    }
  );


/* =========================================================
   ZOOM
========================================================= */

$('zout')
  .addEventListener(
    'click',
    ()=>{

      zoom =
        clamp(
          zoom-.1,
          .5,
          2.5
        );

      render();

    }
  );


$('zin')
  .addEventListener(
    'click',
    ()=>{

      zoom =
        clamp(
          zoom+.1,
          .5,
          2.5
        );

      render();

    }
  );


$('fit')
  .addEventListener(
    'click',
    ()=>{

      zoom = 1;

      render();

    }
  );


$('full')
  .addEventListener(
    'click',
    ()=>{

      $('stage')
        .requestFullscreen?.();

    }
  );


/* =========================================================
   KEYBOARD
========================================================= */

document
  .addEventListener(
    'keydown',
    event=>{

      if(
        (event.ctrlKey ||
        event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z'
      ){

        event.preventDefault();

        $('undo').click();

      }


      else if(
        (event.ctrlKey ||
        event.metaKey) &&
        (
          event.shiftKey &&
          event.key.toLowerCase() === 'z'
        )
      ){

        event.preventDefault();

        $('redo').click();

      }

    }
  );


/* =========================================================
   EXPORT
========================================================= */

function exportImage(){

  if(!image){

    alert(
      'Please open a photo first.'
    );

    return;

  }


  const max =
    Number(
      $('exportSize').value
    )
    ||
    Math.max(
      source.width,
      source.height
    );


  const type =
    $('format').value;


  const quality =
    Number(
      $('quality').value
    );


  setStatus(
    'Exporting…'
  );


  setTimeout(
    ()=>{

      try{

        const output =
          renderToCanvas(
            max,
            true
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


        setStatus(
          'Export complete'
        );

      }

      catch(error){

        console.error(error);

        setStatus(
          'Export failed'
        );


        alert(
          'The photo is too large for this browser to export. Try a smaller export size.'
        );

      }

    },
    20
  );

}


/* =========================================================
   RESET BUTTON
========================================================= */

$('reset')
  .addEventListener(
    'click',
    ()=>{
      push();
      resetAll(false);
    }
  );


/* =========================================================
   WINDOW RESIZE
========================================================= */

window.addEventListener(
  'resize',
  ()=>{
    if(image){
      schedule();
    }
  }
);


/* =========================================================
   START
========================================================= */

syncTabs();

panel();

})();
