(() => {
'use strict';

/* =========================================================
   TOOLORA PHOTO EDITOR
   Browser-side image editing engine
========================================================= */

const $ = id => document.getElementById(id);
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

const C = $('canvas');
const ctx = C.getContext('2d',{willReadFrequently:true});

const O = $('overlay');
const ox = O.getContext('2d');

const src = document.createElement('canvas');
const sx = src.getContext('2d',{willReadFrequently:true});

let img = null;
let fileName = '';
let rendering = false;
let renderQueued = false;

let zoom = 1;
let panX = 0;
let panY = 0;

let active = 'light';
let showBefore = false;
let cropGuide = false;

let history = [];
let future = [];

let retouch = [];

let specialPointer = null;
let retouchDrawing = false;

const pointers = new Map();
let gesture = null;
let lastTap = 0;

/* =========================================================
   STATE
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

  h_red:0,
  h_orange:0,
  h_yellow:0,
  h_green:0,
  h_aqua:0,
  h_blue:0,
  h_purple:0,
  h_magenta:0,

  s_red:0,
  s_orange:0,
  s_yellow:0,
  s_green:0,
  s_aqua:0,
  s_blue:0,
  s_purple:0,
  s_magenta:0,

  l_red:0,
  l_orange:0,
  l_yellow:0,
  l_green:0,
  l_aqua:0,
  l_blue:0,
  l_purple:0,
  l_magenta:0,

  texture:0,
  clarity:0,
  dehaze:0,
  vignette:0,
  midpoint:50,
  feather:50,
  roundness:0,

  grain:0,
  grainSize:25,
  grainRough:50,

  sharp:0,
  radius:1,
  noise:0,
  colorNoise:0,

  ratio:'original',
  rotate:0,
  straighten:0,
  flipX:false,
  flipY:false,

  profile:'natural',
  preset:'none',
  presetAmount:100,

  blur:0,
  blurX:50,
  blurY:50,

  lensVignette:0,
  defringe:0,

  maskType:'radial',
  maskAmount:0,
  maskExposure:0,
  maskContrast:0,
  maskSaturation:0,

  retouchSize:30,

  gradeShadow:0,
  gradeShadowSat:0,
  gradeMid:0,
  gradeMidSat:0,
  gradeHigh:0,
  gradeHighSat:0,
  gradeBlend:50,
  gradeBalance:0,

  drawSize:8,
  drawOpacity:100,
  drawColor:'#ffffff',

  textSize:48,
  textOpacity:100,
  textFont:'Arial',
  textColor:'#ffffff',
  textStroke:'#000000',
  textBold:false,
  textItalic:false,
  textAlign:'center',

  selectiveR:0,
  selectiveG:0,
  selectiveB:0,
  selectiveRange:35,
  selectiveHue:0,
  selectiveSat:0,
  selectiveLight:0,
  selectiveActive:false,

  textLayers:[],
  drawLayers:[],
  selectedTextId:null
};

const names = {
  light:['Adjust','Light'],
  color:['Adjust','Color'],
  effects:['Adjust','Effects'],
  detail:['Adjust','Detail'],
  crop:['Transform','Crop'],
  presets:['Looks','Presets'],
  profiles:['Looks','Profiles'],
  mask:['Local','Mask'],
  retouch:['Retouch','Spot Blur'],
  blur:['Effects','Blur'],
  optics:['Lens','Optics'],
  text:['Overlay','Text'],
  draw:['Overlay','Draw'],
  selective:['Color','Color Select'],
  layers:['Manage','Layers'],
  export:['Output','Export']
};

/* =========================================================
   HISTORY
========================================================= */

function cloneState(){
  return JSON.parse(JSON.stringify(S));
}

function pushHistory(){
  history.push(cloneState());

  if(history.length > 40){
    history.shift();
  }

  future = [];
}

function restoreState(state){
  Object.assign(S,JSON.parse(JSON.stringify(state)));
  render();
  panel();
}

function undo(){
  if(!history.length) return;

  future.push(cloneState());
  const state = history.pop();

  Object.assign(S,JSON.parse(JSON.stringify(state)));

  render();
  panel();
}

function redo(){
  if(!future.length) return;

  history.push(cloneState());
  const state = future.pop();

  Object.assign(S,JSON.parse(JSON.stringify(state)));

  render();
  panel();
}

/* =========================================================
   UI HELPERS
========================================================= */

function fmt(value){
  const n = Number(value);

  if(!Number.isFinite(n)) return '0';

  return `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(1)}`;
}

function control(key,label,min,max,step=1){
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

function escapeHTML(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

/* =========================================================
   PANEL
========================================================= */

function bindRangeControls(){
  document.querySelectorAll('#panel input[data-k]').forEach(input => {

    input.addEventListener('input',() => {
      const key = input.dataset.k;
      S[key] = Number(input.value);

      const output = $('v_' + key);

      if(output){
        output.textContent = fmt(input.value);
      }

      schedule();
    });

    input.addEventListener('change',() => {
      pushHistory();
    });
  });

  document.querySelectorAll('#panel input[data-mix]').forEach(input => {

    input.addEventListener('input',() => {
      S[input.dataset.mix] = Number(input.value);
      schedule();
    });

    input.addEventListener('change',pushHistory);
  });
}

function panel(){

  const p = $('panel');

  $('eyebrow').textContent = names[active][0];
  $('title').textContent = names[active][1];

  let h = '';

  if(active === 'light'){
    h = `
      <div class="section">
        <h3>Tone</h3>
        ${control('exposure','Exposure',-100,100)}
        ${control('contrast','Contrast',-100,100)}
        ${control('highlights','Highlights',-100,100)}
        ${control('shadows','Shadows',-100,100)}
        ${control('whites','Whites',-100,100)}
        ${control('blacks','Blacks',-100,100)}
      </div>

      <div class="section">
        <button class="btn" id="auto" style="width:100%">Auto Tone</button>
        <p class="note">Balanced browser-side tone correction.</p>
      </div>
    `;
  }

  if(active === 'color'){
    const colors = [
      ['red','Red'],
      ['orange','Orange'],
      ['yellow','Yellow'],
      ['green','Green'],
      ['aqua','Aqua'],
      ['blue','Blue'],
      ['purple','Purple'],
      ['magenta','Magenta']
    ];

    h = `
      <div class="section">
        <h3>White Balance</h3>
        ${control('temp','Temperature',-100,100)}
        ${control('tint','Tint',-100,100)}
        ${control('vibrance','Vibrance',-100,100)}
        ${control('saturation','Saturation',-100,100)}
      </div>

      <div class="section">
        <h3>Color Mixer</h3>
        ${colors.map(([key,label]) => `
          <div class="mixer">
            <span>${label}</span>
            <input data-mix="h_${key}" type="range" min="-30" max="30" value="${S['h_'+key]}" title="${label} Hue">
            <input data-mix="s_${key}" type="range" min="-100" max="100" value="${S['s_'+key]}" title="${label} Saturation">
            <input data-mix="l_${key}" type="range" min="-100" max="100" value="${S['l_'+key]}" title="${label} Luminance">
          </div>
        `).join('')}
        <p class="note">Hue, saturation and luminance are controlled independently.</p>
      </div>

      <div class="section">
        <h3>Color Grading</h3>
        ${control('gradeShadow','Shadow Hue',0,360)}
        ${control('gradeShadowSat','Shadow Strength',0,100)}
        ${control('gradeMid','Midtone Hue',0,360)}
        ${control('gradeMidSat','Midtone Strength',0,100)}
        ${control('gradeHigh','Highlight Hue',0,360)}
        ${control('gradeHighSat','Highlight Strength',0,100)}
        ${control('gradeBlend','Blending',0,100)}
        ${control('gradeBalance','Balance',-100,100)}
      </div>
    `;
  }

  if(active === 'effects'){
    h = `
      <div class="section">
        <h3>Effects</h3>
        ${control('texture','Texture',-100,100)}
        ${control('clarity','Clarity',-100,100)}
        ${control('dehaze','Dehaze',-100,100)}
        ${control('vignette','Vignette',-100,100)}
        ${control('midpoint','Midpoint',0,100)}
        ${control('feather','Feather',0,100)}
        ${control('roundness','Roundness',-100,100)}
      </div>

      <div class="section">
        <h3>Grain</h3>
        ${control('grain','Amount',0,100)}
        ${control('grainSize','Size',0,100)}
        ${control('grainRough','Roughness',0,100)}
      </div>
    `;
  }

  if(active === 'detail'){
    h = `
      <div class="section">
        <h3>Sharpening</h3>
        ${control('sharp','Amount',0,100)}
        ${control('radius','Radius',0.5,3,.1)}
      </div>

      <div class="section">
        <h3>Noise Reduction</h3>
        ${control('noise','Luminance Noise',0,100)}
        ${control('colorNoise','Color Noise',0,100)}
      </div>
    `;
  }

  if(active === 'crop'){
    h = `
      <div class="section">
        <h3>Crop & Geometry</h3>

        <select class="select" id="ratio">
          <option value="original">Original</option>
          <option value="1:1">1 : 1</option>
          <option value="4:5">4 : 5</option>
          <option value="3:4">3 : 4</option>
          <option value="4:3">4 : 3</option>
          <option value="16:9">16 : 9</option>
          <option value="9:16">9 : 16</option>
          <option value="2:3">2 : 3</option>
          <option value="3:2">3 : 2</option>
        </select>

        <div style="height:9px"></div>

        ${control('straighten','Straighten',-10,10,.1)}

        <div class="grid2">
          <button class="btn" id="rl">Rotate Left</button>
          <button class="btn" id="rr">Rotate Right</button>
          <button class="btn" id="fx">Flip Horizontal</button>
          <button class="btn" id="fy">Flip Vertical</button>
        </div>

        <div style="height:8px"></div>

        <button class="btn" id="cropGuideBtn" style="width:100%">
          ${cropGuide ? 'Hide Crop Guide' : 'Show Crop Guide'}
        </button>
      </div>

      <p class="note">
        Crop ratios are applied to the rendered image. Rotate and straighten are combined before cropping.
      </p>
    `;
  }

  if(active === 'presets'){
    const presets = [
      ['clean','Clean','Balanced'],
      ['warm','Warm','Soft warm'],
      ['cool','Cool','Clean cool'],
      ['cinematic','Cinematic','Moody contrast'],
      ['matte','Matte','Soft film'],
      ['vivid','Vivid','Color punch'],
      ['portrait','Portrait','Soft portrait'],
      ['bw','B&W','Monochrome']
    ];

    h = `
      <div class="section">
        <h3>Toolora Presets</h3>
        <div class="presets">
          ${presets.map(x => `
            <button class="preset" data-preset="${x[0]}">
              <b>${x[1]}</b>
              <small>${x[2]}</small>
            </button>
          `).join('')}
        </div>
      </div>

      ${control('presetAmount','Preset Amount',0,100)}
    `;
  }

  if(active === 'profiles'){
    const profiles = [
      ['natural','Natural'],
      ['neutral','Neutral'],
      ['vivid','Vivid'],
      ['modern','Modern'],
      ['film','Film'],
      ['mono','Monochrome']
    ];

    h = `
      <div class="section">
        <h3>Profiles</h3>
        <div class="grid2">
          ${profiles.map(x => `
            <button class="btn ${S.profile === x[0] ? 'active' : ''}" data-profile="${x[0]}">
              ${x[1]}
            </button>
          `).join('')}
        </div>
      </div>

      <p class="note">
        Profiles change the rendering character without changing the original image.
      </p>
    `;
  }

  if(active === 'mask'){
    h = `
      <div class="section">
        <h3>Local Mask</h3>

        <div class="grid3">
          <button class="btn mask ${S.maskType === 'radial' ? 'active' : ''}" data-type="radial">Radial</button>
          <button class="btn mask ${S.maskType === 'linear' ? 'active' : ''}" data-type="linear">Linear</button>
          <button class="btn mask ${S.maskType === 'brush' ? 'active' : ''}" data-type="brush">Brush</button>
        </div>

        <div style="height:10px"></div>

        ${control('maskAmount','Mask Amount',0,100)}
        ${control('maskExposure','Local Exposure',-100,100)}
        ${control('maskContrast','Local Contrast',-100,100)}
        ${control('maskSaturation','Local Saturation',-100,100)}

        <button class="btn" id="maskClear" style="width:100%">Clear Mask</button>
      </div>

      <p class="note">
        Radial and linear local masks work directly in the browser. AI subject or sky detection is not falsely simulated.
      </p>
    `;
  }

  if(active === 'retouch'){
    h = `
      <div class="section">
        <h3>Spot Blur Retouch</h3>
        ${control('retouchSize','Brush Size',5,100)}
        <button class="btn" id="retouchClear" style="width:100%">Clear Retouch</button>
      </div>

      <p class="note">
        Paint over an unwanted area to apply local blur.
      </p>
    `;
  }

  if(active === 'blur'){
    h = `
      <div class="section">
        <h3>Lens-style Blur</h3>
        ${control('blur','Blur Amount',0,100)}
        ${control('blurX','Focus X',0,100)}
        ${control('blurY','Focus Y',0,100)}
      </div>

      <p class="note">
        Browser-side focus blur with an adjustable focus point.
      </p>
    `;
  }

  if(active === 'optics'){
    h = `
      <div class="section">
        <h3>Optics</h3>
        ${control('lensVignette','Lens Vignette',-100,100)}
        ${control('defringe','Defringe',0,100)}
      </div>

      <p class="note">
        Browser-safe optical corrections. Camera-specific lens profiles are not faked.
      </p>
    `;
  }

  if(active === 'text'){
    const selected = S.textLayers.find(x => x.id === S.selectedTextId);

    h = `
      <div class="section">
        <h3>Text Overlay</h3>

        <textarea class="select" id="textValue" rows="3" placeholder="Enter text">${escapeHTML(selected ? selected.text : '')}</textarea>

        <div style="height:9px"></div>

        <label class="colorhead">
          Font
          <select class="select" id="textFont" style="margin-top:6px">
            ${[
              'Arial',
              'Georgia',
              'Verdana',
              'Trebuchet MS',
              'Courier New',
              'Impact',
              'Times New Roman',
              'Tahoma',
              'Palatino Linotype'
            ].map(f => `
              <option value="${escapeHTML(f)}" ${
                selected
                ? selected.font === f ? 'selected' : ''
                : S.textFont === f ? 'selected' : ''
              }>${escapeHTML(f)}</option>
            `).join('')}
          </select>
        </label>

        <div style="height:9px"></div>

        ${control('textSize','Font Size',10,160)}
        ${control('textOpacity','Opacity',0,100)}

        <div class="grid2">
          <button class="btn ${selected?.bold ? 'active' : ''}" id="textBold">Bold</button>
          <button class="btn ${selected?.italic ? 'active' : ''}" id="textItalic">Italic</button>
          <button class="btn ${selected?.align === 'left' ? 'active' : ''}" data-text-align="left">Left</button>
          <button class="btn ${selected?.align === 'center' ? 'active' : ''}" data-text-align="center">Center</button>
          <button class="btn ${selected?.align === 'right' ? 'active' : ''}" data-text-align="right">Right</button>
        </div>

        <div style="height:10px"></div>

        <div class="grid2">
          <label class="colorhead">
            Text Color
            <input id="textColor" type="color" value="${selected ? selected.color : S.textColor}">
          </label>

          <label class="colorhead">
            Stroke Color
            <input id="textStroke" type="color" value="${selected ? selected.stroke : S.textStroke}">
          </label>
        </div>

        <div style="height:10px"></div>

        <div class="grid2">
          <button class="btn" id="addText">Add Text</button>
          <button class="btn danger" id="deleteText">Delete</button>
        </div>

        <div style="height:7px"></div>

        <button class="btn" id="clearText" style="width:100%">Clear Text</button>
      </div>

      <p class="note">
        Add text and drag it anywhere on the photo.
      </p>
    `;
  }

  if(active === 'draw'){
    h = `
      <div class="section">
        <h3>Drawing</h3>

        ${control('drawSize','Brush Size',1,80)}
        ${control('drawOpacity','Opacity',1,100)}

        <label class="colorhead">
          Brush Color
          <input id="drawColor" type="color" value="${S.drawColor}">
        </label>

        <div style="height:10px"></div>

        <div class="grid2">
          <button class="btn" id="clearDraw">Clear Drawing</button>
          <button class="btn" id="removeDraw">Remove Last</button>
        </div>
      </div>

      <p class="note">
        Draw directly over the image. Strokes are stored as editable overlay layers.
      </p>
    `;
  }

  if(active === 'selective'){
    const hex =
      '#' +
      [S.selectiveR,S.selectiveG,S.selectiveB]
        .map(v => Number(v).toString(16).padStart(2,'0'))
        .join('');

    h = `
      <div class="section">
        <h3>Selective Color</h3>

        <button class="btn ${S.selectiveActive ? 'active' : ''}" id="pickColor" style="width:100%">
          ${S.selectiveActive ? 'Pick Color From Photo' : 'Pick Color From Photo'}
        </button>

        <div class="colorhead" style="margin-top:10px">
          Selected Color
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <span style="display:inline-block;width:30px;height:30px;border-radius:7px;background:${hex};border:1px solid #777"></span>
            <span>${hex.toUpperCase()}</span>
          </div>
        </div>

        ${control('selectiveRange','Color Range',1,100)}
        ${control('selectiveHue','Hue',-100,100)}
        ${control('selectiveSat','Saturation',-100,100)}
        ${control('selectiveLight','Lightness',-100,100)}

        <button class="btn" id="clearSelective" style="width:100%">
          Clear Color Selection
        </button>
      </div>

      <p class="note">
        Activate the picker, then click a color directly in the photo.
      </p>
    `;
  }

  if(active === 'layers'){
    const items = [
      ...S.textLayers.map((x,i) => ({
        type:'text',
        id:x.id,
        label:`Text ${i+1}`,
        sub:x.text || 'Text layer'
      })),
      ...S.drawLayers.map((x,i) => ({
        type:'draw',
        id:i,
        label:`Drawing ${i+1}`,
        sub:`${x.points.length} points`
      }))
    ];

    h = `
      <div class="section">
        <h3>Layers</h3>

        ${
          items.length
          ? items.map(item => `
              <button
                class="btn layerItem"
                data-layer-type="${item.type}"
                data-layer-id="${escapeHTML(item.id)}"
                style="width:100%;text-align:left;margin-bottom:6px"
              >
                <b>${escapeHTML(item.label)}</b><br>
                <small>${escapeHTML(item.sub)}</small>
              </button>
            `).join('')
          : '<p class="note">No overlay layers yet.</p>'
        }

        <button class="btn danger" id="clearLayers" style="width:100%;margin-top:8px">
          Clear All Layers
        </button>
      </div>
    `;
  }

  if(active === 'export'){
    h = `
      <div class="section">
        <h3>Export</h3>

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

      <button class="btn danger" id="resetAll" style="width:100%">
        Reset All Edits
      </button>
    `;
  }

  p.innerHTML = h;

  bindRangeControls();
  panelActions();
}

/* =========================================================
   PANEL ACTIONS
========================================================= */

function panelActions(){

  $('auto')?.addEventListener('click',() => {
    pushHistory();

    S.exposure = 0;
    S.contrast = 8;
    S.highlights = -14;
    S.shadows = 16;
    S.whites = 4;
    S.blacks = -5;

    render();
    panel();
  });

  $('ratio')?.addEventListener('change',e => {
    pushHistory();
    S.ratio = e.target.value;
    schedule();
  });

  $('rl')?.addEventListener('click',() => {
    pushHistory();
    S.rotate = (S.rotate + 270) % 360;
    panX = 0;
    panY = 0;
    render();
  });

  $('rr')?.addEventListener('click',() => {
    pushHistory();
    S.rotate = (S.rotate + 90) % 360;
    panX = 0;
    panY = 0;
    render();
  });

  $('fx')?.addEventListener('click',() => {
    pushHistory();
    S.flipX = !S.flipX;
    render();
  });

  $('fy')?.addEventListener('click',() => {
    pushHistory();
    S.flipY = !S.flipY;
    render();
  });

  $('cropGuideBtn')?.addEventListener('click',() => {
    cropGuide = !cropGuide;
    updateCropGuide();
    panel();
  });

  document.querySelectorAll('[data-preset]').forEach(button => {
    button.addEventListener('click',() => {
      applyPreset(button.dataset.preset);
    });
  });

  document.querySelectorAll('[data-profile]').forEach(button => {
    button.addEventListener('click',() => {
      pushHistory();
      S.profile = button.dataset.profile;
      render();
      panel();
    });
  });

  document.querySelectorAll('.mask').forEach(button => {
    button.addEventListener('click',() => {
      pushHistory();
      S.maskType = button.dataset.type;
      render();
      panel();
    });
  });

  $('maskClear')?.addEventListener('click',() => {
    pushHistory();

    S.maskAmount = 0;
    S.maskExposure = 0;
    S.maskContrast = 0;
    S.maskSaturation = 0;

    render();
    panel();
  });

  $('retouchClear')?.addEventListener('click',() => {
    if(!retouch.length) return;

    pushHistory();
    retouch = [];
    render();
  });

  $('textFont')?.addEventListener('change',e => {
    const selected = getSelectedText();

    if(selected){
      pushHistory();
      selected.font = e.target.value;
      render();
      panel();
    }else{
      S.textFont = e.target.value;
    }
  });

  $('textColor')?.addEventListener('input',e => {
    const selected = getSelectedText();

    if(selected){
      selected.color = e.target.value;
      schedule();
    }

    S.textColor = e.target.value;
  });

  $('textStroke')?.addEventListener('input',e => {
    const selected = getSelectedText();

    if(selected){
      selected.stroke = e.target.value;
      schedule();
    }

    S.textStroke = e.target.value;
  });

  $('textBold')?.addEventListener('click',() => {
    const selected = getSelectedText();
    if(!selected) return;

    pushHistory();
    selected.bold = !selected.bold;
    render();
    panel();
  });

  $('textItalic')?.addEventListener('click',() => {
    const selected = getSelectedText();
    if(!selected) return;

    pushHistory();
    selected.italic = !selected.italic;
    render();
    panel();
  });

  document.querySelectorAll('[data-text-align]').forEach(button => {
    button.addEventListener('click',() => {
      const selected = getSelectedText();
      if(!selected) return;

      pushHistory();
      selected.align = button.dataset.textAlign;

      render();
      panel();
    });
  });

  $('addText')?.addEventListener('click',() => {
    const value = $('textValue')?.value.trim();

    if(!value){
      alert('Please enter some text first.');
      return;
    }

    pushHistory();

    const id = 'text_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    S.textLayers.push({
      id,
      text:value,
      x:.5,
      y:.5,
      font:S.textFont,
      size:S.textSize,
      opacity:S.textOpacity,
      color:S.textColor,
      stroke:S.textStroke,
      bold:S.textBold,
      italic:S.textItalic,
      align:S.textAlign
    });

    S.selectedTextId = id;

    render();
    panel();
  });

  $('deleteText')?.addEventListener('click',() => {
    if(!S.selectedTextId) return;

    pushHistory();

    S.textLayers = S.textLayers.filter(x => x.id !== S.selectedTextId);
    S.selectedTextId = null;

    render();
    panel();
  });

  $('clearText')?.addEventListener('click',() => {
    if(!S.textLayers.length) return;

    pushHistory();

    S.textLayers = [];
    S.selectedTextId = null;

    render();
    panel();
  });

  $('drawColor')?.addEventListener('input',e => {
    S.drawColor = e.target.value;
  });

  $('clearDraw')?.addEventListener('click',() => {
    if(!S.drawLayers.length) return;

    pushHistory();
    S.drawLayers = [];

    render();
    panel();
  });

  $('removeDraw')?.addEventListener('click',() => {
    if(!S.drawLayers.length) return;

    pushHistory();
    S.drawLayers.pop();

    render();
    panel();
  });

  $('pickColor')?.addEventListener('click',() => {
    S.selectiveActive = true;

    $('pickerBadge').style.display = 'block';
    $('status').textContent = 'Click a color in the photo';
  });

  $('clearSelective')?.addEventListener('click',() => {
    pushHistory();

    S.selectiveR = 0;
    S.selectiveG = 0;
    S.selectiveB = 0;
    S.selectiveRange = 35;
    S.selectiveHue = 0;
    S.selectiveSat = 0;
    S.selectiveLight = 0;
    S.selectiveActive = false;

    $('pickerBadge').style.display = 'none';

    render();
    panel();
  });

  document.querySelectorAll('[data-layer-type="text"]').forEach(button => {
    button.addEventListener('click',() => {
      S.selectedTextId = button.dataset.layerId;
      active = 'text';
      setActiveTab();
      panel();
      render();
    });
  });

  document.querySelectorAll('[data-layer-type="draw"]').forEach(button => {
    button.addEventListener('click',() => {
      active = 'draw';
      setActiveTab();
      panel();
    });
  });

  $('clearLayers')?.addEventListener('click',() => {
    if(!S.textLayers.length && !S.drawLayers.length) return;

    pushHistory();

    S.textLayers = [];
    S.drawLayers = [];
    S.selectedTextId = null;

    render();
    panel();
  });

  $('download')?.addEventListener('click',exportImage);
  $('resetAll')?.addEventListener('click',resetAll);
}

/* =========================================================
   PRESETS
========================================================= */

function applyPreset(name){

  pushHistory();

  const presets = {
    clean:{
      exposure:4,
      contrast:5,
      shadows:8,
      vibrance:10,
      texture:8
    },

    warm:{
      temp:16,
      contrast:4,
      highlights:-8,
      shadows:8,
      vibrance:8
    },

    cool:{
      temp:-16,
      contrast:5,
      shadows:6,
      vibrance:8
    },

    cinematic:{
      contrast:12,
      highlights:-15,
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
      saturation:5,
      clarity:6
    },

    portrait:{
      exposure:5,
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
      clarity:8
    }
  };

  const values = presets[name];

  if(!values) return;

  const amount = clamp(S.presetAmount / 100,0,1);

  Object.keys(values).forEach(key => {
    const current = Number(S[key]) || 0;
    const target = Number(values[key]);

    S[key] = current + (target - current) * amount;
  });

  S.preset = name;

  render();
  panel();
}

/* =========================================================
   IMAGE LOADING
========================================================= */

function handleImageFile(file){

  if(!file) return;

  if(!file.type || !file.type.startsWith('image/')){
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

    const max = 1800;

    const scale = Math.min(
      1,
      max / Math.max(image.naturalWidth,image.naturalHeight)
    );

    src.width = Math.max(1,Math.round(image.naturalWidth * scale));
    src.height = Math.max(1,Math.round(image.naturalHeight * scale));

    sx.clearRect(0,0,src.width,src.height);

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
    $('beforeBadge').style.display = 'none';

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
    alert('The selected image could not be opened.');
  };

  image.src = url;
}

$('openTop').addEventListener('click',() => $('fileInput').click());
$('openEmpty').addEventListener('click',() => $('fileInput').click());

$('fileInput').addEventListener('change',e => {
  handleImageFile(e.target.files?.[0]);
  e.target.value = '';
});

/* =========================================================
   RESET
========================================================= */

function resetState(clearHistory=true){

  const fresh = {
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
    roundness:0,

    grain:0,
    grainSize:25,
    grainRough:50,

    sharp:0,
    radius:1,
    noise:0,
    colorNoise:0,

    ratio:'original',
    rotate:0,
    straighten:0,
    flipX:false,
    flipY:false,

    profile:'natural',
    preset:'none',
    presetAmount:100,

    blur:0,
    blurX:50,
    blurY:50,

    lensVignette:0,
    defringe:0,

    maskType:'radial',
    maskAmount:0,
    maskExposure:0,
    maskContrast:0,
    maskSaturation:0,

    retouchSize:30,

    gradeShadow:0,
    gradeShadowSat:0,
    gradeMid:0,
    gradeMidSat:0,
    gradeHigh:0,
    gradeHighSat:0,
    gradeBlend:50,
    gradeBalance:0,

    drawSize:8,
    drawOpacity:100,
    drawColor:'#ffffff',

    textSize:48,
    textOpacity:100,
    textFont:'Arial',
    textColor:'#ffffff',
    textStroke:'#000000',
    textBold:false,
    textItalic:false,
    textAlign:'center',

    selectiveR:0,
    selectiveG:0,
    selectiveB:0,
    selectiveRange:35,
    selectiveHue:0,
    selectiveSat:0,
    selectiveLight:0,
    selectiveActive:false,

    textLayers:[],
    drawLayers:[],
    selectedTextId:null
  };

  Object.keys(fresh).forEach(key => {
    S[key] = fresh[key];
  });

  [
    'red',
    'orange',
    'yellow',
    'green',
    'aqua',
    'blue',
    'purple',
    'magenta'
  ].forEach(color => {
    S['h_'+color] = 0;
    S['s_'+color] = 0;
    S['l_'+color] = 0;
  });

  retouch = [];

  if(clearHistory){
    history = [];
    future = [];
  }

  cropGuide = false;

  zoom = 1;
  panX = 0;
  panY = 0;

  panel();
  schedule();
}

function resetAll(){
  pushHistory();
  resetState(false);
}

/* =========================================================
   RENDER QUEUE
========================================================= */

function schedule(){

  if(renderQueued) return;

  renderQueued = true;

  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

/* =========================================================
   COLOR HELPERS
========================================================= */

function rgbToHsv(r,g,b){

  const max = Math.max(r,g,b);
  const min = Math.min(r,g,b);
  const d = max - min;

  let h = 0;

  if(d){
    if(max === r){
      h = ((g-b)/d + (g < b ? 6 : 0)) / 6;
    }else if(max === g){
      h = ((b-r)/d + 2) / 6;
    }else{
      h = ((r-g)/d + 4) / 6;
    }
  }

  return [
    h,
    max ? d/max : 0,
    max
  ];
}

function hsvToRgb(h,s,v){

  h = ((h % 1) + 1) % 1;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;

  const p = v * (1-s);
  const q = v * (1-f*s);
  const t = v * (1-(1-f)*s);

  const values = [
    [v,t,p],
    [q,v,p],
    [p,v,t],
    [p,q,v],
    [t,p,v],
    [v,p,q]
  ];

  return values[i % 6];
}

function colorBand(h){

  if(h < .04 || h > .96) return 'red';
  if(h < .11) return 'orange';
  if(h < .19) return 'yellow';
  if(h < .43) return 'green';
  if(h < .53) return 'aqua';
  if(h < .70) return 'blue';
  if(h < .85) return 'purple';

  return 'magenta';
}

/* =========================================================
   PROFILE
========================================================= */

function profileValues(){

  const p = {...S};

  if(p.profile === 'neutral'){
    p.contrast -= 3;
    p.saturation -= 3;
  }

  if(p.profile === 'vivid'){
    p.vibrance += 12;
    p.saturation += 5;
    p.contrast += 5;
  }

  if(p.profile === 'modern'){
    p.contrast += 5;
    p.clarity += 7;
    p.vibrance += 7;
  }

  if(p.profile === 'film'){
    p.contrast += 4;
    p.saturation -= 5;
    p.temp += 4;
    p.grain += 5;
  }

  if(p.profile === 'mono'){
    p.saturation = -100;
  }

  return p;
}

/* =========================================================
   PIXEL ENGINE
========================================================= */

function applyPixel(imageData,w,h){

  const d = imageData.data;
  const p = profileValues();

  const exposure = Math.pow(2,p.exposure/50);
  const contrast = (100+p.contrast)/100;
  const saturation = (100+p.saturation)/100;

  for(let i=0;i<d.length;i+=4){

    let r = d[i]/255;
    let g = d[i+1]/255;
    let b = d[i+2]/255;

    r *= exposure;
    g *= exposure;
    b *= exposure;

    const lum =
      .2126*r +
      .7152*g +
      .0722*b;

    const highlight = p.highlights/120;
    const shadow = p.shadows/120;

    if(lum > .5){
      r += highlight*(r-.5);
      g += highlight*(g-.5);
      b += highlight*(b-.5);
    }else{
      r += shadow*(.5-r);
      g += shadow*(.5-g);
      b += shadow*(.5-b);
    }

    const wb = (p.whites+p.blacks)/255;

    r += wb;
    g += wb;
    b += wb;

    r = (r-.5)*contrast+.5;
    g = (g-.5)*contrast+.5;
    b = (b-.5)*contrast+.5;

    r += p.temp*.0009;
    b -= p.temp*.0009;
    g += p.tint*.00045;

    const gray =
      .299*r +
      .587*g +
      .114*b;

    const vibrance =
      1 +
      (p.vibrance/100) *
      (1-Math.abs(2*lum-1))*.7;

    r = gray+(r-gray)*saturation*vibrance;
    g = gray+(g-gray)*saturation*vibrance;
    b = gray+(b-gray)*saturation*vibrance;

    const effect =
      (p.texture+p.clarity)/900;

    const average = (r+g+b)/3;

    r += (r-average)*effect;
    g += (g-average)*effect;
    b += (b-average)*effect;

    if(p.dehaze){
      const amount = p.dehaze/140;

      r = (r-.5)*(1+amount)+.5;
      g = (g-.5)*(1+amount)+.5;
      b = (b-.5)*(1+amount)+.5;
    }

    let [hh,ss,vv] = rgbToHsv(
      clamp(r,0,1),
      clamp(g,0,1),
      clamp(b,0,1)
    );

    const band = colorBand(hh);

    const hs = S['h_'+band];
    const ssShift = S['s_'+band];
    const ls = S['l_'+band];

    if(hs || ssShift || ls){
      [r,g,b] = hsvToRgb(
        hh+hs/360,
        clamp(ss*(1+ssShift/100),0,1),
        clamp(vv*(1+ls/100),0,1)
      );
    }

    /* Selective color */

    if(
      S.selectiveActive &&
      (
        S.selectiveHue ||
        S.selectiveSat ||
        S.selectiveLight
      )
    ){

      const sr = S.selectiveR/255;
      const sg = S.selectiveG/255;
      const sb = S.selectiveB/255;

      const distance = Math.sqrt(
        Math.pow(r-sr,2) +
        Math.pow(g-sg,2) +
        Math.pow(b-sb,2)
      );

      const range =
        Math.max(.01,S.selectiveRange/100);

      const mask =
        clamp(1-distance/range,0,1);

      if(mask > 0){

        const [sh,ssv,sv] =
          rgbToHsv(
            clamp(r,0,1),
            clamp(g,0,1),
            clamp(b,0,1)
          );

        const q = hsvToRgb(
          sh+S.selectiveHue/360,
          clamp(ssv*(1+S.selectiveSat/100),0,1),
          clamp(sv+S.selectiveLight/200,0,1)
        );

        r = r*(1-mask)+q[0]*mask;
        g = g*(1-mask)+q[1]*mask;
        b = b*(1-mask)+q[2]*mask;
      }
    }

    /* Color grading */

    const gradeLum =
      .2126*r +
      .7152*g +
      .0722*b;

    let gradeHue = 0;
    let gradeSat = 0;

    if(gradeLum < .35){
      gradeHue = S.gradeShadow;
      gradeSat = S.gradeShadowSat;
    }else if(gradeLum > .65){
      gradeHue = S.gradeHigh;
      gradeSat = S.gradeHighSat;
    }else{
      gradeHue = S.gradeMid;
      gradeSat = S.gradeMidSat;
    }

    if(gradeSat){

      const color = hsvToRgb(
        gradeHue/360,
        gradeSat/100,
        Math.max(.25,gradeLum)
      );

      const blend =
        (S.gradeBlend/100)*.35;

      r = r*(1-blend)+color[0]*blend;
      g = g*(1-blend)+color[1]*blend;
      b = b*(1-blend)+color[2]*blend;
    }

    /* Vignette */

    const px = ((i/4)%w)/w-.5;
    const py = Math.floor((i/4)/w)/h-.5;

    const distance =
      Math.sqrt(
        px*px+py*py
      )*1.414;

    if(p.vignette){

      const start =
        p.midpoint/100*.65;

      const softness =
        Math.max(.05,p.feather/100);

      const edge =
        clamp(
          (distance-start)/softness,
          0,
          1
        );

      const factor =
        1-
        p.vignette/100*
        edge*edge;

      r *= factor;
      g *= factor;
      b *= factor;
    }

    /* Local mask */

    if(p.maskAmount){

      let mask = 0;

      if(p.maskType === 'radial'){
        mask =
          1-
          clamp(
            Math.sqrt(px*px+py*py)*2.1,
            0,
            1
          );
      }else if(p.maskType === 'linear'){
        mask =
          clamp(
            1-Math.abs(py)*2,
            0,
            1
          );
      }else{
        mask = 1;
      }

      mask *= p.maskAmount/100;

      const localExposure =
        p.maskExposure/250*mask;

      r += localExposure;
      g += localExposure;
      b += localExposure;

      const localContrast =
        1+mask*p.maskContrast/100;

      r=(r-.5)*localContrast+.5;
      g=(g-.5)*localContrast+.5;
      b=(b-.5)*localContrast+.5;

      const localGray =
        .299*r+.587*g+.114*b;

      const localSat =
        1+mask*p.maskSaturation/100;

      r=localGray+(r-localGray)*localSat;
      g=localGray+(g-localGray)*localSat;
      b=localGray+(b-localGray)*localSat;
    }

    d[i] = clamp(r*255,0,255);
    d[i+1] = clamp(g*255,0,255);
    d[i+2] = clamp(b*255,0,255);
  }

  return imageData;
}

/* =========================================================
   FILTERS
========================================================= */

function applyBlur(ctx2,w,h,amount){

  if(amount <= 0) return;

  const temp = document.createElement('canvas');

  temp.width = w;
  temp.height = h;

  const tc = temp.getContext('2d');

  tc.drawImage(ctx2.canvas,0,0);

  ctx2.save();
  ctx2.clearRect(0,0,w,h);

  const radius =
    Math.max(1,amount*.18);

  ctx2.filter =
    `blur(${radius}px)`;

  ctx2.drawImage(temp,0,0);

  ctx2.filter = 'none';
  ctx2.restore();
}

function sharpen(ctx2,w,h,amount){

  if(amount <= 0) return;

  const imageData =
    ctx2.getImageData(0,0,w,h);

  const srcData =
    new Uint8ClampedArray(imageData.data);

  const d = imageData.data;

  const strength =
    amount/100*.8;

  for(let y=1;y<h-1;y++){

    for(let x=1;x<w-1;x++){

      const i=(y*w+x)*4;

      for(let c=0;c<3;c++){

        const value =
          srcData[i+c]*5 -
          srcData[i-4+c] -
          srcData[i+4+c] -
          srcData[i-w*4+c] -
          srcData[i+w*4+c];

        d[i+c] =
          clamp(
            srcData[i+c]*(1-strength)+
            value*strength,
            0,
            255
          );
      }
    }
  }

  ctx2.putImageData(imageData,0,0);
}

function addGrain(ctx2,w,h,amount,size,roughness){

  if(amount <= 0) return;

  const data =
    ctx2.getImageData(0,0,w,h);

  const d = data.data;

  const strength =
    amount/100*35;

  const rough =
    .5+(roughness/100);

  const sizeFactor =
    Math.max(.5,size/25);

  for(let i=0;i<d.length;i+=4){

    const n =
      (Math.random()-.5)*
      strength*
      rough*
      sizeFactor;

    d[i] = clamp(d[i]+n,0,255);
    d[i+1] = clamp(d[i+1]+n,0,255);
    d[i+2] = clamp(d[i+2]+n,0,255);
  }

  ctx2.putImageData(data,0,0);
}

/* =========================================================
   RETOUCH
========================================================= */

function applyRetouch(ctx2){

  if(!retouch.length) return;

  const copy =
    document.createElement('canvas');

  copy.width = C.width;
  copy.height = C.height;

  const cc = copy.getContext('2d');

  cc.drawImage(C,0,0);

  retouch.forEach(point => {

    const r = point.r;

    ctx2.save();

    ctx2.beginPath();
    ctx2.arc(point.x,point.y,r,0,Math.PI*2);
    ctx2.clip();

    ctx2.filter =
      `blur(${Math.max(2,r*.12)}px)`;

    ctx2.drawImage(copy,0,0);

    ctx2.restore();
  });
}

/* =========================================================
   TRANSFORM
========================================================= */

function getTransformedSource(){

  const angle =
    (S.rotate+S.straighten)*
    Math.PI/180;

  const sw = src.width;
  const sh = src.height;

  const sin = Math.abs(Math.sin(angle));
  const cos = Math.abs(Math.cos(angle));

  const W =
    Math.max(
      1,
      Math.ceil(sw*cos+sh*sin)
    );

  const H =
    Math.max(
      1,
      Math.ceil(sw*sin+sh*cos)
    );

  const canvas =
    document.createElement('canvas');

  canvas.width = W;
  canvas.height = H;

  const c = canvas.getContext('2d');

  c.save();

  c.translate(W/2,H/2);
  c.rotate(angle);

  c.scale(
    S.flipX ? -1 : 1,
    S.flipY ? -1 : 1
  );

  c.drawImage(
    src,
    -sw/2,
    -sh/2
  );

  c.restore();

  return canvas;
}

/* =========================================================
   OVERLAY LAYERS
========================================================= */

function getSelectedText(){
  return S.textLayers.find(
    x => x.id === S.selectedTextId
  );
}

function drawTextLayer(context,layer,width,height){

  context.save();

  const size =
    layer.size *
    (width/Math.max(1,C.width));

  const weight =
    layer.bold ? '700' : '400';

  const style =
    layer.italic ? 'italic ' : '';

  context.font =
    `${style}${weight} ${size}px ${layer.font}`;

  context.textAlign =
    layer.align || 'center';

  context.textBaseline = 'middle';

  context.globalAlpha =
    clamp(layer.opacity/100,0,1);

  const x = layer.x*width;
  const y = layer.y*height;

  const lines =
    String(layer.text || '').split('\n');

  const lineHeight =
    size*1.2;

  lines.forEach((line,index) => {

    const yy =
      y+
      (index-(lines.length-1)/2)*
      lineHeight;

    if(layer.stroke){

      context.lineWidth =
        Math.max(1,size*.07);

      context.strokeStyle =
        layer.stroke;

      context.strokeText(
        line,
        x,
        yy
      );
    }

    context.fillStyle =
      layer.color;

    context.fillText(
      line,
      x,
      yy
    );
  });

  context.restore();
}

function drawDrawLayer(context,layer,width,height){

  if(!layer.points.length) return;

  context.save();

  context.strokeStyle =
    layer.color;

  context.globalAlpha =
    clamp(layer.opacity/100,0,1);

  context.lineWidth =
    Math.max(
      .5,
      layer.size*
      width/
      Math.max(1,C.width)
    );

  context.lineCap = 'round';
  context.lineJoin = 'round';

  context.beginPath();

  layer.points.forEach((point,index) => {

    const x=point.x*width;
    const y=point.y*height;

    if(index===0){
      context.moveTo(x,y);
    }else{
      context.lineTo(x,y);
    }
  });

  context.stroke();

  context.restore();
}

function showOverlay(){

  if(!img){
    return;
  }

  O.width = C.width;
  O.height = C.height;

  ox.clearRect(0,0,O.width,O.height);

  S.textLayers.forEach(layer => {
    drawTextLayer(
      ox,
      layer,
      O.width,
      O.height
    );
  });

  S.drawLayers.forEach(layer => {
    drawDrawLayer(
      ox,
      layer,
      O.width,
      O.height
    );
  });

  const selected =
    getSelectedText();

  if(
    active === 'text' &&
    selected
  ){

    ox.save();

    const x =
      selected.x*O.width;

    const y =
      selected.y*O.height;

    ox.strokeStyle =
      'rgba(255,255,255,.65)';

    ox.setLineDash([5,5]);

    ox.strokeRect(
      x-20,
      y-selected.size*.7,
      40,
      selected.size*1.4
    );

    ox.restore();
  }

  O.style.display='block';
}

/* =========================================================
   CROP GUIDE
========================================================= */

function updateCropGuide(){

  const guide = $('cropOverlay');

  if(!guide || !img || active !== 'crop' || !cropGuide){
    if(guide) guide.style.display='none';
    return;
  }

  const rect =
    C.getBoundingClientRect();

  if(!rect.width || !rect.height){
    guide.style.display='none';
    return;
  }

  guide.style.display='block';

  guide.style.width =
    rect.width+'px';

  guide.style.height =
    rect.height+'px';

  guide.style.left =
    (rect.left-
     $('stage').getBoundingClientRect().left+
     $('stage').scrollLeft)+'px';

  guide.style.top =
    (rect.top-
     $('stage').getBoundingClientRect().top+
     $('stage').scrollTop)+'px';

  guide.style.transform =
    `translate3d(${panX}px,${panY}px,0) scale(${zoom})`;

  guide.style.transformOrigin='center center';
}

/* =========================================================
   CANVAS TRANSFORM
========================================================= */

function updateCanvasTransform(){

  const transform =
    `translate3d(${panX}px,${panY}px,0) scale(${zoom})`;

  C.style.transform = transform;
  O.style.transform = transform;

  $('zlabel').textContent =
    `${Math.round(zoom*100)}%`;

  updateCropGuide();
}

/* =========================================================
   MAIN RENDER
========================================================= */

function render(){

  if(rendering || !img) return;

  rendering = true;

  const transformed =
    getTransformedSource();

  const rotatedWidth =
    transformed.width;

  const rotatedHeight =
    transformed.height;

  let cropWidth =
    rotatedWidth;

  let cropHeight =
    rotatedHeight;

  let cropX = 0;
  let cropY = 0;

  if(S.ratio !== 'original'){

    const parts =
      S.ratio.split(':').map(Number);

    const target =
      parts[0]/parts[1];

    const current =
      rotatedWidth/rotatedHeight;

    if(current > target){

      cropWidth =
        Math.round(
          rotatedHeight*target
        );

      cropX =
        (rotatedWidth-cropWidth)/2;

    }else{

      cropHeight =
        Math.round(
          rotatedWidth/target
        );

      cropY =
        (rotatedHeight-cropHeight)/2;
    }
  }

  const maxPreview =
    window.innerWidth < 700
      ? 700
      : 1200;

  const scale =
    Math.min(
      1,
      maxPreview/
      Math.max(
        cropWidth,
        cropHeight
      )
    );

  const width =
    Math.max(
      1,
      Math.round(cropWidth*scale)
    );

  const height =
    Math.max(
      1,
      Math.round(cropHeight*scale)
    );

  C.width = width;
  C.height = height;

  ctx.clearRect(0,0,width,height);

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

  if(!showBefore){

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

    if(S.noise > 0){

      applyBlur(
        ctx,
        width,
        height,
        S.noise
      );
    }

    if(S.colorNoise > 0){

      const data2 =
        ctx.getImageData(
          0,
          0,
          width,
          height
        );

      const d=data2.data;

      const amount =
        S.colorNoise/100;

      for(let i=0;i<d.length;i+=4){

        const gray =
          .299*d[i]+
          .587*d[i+1]+
          .114*d[i+2];

        d[i] =
          d[i]*(1-amount)+gray*amount;

        d[i+1] =
          d[i+1]*(1-amount)+gray*amount;

        d[i+2] =
          d[i+2]*(1-amount)+gray*amount;
      }

      ctx.putImageData(data2,0,0);
    }

    if(S.sharp > 0){
      sharpen(ctx,width,height,S.sharp);
    }

    if(S.grain > 0){
      addGrain(
        ctx,
        width,
        height,
        S.grain,
        S.grainSize,
        S.grainRough
      );
    }

    if(S.blur > 0){

      applyBlur(
        ctx,
        width,
        height,
        S.blur
      );
    }

    if(S.lensVignette){

      const data3 =
        ctx.getImageData(
          0,
          0,
          width,
          height
        );

      const d=data3.data;

      const amount =
        S.lensVignette/100;

      for(let y=0;y<height;y++){

        for(let x=0;x<width;x++){

          const i=(y*width+x)*4;

          const dx =
            x/width-.5;

          const dy =
            y/height-.5;

          const dist =
            Math.min(
              1,
              Math.sqrt(dx*dx+dy*dy)*1.6
            );

          const factor =
            1-
            amount*
            dist*
            dist*.45;

          d[i] =
            clamp(d[i]*factor,0,255);

          d[i+1] =
            clamp(d[i+1]*factor,0,255);

          d[i+2] =
            clamp(d[i+2]*factor,0,255);
        }
      }

      ctx.putImageData(data3,0,0);
    }

    if(S.defringe > 0){

      const data4 =
        ctx.getImageData(
          0,
          0,
          width,
          height
        );

      const d=data4.data;

      const amount =
        S.defringe/100*.12;

      for(let i=0;i<d.length;i+=4){

        const avg =
          (d[i]+d[i+1]+d[i+2])/3;

        d[i] =
          d[i]*(1-amount)+avg*amount;

        d[i+2] =
          d[i+2]*(1-amount)+avg*amount;
      }

      ctx.putImageData(data4,0,0);
    }

    if(retouch.length){
      applyRetouch(ctx);
    }
  }

  showOverlay();

  $('beforeBadge').style.display =
    showBefore ? 'block' : 'none';

  $('status').textContent =
    showBefore ? 'Original' : 'Ready';

  updateCanvasTransform();

  rendering = false;
}

/* =========================================================
   EXPORT
========================================================= */

function drawFinalOverlay(target){

  if(!O.width || !O.height) return;

  target.save();

  target.drawImage(
    O,
    0,
    0,
    target.canvas.width,
    target.canvas.height
  );

  target.restore();
}

function exportImage(){

  if(!img){
    alert('Please open a photo first.');
    return;
  }

  $('status').textContent='Exporting...';

  const oldZoom=zoom;
  const oldPanX=panX;
  const oldPanY=panY;
  const oldBefore=showBefore;

  zoom=1;
  panX=0;
  panY=0;
  showBefore=false;

  render();

  const max =
    Number($('size')?.value) ||
    Math.max(C.width,C.height);

  const scale =
    Math.min(
      1,
      max/
      Math.max(C.width,C.height)
    );

  const output =
    document.createElement('canvas');

  output.width =
    Math.max(
      1,
      Math.round(C.width*scale)
    );

  output.height =
    Math.max(
      1,
      Math.round(C.height*scale)
    );

  const out =
    output.getContext('2d');

  out.drawImage(
    C,
    0,
    0,
    output.width,
    output.height
  );

  S.textLayers.forEach(layer => {
    drawTextLayer(
      out,
      layer,
      output.width,
      output.height
    );
  });

  S.drawLayers.forEach(layer => {
    drawDrawLayer(
      out,
      layer,
      output.width,
      output.height
    );
  });

  const type =
    $('format')?.value ||
    'image/jpeg';

  const quality =
    Number($('quality')?.value || .85);

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

  zoom=oldZoom;
  panX=oldPanX;
  panY=oldPanY;
  showBefore=oldBefore;

  render();

  $('status').textContent='Export complete';
}

/* =========================================================
   TOP CONTROLS
========================================================= */

$('tabs').addEventListener('click',e => {

  const button =
    e.target.closest('[data-tool]');

  if(!button) return;

  active =
    button.dataset.tool;

  setActiveTab();

  $('pickerBadge').style.display =
    active === 'selective' &&
    S.selectiveActive
      ? 'block'
      : 'none';

  if(active !== 'crop'){
    cropGuide=false;
  }

  panel();
  render();
});

function setActiveTab(){

  document
    .querySelectorAll('#tabs button')
    .forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.tool === active
      );
    });
}

$('reset').addEventListener('click',() => {
  if(!img) return;
  pushHistory();
  resetState(false);
});

$('undo').addEventListener('click',undo);
$('redo').addEventListener('click',redo);

$('before').addEventListener('click',() => {

  if(!img) return;

  showBefore = !showBefore;

  render();
});

/* =========================================================
   ZOOM
========================================================= */

function setZoom(value){

  zoom =
    clamp(
      value,
      .5,
      4
    );

  if(zoom <= 1){
    panX=0;
    panY=0;
  }

  updateCanvasTransform();
}

$('zout').addEventListener('click',() => {
  setZoom(zoom-.2);
});

$('zin').addEventListener('click',() => {
  setZoom(zoom+.2);
});

$('fit').addEventListener('click',() => {

  zoom=1;
  panX=0;
  panY=0;

  updateCanvasTransform();
});

$('full').addEventListener('click',() => {
  $('stage').requestFullscreen?.();
});

/* =========================================================
   DOUBLE TAP
========================================================= */

$('stage').addEventListener('pointerup',e => {

  if(
    active === 'retouch' ||
    active === 'text' ||
    active === 'draw' ||
    active === 'selective' ||
    active === 'layers'
  ){
    return;
  }

  const now=Date.now();

  if(now-lastTap < 280){

    if(zoom > 1){
      zoom=1;
      panX=0;
      panY=0;
    }else{
      zoom=2;
    }

    updateCanvasTransform();
  }

  lastTap=now;
});

/* =========================================================
   POINTER / PAN / PINCH
========================================================= */

function distance(a,b){
  return Math.hypot(
    a.clientX-b.clientX,
    a.clientY-b.clientY
  );
}

function midpoint(a,b){
  return {
    x:(a.clientX+b.clientX)/2,
    y:(a.clientY+b.clientY)/2
  };
}

$('stage').addEventListener('pointerdown',e => {

  if(!img) return;

  if(active === 'retouch'){
    retouchDrawing=true;
    $('stage').setPointerCapture(e.pointerId);
    addRetouchPoint(e);
    return;
  }

  if(
    active === 'text' ||
    active === 'draw' ||
    active === 'selective'
  ){
    handleSpecialPointerDown(e);
    return;
  }

  pointers.set(e.pointerId,e);

  $('stage').setPointerCapture(e.pointerId);

  if(pointers.size===1){

    gesture={
      type:'pan',
      startX:e.clientX,
      startY:e.clientY,
      startPanX:panX,
      startPanY:panY
    };

  }else if(pointers.size===2){

    const values=
      [...pointers.values()];

    gesture={
      type:'pinch',
      startDistance:
        distance(values[0],values[1]),
      startZoom:zoom,
      startPanX:panX,
      startPanY:panY,
      startMid:
        midpoint(values[0],values[1])
    };
  }
});

$('stage').addEventListener('pointermove',e => {

  if(active === 'retouch'){
    if(retouchDrawing){
      addRetouchPoint(e);
    }
    return;
  }

  if(
    active === 'text' ||
    active === 'draw' ||
    active === 'selective'
  ){
    handleSpecialPointerMove(e);
    return;
  }

  if(!pointers.has(e.pointerId)) return;

  pointers.set(e.pointerId,e);

  if(
    pointers.size===1 &&
    gesture?.type==='pan'
  ){

    if(zoom <= 1) return;

    panX =
      gesture.startPanX+
      e.clientX-
      gesture.startX;

    panY =
      gesture.startPanY+
      e.clientY-
      gesture.startY;

    updateCanvasTransform();

  }else if(
    pointers.size===2 &&
    gesture?.type==='pinch'
  ){

    const values=
      [...pointers.values()];

    const currentDistance =
      distance(values[0],values[1]);

    if(gesture.startDistance <= 0) return;

    zoom =
      clamp(
        gesture.startZoom*
        currentDistance/
        gesture.startDistance,
        .5,
        4
      );

    const currentMid =
      midpoint(values[0],values[1]);

    panX =
      gesture.startPanX+
      currentMid.x-
      gesture.startMid.x;

    panY =
      gesture.startPanY+
      currentMid.y-
      gesture.startMid.y;

    if(zoom<=1){
      panX=0;
      panY=0;
    }

    updateCanvasTransform();
  }
});

$('stage').addEventListener('pointerup',e => {

  pointers.delete(e.pointerId);

  if(pointers.size===0){
    gesture=null;
  }

  if(retouchDrawing){
    retouchDrawing=false;
    pushHistory();
  }

  if(specialPointer){
    specialPointer=null;
    showOverlay();
    updateCanvasTransform();
  }
});

$('stage').addEventListener('pointercancel',e => {

  pointers.delete(e.pointerId);

  if(pointers.size===0){
    gesture=null;
  }

  retouchDrawing=false;
  specialPointer=null;
});

/* =========================================================
   CANVAS POINT
========================================================= */

function canvasPoint(e){

  const rect =
    C.getBoundingClientRect();

  if(!rect.width || !rect.height){
    return null;
  }

  return {
    x:clamp(
      (e.clientX-rect.left)/rect.width,
      0,
      1
    ),
    y:clamp(
      (e.clientY-rect.top)/rect.height,
      0,
      1
    )
  };
}

/* =========================================================
   TEXT HIT TEST
========================================================= */

function hitText(point){

  const px =
    point.x*C.width;

  const py =
    point.y*C.height;

  for(
    let i=S.textLayers.length-1;
    i>=0;
    i--
  ){

    const layer =
      S.textLayers[i];

    ox.save();

    ox.font =
      `${layer.italic?'italic ':''}${layer.bold?'700 ':'400 '}${layer.size}px ${layer.font}`;

    const lines =
      String(layer.text || '').split('\n');

    const width =
      Math.max(
        ...lines.map(
          line => ox.measureText(line).width
        ),
        30
      );

    const height =
      lines.length*
      layer.size*
      1.2;

    ox.restore();

    const x =
      layer.x*C.width;

    const y =
      layer.y*C.height;

    if(
      px >= x-width/2-20 &&
      px <= x+width/2+20 &&
      py >= y-height/2-20 &&
      py <= y+height/2+20
    ){
      return layer;
    }
  }

  return null;
}

/* =========================================================
   SPECIAL TOOLS
========================================================= */

function handleSpecialPointerDown(e){

  const point =
    canvasPoint(e);

  if(!point) return;

  if(active === 'selective'){

    if(S.selectiveActive){
      sampleSelectedColor(point);
    }

    return;
  }

  if(active === 'text'){

    const hit =
      hitText(point);

    if(hit){

      pushHistory();

      S.selectedTextId =
        hit.id;

      specialPointer={
        type:'text',
        id:hit.id,
        startX:point.x,
        startY:point.y,
        originalX:hit.x,
        originalY:hit.y
      };

      render();
      panel();

    }else{

      S.selectedTextId=null;

      showOverlay();
      panel();
    }

    return;
  }

  if(active === 'draw'){

    pushHistory();

    const stroke={
      points:[point],
      size:S.drawSize,
      opacity:S.drawOpacity,
      color:S.drawColor
    };

    S.drawLayers.push(stroke);

    specialPointer={
      type:'draw',
      stroke
    };

    showOverlay();
  }
}

function handleSpecialPointerMove(e){

  if(!specialPointer) return;

  const point =
    canvasPoint(e);

  if(!point) return;

  if(specialPointer.type === 'text'){

    const layer =
      S.textLayers.find(
        x => x.id === specialPointer.id
      );

    if(!layer) return;

    layer.x =
      clamp(
        specialPointer.originalX+
        point.x-
        specialPointer.startX,
        0,
        1
      );

    layer.y =
      clamp(
        specialPointer.originalY+
        point.y-
        specialPointer.startY,
        0,
        1
      );

    showOverlay();

  }else if(specialPointer.type === 'draw'){

    specialPointer.stroke.points.push(point);

    showOverlay();
  }
}

/* =========================================================
   SELECTIVE COLOR
========================================================= */

function sampleSelectedColor(point){

  const x =
    clamp(
      Math.round(point.x*C.width),
      0,
      C.width-1
    );

  const y =
    clamp(
      Math.round(point.y*C.height),
      0,
      C.height-1
    );

  const pixel =
    ctx.getImageData(
      x,
      y,
      1,
      1
    ).data;

  pushHistory();

  S.selectiveR=pixel[0];
  S.selectiveG=pixel[1];
  S.selectiveB=pixel[2];
  S.selectiveActive=true;

  $('pickerBadge').style.display='none';
  $('status').textContent='Color selected';

  render();
  panel();
}

/* =========================================================
   RETOUCH
========================================================= */

function addRetouchPoint(e){

  if(!img) return;

  const point =
    canvasPoint(e);

  if(!point) return;

  retouch.push({
    x:point.x*C.width,
    y:point.y*C.height,
    r:Math.max(
      3,
      S.retouchSize*
      C.width/
      1000
    )
  });

  schedule();
}

/* =========================================================
   DRAG & DROP
========================================================= */

$('stage').addEventListener('dragover',e => {
  e.preventDefault();
  $('stage').classList.add('dragover');
});

$('stage').addEventListener('dragleave',() => {
  $('stage').classList.remove('dragover');
});

$('stage').addEventListener('drop',e => {

  e.preventDefault();

  $('stage').classList.remove('dragover');

  handleImageFile(
    e.dataTransfer.files?.[0]
  );
});

/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener('keydown',e => {

  if(
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase()==='z'
  ){

    e.preventDefault();

    if(e.shiftKey){
      redo();
    }else{
      undo();
    }

    return;
  }

  if(
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase()==='y'
  ){

    e.preventDefault();
    redo();

    return;
  }

  if(e.key === '[' && active === 'crop'){
    S.rotate =
      (S.rotate+359)%360;
    render();
  }

  if(e.key === ']' && active === 'crop'){
    S.rotate =
      (S.rotate+1)%360;
    render();
  }

  if(
    e.key.toLowerCase()==='g' &&
    active === 'crop'
  ){

    cropGuide=!cropGuide;
    updateCropGuide();
  }
});

/* =========================================================
   RESIZE
========================================================= */

window.addEventListener('resize',() => {
  updateCanvasTransform();
});

/* =========================================================
   INITIALIZE
========================================================= */

setActiveTab();
panel();
updateCanvasTransform();

})();
