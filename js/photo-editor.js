(()=>{
'use strict';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

const C = $('canvas');
const O = $('overlay');

const ctx = C.getContext('2d',{
  willReadFrequently:true
});

const ox = O.getContext('2d');

const src = document.createElement('canvas');
const sx = src.getContext('2d',{
  willReadFrequently:true
});


let img = null;
let fileName = '';

let active = 'light';

let zoom = 1;
let panX = 0;
let panY = 0;

let showBefore = false;

let renderQueued = false;
let rendering = false;

let history = [];
let future = [];

let textId = 0;
let selectedTextId = null;

let drawing = false;
let panning = false;

let panStart = null;

let pinch = null;

let drawPoints = [];

let selectedColor = null;


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

  preset:'none',
  presetAmount:100,

  profile:'natural',

  gradeShadow:0,
  gradeShadowSat:0,
  gradeMid:0,
  gradeMidSat:0,
  gradeHigh:0,
  gradeHighSat:0,

  gradeBlend:50,
  gradeBalance:0,

  blur:0,
  blurX:50,
  blurY:50,

  selectiveRadius:18,
  selectiveHue:0,
  selectiveSat:0,
  selectiveLight:0,

  brushSize:18,
  brushOpacity:100,
  drawColor:'#ffffff',

  textSize:48,
  textOpacity:100,
  textColor:'#ffffff',
  strokeColor:'#000000',

  textFont:'Arial',
  textBold:false,
  textItalic:false,
  textAlign:'center'
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

colors.forEach(c=>{
  S['h_'+c]=0;
  S['s_'+c]=0;
  S['l_'+c]=0;
});


let texts = [];
let strokes = [];


const titles = {

  light:['Adjust','Light'],
  color:['Adjust','Color'],
  effects:['Adjust','Effects'],
  detail:['Adjust','Detail'],
  crop:['Transform','Crop'],
  text:['Overlay','Text'],
  draw:['Overlay','Draw'],
  selective:['Color','Color Select'],
  presets:['Looks','Presets'],
  layers:['Manage','Layers'],
  export:['Output','Export']

};


/* HISTORY */

function snapshot(){

  return {
    S:JSON.parse(JSON.stringify(S)),
    texts:JSON.parse(JSON.stringify(texts)),
    strokes:JSON.parse(JSON.stringify(strokes)),
    selectedTextId
  };

}


function restore(s){

  Object.assign(S,s.S);

  texts=JSON.parse(
    JSON.stringify(s.texts||[])
  );

  strokes=JSON.parse(
    JSON.stringify(s.strokes||[])
  );

  selectedTextId=
    s.selectedTextId??null;

  panel();

  schedule();

}


function push(){

  history.push(snapshot());

  if(history.length>40){
    history.shift();
  }

  future=[];

}


/* RENDER QUEUE */

function schedule(){

  if(renderQueued){
    return;
  }

  renderQueued=true;

  requestAnimationFrame(()=>{
    renderQueued=false;
    render();
  });

}


/* FORMATTING */

function fmt(v){

  v=Number(v);

  return `${v>0?'+':''}${
    Number.isInteger(v)
      ?v
      :v.toFixed(1)
  }`;

}


/* RANGE */

function control(
  k,
  label,
  min,
  max,
  step=1
){

  return `
  <div class="control">

    <div class="ch">
      <span>${label}</span>
      <span class="val" id="v_${k}">
        ${fmt(S[k])}
      </span>
    </div>

    <input
      data-k="${k}"
      type="range"
      min="${min}"
      max="${max}"
      step="${step}"
      value="${S[k]}"
    >

  </div>
  `;

}


function colorControl(
  id,
  label,
  value
){

  return `
  <div class="control">

    <div class="ch">
      <span>${label}</span>
      <span class="val" id="v_${id}">
        ${value}
      </span>
    </div>

    <input
      id="${id}"
      type="color"
      value="${value}"
    >

  </div>
  `;

}


/* CONTROL BINDING */

function bindRangeControls(){

  document
    .querySelectorAll('#panel input[data-k]')
    .forEach(el=>{

      let saved=false;

      const save=()=>{

        if(!saved){

          push();

          saved=true;

        }

      };


      el.addEventListener(
        'pointerdown',
        save,
        {passive:true}
      );


      el.addEventListener(
        'touchstart',
        save,
        {passive:true}
      );


      el.addEventListener(
        'input',
        ()=>{

          S[el.dataset.k]=
            el.type==='range'
              ?Number(el.value)
              :el.value;


          const t=selectedText();

          if(
            t &&
            el.dataset.k==='textSize'
          ){

            t.size=S.textSize;

          }


          if(
            t &&
            el.dataset.k==='textOpacity'
          ){

            t.opacity=S.textOpacity;

          }


          const v=
            $('v_'+el.dataset.k);

          if(v){

            v.textContent=
              fmt(S[el.dataset.k]);

          }


          schedule();

        }
      );


      el.addEventListener(
        'change',
        ()=>{
          saved=false;
        }
      );

    });


  document
    .querySelectorAll('#panel input[data-mix]')
    .forEach(el=>{

      let saved=false;

      const save=()=>{

        if(!saved){

          push();

          saved=true;

        }

      };


      el.addEventListener(
        'pointerdown',
        save,
        {passive:true}
      );


      el.addEventListener(
        'touchstart',
        save,
        {passive:true}
      );


      el.addEventListener(
        'input',
        ()=>{

          S[el.dataset.mix]=
            Number(el.value);

          schedule();

        }
      );


      el.addEventListener(
        'change',
        ()=>{
          saved=false;
        }
      );

    });

}


/* PANEL */

function panel(){

  const p=$('panel');

  $('eyebrow').textContent=
    titles[active]?.[0] || 'Adjust';

  $('title').textContent=
    titles[active]?.[1] || 'Tool';


  let h='';


  /* LIGHT */

  if(active==='light'){

    h=`

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
        class="btn wide"
        id="auto"
      >
        Auto Tone
      </button>

      <p class="note">
        Applies a quick balanced correction
        to the current photo.
      </p>

    </div>

    `;

  }


  /* COLOR */

  if(active==='color'){

    h=`

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

      ${
        colors.map(c=>`

        <div class="mixer">

          <b>
            ${
              c[0].toUpperCase()+
              c.slice(1)
            }
          </b>

          ${
            mix(
              c,
              'Hue',
              'h_'+c,
              -30,
              30
            )
          }

          ${
            mix(
              c,
              'Saturation',
              's_'+c,
              -100,
              100
            )
          }

          ${
            mix(
              c,
              'Luminance',
              'l_'+c,
              -100,
              100
            )
          }

        </div>

        `).join('')
      }

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


  /* EFFECTS */

  if(active==='effects'){

    h=`

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

    </div>

    `;

  }


  /* DETAIL */

  if(active==='detail'){

    h=`

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
        .5,
        3,
        .1
      )}

      ${control(
        'noise',
        'Luminance Noise',
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
      Preview processing is optimized for
      mobile performance. Edits stay local
      in your browser.
    </p>

    `;

  }


  /* CROP */

  if(active==='crop'){

    h=`

    <div class="section">

      <h3>Crop & Geometry</h3>

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
        .1
      )}


      <div class="grid2">

        <button
          class="btn"
          id="rl"
        >
          Rotate Left
        </button>

        <button
          class="btn"
          id="rr"
        >
          Rotate Right
        </button>

        <button
          class="btn"
          id="fx"
        >
          Flip Horizontal
        </button>

        <button
          class="btn"
          id="fy"
        >
          Flip Vertical
        </button>

      </div>

    </div>


    <p class="note">
      Use zoom or two fingers to inspect
      the image area. The crop is centered.
    </p>

    `;

  }


  /* TEXT */

  if(active==='text'){

    h=`

    <div class="section">

      <h3>Text</h3>

      <button
        class="btn wide"
        id="addText"
      >
        Add Text
      </button>

      <button
        class="btn wide"
        id="clearText"
      >
        Clear Text
      </button>

    </div>


    <div class="section">

      <h3>Selected Text</h3>

      ${control(
        'textSize',
        'Font Size',
        12,
        160,
        1
      )}

      ${control(
        'textOpacity',
        'Opacity',
        0,
        100
      )}


      <select
        class="select"
        id="font"
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


      <div class="grid2">

        <button
          class="btn"
          id="bold"
        >
          Bold
        </button>

        <button
          class="btn"
          id="italic"
        >
          Italic
        </button>

        <button
          class="btn"
          id="align"
        >
          Align
        </button>

        <button
          class="btn"
          id="deleteText"
        >
          Delete
        </button>

      </div>


      ${colorControl(
        'textColor',
        'Text Color',
        S.textColor
      )}

      ${colorControl(
        'strokeColor',
        'Stroke Color',
        S.strokeColor
      )}

    </div>


    <p class="note">
      Select a text layer and drag it
      directly on the photo.
    </p>

    `;

  }


  /* DRAW */

  if(active==='draw'){

    h=`

    <div class="section">

      <h3>Brush</h3>

      ${control(
        'brushSize',
        'Brush Size',
        1,
        80
      )}

      ${control(
        'brushOpacity',
        'Opacity',
        1,
        100
      )}

      ${colorControl(
        'drawColor',
        'Brush Color',
        S.drawColor
      )}


      <div class="grid2">

        <button
          class="btn"
          id="clearDraw"
        >
          Clear Drawing
        </button>

        <button
          class="btn"
          id="undoStroke"
        >
          Remove Last
        </button>

      </div>

    </div>


    <p class="note">
      Draw directly on the photo.
      Each stroke is one undo step.
    </p>

    `;

  }


  /* SELECTIVE COLOR */

  if(active==='selective'){

    h=`

    <div class="section">

      <h3>Point Color</h3>

      <button
        class="btn wide"
        id="pickColor"
      >
        Pick Color From Photo
      </button>


      <div
        class="color-preview"
        id="picked"
      >
        No color selected
      </div>


      ${control(
        'selectiveRadius',
        'Color Range',
        1,
        60
      )}

      ${control(
        'selectiveHue',
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


      <button
        class="btn wide"
        id="clearColor"
      >
        Clear Selection
      </button>

    </div>


    <p class="note">
      Tap a color in the photo, then adjust
      its hue, saturation and lightness.
    </p>

    `;

  }


  /* PRESETS */

  if(active==='presets'){

    h=`

    <div class="section">

      <h3>Toolora Presets</h3>

      <div class="presets">

        ${
          [
            ['clean','Clean','Balanced'],
            ['warm','Warm','Soft warm'],
            ['cool','Cool','Clean cool'],
            ['cinematic','Cinematic','Moody'],
            ['matte','Matte','Soft film'],
            ['vivid','Vivid','Color punch'],
            ['portrait','Portrait','Soft portrait'],
            ['bw','B&W','Monochrome']
          ]
          .map(x=>`

            <button
              class="preset"
              data-preset="${x[0]}"
            >

              <b>${x[1]}</b>
              <small>${x[2]}</small>

            </button>

          `)
          .join('')
        }

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


  /* LAYERS */

  if(active==='layers'){

    h=`

    <div class="section">

      <h3>Text Layers</h3>

      ${
        texts.length

        ?

        texts.map(t=>`

          <div class="layer-row">

            <span>
              ${escapeHTML(t.text||'Text')}
            </span>

            <button
              class="btn layer-select ${
                selectedTextId===t.id
                  ?'active'
                  :''
              }"
              data-select-text="${t.id}"
            >
              Select
            </button>

            <button
              class="btn"
              data-delete-layer="${t.id}"
            >
              Delete
            </button>

          </div>

        `).join('')

        :

        '<p class="note">No text layers yet.</p>'
      }


      <button
        class="btn wide"
        id="clearOverlays"
      >
        Clear All Overlays
      </button>

    </div>

    `;

  }


  /* EXPORT */

  if(active==='export'){

    h=`

    <div class="section">

      <h3>Export</h3>


      <div class="grid2">

        <div>

          <div class="small-label">
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

          <div class="small-label">
            Quality
          </div>

          <select
            class="select"
            id="quality"
          >

            <option value="0.7">
              Standard
            </option>

            <option
              value="0.85"
              selected
            >
              High
            </option>

            <option value="0.95">
              Maximum
            </option>

          </select>

        </div>

      </div>


      <div class="small-label">
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


    <button
      class="btn danger wide"
      id="resetAll"
    >
      Reset All Edits
    </button>

    `;

  }


  p.innerHTML=h;

  bindRangeControls();

  panelActions();

  syncPanelValues();

}


/* MIXER */

function mix(
  color,
  label,
  key,
  min,
  max
){

  return `

  <label class="mix-row">

    <span>${label}</span>

    <input
      data-mix="${key}"
      type="range"
      min="${min}"
      max="${max}"
      value="${S[key]}"
    >

    <em>${fmt(S[key])}</em>

  </label>

  `;

}


function escapeHTML(s){

  return String(s).replace(
    /[&<>"]/g,
    m=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;'
    }[m])
  );

}


/* PANEL ACTIONS */

function panelActions(){

  $('auto')?.addEventListener(
    'click',
    ()=>{

      push();

      S.exposure=0;
      S.contrast=8;
      S.highlights=-15;
      S.shadows=18;
      S.whites=4;
      S.blacks=-5;

      panel();
      schedule();

    }
  );


  $('ratio')?.addEventListener(
    'change',
    e=>{

      push();

      S.ratio=e.target.value;

      schedule();

    }
  );


  $('rl')?.addEventListener(
    'click',
    ()=>{

      push();

      S.rotate=
        (S.rotate+270)%360;

      panX=0;
      panY=0;

      schedule();

    }
  );


  $('rr')?.addEventListener(
    'click',
    ()=>{

      push();

      S.rotate=
        (S.rotate+90)%360;

      panX=0;
      panY=0;

      schedule();

    }
  );


  $('fx')?.addEventListener(
    'click',
    ()=>{

      push();

      S.flipX=!S.flipX;

      schedule();

    }
  );


  $('fy')?.addEventListener(
    'click',
    ()=>{

      push();

      S.flipY=!S.flipY;

      schedule();

    }
  );


  document
    .querySelectorAll('[data-preset]')
    .forEach(b=>

      b.addEventListener(
        'click',
        ()=>applyPreset(
          b.dataset.preset
        )
      )

    );


  /* ADD TEXT */

  $('addText')?.addEventListener(
    'click',
    ()=>{

      push();

      const t={

        id:++textId,

        text:'Your Text',

        x:.5,
        y:.5,

        size:48,

        font:'Arial',

        bold:false,
        italic:false,

        align:'center',

        color:'#ffffff',
        stroke:'#000000',

        opacity:100

      };


      texts.push(t);

      selectedTextId=t.id;

      S.textSize=t.size;
      S.textFont=t.font;
      S.textColor=t.color;
      S.strokeColor=t.stroke;
      S.textOpacity=t.opacity;

      panel();
      schedule();

    }
  );


  /* CLEAR TEXT */

  $('clearText')?.addEventListener(
    'click',
    ()=>{

      if(!texts.length){
        return;
      }

      push();

      texts=[];

      selectedTextId=null;

      schedule();
      panel();

    }
  );


  /* DELETE TEXT */

  $('deleteText')?.addEventListener(
    'click',
    ()=>{

      if(selectedTextId==null){
        return;
      }

      push();

      texts=
        texts.filter(
          t=>t.id!==selectedTextId
        );

      selectedTextId=null;

      schedule();
      panel();

    }
  );


  /* BOLD */

  $('bold')?.addEventListener(
    'click',
    ()=>toggleTextProp('bold')
  );


  /* ITALIC */

  $('italic')?.addEventListener(
    'click',
    ()=>toggleTextProp('italic')
  );


  /* ALIGN */

  $('align')?.addEventListener(
    'click',
    ()=>{

      const t=selectedText();

      if(!t){
        return;
      }

      push();

      t.align=
        t.align==='center'
          ?'left'
          :t.align==='left'
            ?'right'
            :'center';

      schedule();
      panel();

    }
  );


  /* FONT */

  $('font')?.addEventListener(
    'change',
    e=>updateSelectedText(
      'font',
      e.target.value
    )
  );


  /* TEXT COLOR */

  $('textColor')?.addEventListener(
    'input',
    e=>updateSelectedText(
      'color',
      e.target.value,
      false
    )
  );


  $('textColor')?.addEventListener(
    'change',
    ()=>push()
  );


  /* STROKE */

  $('strokeColor')?.addEventListener(
    'input',
    e=>updateSelectedText(
      'stroke',
      e.target.value,
      false
    )
  );


  $('strokeColor')?.addEventListener(
    'change',
    ()=>push()
  );


  /* DRAW COLOR */

  $('drawColor')?.addEventListener(
    'input',
    e=>{

      S.drawColor=e.target.value;

      schedule();

    }
  );


  /* CLEAR DRAW */

  $('clearDraw')?.addEventListener(
    'click',
    ()=>{

      if(!strokes.length){
        return;
      }

      push();

      strokes=[];

      schedule();

    }
  );


  /* REMOVE LAST STROKE */

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


  /* PICK COLOR */

  $('pickColor')?.addEventListener(
    'click',
    ()=>{

      selectedColor=null;

      $('pickerBadge').style.display='block';

      $('pickerBadge').textContent=
        'Tap a color in the photo';

      $('status').textContent=
        'Pick a color from the photo';

    }
  );


  /* CLEAR COLOR */

  $('clearColor')?.addEventListener(
    'click',
    ()=>{

      selectedColor=null;

      $('pickerBadge').style.display='none';

      schedule();

    }
  );


  /* RESET ALL */

  $('resetAll')?.addEventListener(
    'click',
    ()=>{

      push();

      resetEdits();

      panel();

      schedule();

    }
  );


  /* DOWNLOAD */

  $('download')?.addEventListener(
    'click',
    exportImage
  );


  /* SELECT LAYER */

  document
    .querySelectorAll('[data-select-text]')
    .forEach(b=>

      b.addEventListener(
        'click',
        ()=>{

          selectedTextId=
            Number(
              b.dataset.selectText
            );

          const t=selectedText();

          if(t){

            S.textSize=t.size;
            S.textFont=t.font;
            S.textColor=t.color;
            S.strokeColor=t.stroke;
            S.textOpacity=t.opacity;

          }

          panel();
          schedule();

        }
      )

    );


  /* DELETE LAYER */

  document
    .querySelectorAll('[data-delete-layer]')
    .forEach(b=>

      b.addEventListener(
        'click',
        ()=>{

          push();

          const id=
            Number(
              b.dataset.deleteLayer
            );

          texts=
            texts.filter(
              t=>t.id!==id
            );

          if(selectedTextId===id){
            selectedTextId=null;
          }

          panel();
          schedule();

        }
      )

    );


  /* CLEAR OVERLAYS */

  $('clearOverlays')?.addEventListener(
    'click',
    ()=>{

      if(!texts.length&&!strokes.length){
        return;
      }

      push();

      texts=[];
      strokes=[];
      selectedTextId=null;

      panel();
      schedule();

    }
  );

}


/* PANEL VALUE SYNC */

function syncPanelValues(){

  const t=selectedText();

  if(active==='text'&&t){

    const size=$('textSize');

    if(size){
      size.value=t.size;
    }


    const opacity=$('textOpacity');

    if(opacity){
      opacity.value=t.opacity;
    }


    const font=$('font');

    if(font){
      font.value=t.font;
    }


    const tc=$('textColor');

    if(tc){
      tc.value=t.color;
    }


    const sc=$('strokeColor');

    if(sc){
      sc.value=t.stroke;
    }


    const b=$('bold');

    if(b){
      b.classList.toggle(
        'active',
        !!t.bold
      );
    }


    const i=$('italic');

    if(i){
      i.classList.toggle(
        'active',
        !!t.italic
      );
    }

  }


  if(
    active==='crop' &&
    $('ratio')
  ){

    $('ratio').value=S.ratio;

  }


  if(
    active==='selective' &&
    selectedColor
  ){

    $('picked').textContent=
      `Selected: rgb(${
        selectedColor.r
      }, ${
        selectedColor.g
      }, ${
        selectedColor.b
      })`;

    $('picked').style.background=
      `rgb(
        ${selectedColor.r},
        ${selectedColor.g},
        ${selectedColor.b}
      )`;

    $('picked').style.color=
      brightness(
        selectedColor.r,
        selectedColor.g,
        selectedColor.b
      )>150
        ?'#111'
        :'#fff';

  }

}


function selectedText(){

  return texts.find(
    t=>t.id===selectedTextId
  )||null;

}


function updateSelectedText(
  prop,
  val,
  pushHistory=true
){

  const t=selectedText();

  if(!t){
    return;
  }


  if(pushHistory){
    push();
  }


  t[prop]=val;


  if(prop==='size'){
    S.textSize=val;
  }

  if(prop==='font'){
    S.textFont=val;
  }

  if(prop==='color'){
    S.textColor=val;
  }

  if(prop==='stroke'){
    S.strokeColor=val;
  }

  if(prop==='opacity'){
    S.textOpacity=val;
  }


  schedule();


  if(pushHistory){
    panel();
  }

}


function toggleTextProp(prop){

  const t=selectedText();

  if(!t){
    return;
  }

  push();

  t[prop]=!t[prop];

  schedule();
  panel();

}


/* RESET */

function resetEdits(){

  S.exposure=0;
  S.contrast=0;
  S.highlights=0;
  S.shadows=0;
  S.whites=0;
  S.blacks=0;

  S.temp=0;
  S.tint=0;
  S.vibrance=0;
  S.saturation=0;

  S.texture=0;
  S.clarity=0;
  S.dehaze=0;

  S.vignette=0;
  S.midpoint=50;
  S.feather=50;
  S.roundness=0;

  S.grain=0;
  S.grainSize=25;
  S.grainRough=50;

  S.sharp=0;
  S.radius=1;
  S.noise=0;
  S.colorNoise=0;

  S.ratio='original';
  S.rotate=0;
  S.straighten=0;

  S.flipX=false;
  S.flipY=false;

  S.preset='none';
  S.presetAmount=100;

  S.profile='natural';

  S.gradeShadow=0;
  S.gradeShadowSat=0;
  S.gradeMid=0;
  S.gradeMidSat=0;
  S.gradeHigh=0;
  S.gradeHighSat=0;
  S.gradeBlend=50;
  S.gradeBalance=0;

  S.blur=0;
  S.blurX=50;
  S.blurY=50;

  S.selectiveRadius=18;
  S.selectiveHue=0;
  S.selectiveSat=0;
  S.selectiveLight=0;

  S.brushSize=18;
  S.brushOpacity=100;
  S.drawColor='#ffffff';

  S.textSize=48;
  S.textOpacity=100;
  S.textColor='#ffffff';
  S.strokeColor='#000000';
  S.textFont='Arial';

  S.textBold=false;
  S.textItalic=false;
  S.textAlign='center';


  colors.forEach(c=>{

    S['h_'+c]=0;
    S['s_'+c]=0;
    S['l_'+c]=0;

  });


  texts=[];
  strokes=[];

  selectedTextId=null;

  selectedColor=null;

  panX=0;
  panY=0;

  zoom=1;

  showBefore=false;

}


/* PRESETS */

function applyPreset(name){

  push();


  const base={

    exposure:0,
    contrast:0,
    highlights:0,
    shadows:0,
    temp:0,
    tint:0,
    vibrance:0,
    saturation:0,
    clarity:0,
    dehaze:0,
    vignette:0,
    grain:0

  };


  Object.assign(S,base);


  const p={

    clean:{},

    warm:{
      temp:16,
      vibrance:8,
      contrast:4
    },

    cool:{
      temp:-16,
      vibrance:6,
      contrast:3
    },

    cinematic:{
      contrast:16,
      highlights:-22,
      shadows:8,
      saturation:-8,
      clarity:12,
      vignette:18
    },

    matte:{
      contrast:-8,
      shadows:12,
      blacks:12,
      saturation:-5
    },

    vivid:{
      contrast:8,
      vibrance:24,
      saturation:8,
      clarity:8
    },

    portrait:{
      highlights:-12,
      shadows:14,
      temp:8,
      vibrance:10,
      clarity:-4
    },

    bw:{
      saturation:-100,
      contrast:12,
      grain:8
    }

  }[name]||{};


  Object.assign(S,p);

  S.presetAmount=100;
  S.preset=name;

  panel();
  schedule();

}


/* PIXEL HELPERS */

function applyProfile(p){

  if(p.profile==='vivid'){

    p.vibrance+=12;
    p.saturation+=5;
    p.contrast+=5;

  }


  if(p.profile==='neutral'){

    p.contrast-=3;
    p.saturation-=3;

  }


  if(p.profile==='modern'){

    p.contrast+=5;
    p.clarity+=7;
    p.vibrance+=7;

  }


  if(p.profile==='film'){

    p.contrast+=4;
    p.saturation-=5;
    p.temp+=4;
    p.grain+=5;

  }


  if(p.profile==='mono'){

    p.saturation=-100;

  }

}


function rgbh(r,g,b){

  const mx=Math.max(r,g,b);
  const mn=Math.min(r,g,b);
  const d=mx-mn;

  let h=0;
  let s=mx?d/mx:0;

  if(d){

    if(mx===r){
      h=((g-b)/d+(g<b?6:0))/6;
    }

    else if(mx===g){
      h=((b-r)/d+2)/6;
    }

    else{
      h=((r-g)/d+4)/6;
    }

  }

  return [h,s,mx];

}


function hsv(h,s,v){

  let i=Math.floor(h*6);

  const f=h*6-i;
  const p=v*(1-s);
  const q=v*(1-f*s);
  const t=v*(1-(1-f)*s);

  return [
    [v,t,p],
    [q,v,p],
    [p,v,t],
    [p,q,v],
    [t,p,v],
    [v,p,q]
  ][i%6];

}


function band(h){

  if(h<.04||h>.96)return'red';
  if(h<.11)return'orange';
  if(h<.19)return'yellow';
  if(h<.43)return'green';
  if(h<.53)return'aqua';
  if(h<.70)return'blue';
  if(h<.85)return'purple';

  return'magenta';

}


function brightness(r,g,b){

  return .299*r+.587*g+.114*b;

}


/* COLOR PROCESSING */

function applyPixel(
  data,
  w,
  h
){

  const d=data.data;

  const p={...S};

  applyProfile(p);


  const presetScale=
    p.preset&&p.preset!=='none'
      ?clamp(
        (p.presetAmount??100)/100,
        0,
        1
      )
      :1;


  [
    'exposure',
    'contrast',
    'highlights',
    'shadows',
    'whites',
    'blacks',
    'temp',
    'tint',
    'vibrance',
    'saturation',
    'texture',
    'clarity',
    'dehaze',
    'vignette',
    'grain'
  ].forEach(k=>{

    p[k]*=presetScale;

  });


  const ex=
    Math.pow(
      2,
      p.exposure/50
    );

  const con=
    (100+p.contrast)/100;

  const sat=
    Math.max(
      0,
      (100+p.saturation)/100
    );

  const vib=p.vibrance/100;


  const selective=
    selectedColor;


  for(
    let i=0;
    i<d.length;
    i+=4
  ){

    let r=d[i]/255;
    let g=d[i+1]/255;
    let b=d[i+2]/255;


    r*=ex;
    g*=ex;
    b*=ex;


    const lum=
      .2126*r+
      .7152*g+
      .0722*b;


    const hi=
      p.highlights/120;

    const sh=
      p.shadows/120;


    if(lum>.5){

      r+=hi*(r-.5);
      g+=hi*(g-.5);
      b+=hi*(b-.5);

    }

    else{

      r+=sh*(.5-r);
      g+=sh*(.5-g);
      b+=sh*(.5-b);

    }


    const wb=
      (p.whites+p.blacks)/255;

    r+=wb;
    g+=wb;
    b+=wb;


    r=(r-.5)*con+.5;
    g=(g-.5)*con+.5;
    b=(b-.5)*con+.5;


    r+=p.temp*.0009;
    b-=p.temp*.0009;
    g+=p.tint*.00045;


    const gray=
      .299*r+
      .587*g+
      .114*b;


    const boost=
      1+
      vib*
      (1-Math.abs(2*lum-1))
      *.7;


    r=
      gray+
      (r-gray)*
      sat*
      boost;

    g=
      gray+
      (g-gray)*
      sat*
      boost;

    b=
      gray+
      (b-gray)*
      sat*
      boost;


    const fx=
      (p.texture+p.clarity)/1000;

    const fg=
      (r+g+b)/3;


    r+=(r-fg)*fx;
    g+=(g-fg)*fx;
    b+=(b-fg)*fx;


    if(p.dehaze){

      const dh=p.dehaze/140;

      r=(r-.5)*(1+dh)+.5;
      g=(g-.5)*(1+dh)+.5;
      b=(b-.5)*(1+dh)+.5;

    }


    let [
      hh,
      ss,
      vv
    ]=rgbh(
      clamp(r,0,1),
      clamp(g,0,1),
      clamp(b,0,1)
    );


    const bb=band(hh);

    const dh=S['h_'+bb];
    const ds=S['s_'+bb];
    const dl=S['l_'+bb];


    if(dh||ds||dl){

      [r,g,b]=hsv(

        (
          hh+
          dh/360+
          1
        )%1,

        clamp(
          ss*(1+ds/100),
          0,
          1
        ),

        clamp(
          vv*(1+dl/100),
          0,
          1
        )

      );

    }


    const lum2=
      .2126*r+
      .7152*g+
      .0722*b;


    const gh=
      lum2<.35
        ?p.gradeShadow
        :lum2>.65
          ?p.gradeHigh
          :p.gradeMid;


    const gs=
      lum2<.35
        ?p.gradeShadowSat
        :lum2>.65
          ?p.gradeHighSat
          :p.gradeMidSat;


    if(gs){

      const grgb=
        hsv(
          gh/360,
          gs/100,
          Math.max(.2,lum2)
        );


      const blend=
        (p.gradeBlend/100)*.35;


      r=
        r*(1-blend)+
        grgb[0]*blend;

      g=
        g*(1-blend)+
        grgb[1]*blend;

      b=
        b*(1-blend)+
        grgb[2]*blend;

    }


    const px=
      (i/4)%w/w-.5;

    const py=
      Math.floor(i/4/w)/h-.5;


    let dist=
      Math.sqrt(
        px*px+
        (
          py*
          (1+p.roundness/100)
        )**2
      )*
      1.414;


    if(p.vignette){

      const edge=
        clamp(
          (
            dist-
            p.midpoint/100*.65
          )/
          Math.max(
            .05,
            p.feather/100
          ),
          0,
          1
        );


      const vv2=
        1-
        p.vignette/100*
        edge*
        edge;


      r*=vv2;
      g*=vv2;
      b*=vv2;

    }


    if(p.blur){

      const focusX=
        p.blurX/100-.5;

      const focusY=
        p.blurY/100-.5;


      const fd=
        Math.hypot(
          px-focusX,
          py-focusY
        )*1.7;


      const amt=
        clamp(
          fd,
          0,
          1
        )*
        p.blur/100;


      if(amt>.03){

        const lumB=
          (r+g+b)/3;

        r=
          r*(1-amt)+
          lumB*amt;

        g=
          g*(1-amt)+
          lumB*amt;

        b=
          b*(1-amt)+
          lumB*amt;

      }

    }


    if(p.maskAmount){

      let m;

      if(p.maskType==='linear'){

        m=
          clamp(
            1-Math.abs(py)*2,
            0,
            1
          );

      }

      else{

        m=
          1-
          clamp(
            Math.hypot(px,py)*2.1,
            0,
            1
          );

      }


      m*=p.maskAmount/100;


      r+=m*p.maskExposure/250;
      g+=m*p.maskExposure/250;
      b+=m*p.maskExposure/250;


      const mc=
        1+
        m*p.maskContrast/100;


      r=(r-.5)*mc+.5;
      g=(g-.5)*mc+.5;
      b=(b-.5)*mc+.5;


      const gg=
        .299*r+
        .587*g+
        .114*b;


      const ms=
        1+
        m*p.maskSaturation/100;


      r=
        gg+
        (r-gg)*ms;

      g=
        gg+
        (g-gg)*ms;

      b=
        gg+
        (b-gg)*ms;

    }


    /* SELECTED COLOR */

    if(selective){

      const targetH=
        rgbh(
          selective.r/255,
          selective.g/255,
          selective.b/255
        )[0];


      const [
        ch,
        cs
      ]=
        rgbh(
          clamp(r,0,1),
          clamp(g,0,1),
          clamp(b,0,1)
        );


      let hd=
        Math.abs(
          ch-targetH
        );


      hd=
        Math.min(
          hd,
          1-hd
        );


      const radius=
        clamp(
          S.selectiveRadius/60,
          .02,
          1
        );


      const weight=
        clamp(
          1-hd/radius,
          0,
          1
        )*
        (
          .35+
          cs*.65
        );


      if(weight>.01){

        let [
          nh,
          ns,
          nv
        ]=[
          ch,
          cs,
          clamp(
            (r+g+b)/3,
            0,
            1
          )
        ];


        nh=
          (
            nh+
            S.selectiveHue/360*
            weight+
            1
          )%1;


        ns=
          clamp(
            ns*
            (
              1+
              S.selectiveSat/100*
              weight
            ),
            0,
            1
          );


        nv=
          clamp(
            nv+
            (
              S.selectiveLight/
              100*.5
            )*
            weight,
            0,
            1
          );


        [r,g,b]=
          hsv(
            nh,
            ns,
            nv
          );

      }

    }


    d[i]=clamp(
      r*255,
      0,
      255
    );

    d[i+1]=clamp(
      g*255,
      0,
      255
    );

    d[i+2]=clamp(
      b*255,
      0,
      255
    );

    d[i+3]=255;

  }


  return data;

}


/* DETAIL */

function sharpen(
  c,
  w,
  h,
  a
){

  if(a<1){
    return;
  }


  const s=
    c.getImageData(
      0,
      0,
      w,
      h
    );


  const o=
    c.createImageData(
      w,
      h
    );


  const d=s.data;
  const q=o.data;

  const k=
    a/100*.55;


  q.set(d);


  for(
    let y=1;
    y<h-1;
    y++
  ){

    for(
      let x=1;
      x<w-1;
      x++
    ){

      const i=
        (y*w+x)*4;


      for(
        let ch=0;
        ch<3;
        ch++
      ){

        q[i+ch]=
          clamp(

            d[i+ch]*
            (1+4*k)

            -

            k*(
              d[i-4+ch]+
              d[i+4+ch]+
              d[i-w*4+ch]+
              d[i+w*4+ch]
            ),

            0,
            255

          );

      }

    }

  }


  c.putImageData(
    o,
    0,
    0
  );

}


function reduceNoise(
  c,
  w,
  h,
  a
){

  if(a<1){
    return;
  }


  const temp=
    document.createElement(
      'canvas'
    );

  temp.width=w;
  temp.height=h;


  const tc=
    temp.getContext('2d');


  tc.filter=
    `blur(${Math.min(
      2,
      a/50
    )}px)`;


  tc.drawImage(
    c.canvas,
    0,
    0
  );


  c.save();

  c.globalAlpha=
    a/100*.65;

  c.drawImage(
    temp,
    0,
    0
  );

  c.restore();

}


function addGrain(
  c,
  w,
  h,
  a,
  size,
  rough
){

  if(a<1){
    return;
  }


  const q=
    c.getImageData(
      0,
      0,
      w,
      h
    );


  const d=q.data;


  const amp=
    a/100*
    22*
    (
      .5+
      rough/200
    );


  const scale=
    Math.max(
      1,
      size/18
    );


  for(
    let y=0;
    y<h;
    y++
  ){

    for(
      let x=0;
      x<w;
      x++
    ){

      const i=
        (y*w+x)*4;


      const n=
        (
          Math.random()-.5
        )*
        amp*
        (
          .7+
          .3*
          Math.sin(
            (x+y)/scale
          )
        );


      d[i]=clamp(
        d[i]+n,
        0,
        255
      );

      d[i+1]=clamp(
        d[i+1]+n,
        0,
        255
      );

      d[i+2]=clamp(
        d[i+2]+n,
        0,
        255
      );

    }

  }


  c.putImageData(
    q,
    0,
    0
  );

}


/* GEOMETRY */

function geometryCanvas(){

  const W=src.width;
  const H=src.height;

  const rot=
    (
      (
        S.rotate+
        S.straighten
      )%360+
      360
    )%360;


  const quarter=
    Math.abs(
      S.rotate%180
    )===90;


  const sw=
    quarter
      ?H
      :W;

  const sh=
    quarter
      ?W
      :H;


  const t=
    document.createElement(
      'canvas'
    );


  t.width=sw;
  t.height=sh;


  const tc=
    t.getContext('2d');


  tc.translate(
    sw/2,
    sh/2
  );


  tc.rotate(
    rot*Math.PI/180
  );


  tc.scale(
    S.flipX?-1:1,
    S.flipY?-1:1
  );


  tc.drawImage(
    src,
    -W/2,
    -H/2
  );


  return t;

}


function cropInfo(
  sw,
  sh
){

  let cw=sw;
  let ch=sh;

  let cx=0;
  let cy=0;


  if(S.ratio!=='original'){

    const [
      rw,
      rh
    ]=
      S.ratio
        .split(':')
        .map(Number);


    const tr=rw/rh;
    const cr=sw/sh;


    if(cr>tr){

      cw=
        Math.round(
          sh*tr
        );

      cx=
        (sw-cw)/2;

    }

    else{

      ch=
        Math.round(
          sw/tr
        );

      cy=
        (sh-ch)/2;

    }

  }


  return {
    cw,
    ch,
    cx,
    cy
  };

}


/* MAIN RENDER */

function render(){

  if(
    !img||
    rendering
  ){

    return;
  }


  rendering=true;

  $('status').textContent=
    'Rendering…';


  try{

    const t=
      geometryCanvas();


    const ci=
      cropInfo(
        t.width,
        t.height
      );


    const max=
      window.innerWidth<760
        ?700
        :1000;


    const scale=
      Math.min(
        1,
        max/
        Math.max(
          ci.cw,
          ci.ch
        )
      );


    const w=
      Math.max(
        1,
        Math.round(
          ci.cw*scale
        )
      );


    const h=
      Math.max(
        1,
        Math.round(
          ci.ch*scale
        )
      );


    C.width=w;
    C.height=h;


    ctx.clearRect(
      0,
      0,
      w,
      h
    );


    ctx.drawImage(
      t,
      ci.cx,
      ci.cy,
      ci.cw,
      ci.ch,
      0,
      0,
      w,
      h
    );


    if(showBefore){

      ctx.clearRect(
        0,
        0,
        w,
        h
      );


      ctx.drawImage(
        t,
        ci.cx,
        ci.cy,
        ci.cw,
        ci.ch,
        0,
        0,
        w,
        h
      );


      drawOverlay();

      positionCanvas();

      $('beforeBadge').style.display=
        'block';

      $('status').textContent=
        'Before';

      return;

    }


    $('beforeBadge').style.display=
      'none';


    let data=
      ctx.getImageData(
        0,
        0,
        w,
        h
      );


    data=
      applyPixel(
        data,
        w,
        h
      );


    ctx.putImageData(
      data,
      0,
      0
    );


    if(S.noise){

      reduceNoise(
        ctx,
        w,
        h,
        S.noise
      );

    }


    if(S.sharp){

      sharpen(
        ctx,
        w,
        h,
        S.sharp
      );

    }


    if(S.colorNoise){

      const q=
        ctx.getImageData(
          0,
          0,
          w,
          h
        );


      const d=q.data;

      const amt=
        S.colorNoise/100;


      for(
        let i=0;
        i<d.length;
        i+=4
      ){

        const g=
          (
            d[i]+
            d[i+1]+
            d[i+2]
          )/3;


        d[i]=
          d[i]*(1-amt)+
          g*amt;

        d[i+1]=
          d[i+1]*(1-amt)+
          g*amt;

        d[i+2]=
          d[i+2]*(1-amt)+
          g*amt;

      }


      ctx.putImageData(
        q,
        0,
        0
      );

    }


    if(S.grain){

      addGrain(
        ctx,
        w,
        h,
        S.grain,
        S.grainSize,
        S.grainRough
      );

    }


    drawOverlay();

    positionCanvas();

    $('status').textContent=
      'Ready';

  }

  catch(err){

    console.error(err);

    $('status').textContent=
      'Ready';

  }

  finally{

    rendering=false;

  }

}


/* ZOOM + PAN */

function positionCanvas(){

  C.style.display='block';
  O.style.display='block';


  O.style.width=
    C.clientWidth+'px';

  O.style.height=
    C.clientHeight+'px';


  O.style.left=
    C.offsetLeft+'px';

  O.style.top=
    C.offsetTop+'px';


  C.style.transform=
    `translate3d(
      ${panX}px,
      ${panY}px,
      0
    ) scale(${zoom})`;


  O.style.transform=
    `translate3d(
      ${panX}px,
      ${panY}px,
      0
    ) scale(${zoom})`;


  $('zlabel').textContent=
    Math.round(
      zoom*100
    )+'%';

}


function clampPan(){

  if(
    !C.width||
    !C.height
  ){

    return;
  }


  const r=
    $('stage')
      .getBoundingClientRect();


  const cw=
    C.getBoundingClientRect().width/
    Math.max(
      .01,
      zoom
    );


  const ch=
    C.getBoundingClientRect().height/
    Math.max(
      .01,
      zoom
    );


  const maxX=
    Math.max(
      0,
      (
        cw*zoom-r.width
      )/2+
      cw*.15
    );


  const maxY=
    Math.max(
      0,
      (
        ch*zoom-r.height
      )/2+
      ch*.15
    );


  panX=
    clamp(
      panX,
      -maxX,
      maxX
    );


  panY=
    clamp(
      panY,
      -maxY,
      maxY
    );

}


function setZoom(
  z,
  focusX=null,
  focusY=null
){

  const old=zoom;

  zoom=
    clamp(
      z,
      .5,
      5
    );


  if(
    focusX!==null&&
    focusY!==null
  ){

    const k=
      zoom/old;


    panX=
      focusX-
      (
        focusX-panX
      )*k;


    panY=
      focusY-
      (
        focusY-panY
      )*k;

  }


  if(zoom<=1){

    panX=0;
    panY=0;

  }

  else{

    clampPan();

  }


  positionCanvas();

}


function fit(){

  zoom=1;

  panX=0;
  panY=0;

  positionCanvas();

}


/* OVERLAY */

function drawOverlay(){

  O.width=C.width;
  O.height=C.height;


  ox.clearRect(
    0,
    0,
    O.width,
    O.height
  );


  /* DRAW STROKES */

  for(
    const s of strokes
  ){

    if(
      s.points.length<2
    ){
      continue;
    }


    ox.save();


    ox.globalAlpha=
      s.opacity/100;


    ox.strokeStyle=
      s.color;


    ox.lineWidth=
      s.size;


    ox.lineCap='round';
    ox.lineJoin='round';


    ox.beginPath();


    s.points.forEach(
      (p,i)=>{

        if(i){

          ox.lineTo(
            p.x,
            p.y
          );

        }

        else{

          ox.moveTo(
            p.x,
            p.y
          );

        }

      }
    );


    ox.stroke();

    ox.restore();

  }


  /* TEXT */

  for(
    const t of texts
  ){

    const size=t.size;

    const weight=
      t.bold
        ?'700'
        :'400';

    const style=
      t.italic
        ?'italic'
        :'normal';


    ox.save();


    ox.globalAlpha=
      t.opacity/100;


    ox.font=
      `${style} ${weight} ${size}px "${t.font}"`;


    ox.textAlign=
      t.align;


    ox.textBaseline=
      'middle';


    ox.lineWidth=
      Math.max(
        1,
        size*.08
      );


    ox.strokeStyle=
      t.stroke;


    ox.fillStyle=
      t.color;


    ox.strokeText(
      t.text,
      t.x*C.width,
      t.y*C.height
    );


    ox.fillText(
      t.text,
      t.x*C.width,
      t.y*C.height
    );


    if(
      t.id===selectedTextId
    ){

      ox.globalAlpha=.7;

      ox.setLineDash([
        5,
        4
      ]);

      ox.strokeStyle='#ffffff';


      const m=
        ox.measureText(
          t.text
        );


      let left;


      if(t.align==='center'){

        left=
          t.x*C.width-
          m.width/2;

      }

      else if(t.align==='right'){

        left=
          t.x*C.width-
          m.width;

      }

      else{

        left=
          t.x*C.width;

      }


      ox.strokeRect(
        left-5,
        t.y*C.height-
          size/2-
          5,
        m.width+10,
        size+10
      );

    }


    ox.restore();

  }

}


/* IMAGE POSITION */

function imagePoint(e){

  const r=
    C.getBoundingClientRect();


  if(
    !r.width||
    !r.height
  ){

    return null;

  }


  return {

    x:
      clamp(
        (
          e.clientX-
          r.left
        )/
        r.width,
        0,
        1
      )*
      C.width,


    y:
      clamp(
        (
          e.clientY-
          r.top
        )/
        r.height,
        0,
        1
      )*
      C.height,


    nx:
      clamp(
        (
          e.clientX-
          r.left
        )/
        r.width,
        0,
        1
      ),


    ny:
      clamp(
        (
          e.clientY-
          r.top
        )/
        r.height,
        0,
        1
      )

  };

}


/* TEXT HIT TEST */

function textAt(p){

  for(
    let i=texts.length-1;
    i>=0;
    i--
  ){

    const t=texts[i];

    const x=
      t.x*C.width;

    const y=
      t.y*C.height;


    ox.font=
      `${t.italic?'italic ':''}${
        t.bold?'700':'400'
      } ${t.size}px "${t.font}"`;


    const m=
      ox.measureText(
        t.text
      );


    let left;


    if(t.align==='center'){

      left=
        x-m.width/2;

    }

    else if(t.align==='right'){

      left=
        x-m.width;

    }

    else{

      left=x;

    }


    const top=
      y-t.size/2;


    if(
      p.x>=left-15&&
      p.x<=left+m.width+15&&
      p.y>=top-15&&
      p.y<=top+t.size+15
    ){

      return t;

    }

  }


  return null;

}


/* OPEN IMAGE */

$('fileInput').addEventListener(
  'change',
  e=>{

    const f=
      e.target.files?.[0];

    if(f){

      loadFile(f);

    }

  }
);


$('openTop').onclick=
  ()=>$('fileInput').click();


$('openEmpty').onclick=
  ()=>$('fileInput').click();


function loadFile(file){

  const reader=
    new FileReader();


  reader.onload=()=>{

    const im=
      new Image();


    im.onload=()=>{

      const max=2200;


      const k=
        Math.min(
          1,
          max/
          Math.max(
            im.naturalWidth,
            im.naturalHeight
          )
        );


      src.width=
        Math.max(
          1,
          Math.round(
            im.naturalWidth*k
          )
        );


      src.height=
        Math.max(
          1,
          Math.round(
            im.naturalHeight*k
          )
        );


      sx.clearRect(
        0,
        0,
        src.width,
        src.height
      );


      sx.drawImage(
        im,
        0,
        0,
        src.width,
        src.height
      );


      img=im;

      fileName=file.name;


      $('name').textContent=
        file.name;


      $('meta').textContent=
        `${src.width} × ${src.height}px`;


      $('empty').style.display=
        'none';


      fit();

      resetEdits();


      $('status').textContent=
        'Ready';


      schedule();

    };


    im.src=
      reader.result;

  };


  reader.readAsDataURL(file);

}


/* TOP BUTTONS */

$('undo').onclick=()=>{

  if(!history.length){
    return;
  }

  future.push(
    snapshot()
  );

  restore(
    history.pop()
  );

};


$('redo').onclick=()=>{

  if(!future.length){
    return;
  }

  history.push(
    snapshot()
  );

  restore(
    future.pop()
  );

};


$('before').onclick=()=>{

  if(!img){
    return;
  }

  showBefore=
    !showBefore;

  render();

};


$('zout').onclick=
  ()=>setZoom(
    zoom-.15
  );


$('zin').onclick=
  ()=>setZoom(
    zoom+.15
  );


$('fit').onclick=
  fit;


$('full').onclick=()=>{

  $('stage')
    .requestFullscreen
    ?.();

};


$('reset').onclick=()=>{

  push();

  resetEdits();

  panel();

  schedule();

};


/* TABS */

$('tabs').addEventListener(
  'click',
  e=>{

    const b=
      e.target.closest(
        '[data-tool]'
      );


    if(!b){
      return;
    }


    active=
      b.dataset.tool;


    document
      .querySelectorAll(
        '#tabs button'
      )
      .forEach(x=>

        x.classList.toggle(
          'active',
          x===b
        )

      );


    panel();

  }
);


/* KEYBOARD */

document.addEventListener(
  'keydown',
  e=>{

    if(
      (e.ctrlKey||e.metaKey)&&
      e.key.toLowerCase()==='z'
    ){

      e.preventDefault();

      $('undo').click();

    }

    else if(
      (e.ctrlKey||e.metaKey)&&
      e.shiftKey&&
      e.key.toLowerCase()==='z'
    ){

      e.preventDefault();

      $('redo').click();

    }

  }
);


/* POINTER SYSTEM */

const pointers=
  new Map();


$('stage').addEventListener(
  'pointerdown',
  e=>{

    if(!img){
      return;
    }


    pointers.set(
      e.pointerId,
      {
        x:e.clientX,
        y:e.clientY
      }
    );


    /* TWO FINGER PINCH */

    if(
      pointers.size===2
    ){

      const pts=
        [...pointers.values()];


      pinch={

        distance:
          Math.max(
            1,
            Math.hypot(
              pts[0].x-
                pts[1].x,
              pts[0].y-
                pts[1].y
            )
          ),

        zoom,

        midX:
          (
            pts[0].x+
            pts[1].x
          )/2,

        midY:
          (
            pts[0].y+
            pts[1].y
          )/2

      };


      drawing=false;
      panning=false;

      return;

    }


    /* COLOR PICK */

    if(
      active==='selective'&&
      $('pickerBadge').style.display!=='none'
    ){

      const p=
        imagePoint(e);


      if(p){

        const px=
          ctx.getImageData(
            Math.round(p.x),
            Math.round(p.y),
            1,
            1
          ).data;


        selectedColor={

          r:px[0],
          g:px[1],
          b:px[2]

        };


        $('pickerBadge').style.display=
          'none';


        $('status').textContent=
          'Color selected';


        panel();
        schedule();

      }


      return;

    }


    /* TEXT */

    if(active==='text'){

      const p=
        imagePoint(e);


      const t=
        p&&textAt(p);


      if(t){

        selectedTextId=
          t.id;


        push();


        t._drag=true;

        t._dx=
          t.x-p.nx;

        t._dy=
          t.y-p.ny;


        panel();
        schedule();

        return;

      }

    }


    /* DRAW */

    if(active==='draw'){

      const p=
        imagePoint(e);


      if(!p){
        return;
      }


      push();


      drawing=true;


      drawPoints=[
        {
          x:p.x,
          y:p.y
        }
      ];


      strokes.push({

        points:
          drawPoints.slice(),

        size:
          S.brushSize*
          C.width/
          500,

        opacity:
          S.brushOpacity,

        color:
          S.drawColor

      });


      schedule();

      return;

    }


    /* PAN */

    if(zoom>1){

      panning=true;

      panStart={

        x:e.clientX,
        y:e.clientY,

        px:panX,
        py:panY

      };

    }

  }
);


/* POINTER MOVE */

$('stage').addEventListener(
  'pointermove',
  e=>{

    if(
      pointers.has(
        e.pointerId
      )
    ){

      pointers.set(
        e.pointerId,
        {
          x:e.clientX,
          y:e.clientY
        }
      );

    }


    /* PINCH */

    if(
      pinch&&
      pointers.size>=2
    ){

      const pts=
        [...pointers.values()];


      const d=
        Math.max(
          1,
          Math.hypot(
            pts[0].x-
              pts[1].x,
            pts[0].y-
              pts[1].y
          )
        );


      setZoom(
        pinch.zoom*
        d/
        pinch.distance
      );


      return;

    }


    /* MOVE TEXT */

    if(
      active==='text'&&
      selectedTextId!=null
    ){

      const t=
        selectedText();


      if(
        t&&
        t._drag
      ){

        const p=
          imagePoint(e);


        if(p){

          t.x=
            clamp(
              p.nx+t._dx,
              0,
              1
            );


          t.y=
            clamp(
              p.ny+t._dy,
              0,
              1
            );


          schedule();

        }


        return;

      }

    }


    /* DRAW */

    if(
      active==='draw'&&
      drawing
    ){

      const p=
        imagePoint(e);


      if(p){

        drawPoints.push({

          x:p.x,
          y:p.y

        });


        strokes[
          strokes.length-1
        ].points=
          drawPoints.slice();


        schedule();

      }


      return;

    }


    /* PAN */

    if(
      panning&&
      panStart
    ){

      panX=
        panStart.px+
        (
          e.clientX-
          panStart.x
        );


      panY=
        panStart.py+
        (
          e.clientY-
          panStart.y
        );


      clampPan();

      positionCanvas();

    }

  }
);


/* POINTER END */

function endPointer(e){

  pointers.delete(
    e.pointerId
  );


  if(
    pointers.size<2
  ){

    pinch=null;

  }


  if(
    active==='text'
  ){

    const t=
      selectedText();


    if(t){

      t._drag=false;

    }

  }


  drawing=false;

  panning=false;

  panStart=null;

}


$('stage').addEventListener(
  'pointerup',
  endPointer
);


$('stage').addEventListener(
  'pointercancel',
  endPointer
);


/* MOUSE WHEEL ZOOM */

$('stage').addEventListener(
  'wheel',
  e=>{

    if(!img){
      return;
    }


    e.preventDefault();


    const r=
      $('stage')
        .getBoundingClientRect();


    setZoom(

      zoom*
      (
        e.deltaY<0
          ?1.1
          :.9
      ),

      e.clientX-
        r.left-
        r.width/2,

      e.clientY-
        r.top-
        r.height/2

    );

  },
  {
    passive:false
  }
);


/* EXPORT */

function exportImage(){

  if(!img){

    alert(
      'Please open a photo first.'
    );

    return;

  }


  const type=
    $('format')?.value||
    'image/jpeg';


  const q=
    Number(
      $('quality')?.value||
      .85
    );


  const max=
    Number(
      $('size')?.value||
      2400
    )||
    Math.max(
      src.width,
      src.height
    );


  $('status').textContent=
    'Exporting…';


  const t=
    geometryCanvas();


  const ci=
    cropInfo(
      t.width,
      t.height
    );


  const scale=
    Math.min(
      1,
      max/
      Math.max(
        ci.cw,
        ci.ch
      )
    );


  const w=
    Math.max(
      1,
      Math.round(
        ci.cw*scale
      )
    );


  const h=
    Math.max(
      1,
      Math.round(
        ci.ch*scale
      )
    );


  const out=
    document.createElement(
      'canvas'
    );


  out.width=w;
  out.height=h;


  const oc=
    out.getContext(
      '2d',
      {
        willReadFrequently:true
      }
    );


  oc.drawImage(
    t,
    ci.cx,
    ci.cy,
    ci.cw,
    ci.ch,
    0,
    0,
    w,
    h
  );


  let data=
    oc.getImageData(
      0,
      0,
      w,
      h
    );


  data=
    applyPixel(
      data,
      w,
      h
    );


  oc.putImageData(
    data,
    0,
    0
  );


  if(S.noise){

    reduceNoise(
      oc,
      w,
      h,
      S.noise
    );

  }


  if(S.sharp){

    sharpen(
      oc,
      w,
      h,
      S.sharp
    );

  }


  if(S.grain){

    addGrain(
      oc,
      w,
      h,
      S.grain,
      S.grainSize,
      S.grainRough
    );

  }


  /* OVERLAY EXPORT */

  const overlay=
    document.createElement(
      'canvas'
    );


  overlay.width=w;
  overlay.height=h;


  const oo=
    overlay.getContext('2d');


  const ratioX=
    w/C.width;

  const ratioY=
    h/C.height;


  for(
    const s of strokes
  ){

    if(
      s.points.length<2
    ){
      continue;
    }


    oo.save();

    oo.globalAlpha=
      s.opacity/100;

    oo.strokeStyle=
      s.color;

    oo.lineWidth=
      s.size*
      ratioX;

    oo.lineCap='round';
    oo.lineJoin='round';

    oo.beginPath();


    s.points.forEach(
      (p,i)=>{

        const x=
          p.x*ratioX;

        const y=
          p.y*ratioY;


        if(i){

          oo.lineTo(
            x,
            y
          );

        }

        else{

          oo.moveTo(
            x,
            y
          );

        }

      }
    );


    oo.stroke();

    oo.restore();

  }


  for(
    const tx of texts
  ){

    oo.save();


    oo.globalAlpha=
      tx.opacity/100;


    oo.font=
      `${
        tx.italic
          ?'italic '
          :''
      }${
        tx.bold
          ?'700'
          :'400'
      } ${
        tx.size*ratioX
      }px "${tx.font}"`;


    oo.textAlign=
      tx.align;


    oo.textBaseline=
      'middle';


    oo.lineWidth=
      Math.max(
        1,
        tx.size*
        ratioX*
        .08
      );


    oo.strokeStyle=
      tx.stroke;

    oo.fillStyle=
      tx.color;


    oo.strokeText(
      tx.text,
      tx.x*w,
      tx.y*h
    );


    oo.fillText(
      tx.text,
      tx.x*w,
      tx.y*h
    );


    oo.restore();

  }


  oc.drawImage(
    overlay,
    0,
    0
  );


  const ext=
    type==='image/png'
      ?'png'
      :type==='image/webp'
        ?'webp'
        :'jpg';


  const a=
    document.createElement(
      'a'
    );


  a.download=
    `toolora-edited-${Date.now()}.${ext}`;


  a.href=
    out.toDataURL(
      type,
      q
    );


  a.click();


  $('status').textContent=
    'Export complete';

}


/* RESIZE */

window.addEventListener(
  'resize',
  ()=>{

    if(img){
      schedule();
    }

  }
);


/* INIT */

document
  .querySelector(
    '#tabs button[data-tool="light"]'
  )
  .classList.add('active');


$('pickerBadge').style.display=
  'none';


$('beforeBadge').style.display=
  'none';


panel();

})();
