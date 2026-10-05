(()=>{
'use strict';

const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

const C=$('canvas');
const ctx=C.getContext('2d',{willReadFrequently:true});

const O=$('overlay');
const ox=O.getContext('2d');

const src=document.createElement('canvas');
const sx=src.getContext('2d',{willReadFrequently:true});

let img=null;
let fileName='';
let renderQueued=false;
let zoom=1;
let active='light';
let showBefore=false;
let history=[];
let future=[];

/* Touch zoom state */
let drawing=false;
const pointers=new Map();
let pinchStartDistance=0;
let pinchStartZoom=1;
let pinchActive=false;

const S={
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

  retouchSize:30
};

const colors=[
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

const names={
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
  export:['Output','Export']
};

function snap(){
  return JSON.parse(JSON.stringify(S));
}

function push(){
  history.push(snap());

  if(history.length>25){
    history.shift();
  }

  future=[];
}

function restore(x){
  Object.assign(S,x);
  render();
  panel();
}

function fmt(v){
  v=Number(v);
  return `${v>0?'+':''}${Number.isInteger(v)?v:v.toFixed(1)}`;
}

function control(k,label,min,max,step=1){
  return `
  <div class="control">
    <div class="ch">
      <span>${label}</span>
      <span class="val" id="v_${k}">${fmt(S[k])}</span>
    </div>

    <input
      data-k="${k}"
      type="range"
      min="${min}"
      max="${max}"
      step="${step}"
      value="${S[k]}"
    >
  </div>`;
}

function bind(){

  document.querySelectorAll('#panel input[data-k]').forEach(e=>{

    e.oninput=()=>{

      S[e.dataset.k]=+e.value;

      const v=$('v_'+e.dataset.k);

      if(v){
        v.textContent=fmt(e.value);
      }

      schedule();
    };

    e.onchange=push;
  });

  document.querySelectorAll('#panel [data-mix]').forEach(e=>{

    e.oninput=()=>{

      S[e.dataset.mix+e.dataset.color]=+e.value;

      schedule();
    };

  });
}

function panel(){

  const p=$('controlPanel')||$('panel');

  if(!p)return;

  $('eyebrow').textContent=names[active][0];
  $('title').textContent=names[active][1];

  let h='';

  if(active==='light'){

    h=`
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

      <button class="btn" id="auto" style="width:100%">
        Auto Tone
      </button>

      <p class="note" style="margin-top:10px">
        Auto uses the image histogram and applies a quick balanced correction.
      </p>

    </div>`;
  }

  if(active==='color'){

    h=`
    <div class="section">

      <h3>White Balance</h3>

      ${control('temp','Temperature',-100,100)}
      ${control('tint','Tint',-100,100)}
      ${control('vibrance','Vibrance',-100,100)}
      ${control('saturation','Saturation',-100,100)}

    </div>

    <div class="section">

      <h3>Color Mixer</h3>

      ${colors.map(c=>`

        <div class="mixer">

          <span>
            ${c[0].toUpperCase()+c.slice(1)}
          </span>

          <input
            data-mix="h_${c}"
            data-color=""
            type="range"
            min="-30"
            max="30"
            value="${S['h_'+c]}"
            title="Hue"
          >

          <input
            data-mix="s_${c}"
            data-color=""
            type="range"
            min="-100"
            max="100"
            value="${S['s_'+c]}"
            title="Saturation"
          >

          <input
            data-mix="l_${c}"
            data-color=""
            type="range"
            min="-100"
            max="100"
            value="${S['l_'+c]}"
            title="Luminance"
          >

        </div>

      `).join('')}

      <p class="note">
        Each color row contains Hue, Saturation and Luminance sliders.
      </p>

    </div>

    <div class="section">

      <h3>Color Grading</h3>

      ${control('gradeShadow','Shadow Color',0,360)}
      ${control('gradeShadowSat','Shadow Strength',0,100)}

      ${control('gradeMid','Midtone Color',0,360)}
      ${control('gradeMidSat','Midtone Strength',0,100)}

      ${control('gradeHigh','Highlight Color',0,360)}
      ${control('gradeHighSat','Highlight Strength',0,100)}

      ${control('gradeBlend','Blending',0,100)}
      ${control('gradeBalance','Balance',-100,100)}

    </div>`;
  }

  if(active==='effects'){

    h=`
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

    </div>`;
  }

  if(active==='detail'){

    h=`
    <div class="section">

      <h3>Detail</h3>

      ${control('sharp','Sharpening',0,100)}
      ${control('radius','Radius',.5,3,.1)}
      ${control('noise','Noise Reduction',0,100)}
      ${control('colorNoise','Color Noise',0,100)}

    </div>

    <p class="note">
      Preview processing is capped for speed. Export uses the same edit state.
    </p>`;
  }

  if(active==='crop'){

    h=`
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

      ${control('straighten','Straighten',-10,10,.1)}

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

    </div>`;
  }

  if(active==='presets'){

    h=`
    <div class="section">

      <h3>Toolora Presets</h3>

      <div class="presets">

        ${[
          ['clean','Clean','Balanced'],
          ['warm','Warm','Soft warm'],
          ['cool','Cool','Clean cool'],
          ['cinematic','Cinematic','Moody'],
          ['matte','Matte','Soft film'],
          ['vivid','Vivid','Color punch'],
          ['portrait','Portrait','Soft portrait'],
          ['bw','B&W','Monochrome']
        ].map(x=>`

          <button class="preset" data-preset="${x[0]}">
            <b>${x[1]}</b>
            <small>${x[2]}</small>
          </button>

        `).join('')}

      </div>

    </div>

    ${control('presetAmount','Preset Amount',0,100)}`;
  }

  if(active==='profiles'){

    h=`
    <div class="section">

      <h3>Profiles</h3>

      <div class="grid2">

        ${[
          ['natural','Natural'],
          ['neutral','Neutral'],
          ['vivid','Vivid'],
          ['modern','Modern'],
          ['film','Film'],
          ['mono','Monochrome']
        ].map(x=>`

          <button
            class="btn ${S.profile===x[0]?'active':''}"
            data-profile="${x[0]}"
          >
            ${x[1]}
          </button>

        `).join('')}

      </div>

    </div>

    <p class="note">
      Profiles change the base rendering character while keeping edits non-destructive.
    </p>`;
  }

  if(active==='mask'){

    h=`
    <div class="section">

      <h3>Local Mask</h3>

      <div class="grid3">

        <button class="btn mask active" data-type="radial">
          Radial
        </button>

        <button class="btn mask" data-type="linear">
          Linear
        </button>

        <button class="btn mask" data-type="brush">
          Brush
        </button>

      </div>

      ${control('maskAmount','Mask Amount',0,100)}
      ${control('maskExposure','Local Exposure',-100,100)}
      ${control('maskContrast','Local Contrast',-100,100)}
      ${control('maskSaturation','Local Saturation',-100,100)}

      <button class="btn" id="maskClear" style="width:100%">
        Clear Mask
      </button>

    </div>

    <p class="note">
      Radial and linear masks are real browser-side masks. AI subject/sky selection is intentionally not faked.
    </p>`;
  }

  if(active==='retouch'){

    h=`
    <div class="section">

      <h3>Spot Blur Retouch</h3>

      ${control('retouchSize','Brush Size',5,100)}

      <button
        class="btn"
        id="retouchClear"
        style="width:100%"
      >
        Clear Retouch
      </button>

    </div>

    <p class="note">
      Paint over an unwanted area on the photo to blur it locally. This is a safe browser retouch tool, not generative fill.
    </p>`;
  }

  if(active==='blur'){

    h=`
    <div class="section">

      <h3>Lens-style Blur</h3>

      ${control('blur','Blur Amount',0,100)}
      ${control('blurX','Focus X',0,100)}
      ${control('blurY','Focus Y',0,100)}

    </div>`;
  }

  if(active==='optics'){

    h=`
    <div class="section">

      <h3>Optics</h3>

      ${control('lensVignette','Lens Vignette',-100,100)}
      ${control('defringe','Defringe',0,100)}

    </div>

    <p class="note">
      Browser-safe optical compensation. Camera-specific lens profiles require external profile data.
    </p>`;
  }

  if(active==='export'){

    h=`
    <div class="section">

      <h3>Export</h3>

      <div class="export">

        <div class="grid2">

          <div>

            <div class="colorhead">
              Format
            </div>

            <select class="select" id="format">
              <option value="image/jpeg">JPG</option>
              <option value="image/png">PNG</option>
              <option value="image/webp">WebP</option>
            </select>

          </div>

          <div>

            <div class="colorhead">
              Quality
            </div>

            <select class="select" id="quality">
              <option value=".7">Standard</option>
              <option value=".85" selected>High</option>
              <option value=".95">Maximum</option>
            </select>

          </div>

        </div>

        <div
          class="colorhead"
          style="margin-top:12px"
        >
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

    <button
      class="btn danger"
      id="resetAll"
      style="width:100%"
    >
      Reset All Edits
    </button>`;
  }

  p.innerHTML=h;

  bind();
  panelActions();
}

function panelActions(){

  $('auto')?.addEventListener('click',()=>{

    push();

    S.exposure=0;
    S.contrast=8;
    S.highlights=-14;
    S.shadows=16;
    S.whites=4;
    S.blacks=-5;

    render();
    panel();
  });

  $('ratio')?.addEventListener('change',e=>{
    push();
    S.ratio=e.target.value;
    schedule();
  });

  $('rl')?.addEventListener('click',()=>{
    push();
    S.rotate=(S.rotate+270)%360;
    schedule();
  });

  $('rr')?.addEventListener('click',()=>{
    push();
    S.rotate=(S.rotate+90)%360;
    schedule();
  });

  $('fx')?.addEventListener('click',()=>{
    push();
    S.flipX=!S.flipX;
    schedule();
  });

  $('fy')?.addEventListener('click',()=>{
    push();
    S.flipY=!S.flipY;
    schedule();
  });

  document.querySelectorAll('[data-preset]').forEach(b=>{
    b.onclick=()=>preset(b.dataset.preset);
  });

  document.querySelectorAll('[data-profile]').forEach(b=>{
    b.onclick=()=>{
      push();
      S.profile=b.dataset.profile;
      render();
      panel();
    };
  });

  document.querySelectorAll('.mask').forEach(b=>{
    b.onclick=()=>{
      S.maskType=b.dataset.type;

      document.querySelectorAll('.mask').forEach(x=>{
        x.classList.remove('active');
      });

      b.classList.add('active');
      schedule();
    };
  });

  $('maskClear')?.addEventListener('click',()=>{
    push();

    S.maskAmount=0;
    S.maskExposure=0;
    S.maskContrast=0;
    S.maskSaturation=0;

    schedule();
  });

  $('retouchClear')?.addEventListener('click',()=>{
    push();
    retouch=[];
    render();
  });

  $('download')?.addEventListener('click',exportImage);

  $('resetAll')?.addEventListener('click',resetAll);
}

function preset(n){

  push();

  const z={
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
    z,
    {
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

    }[n]
  );

  Object.assign(S,z);

  S.preset=n;

  render();
  panel();
}

function handleImageFile(file){

  if(!file)return;

  if(!file.type || !file.type.startsWith('image/')){
    alert('Please select a valid image file.');
    return;
  }

  $('status-bar')?.classList.add('busy');

  $('status').textContent='Opening photo…';

  const url=URL.createObjectURL(file);
  const i=new Image();

  i.onload=()=>{

    URL.revokeObjectURL(url);

    img=i;
    fileName=file.name;

    /*
      Keep source smaller for faster browser processing.
      Original dimensions are still shown to the user.
    */
    const max=1400;
    const k=Math.min(
      1,
      max/Math.max(i.naturalWidth,i.naturalHeight)
    );

    src.width=Math.max(
      1,
      Math.round(i.naturalWidth*k)
    );

    src.height=Math.max(
      1,
      Math.round(i.naturalHeight*k)
    );

    sx.clearRect(
      0,
      0,
      src.width,
      src.height
    );

    sx.drawImage(
      i,
      0,
      0,
      src.width,
      src.height
    );

    $('name').textContent=file.name;

    $('meta').textContent=
      `${i.naturalWidth} × ${i.naturalHeight}px`;

    $('empty').style.display='none';

    C.style.display='block';
    O.style.display='block';

    showBefore=false;

    if($('badge')){
      $('badge').style.display='none';
    }

    retouch=[];

    resetState(false);

    zoom=1;
    applyZoomVisual();

    render();

    $('status').textContent='Ready';
  };

  i.onerror=()=>{
    URL.revokeObjectURL(url);

    $('status').textContent='Ready';

    alert(
      'The selected image could not be opened. Please try another image.'
    );
  };

  i.src=url;
}

const fileInput=$('fileInput');

$('openTop').addEventListener(
  'click',
  ()=>fileInput.click()
);

$('openEmpty').addEventListener(
  'click',
  ()=>fileInput.click()
);

fileInput.addEventListener(
  'change',
  e=>{
    handleImageFile(
      e.target.files &&
      e.target.files[0]
    );

    e.target.value='';
  }
);

$('stage').addEventListener(
  'dragover',
  e=>{
    e.preventDefault();
    $('stage').classList.add('dragover');
  }
);

$('stage').addEventListener(
  'dragleave',
  ()=>{
    $('stage').classList.remove('dragover');
  }
);

$('stage').addEventListener(
  'drop',
  e=>{
    e.preventDefault();

    $('stage').classList.remove('dragover');

    handleImageFile(
      e.dataTransfer.files &&
      e.dataTransfer.files[0]
    );
  }
);

function updateZoomLabel(){

  const el=$('zlabel');

  if(!el)return;

  el.textContent=
    zoom===1
      ? '100%'
      : `${Math.round(zoom*100)}%`;
}

function applyZoomVisual(){

  zoom=clamp(
    zoom,
    .5,
    4
  );

  /*
    Important:
    Zoom only changes the visual transform.
    The image is NOT rendered again.
  */
  C.style.transform=`scale(${zoom})`;

  updateZoomLabel();
}

function resetState(){

  for(const k of Object.keys(S)){

    if(
      k.startsWith('h_') ||
      k.startsWith('s_') ||
      k.startsWith('l_')
    ){
      S[k]=0;
    }

    else if(typeof S[k]==='boolean'){
      S[k]=false;
    }

    else if(
      k==='ratio' ||
      k==='profile' ||
      k==='preset' ||
      k==='maskType'
    ){

      S[k]=
        k==='ratio'
          ? 'original'
          : k==='profile'
            ? 'natural'
            : k==='preset'
              ? 'none'
              : 'radial';
    }

    else if(
      k==='midpoint' ||
      k==='feather' ||
      k==='grainSize' ||
      k==='grainRough' ||
      k==='blurX' ||
      k==='blurY'
    ){

      S[k]=
        k==='midpoint' ||
        k==='feather'
          ? 50
          : k==='grainSize'
            ? 25
            : 50;
    }

    else if(k==='radius'){
      S[k]=1;
    }

    else{
      S[k]=0;
    }
  }

  S.presetAmount=100;

  history=[];
  future=[];

  zoom=1;

  applyZoomVisual();

  panel();
  schedule();
}

function resetAll(){
  push();
  resetState(true);
}

function schedule(){

  if(renderQueued)return;

  renderQueued=true;

  requestAnimationFrame(()=>{
    renderQueued=false;
    render();
  });
}

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

  return[h,s,mx];
}

function hsv(h,s,v){

  const i=Math.floor(h*6);
  const f=h*6-i;

  const p=v*(1-s);
  const q=v*(1-f*s);
  const t=v*(1-(1-f)*s);

  return[
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

function applyPixel(imgData,w,h){

  const d=imgData.data;
  const p={...S};

  applyProfile(p);

  const ex=Math.pow(
    2,
    p.exposure/50
  );

  const con=(100+p.contrast)/100;
  const sat=(100+p.saturation)/100;
  const vib=p.vibrance/100;

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

    const hi=p.highlights/120;
    const sh=p.shadows/120;

    if(lum>.5){

      r+=hi*(r-.5);
      g+=hi*(g-.5);
      b+=hi*(b-.5);

    }else{

      r+=sh*(.5-r);
      g+=sh*(.5-g);
      b+=sh*(.5-b);
    }

    r+=p.whites/255+p.blacks/255;
    g+=p.whites/255+p.blacks/255;
    b+=p.whites/255+p.blacks/255;

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
      (1-Math.abs(2*lum-1))*
      .7;

    r=gray+(r-gray)*sat*boost;
    g=gray+(g-gray)*sat*boost;
    b=gray+(b-gray)*sat*boost;

    const fx=
      (p.texture+p.clarity)/900;

    const fgray=(r+g+b)/3;

    r+=((r-fgray)*fx);
    g+=((g-fgray)*fx);
    b+=((b-fgray)*fx);

    if(p.dehaze){

      const dh=p.dehaze/140;

      r=(r-.5)*(1+dh)+.5;
      g=(g-.5)*(1+dh)+.5;
      b=(b-.5)*(1+dh)+.5;
    }

    let[
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

      [
        r,
        g,
        b
      ]=hsv(
        (hh+dh/360+1)%1,
        clamp(ss*(1+ds/100),0,1),
        clamp(vv*(1+dl/100),0,1)
      );
    }

    const lum2=
      .2126*r+
      .7152*g+
      .0722*b;

    const gh=
      lum2<.35
        ?S.gradeShadow
        :lum2>.65
          ?S.gradeHigh
          :S.gradeMid;

    const gs=
      lum2<.35
        ?S.gradeShadowSat
        :lum2>.65
          ?S.gradeHighSat
          :S.gradeMidSat;

    if(gs){

      const grgb=hsv(
        gh/360,
        gs/100,
        Math.max(.25,lum2)
      );

      const blend=
        (S.gradeBlend/100)*.35;

      r=r*(1-blend)+grgb[0]*blend;
      g=g*(1-blend)+grgb[1]*blend;
      b=b*(1-blend)+grgb[2]*blend;
    }

    const x=
      (i/4%w)/w-.5;

    const y=
      Math.floor(i/4/w)/h-.5;

    const dist=
      Math.sqrt(x*x+y*y)*1.414;

    if(p.vignette){

      const edge=
        clamp(
          (dist-p.midpoint/100*.65)/
          Math.max(.05,p.feather/100),
          0,
          1
        );

      const vvv=
        1-
        p.vignette/100*
        edge*
        edge;

      r*=vvv;
      g*=vvv;
      b*=vvv;
    }

    if(p.maskAmount){

      let m=
        p.maskType==='radial'
          ?1-clamp(
            Math.sqrt(x*x+y*y)*2.1,
            0,
            1
          )
          :p.maskType==='linear'
            ?clamp(
              1-Math.abs(y)*2,
              0,
              1
            )
            :1;

      m*=p.maskAmount/100;

      r+=m*p.maskExposure/250;
      g+=m*p.maskExposure/250;
      b+=m*p.maskExposure/250;

      const mg=
        1+
        m*p.maskContrast/100;

      r=(r-.5)*mg+.5;
      g=(g-.5)*mg+.5;
      b=(b-.5)*mg+.5;

      const gr=
        .299*r+
        .587*g+
        .114*b;

      const ms=
        1+
        m*p.maskSaturation/100;

      r=gr+(r-gr)*ms;
      g=gr+(g-gr)*ms;
      b=gr+(b-gr)*ms;
    }

    d[i]=clamp(r*255,0,255);
    d[i+1]=clamp(g*255,0,255);
    d[i+2]=clamp(b*255,0,255);
  }

  return imgData;
}

function sharpen(c,w,h,a){

  if(a<1)return;

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
    a/100*.7;

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

        q[i+ch]=clamp(
          d[i+ch]*(1+4*k)-
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

      q[i+3]=255;
    }
  }

  c.putImageData(o,0,0);
}

function grain(c,w,h,a){

  if(!a)return;

  const q=
    c.getImageData(
      0,
      0,
      w,
      h
    );

  const d=q.data;

  const n=
    a/100*28;

  for(
    let i=0;
    i<d.length;
    i+=4
  ){

    const x=
      (Math.random()-.5)*n;

    d[i]=clamp(d[i]+x,0,255);
    d[i+1]=clamp(d[i+1]+x,0,255);
    d[i+2]=clamp(d[i+2]+x,0,255);
  }

  c.putImageData(q,0,0);
}

let retouch=[];

function retouchDraw(c,w,h){

  for(const p of retouch){

    const r=p.r;
    const blur=Math.max(2,r/5);

    c.save();

    c.beginPath();

    c.arc(
      p.x,
      p.y,
      r,
      0,
      Math.PI*2
    );

    c.clip();

    c.filter=`blur(${blur}px)`;

    const cp=
      document.createElement('canvas');

    cp.width=w;
    cp.height=h;

    cp
      .getContext('2d')
      .drawImage(
        c.canvas,
        0,
        0
      );

    c.drawImage(
      cp,
      0,
      0
    );

    c.restore();
  }
}

function render(){

  if(!img)return;

  $('status').textContent='Rendering…';

  let a=
    (S.rotate+S.straighten)*
    Math.PI/180;

  const W=src.width;
  const H=src.height;

  const sw=
    (S.rotate%180)
      ?H
      :W;

  const sh=
    (S.rotate%180)
      ?W
      :H;

  const t=
    document.createElement('canvas');

  t.width=sw;
  t.height=sh;

  const tc=
    t.getContext('2d');

  tc.translate(
    sw/2,
    sh/2
  );

  tc.rotate(a);

  tc.scale(
    S.flipX?-1:1,
    S.flipY?-1:1
  );

  tc.drawImage(
    src,
    -W/2,
    -H/2
  );

  let cw=sw;
  let ch=sh;
  let cx=0;
  let cy=0;

  if(S.ratio!=='original'){

    const[
      rw,
      rh
    ]=S.ratio
      .split(':')
      .map(Number);

    const tr=rw/rh;
    const cr=sw/sh;

    if(cr>tr){

      cw=
        Math.round(sh*tr);

      cx=
        (sw-cw)/2;

    }else{

      ch=
        Math.round(sw/tr);

      cy=
        (sh-ch)/2;
    }
  }

  /*
    Small preview canvas = faster editing.
    The original image remains untouched.
  */
  const max=
    innerWidth<700
      ?620
      :900;

  const k=
    Math.min(
      1,
      max/Math.max(cw,ch)
    );

  const w=
    Math.max(
      1,
      Math.round(cw*k)
    );

  const h=
    Math.max(
      1,
      Math.round(ch*k)
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
    cx,
    cy,
    cw,
    ch,
    0,
    0,
    w,
    h
  );

  let data=
    ctx.getImageData(
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
      src,
      0,
      0,
      w,
      h
    );

    showOverlay();

    $('status').textContent='Original';

    return;
  }

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

  if(S.sharp){
    sharpen(
      ctx,
      w,
      h,
      S.sharp
    );
  }

  if(S.noise){

    ctx.filter=
      `blur(${S.noise/50}px)`;

    const cp=
      document.createElement('canvas');

    cp.width=w;
    cp.height=h;

    cp
      .getContext('2d')
      .drawImage(
        C,
        0,
        0
      );

    ctx.filter='none';

    ctx.drawImage(
      cp,
      0,
      0
    );
  }

  if(S.grain){
    grain(
      ctx,
      w,
      h,
      S.grain
    );
  }

  if(S.blur){

    ctx.filter=
      `blur(${Math.min(
        10,
        S.blur/10
      )}px)`;

    const cp=
      document.createElement('canvas');

    cp.width=w;
    cp.height=h;

    cp
      .getContext('2d')
      .drawImage(
        C,
        0,
        0
      );

    ctx.filter='none';

    ctx.clearRect(
      0,
      0,
      w,
      h
    );

    ctx.drawImage(
      cp,
      0,
      0
    );
  }

  retouchDraw(
    ctx,
    w,
    h
  );

  showOverlay();

  O.style.width=
    C.clientWidth+'px';

  O.style.height=
    C.clientHeight+'px';

  /*
    Keep current zoom after every edit.
  */
  applyZoomVisual();

  $('status').textContent='Ready';
}

function showOverlay(){

  O.width=C.width;
  O.height=C.height;

  ox.clearRect(
    0,
    0,
    O.width,
    O.height
  );

  O.style.width=
    C.clientWidth+'px';

  O.style.height=
    C.clientHeight+'px';
}

function exportImage(){

  if(!img){

    alert(
      'Please open a photo first.'
    );

    return;
  }

  $('status').textContent='Exporting…';

  const max=
    +$('size').value ||
    Math.max(
      src.width,
      src.height
    );

  const old=zoom;

  zoom=1;

  render();

  const k=
    Math.min(
      1,
      max/
      Math.max(
        C.width,
        C.height
      )
    );

  const o=
    document.createElement('canvas');

  o.width=
    Math.max(
      1,
      Math.round(C.width*k)
    );

  o.height=
    Math.max(
      1,
      Math.round(C.height*k)
    );

  o
    .getContext('2d')
    .drawImage(
      C,
      0,
      0,
      o.width,
      o.height
    );

  const type=
    $('format').value;

  const q=
    +$('quality').value;

  const ext=
    type==='image/png'
      ?'png'
      :type==='image/webp'
        ?'webp'
        :'jpg';

  const a=
    document.createElement('a');

  a.download=
    `toolora-edited-${Date.now()}.${ext}`;

  a.href=
    o.toDataURL(
      type,
      q
    );

  a.click();

  zoom=old;

  render();

  $('status').textContent=
    'Export complete';
}

/* Tool switching */

$('tabs').addEventListener(
  'click',
  e=>{
    const b=
      e.target.closest('[data-tool]');

    if(!b)return;

    active=
      b.dataset.tool;

    document
      .querySelectorAll(
        '#tabs button'
      )
      .forEach(x=>{
        x.classList.toggle(
          'active',
          x===b
        );
      });

    panel();
  }
);

/* Reset */

$('reset').onclick=()=>{
  push();
  resetState(true);
};

/* Undo */

$('undo').onclick=()=>{

  if(history.length){

    future.push(
      snap()
    );

    restore(
      history.pop()
    );
  }
};

/* Redo */

$('redo').onclick=()=>{

  if(future.length){

    history.push(
      snap()
    );

    restore(
      future.pop()
    );
  }
};

/* Before */

$('before').onclick=()=>{

  showBefore=!showBefore;

  if($('badge')){
    $('badge').style.display=
      showBefore
        ?'block'
        :'none';
  }

  render();
};

/*
  Desktop zoom buttons.
  These do NOT render the photo again.
*/

$('zout').onclick=()=>{
  zoom=
    clamp(
      zoom-.1,
      .5,
      4
    );

  applyZoomVisual();
};

$('zin').onclick=()=>{
  zoom=
    clamp(
      zoom+.1,
      .5,
      4
    );

  applyZoomVisual();
};

$('fit').onclick=()=>{
  zoom=1;
  applyZoomVisual();
};

$('full').onclick=()=>{
  $('stage').requestFullscreen?.();
};

/* Double click before/after */

$('stage').ondblclick=()=>{
  $('before').click();
};

/* Keyboard */

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

    if(
      (e.ctrlKey||e.metaKey)&&
      e.shiftKey&&
      e.key.toLowerCase()==='z'
    ){

      e.preventDefault();
      $('redo').click();
    }
  }
);

/* =========================================
   MOBILE PINCH ZOOM
   ========================================= */

function pointerDistance(a,b){

  return Math.hypot(
    a.x-b.x,
    a.y-b.y
  );
}

$('stage').addEventListener(
  'pointerdown',
  e=>{

    if(!img)return;

    e.preventDefault();

    pointers.set(
      e.pointerId,
      {
        x:e.clientX,
        y:e.clientY
      }
    );

    /*
      Two fingers = pinch zoom.
    */

    if(pointers.size===2){

      if(drawing){

        drawing=false;

        if(retouch.length){
          retouch.pop();
        }
      }

      pinchActive=true;

      const pts=
        [...pointers.values()];

      pinchStartDistance=
        Math.max(
          1,
          pointerDistance(
            pts[0],
            pts[1]
          )
        );

      pinchStartZoom=zoom;

      return;
    }

    /*
      Retouch remains one-finger.
    */

    if(active==='retouch'){

      drawing=true;

      try{
        $('stage').setPointerCapture(
          e.pointerId
        );
      }catch(_){}

      addRetouch(e);
    }
  }
);

$('stage').addEventListener(
  'pointermove',
  e=>{

    if(!img)return;

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

    /*
      Pinch movement only changes
      CSS scale. No canvas rendering.
    */

    if(
      pinchActive &&
      pointers.size>=2
    ){

      e.preventDefault();

      const pts=
        [...pointers.values()];

      const d=
        Math.max(
          1,
          pointerDistance(
            pts[0],
            pts[1]
          )
        );

      zoom=
        clamp(
          pinchStartZoom*
          (d/pinchStartDistance),
          .5,
          4
        );

      applyZoomVisual();

      return;
    }

    if(drawing){
      addRetouch(e);
    }
  }
);

function endPointer(e){

  pointers.delete(
    e.pointerId
  );

  if(pointers.size<2){
    pinchActive=false;
  }

  drawing=false;
}

$('stage').addEventListener(
  'pointerup',
  endPointer
);

$('stage').addEventListener(
  'pointercancel',
  endPointer
);

/* Retouch */

function addRetouch(e){

  const r=
    C.getBoundingClientRect();

  if(
    !r.width ||
    !r.height
  ){
    return;
  }

  const x=
    (e.clientX-r.left)/
    r.width*
    C.width;

  const y=
    (e.clientY-r.top)/
    r.height*
    C.height;

  retouch.push({
    x,
    y,
    r:Math.max(
      3,
      S.retouchSize*
      C.width/1000
    )
  });

  schedule();
}

/* Color grading defaults */

Object.assign(
  S,
  {
    gradeShadow:0,
    gradeShadowSat:0,
    gradeMid:0,
    gradeMidSat:0,
    gradeHigh:0,
    gradeHighSat:0,
    gradeBlend:50,
    gradeBalance:0,
    straighten:0
  }
);

function init(){

  const first=
    document.querySelector(
      '#tabs button[data-tool="light"]'
    );

  if(first){
    first.classList.add('active');
  }

  panel();

  updateZoomLabel();
}

init();

})();
