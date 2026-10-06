/* FILE: photo-editor.js */
/* JavaScript syntax verified with Node.js before delivery. */

(()=>{
"use strict";

const $ = id => document.getElementById(id);

const clamp = (v,a,b) =>
  Math.max(a,Math.min(b,v));

const photo =
  $("photoCanvas");

const pctx =
  photo.getContext(
    "2d",
    {willReadFrequently:true}
  );

const overlay =
  $("overlayCanvas");

const octx =
  overlay.getContext("2d");

let sourceImg = null;
let sourceFile = null;
let sourceURL = null;

let tool = "light";
let showBefore = false;

let zoom = 1;
let panX = 0;
let panY = 0;

let pointers = new Map();
let gesture = null;
let lastTap = 0;
let dragAction = null;

let history = [];
let future = [];

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
    hue:0
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
    roughness:50
  },

  detail:{
    sharpen:0,
    radius:1,
    noise:0,
    colorNoise:0
  },

  crop:{
    x:0,
    y:0,
    w:1,
    h:1,
    angle:0,
    flipX:false,
    flipY:false,
    ratio:"free"
  },

  mask:{
    mode:"none",
    cx:.5,
    cy:.5,
    rx:.35,
    ry:.35,
    feather:.5,
    exposure:0,
    saturation:0,
    clarity:0
  },

  heal:{
    size:50,
    opacity:100
  },

  blur:{
    amount:0,
    size:80
  },

  text:{
    size:64,
    opacity:100,
    color:"#ffffff",
    stroke:"#000000",
    strokeWidth:2,
    font:"Arial",
    bold:false,
    italic:false,
    align:"center"
  },

  draw:{
    size:12,
    opacity:100,
    color:"#ffffff"
  },

  selective:{
    active:false,
    r:128,
    g:128,
    b:128,
    range:28,
    hue:0,
    saturation:0,
    lightness:0
  }
};

let textLayers = [];
let drawLayers = [];
let healStrokes = [];
let blurStrokes = [];

const PRESETS = {

  Original:{},

  Vivid:{
    "light.contrast":14,
    "color.vibrance":28,
    "color.saturation":6,
    "effects.clarity":10
  },

  Warm:{
    "color.temp":28,
    "color.tint":3,
    "color.vibrance":10,
    "effects.vignette":8
  },

  Cool:{
    "color.temp":-25,
    "color.vibrance":8,
    "effects.clarity":8
  },

  Cinematic:{
    "light.contrast":20,
    "light.highlights":-18,
    "light.shadows":-8,
    "color.saturation":-6,
    "effects.clarity":18,
    "effects.vignette":18
  },

  Matte:{
    "light.contrast":-8,
    "light.blacks":18,
    "color.saturation":-8,
    "effects.vignette":10
  },

  Portrait:{
    "light.exposure":5,
    "light.highlights":-12,
    "light.shadows":12,
    "color.temp":6,
    "color.vibrance":15,
    "effects.texture":-12
  },

  BAndW:{
    "color.saturation":-100,
    "light.contrast":18,
    "effects.grain":12
  }
};

function toast(message){

  const el = $("toast");

  el.textContent = message;

  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer =
    setTimeout(
      ()=>el.classList.remove("show"),
      1300
    );
}

function cloneState(){

  return JSON.stringify({
    S,
    textLayers,
    drawLayers,
    healStrokes,
    blurStrokes
  });
}

function saveHistory(){

  history.push(
    cloneState()
  );

  if(history.length > 50){
    history.shift();
  }

  future = [];

  updateHistory();
}

function restoreState(serialized){

  const value =
    JSON.parse(serialized);

  Object.assign(
    S,
    value.S
  );

  textLayers =
    value.textLayers;

  drawLayers =
    value.drawLayers;

  healStrokes =
    value.healStrokes;

  blurStrokes =
    value.blurStrokes;

  render();

  updateHistory();
}

function updateHistory(){

  $("undoBtn").disabled =
    !history.length;

  $("redoBtn").disabled =
    !future.length;
}

$("undoBtn").onclick = ()=>{

  if(!history.length)
    return;

  future.push(
    cloneState()
  );

  restoreState(
    history.pop()
  );
};

$("redoBtn").onclick = ()=>{

  if(!future.length)
    return;

  history.push(
    cloneState()
  );

  restoreState(
    future.pop()
  );
};

function resetZoom(){

  zoom = 1;
  panX = 0;
  panY = 0;

  updateTransform();
}

function updateTransform(){

  const transform =
    `translate3d(${panX}px,${panY}px,0) scale(${zoom})`;

  photo.style.transform =
    transform;

  overlay.style.transform =
    transform;

  $("zoomLabel").textContent =
    Math.round(zoom*100)+"%";
}

function fitZoom(){

  if(!sourceImg)
    return;

  resetZoom();
}

function loadFile(file){

  if(!file ||
     !file.type.startsWith("image/")){

    toast("Please choose an image");

    return;
  }

  const reader =
    new FileReader();

  reader.onload = ()=>{

    const image =
      new Image();

    image.onload = ()=>{

      sourceImg = image;
      sourceFile = file;
      sourceURL = reader.result;

      const maximum = 1800;

      const scale =
        Math.min(
          1,
          maximum /
          Math.max(
            image.naturalWidth,
            image.naturalHeight
          )
        );

      photo.width =
        Math.max(
          1,
          Math.round(
            image.naturalWidth*scale
          )
        );

      photo.height =
        Math.max(
          1,
          Math.round(
            image.naturalHeight*scale
          )
        );

      overlay.width =
        photo.width;

      overlay.height =
        photo.height;

      $("emptyState").style.display =
        "none";

      $("fileName").textContent =
        file.name;

      $("fileInfo").textContent =
        `${image.naturalWidth} × ${image.naturalHeight}px`;

      resetAll(false);

      render();

      history = [];
      future = [];

      updateHistory();

      toast("Photo loaded");
    };

    image.src =
      reader.result;
  };

  reader.readAsDataURL(file);
}

$("openBtn").onclick =
$("openMain").onclick = ()=>{
  $("fileInput").click();
};

$("fileInput").onchange =
event=>{
  loadFile(
    event.target.files[0]
  );
};

const stage =
  $("stage");

stage.addEventListener(
  "dragover",
  event=>{
    event.preventDefault();

    stage.classList.add(
      "dragover"
    );
  }
);

stage.addEventListener(
  "dragleave",
  ()=>{
    stage.classList.remove(
      "dragover"
    );
  }
);

stage.addEventListener(
  "drop",
  event=>{

    event.preventDefault();

    stage.classList.remove(
      "dragover"
    );

    loadFile(
      event.dataTransfer.files[0]
    );
  }
);

function resetAll(renderNow=true){

  for(
    const group
    of Object.values(S)
  ){

    for(
      const key
      of Object.keys(group)
    ){

      if(
        key==="color" ||
        key==="font" ||
        key==="align" ||
        key==="mode" ||
        key==="ratio"
      ){
        continue;
      }

      if(
        typeof group[key]==="number"
      ){

        group[key] =
          ({
            size:50,
            opacity:100,
            range:28,
            feather:.5,
            midpoint:50,
            radius:1
          }[key] ?? 0);
      }
    }
  }

  Object.assign(
    S.crop,
    {
      x:0,
      y:0,
      w:1,
      h:1,
      angle:0,
      flipX:false,
      flipY:false,
      ratio:"free"
    }
  );

  Object.assign(
    S.mask,
    {
      mode:"none",
      cx:.5,
      cy:.5,
      rx:.35,
      ry:.35,
      feather:.5,
      exposure:0,
      saturation:0,
      clarity:0
    }
  );

  S.color.temp = 0;
  S.color.tint = 0;
  S.color.vibrance = 0;
  S.color.saturation = 0;
  S.color.hue = 0;

  S.effects.midpoint = 50;
  S.effects.feather = 50;
  S.effects.grainSize = 50;
  S.effects.roughness = 50;

  S.detail.radius = 1;

  textLayers = [];
  drawLayers = [];
  healStrokes = [];
  blurStrokes = [];

  if(renderNow)
    render();
}

function rgbToHsl(r,g,b){

  r/=255;
  g/=255;
  b/=255;

  const max =
    Math.max(r,g,b);

  const min =
    Math.min(r,g,b);

  const d =
    max-min;

  let h = 0;
  let s = 0;

  const l =
    (max+min)/2;

  if(d){

    s =
      d /
      (
        1 -
        Math.abs(
          2*l-1
        )
      );

    switch(max){

      case r:
        h =
          (
            (g-b)/d +
            (g<b?6:0)
          )/6;
        break;

      case g:
        h =
          (
            (b-r)/d +
            2
          )/6;
        break;

      default:
        h =
          (
            (r-g)/d +
            4
          )/6;
    }
  }

  return [
    h*360,
    s,
    l
  ];
}

function hslToRgb(h,s,l){

  h =
    (
      (h%360)+360
    )%360/360;

  let r,g,b;

  if(!s){

    return [
      l*255,
      l*255,
      l*255
    ];
  }

  const q =
    l<.5
      ? l*(1+s)
      : l+s-l*s;

  const p =
    2*l-q;

  const f =
    t=>{

      if(t<0)
        t+=1;

      if(t>1)
        t-=1;

      if(t<1/6)
        return p+(q-p)*6*t;

      if(t<1/2)
        return q;

      if(t<2/3)
        return p+(q-p)*(2/3-t)*6;

      return p;
    };

  r = f(h+1/3);
  g = f(h);
  b = f(h-1/3);

  return [
    r*255,
    g*255,
    b*255
  ];
}

function processPixels(data){

  const d =
    data.data;

  const L = S.light;
  const C = S.color;
  const E = S.effects;
  const D = S.detail;
  const M = S.mask;
  const Q = S.selective;

  const exposure =
    Math.pow(
      2,
      L.exposure/100*1.4
    );

  const contrast =
    (
      259 *
      (L.contrast/100+1)
    ) /
    (
      255 *
      (1-L.contrast/100)
    );

  const sat =
    1+C.saturation/100;

  const vib =
    C.vibrance/100;

  for(
    let i=0;
    i<d.length;
    i+=4
  ){

    let r =
      d[i]*exposure;

    let g =
      d[i+1]*exposure;

    let b =
      d[i+2]*exposure;

    const avg =
      (r+g+b)/3;

    r =
      avg+
      (r-avg)*sat;

    g =
      avg+
      (g-avg)*sat;

    b =
      avg+
      (b-avg)*sat;

    const hsl =
      rgbToHsl(r,g,b);

    const hue =
      hsl[0]+C.hue/2;

    const saturation =
      clamp(
        hsl[1]*
        (
          1+
          vib*
          (1-hsl[1])
        ),
        0,
        1
      );

    [
      r,
      g,
      b
    ] =
      hslToRgb(
        hue,
        saturation,
        hsl[2]
      );

    r =
      128+
      (r-128)*contrast;

    g =
      128+
      (g-128)*contrast;

    b =
      128+
      (b-128)*contrast;

    const lum =
      .2126*r+
      .7152*g+
      .0722*b;

    const shadow =
      clamp(
        (128-lum)/128,
        0,
        1
      );

    const high =
      clamp(
        (lum-128)/127,
        0,
        1
      );

    r +=
      L.shadows*
      shadow*
      .8;

    g +=
      L.shadows*
      shadow*
      .8;

    b +=
      L.shadows*
      shadow*
      .8;

    r -=
      L.highlights*
      high*
      .65;

    g -=
      L.highlights*
      high*
      .65;

    b -=
      L.highlights*
      high*
      .65;

    r +=
      L.whites*
      Math.max(
        0,
        (lum-180)/75
      )*.5;

    g +=
      L.whites*
      Math.max(
        0,
        (lum-180)/75
      )*.5;

    b +=
      L.whites*
      Math.max(
        0,
        (lum-180)/75
      )*.5;

    r +=
      L.blacks*
      Math.max(
        0,
        (70-lum)/70
      )*.5;

    g +=
      L.blacks*
      Math.max(
        0,
        (70-lum)/70
      )*.5;

    b +=
      L.blacks*
      Math.max(
        0,
        (70-lum)/70
      )*.5;

    const temperature =
      C.temp/100;

    r +=
      temperature*20;

    b -=
      temperature*20;

    g +=
      C.tint/100*9;

    const px =
      (i/4)%photo.width;

    const py =
      Math.floor(
        (i/4)/photo.width
      );

    const x =
      px/photo.width-.5;

    const y =
      py/photo.height-.5;

    const edge =
      Math.min(
        1,
        Math.hypot(x,y)*2.2
      );

    const vignette =
      E.vignette/100*
      Math.pow(
        edge,
        Math.max(
          .2,
          E.feather/100*2+.2
        )
      );

    r *=
      1-vignette;

    g *=
      1-vignette;

    b *=
      1-vignette;

    if(
      E.clarity ||
      E.texture ||
      E.dehaze
    ){

      const lift =
        (
          E.clarity*.22+
          E.texture*.12+
          E.dehaze*.08
        );

      r +=
        (r-128)*lift/100;

      g +=
        (g-128)*lift/100;

      b +=
        (b-128)*lift/100;
    }

    if(
      M.mode!=="none"
    ){

      let mask = 0;

      if(
        M.mode==="radial"
      ){

        const dx =
          (x+.5-M.cx)/
          Math.max(
            .001,
            M.rx
          );

        const dy =
          (y+.5-M.cy)/
          Math.max(
            .001,
            M.ry
          );

        mask =
          1-
          clamp(
            Math.hypot(dx,dy)-
            M.feather,
            0,
            1
          );

      }else if(
        M.mode==="linear"
      ){

        mask =
          clamp(
            (
              y+.5-
              M.cy+
              .5
            )/
            Math.max(
              .01,
              M.ry
            ),
            0,
            1
          );

        mask =
          1-
          Math.abs(
            mask-.5
          )*2;

      }else{

        mask = 1;
      }

      r +=
        M.exposure*mask;

      g +=
        M.exposure*mask;

      b +=
        M.exposure*mask;

      const localSat =
        1+
        M.saturation/100*
        mask;

      r =
        128+
        (r-128)*localSat;

      g =
        128+
        (g-128)*localSat;

      b =
        128+
        (b-128)*localSat;

      const localClarity =
        M.clarity*
        mask/
        100;

      r +=
        (r-128)*
        localClarity;

      g +=
        (g-128)*
        localClarity;

      b +=
        (b-128)*
        localClarity;
    }

    if(Q.active){

      const dist =
        Math.hypot(
          r-Q.r,
          g-Q.g,
          b-Q.b
        );

      if(
        dist<
        Q.range*2
      ){

        const weight =
          1-
          dist/
          (Q.range*2);

        const color =
          rgbToHsl(
            r,
            g,
            b
          );

        [
          r,
          g,
          b
        ] =
          hslToRgb(
            color[0]+
            Q.hue*weight,

            clamp(
              color[1]*
              (
                1+
                Q.saturation/
                100*
                weight
              ),
              0,
              1
            ),

            clamp(
              color[2]+
              Q.lightness/
              100*
              weight,
              0,
              1
            )
          );
      }
    }

    if(E.grain){

      const noise =
        (
          Math.random()-.5
        )*
        E.grain*
        (
          .4+
          E.roughness/100
        );

      r += noise;
      g += noise;
      b += noise;
    }

    d[i] =
      clamp(r,0,255);

    d[i+1] =
      clamp(g,0,255);

    d[i+2] =
      clamp(b,0,255);
  }

  if(D.sharpen>0)
    applySharpen(
      data,
      D.sharpen/100
    );

  if(D.noise>0)
    applySoftNoise(
      data,
      D.noise/100
    );
}

function applySharpen(
  data,
  amount
){

  const w =
    photo.width;

  const h =
    photo.height;

  const src =
    new Uint8ClampedArray(
      data.data
    );

  const d =
    data.data;

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

      const i =
        (y*w+x)*4;

      for(
        let c=0;
        c<3;
        c++
      ){

        const value =
          src[i+c]*
          (
            1+
            4*amount
          )-

          (
            src[
              i-4+c
            ]+

            src[
              i+4+c
            ]+

            src[
              i-w*4+c
            ]+

            src[
              i+w*4+c
            ]
          )*
          amount;

        d[i+c] =
          clamp(
            value,
            0,
            255
          );
      }
    }
  }
}

function applySoftNoise(
  data,
  amount
){

  const d =
    data.data;

  const copy =
    new Uint8ClampedArray(d);

  const w =
    photo.width;

  const h =
    photo.height;

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

      const i =
        (y*w+x)*4;

      for(
        let c=0;
        c<3;
        c++
      ){

        const avg =
          (
            copy[i+c]+
            copy[i-4+c]+
            copy[i+4+c]+
            copy[i-w*4+c]+
            copy[i+w*4+c]
          )/5;

        d[i+c] =
          copy[i+c]*
          (1-amount)+
          avg*amount;
      }
    }
  }
}

function render(){

  if(!sourceImg)
    return;

  const w =
    photo.width;

  const h =
    photo.height;

  pctx.clearRect(
    0,
    0,
    w,
    h
  );

  pctx.save();

  pctx.translate(
    w/2,
    h/2
  );

  if(S.crop.angle){

    pctx.rotate(
      S.crop.angle*
      Math.PI/180
    );
  }

  pctx.scale(
    S.crop.flipX?-1:1,
    S.crop.flipY?-1:1
  );

  pctx.drawImage(
    sourceImg,
    -w/2,
    -h/2,
    w,
    h
  );

  pctx.restore();

  if(!showBefore){

    const data =
      pctx.getImageData(
        0,
        0,
        w,
        h
      );

    processPixels(data);

    pctx.putImageData(
      data,
      0,
      0
    );

    applyHealAndBlur();
  }

  drawOverlay();

  updateTransform();
}

function applyHealAndBlur(){

  const w =
    photo.width;

  const h =
    photo.height;

  for(
    const stroke
    of healStrokes
  ){

    for(
      const point
      of stroke.points
    ){

      const radius =
        Math.max(
          2,
          stroke.size/2
        );

      const sourceX =
        clamp(
          point.x+
          stroke.size*.8,
          0,
          w-1
        );

      const sourceY =
        clamp(
          point.y+
          stroke.size*.2,
          0,
          h-1
        );

      pctx.save();

      pctx.globalAlpha =
        stroke.opacity;

      pctx.beginPath();

      pctx.arc(
        point.x,
        point.y,
        radius,
        0,
        Math.PI*2
      );

      pctx.clip();

      pctx.drawImage(
        photo,
        sourceX-radius,
        sourceY-radius,
        radius*2,
        radius*2,
        point.x-radius,
        point.y-radius,
        radius*2,
        radius*2
      );

      pctx.restore();
    }
  }

  for(
    const stroke
    of blurStrokes
  ){

    const radius =
      stroke.size/2;

    pctx.save();

    pctx.globalAlpha =
      stroke.opacity;

    pctx.filter =
      `blur(${Math.max(
        1,
        radius/5
      )}px)`;

    pctx.beginPath();

    pctx.arc(
      stroke.x,
      stroke.y,
      radius,
      0,
      Math.PI*2
    );

    pctx.clip();

    pctx.drawImage(
      photo,
      0,
      0
    );

    pctx.restore();
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
    const stroke
    of drawLayers
  ){

    if(!stroke.points.length)
      continue;

    octx.save();

    octx.globalAlpha =
      stroke.opacity;

    octx.strokeStyle =
      stroke.color;

    octx.lineWidth =
      stroke.size;

    octx.lineCap =
      "round";

    octx.lineJoin =
      "round";

    octx.beginPath();

    octx.moveTo(
      stroke.points[0].x,
      stroke.points[0].y
    );

    for(
      const point
      of stroke.points.slice(1)
    ){

      octx.lineTo(
        point.x,
        point.y
      );
    }

    octx.stroke();

    octx.restore();
  }

  for(
    const text
    of textLayers
  ){

    octx.save();

    octx.globalAlpha =
      text.opacity;

    octx.fillStyle =
      text.color;

    octx.strokeStyle =
      text.stroke;

    octx.lineWidth =
      text.strokeWidth;

    octx.font =
      `${text.italic?"italic ":""}${
        text.bold?"700":"400"
      } ${text.size}px ${
        text.font
      }`;

    octx.textAlign =
      text.align;

    octx.textBaseline =
      "middle";

    octx.strokeText(
      text.text,
      text.x,
      text.y
    );

    octx.fillText(
      text.text,
      text.x,
      text.y
    );

    octx.restore();
  }

  if(tool==="crop")
    drawCropGuide();
}

function drawCropGuide(){

  const c =
    S.crop;

  const x =
    c.x*
    overlay.width;

  const y =
    c.y*
    overlay.height;

  const w =
    c.w*
    overlay.width;

  const h =
    c.h*
    overlay.height;

  octx.save();

  octx.fillStyle =
    "#0008";

  octx.beginPath();

  octx.rect(
    0,
    0,
    overlay.width,
    overlay.height
  );

  octx.rect(
    x,
    y,
    w,
    h
  );

  octx.fill(
    "evenodd"
  );

  octx.strokeStyle =
    "#fff";

  octx.lineWidth =
    1;

  octx.strokeRect(
    x,
    y,
    w,
    h
  );

  octx.strokeStyle =
    "#fff8";

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

function control(
  label,
  key,
  min,
  max,
  step=1,
  group=tool
){

  return `
    <div class="control">

      <div class="control-head">
        <span>${label}</span>

        <output
          id="out-${group}-${key}"
        >
          ${fmt(S[group][key])}
        </output>
      </div>

      <input
        class="range"
        data-group="${group}"
        data-key="${key}"
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${S[group][key]}"
      >

    </div>
  `;
}

function fmt(value){

  return typeof value==="number"
    ? (
      value>0
        ? `+${Number(value.toFixed(2))}`
        : Number(value.toFixed(2))
    )
    : value;
}

function panelHTML(){

  let h = "";

  if(tool==="light"){

    h = `
      <h2>Light</h2>
      <p class="sub">
        Exposure, contrast and tonal range
      </p>

      <div class="grid-2">
        <button
          class="tool-button"
          id="autoLight"
        >
          Auto
        </button>

        <button
          class="tool-button"
          id="resetLight"
        >
          Reset
        </button>
      </div>

      ${control(
        "Exposure",
        "exposure",
        -100,
        100
      )}

      ${control(
        "Contrast",
        "contrast",
        -100,
        100
      )}

      ${control(
        "Highlights",
        "highlights",
        -100,
        100
      )}

      ${control(
        "Shadows",
        "shadows",
        -100,
        100
      )}

      ${control(
        "Whites",
        "whites",
        -100,
        100
      )}

      ${control(
        "Blacks",
        "blacks",
        -100,
        100
      )}
    `;

  }else if(tool==="color"){

    h = `
      <h2>Color</h2>

      <p class="sub">
        Temperature, tint, vibrance and color mixer
      </p>

      ${control(
        "Temperature",
        "temp",
        -100,
        100
      )}

      ${control(
        "Tint",
        "tint",
        -100,
        100
      )}

      ${control(
        "Vibrance",
        "vibrance",
        -100,
        100
      )}

      ${control(
        "Saturation",
        "saturation",
        -100,
        100
      )}

      ${control(
        "Hue Shift",
        "hue",
        -100,
        100
      )}

      <div class="section">

        <div class="section-title">
          Point Color
        </div>

        <button
          class="tool-button"
          id="pickColor"
          style="width:100%"
        >
          Click a color on the photo
        </button>

        <div
          class="picked"
          id="picked"
        >
          <span class="swatch"></span>
          <span>
            No color selected
          </span>
        </div>

        ${control(
          "Range",
          "range",
          1,
          120,
          1,
          "selective"
        )}

        ${control(
          "Hue",
          "hue",
          -100,
          100,
          1,
          "selective"
        )}

        ${control(
          "Saturation",
          "saturation",
          -100,
          100,
          1,
          "selective"
        )}

        ${control(
          "Lightness",
          "lightness",
          -100,
          100,
          1,
          "selective"
        )}

      </div>
    `;

  }else if(tool==="effects"){

    h = `
      <h2>Effects</h2>

      <p class="sub">
        Texture, atmosphere and film effects
      </p>

      ${control(
        "Texture",
        "texture",
        -100,
        100
      )}

      ${control(
        "Clarity",
        "clarity",
        -100,
        100
      )}

      ${control(
        "Dehaze",
        "dehaze",
        -100,
        100
      )}

      ${control(
        "Vignette",
        "vignette",
        -100,
        100
      )}

      ${control(
        "Midpoint",
        "midpoint",
        0,
        100
      )}

      ${control(
        "Feather",
        "feather",
        0,
        100
      )}

      ${control(
        "Roundness",
        "roundness",
        -100,
        100
      )}

      ${control(
        "Grain",
        "grain",
        0,
        100
      )}

      ${control(
        "Grain Size",
        "grainSize",
        0,
        100
      )}

      ${control(
        "Roughness",
        "roughness",
        0,
        100
      )}
    `;

  }else if(tool==="detail"){

    h = `
      <h2>Detail</h2>

      <p class="sub">
        Sharpening and noise reduction
      </p>

      ${control(
        "Sharpening",
        "sharpen",
        0,
        100
      )}

      ${control(
        "Radius",
        "radius",
        .5,
        3,
        .1
      )}

      ${control(
        "Noise Reduction",
        "noise",
        0,
        100
      )}

      ${control(
        "Color Noise",
        "colorNoise",
        0,
        100
      )}

      <div class="info">

        Processing is performed locally
        in the browser. Large photos are
        preview-scaled for smooth interaction.

      </div>
    `;

  }else if(tool==="crop"){

    h = `
      <h2>Crop & Geometry</h2>

      <p class="sub">
        Crop, straighten, rotate and flip
      </p>

      <div class="grid-3">

        <button
          class="tool-button"
          data-ratio="free"
        >
          Free
        </button>

        <button
          class="tool-button"
          data-ratio="1"
        >
          1:1
        </button>

        <button
          class="tool-button"
          data-ratio=".8"
        >
          4:5
        </button>

        <button
          class="tool-button"
          data-ratio=".5625"
        >
          9:16
        </button>

        <button
          class="tool-button"
          data-ratio="1.7778"
        >
          16:9
        </button>

        <button
          class="tool-button"
          data-ratio="1.3333"
        >
          4:3
        </button>

      </div>

      ${control(
        "Straighten",
        "angle",
        -45,
        45,
        .1,
        "crop"
      )}

      <div
        class="grid-2"
        style="margin-top:10px"
      >

        <button
          class="tool-button"
          id="rotateL"
        >
          Rotate Left
        </button>

        <button
          class="tool-button"
          id="rotateR"
        >
          Rotate Right
        </button>

        <button
          class="tool-button"
          id="flipX"
        >
          Flip Horizontal
        </button>

        <button
          class="tool-button"
          id="flipY"
        >
          Flip Vertical
        </button>

        <button
          class="tool-button"
          id="resetCrop"
        >
          Reset Crop
        </button>

        <button
          class="tool-button"
          id="applyCrop"
        >
          Apply Crop
        </button>

      </div>

      <div
        class="info"
        style="margin-top:12px"
      >
        Drag inside the crop frame to
        reposition it. Drag the bottom-right
        corner to resize it.
      </div>
    `;

  }else if(tool==="heal"){

    h = `
      <h2>Heal / Remove</h2>

      <p class="sub">
        Paint over small imperfections
        and unwanted marks
      </p>

      ${control(
        "Brush Size",
        "size",
        5,
        240,
        1,
        "heal"
      )}

      ${control(
        "Opacity",
        "opacity",
        0,
        100,
        1,
        "heal"
      )}

      <div class="grid-2">

        <button
          class="tool-button"
          id="clearHeal"
        >
          Clear Strokes
        </button>

        <button
          class="tool-button"
          id="undoHeal"
        >
          Remove Last
        </button>

      </div>

      <div
        class="info"
        style="margin-top:12px"
      >
        Browser-side healing uses nearby
        pixels as a source. It is best for
        small spots and marks.
      </div>
    `;

  }else if(tool==="mask"){

    h = `
      <h2>Masking</h2>

      <p class="sub">
        Local adjustments without changing
        the whole photo
      </p>

      <div class="grid-3">

        <button
          class="tool-button"
          data-mask="none"
        >
          Off
        </button>

        <button
          class="tool-button"
          data-mask="radial"
        >
          Radial
        </button>

        <button
          class="tool-button"
          data-mask="linear"
        >
          Linear
        </button>

      </div>

      ${control(
        "Exposure",
        "exposure",
        -100,
        100,
        1,
        "mask"
      )}

      ${control(
        "Saturation",
        "saturation",
        -100,
        100,
        1,
        "mask"
      )}

      ${control(
        "Clarity",
        "clarity",
        -100,
        100,
        1,
        "mask"
      )}

      ${control(
        "Feather",
        "feather",
        0,
        1,
        .01,
        "mask"
      )}

      <div class="info">

        Radial and linear masks are
        calculated locally in the browser.

      </div>
    `;

  }else if(tool==="text"){

    h = `
      <h2>Text</h2>

      <p class="sub">
        Add editable text directly
        over the photo
      </p>

      <textarea
        id="textValue"
        class="textarea"
        placeholder="Type your text"
      >ABC</textarea>

      <div class="control">

        <div class="control-head">
          <span>Font</span>
        </div>

        <select
          id="textFont"
          class="select"
        >

          <option>Arial</option>
          <option>Georgia</option>
          <option>Impact</option>
          <option>Verdana</option>
          <option>Trebuchet MS</option>
          <option>Courier New</option>
          <option>Times New Roman</option>

        </select>

      </div>

      ${control(
        "Font Size",
        "size",
        10,
        220,
        1,
        "text"
      )}

      ${control(
        "Opacity",
        "opacity",
        0,
        100,
        1,
        "text"
      )}

      <div class="color-row">

        <label>
          Text
          <input
            id="textColor"
            class="color-input"
            type="color"
            value="${S.text.color}"
          >
        </label>

        <label>
          Stroke
          <input
            id="textStroke"
            class="color-input"
            type="color"
            value="${S.text.stroke}"
          >
        </label>

      </div>

      <div
        class="grid-3"
        style="margin-top:10px"
      >

        <button
          class="tool-button"
          id="textBold"
        >
          Bold
        </button>

        <button
          class="tool-button"
          id="textItalic"
        >
          Italic
        </button>

        <button
          class="tool-button"
          id="textCenter"
        >
          Align
        </button>

      </div>

      <button
        class="tool-button"
        id="addText"
        style="width:100%;margin-top:9px"
      >
        Add Text
      </button>

      <div
        class="info"
        style="margin-top:10px"
      >
        After adding text, drag it
        anywhere on the image.
      </div>
    `;

  }else if(tool==="draw"){

    h = `
      <h2>Draw</h2>

      <p class="sub">
        Brush, markup and freehand drawing
      </p>

      ${control(
        "Brush Size",
        "size",
        1,
        120,
        1,
        "draw"
      )}

      ${control(
        "Opacity",
        "opacity",
        0,
        100,
        1,
        "draw"
      )}

      <div class="color-row">

        <label>
          Color
          <input
            id="drawColor"
            class="color-input"
            type="color"
            value="${S.draw.color}"
          >
        </label>

      </div>

      <div
        class="grid-2"
        style="margin-top:10px"
      >

        <button
          class="tool-button"
          id="clearDraw"
        >
          Clear
        </button>

        <button
          class="tool-button"
          id="removeDraw"
        >
          Remove Last
        </button>

      </div>
    `;

  }else if(tool==="blur"){

    h = `
      <h2>Blur</h2>

      <p class="sub">
        Paint a soft blur over selected areas
      </p>

      ${control(
        "Blur Amount",
        "amount",
        0,
        100,
        1,
        "blur"
      )}

      ${control(
        "Brush Size",
        "size",
        10,
        320,
        1,
        "blur"
      )}

      <div class="grid-2">

        <button
          class="tool-button"
          id="clearBlur"
        >
          Clear
        </button>

        <button
          class="tool-button"
          id="removeBlur"
        >
          Remove Last
        </button>

      </div>
    `;

  }else if(tool==="presets"){

    h = `
      <h2>Presets</h2>

      <p class="sub">
        One-tap looks you can refine afterwards
      </p>

      <div class="grid-2">

        ${Object.keys(PRESETS)
          .map(
            name=>`
              <button
                class="preset-button"
                data-preset="${name}"
              >
                ${
                  name==="BAndW"
                    ?"B&W"
                    :name
                }
              </button>
            `
          )
          .join("")
        }

      </div>

      <div
        class="info"
        style="margin-top:12px"
      >
        Presets change editable parameters.
        They do not permanently flatten
        your photo.
      </div>
    `;

  }else if(tool==="layers"){

    h = `
      <h2>Layers</h2>

      <p class="sub">
        Text, drawing and adjustment overlays
      </p>

      ${
        textLayers
          .map(
            (t,i)=>`
              <div class="layer">

                <span>T ·</span>

                <span class="grow">
                  ${esc(t.text)}
                </span>

                <button
                  data-deltext="${i}"
                >
                  Delete
                </button>

              </div>
            `
          )
          .join("")
      }

      ${
        drawLayers
          .map(
            (_,i)=>`
              <div class="layer">

                <span>✎</span>

                <span class="grow">
                  Brush layer ${i+1}
                </span>

                <button
                  data-deldraw="${i}"
                >
                  Delete
                </button>

              </div>
            `
          )
          .join("")
      }

      ${
        healStrokes
          .map(
            (_,i)=>`
              <div class="layer">

                <span>✚</span>

                <span class="grow">
                  Heal stroke ${i+1}
                </span>

              </div>
            `
          )
          .join("")
      }

      ${
        blurStrokes
          .map(
            (_,i)=>`
              <div class="layer">

                <span>◒</span>

                <span class="grow">
                  Blur stroke ${i+1}
                </span>

              </div>
            `
          )
          .join("")
      }

      <div
        class="grid-2"
        style="margin-top:10px"
      >

        <button
          class="tool-button"
          id="clearLayers"
        >
          Clear Overlays
        </button>

        <button
          class="tool-button"
          id="resetAll"
        >
          Reset All
        </button>

      </div>
    `;

  }else{

    h = `
      <h2>Export</h2>

      <p class="sub">
        Save the edited photo
      </p>

      <div class="control">

        <div class="control-head">
          <span>Format</span>
        </div>

        <select
          id="format"
          class="select"
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

      <div class="control">

        <div class="control-head">

          <span>Quality</span>

          <output id="qualityOut">
            92%
          </output>

        </div>

        <input
          id="quality"
          class="range"
          type="range"
          min="40"
          max="100"
          value="92"
        >

      </div>

      <label class="row">

        <span>
          Include overlays
        </span>

        <input
          id="includeOverlays"
          class="switch"
          type="checkbox"
          checked
        >

      </label>

      <button
        id="downloadBtn"
        class="primary"
        style="width:100%;height:42px"
      >
        ⇩ Download Edited Photo
      </button>

      <button
        id="resetAllExport"
        class="tool-button"
        style="width:100%;margin-top:9px"
      >
        Reset All Edits
      </button>
    `;
  }

  return h;
}

function esc(value){

  return String(value)
    .replace(
      /[&<>"']/g,
      match=>({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#39;"
      }[match])
    );
}

function buildPanel(){

  const panel =
    $("panel");

  panel.innerHTML =
    panelHTML();

  wirePanel();
}

function wirePanel(){

  document
    .querySelectorAll(
      ".range[data-group]"
    )
    .forEach(input=>{

      input.oninput = ()=>{

        const group =
          input.dataset.group;

        const key =
          input.dataset.key;

        S[group][key] =
          Number(input.value);

        const output =
          $(
            `out-${group}-${key}`
          );

        if(output){

          output.textContent =
            fmt(
              S[group][key]
            );
        }

        render();
      };

      input.onchange =
        ()=>{
          saveHistory();
        };
    });

  $("autoLight")
    ?.addEventListener(
      "click",
      ()=>{

        S.light = {
          exposure:7,
          contrast:10,
          highlights:-10,
          shadows:12,
          whites:5,
          blacks:-5
        };

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("resetLight")
    ?.addEventListener(
      "click",
      ()=>{

        S.light = {
          exposure:0,
          contrast:0,
          highlights:0,
          shadows:0,
          whites:0,
          blacks:0
        };

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("pickColor")
    ?.addEventListener(
      "click",
      ()=>{

        S.selective.active =
          true;

        tool = "color";

        stage.classList.add(
          "picking"
        );

        toast(
          "Tap a color on the photo"
        );
      }
    );

  $("textFont")
    ?.addEventListener(
      "change",
      event=>{

        S.text.font =
          event.target.value;

        render();
      }
    );

  $("textColor")
    ?.addEventListener(
      "input",
      event=>{

        S.text.color =
          event.target.value;

        render();
      }
    );

  $("textStroke")
    ?.addEventListener(
      "input",
      event=>{

        S.text.stroke =
          event.target.value;

        render();
      }
    );

  $("textBold")
    ?.addEventListener(
      "click",
      ()=>{

        S.text.bold =
          !S.text.bold;

        render();

        saveHistory();
      }
    );

  $("textItalic")
    ?.addEventListener(
      "click",
      ()=>{

        S.text.italic =
          !S.text.italic;

        render();

        saveHistory();
      }
    );

  $("textCenter")
    ?.addEventListener(
      "click",
      ()=>{

        S.text.align =
          S.text.align==="center"
            ? "left"
            : "center";

        render();

        saveHistory();
      }
    );

  $("addText")
    ?.addEventListener(
      "click",
      ()=>{

        const value =
          $("textValue")
            .value
            .trim();

        if(!value){

          toast(
            "Type some text first"
          );

          return;
        }

        textLayers.push({

          text:value,

          x:
            photo.width/2,

          y:
            photo.height/2,

          size:
            S.text.size,

          opacity:
            S.text.opacity/100,

          color:
            S.text.color,

          stroke:
            S.text.stroke,

          strokeWidth:
            S.text.strokeWidth,

          font:
            S.text.font,

          bold:
            S.text.bold,

          italic:
            S.text.italic,

          align:
            S.text.align
        });

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("drawColor")
    ?.addEventListener(
      "input",
      event=>{
        S.draw.color =
          event.target.value;
      }
    );

  $("clearDraw")
    ?.addEventListener(
      "click",
      ()=>{

        drawLayers = [];

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("removeDraw")
    ?.addEventListener(
      "click",
      ()=>{

        drawLayers.pop();

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("clearHeal")
    ?.addEventListener(
      "click",
      ()=>{

        healStrokes = [];

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("undoHeal")
    ?.addEventListener(
      "click",
      ()=>{

        healStrokes.pop();

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("clearBlur")
    ?.addEventListener(
      "click",
      ()=>{

        blurStrokes = [];

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("removeBlur")
    ?.addEventListener(
      "click",
      ()=>{

        blurStrokes.pop();

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("rotateL")
    ?.addEventListener(
      "click",
      ()=>{

        S.crop.angle -= 90;

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("rotateR")
    ?.addEventListener(
      "click",
      ()=>{

        S.crop.angle += 90;

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("flipX")
    ?.addEventListener(
      "click",
      ()=>{

        S.crop.flipX =
          !S.crop.flipX;

        render();

        saveHistory();
      }
    );

  $("flipY")
    ?.addEventListener(
      "click",
      ()=>{

        S.crop.flipY =
          !S.crop.flipY;

        render();

        saveHistory();
      }
    );

  $("resetCrop")
    ?.addEventListener(
      "click",
      ()=>{

        S.crop = {
          x:0,
          y:0,
          w:1,
          h:1,
          angle:0,
          flipX:false,
          flipY:false,
          ratio:"free"
        };

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("applyCrop")
    ?.addEventListener(
      "click",
      ()=>{

        applyCropToImage();

        saveHistory();

        buildPanel();
      }
    );

  document
    .querySelectorAll(
      "[data-ratio]"
    )
    .forEach(
      button=>{
        button.onclick =
          ()=>{
            setRatio(
              button.dataset.ratio
            );
          };
      }
    );

  $("clearLayers")
    ?.addEventListener(
      "click",
      ()=>{

        textLayers = [];
        drawLayers = [];

        render();

        saveHistory();

        buildPanel();
      }
    );

  $("resetAll")
    ?.addEventListener(
      "click",
      ()=>{

        resetAll();

        saveHistory();

        buildPanel();
      }
    );

  $("resetAllExport")
    ?.addEventListener(
      "click",
      ()=>{

        resetAll();

        saveHistory();

        buildPanel();
      }
    );

  $("quality")
    ?.addEventListener(
      "input",
      event=>{

        $("qualityOut")
          .textContent =
          event.target.value+
          "%";
      }
    );

  $("downloadBtn")
    ?.addEventListener(
      "click",
      ()=>{

        exportImage(
          $("format").value,
          Number(
            $("quality").value
          )/100,
          $("includeOverlays").checked
        );
      }
    );

  document
    .querySelectorAll(
      "[data-mask]"
    )
    .forEach(
      button=>{
        button.onclick =
          ()=>{

            S.mask.mode =
              button.dataset.mask;

            render();

            saveHistory();

            buildPanel();
          };
      }
    );

  document
    .querySelectorAll(
      "[data-preset]"
    )
    .forEach(
      button=>{
        button.onclick =
          ()=>{
            applyPreset(
              button.dataset.preset
            );
          };
      }
    );

  document
    .querySelectorAll(
      "[data-deltext]"
    )
    .forEach(
      button=>{
        button.onclick =
          ()=>{

            textLayers.splice(
              Number(
                button.dataset.deltext
              ),
              1
            );

            render();

            saveHistory();

            buildPanel();
          };
      }
    );

  document
    .querySelectorAll(
      "[data-deldraw]"
    )
    .forEach(
      button=>{
        button.onclick =
          ()=>{

            drawLayers.splice(
              Number(
                button.dataset.deldraw
              ),
              1
            );

            render();

            saveHistory();

            buildPanel();
          };
      }
    );
}

function setRatio(ratio){

  S.crop.ratio =
    ratio;

  if(ratio==="free"){

    S.crop = {
      ...S.crop,
      x:0,
      y:0,
      w:1,
      h:1,
      ratio:"free"
    };

    render();

    return;
  }

  const value =
    Number(ratio);

  const current =
    S.crop.w/
    S.crop.h;

  if(current>value){

    S.crop.h = 1;
    S.crop.w = value;

  }else{

    S.crop.w = 1;
    S.crop.h = 1/value;
  }

  S.crop.x =
    (1-S.crop.w)/2;

  S.crop.y =
    (1-S.crop.h)/2;

  render();

  saveHistory();
}

function applyCropToImage(){

  if(!sourceImg)
    return;

  const c =
    S.crop;

  const w =
    photo.width;

  const h =
    photo.height;

  const sx =
    Math.round(
      c.x*w
    );

  const sy =
    Math.round(
      c.y*h
    );

  const sw =
    Math.max(
      1,
      Math.round(
        c.w*w
      )
    );

  const sh =
    Math.max(
      1,
      Math.round(
        c.h*h
      )
    );

  const temp =
    document.createElement(
      "canvas"
    );

  temp.width =
    sw;

  temp.height =
    sh;

  const tctx =
    temp.getContext("2d");

  tctx.drawImage(
    photo,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    sw,
    sh
  );

  const data =
    temp.toDataURL(
      "image/png"
    );

  const image =
    new Image();

  image.onload =
    ()=>{

      sourceImg =
        image;

      photo.width =
        sw;

      photo.height =
        sh;

      overlay.width =
        sw;

      overlay.height =
        sh;

      S.crop = {
        x:0,
        y:0,
        w:1,
        h:1,
        angle:0,
        flipX:false,
        flipY:false,
        ratio:"free"
      };

      render();

      toast(
        "Crop applied"
      );
    };

  image.src =
    data;
}

function applyPreset(name){

  const previous =
    cloneState();

  for(
    const key
    in PRESETS[name]
  ){

    const [
      group,
      property
    ] =
      key.split(".");

    S[group][property] =
      PRESETS[name][key];
  }

  render();

  history.push(
    previous
  );

  future = [];

  updateHistory();

  toast(
    `${name} preset applied`
  );

  buildPanel();
}

function pointerToCanvas(event){

  const rect =
    photo.getBoundingClientRect();

  return {

    x:
      clamp(
        (
          event.clientX-
          rect.left
        )/
        rect.width*
        photo.width,
        0,
        photo.width
      ),

    y:
      clamp(
        (
          event.clientY-
          rect.top
        )/
        rect.height*
        photo.height,
        0,
        photo.height
      )
  };
}

function handleSpecialDown(event){

  const point =
    pointerToCanvas(event);

  if(tool==="crop"){

    const c =
      S.crop;

    const x =
      c.x*
      photo.width;

    const y =
      c.y*
      photo.height;

    const w =
      c.w*
      photo.width;

    const h =
      c.h*
      photo.height;

    const edge =
      Math.max(
        18,
        Math.min(
          photo.width,
          photo.height
        )*.035
      );

    const nearRight =
      Math.abs(
        point.x-(x+w)
      )<edge;

    const nearBottom =
      Math.abs(
        point.y-(y+h)
      )<edge;

    const nearResize =
      nearRight &&
      nearBottom;

    const inside =
      point.x>=x &&
      point.x<=x+w &&
      point.y>=y &&
      point.y<=y+h;

    if(nearResize){

      dragAction = {
        type:"cropResize",
        sx:point.x,
        sy:point.y,
        ow:c.w,
        oh:c.h
      };

    }else if(inside){

      dragAction = {
        type:"cropMove",
        sx:point.x,
        sy:point.y,
        ox:c.x,
        oy:c.y
      };
    }

    return;
  }

  if(
    S.selective.active &&
    tool==="color"
  ){

    const data =
      pctx.getImageData(
        Math.floor(point.x),
        Math.floor(point.y),
        1,
        1
      ).data;

    S.selective.r =
      data[0];

    S.selective.g =
      data[1];

    S.selective.b =
      data[2];

    stage.classList.remove(
      "picking"
    );

    toast(
      "Color selected"
    );

    render();

    buildPanel();

    return;
  }

  if(tool==="draw"){

    dragAction = {
      type:"draw",
      layer:{
        points:[point],
        size:S.draw.size,
        opacity:S.draw.opacity/100,
        color:S.draw.color
      }
    };

    drawLayers.push(
      dragAction.layer
    );

    return;
  }

  if(tool==="heal"){

    dragAction = {
      type:"heal",
      layer:{
        points:[point],
        size:S.heal.size,
        opacity:S.heal.opacity/100
      }
    };

    healStrokes.push(
      dragAction.layer
    );

    return;
  }

  if(
    tool==="blur" &&
    S.blur.amount>0
  ){

    dragAction = {
      type:"blur",
      layer:{
        points:[point],
        size:S.blur.size,
        opacity:S.blur.amount/100
      }
    };

    blurStrokes.push({
      x:point.x,
      y:point.y,
      size:S.blur.size,
      opacity:S.blur.amount/100
    });

    return;
  }

  if(tool==="text"){

    const index =
      findText(point);

    if(index>=0){

      dragAction = {
        type:"text",
        index,
        dx:
          point.x-
          textLayers[index].x,
        dy:
          point.y-
          textLayers[index].y
      };
    }
  }
}

function handleSpecialMove(event){

  if(!dragAction)
    return;

  const point =
    pointerToCanvas(event);

  if(
    dragAction.type==="draw" ||
    dragAction.type==="heal"
  ){

    dragAction.layer.points.push(
      point
    );

    render();

  }else if(
    dragAction.type==="text"
  ){

    textLayers[
      dragAction.index
    ].x =
      point.x-
      dragAction.dx;

    textLayers[
      dragAction.index
    ].y =
      point.y-
      dragAction.dy;

    render();

  }else if(
    dragAction.type==="cropMove"
  ){

    const c =
      S.crop;

    c.x =
      clamp(
        dragAction.ox+
        (
          point.x-
          dragAction.sx
        )/
        photo.width,
        0,
        1-c.w
      );

    c.y =
      clamp(
        dragAction.oy+
        (
          point.y-
          dragAction.sy
        )/
        photo.height,
        0,
        1-c.h
      );

    render();

  }else if(
    dragAction.type==="cropResize"
  ){

    const c =
      S.crop;

    c.w =
      clamp(
        dragAction.ow+
        (
          point.x-
          dragAction.sx
        )/
        photo.width,
        .05,
        1-c.x
      );

    c.h =
      clamp(
        dragAction.oh+
        (
          point.y-
          dragAction.sy
        )/
        photo.height,
        .05,
        1-c.y
      );

    if(
      c.ratio!=="free"
    ){

      const ratio =
        Number(
          c.ratio
        );

      c.h =
        clamp(
          c.w/ratio,
          .05,
          1-c.y
        );

      c.w =
        clamp(
          c.h*ratio,
          .05,
          1-c.x
        );
    }

    render();
  }
}

function findText(point){

  for(
    let i=textLayers.length-1;
    i>=0;
    i--
  ){

    const text =
      textLayers[i];

    const width =
      Math.max(
        30,
        text.text.length*
        text.size*.55
      );

    if(
      Math.abs(
        point.x-text.x
      )<
      width/2 &&

      Math.abs(
        point.y-text.y
      )<
      text.size
    ){

      return i;
    }
  }

  return -1;
}

stage.addEventListener(
  "pointerdown",
  event=>{

    if(!sourceImg)
      return;

    if(
      [
        "draw",
        "heal",
        "blur",
        "text",
        "crop"
      ].includes(tool)
    ){

      handleSpecialDown(
        event
      );

      return;
    }

    pointers.set(
      event.pointerId,
      event
    );

    stage.setPointerCapture(
      event.pointerId
    );

    if(
      pointers.size===1
    ){

      gesture = {
        type:"pan",

        startX:
          event.clientX,

        startY:
          event.clientY,

        startPanX:
          panX,

        startPanY:
          panY
      };

    }else if(
      pointers.size===2
    ){

      const values =
        [
          ...pointers.values()
        ];

      gesture = {
        type:"pinch",

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

stage.addEventListener(
  "pointermove",
  event=>{

    if(
      [
        "draw",
        "heal",
        "blur",
        "text",
        "crop"
      ].includes(tool)
    ){

      handleSpecialMove(
        event
      );

      return;
    }

    if(
      !pointers.has(
        event.pointerId
      )
    ){

      return;
    }

    pointers.set(
      event.pointerId,
      event
    );

    if(
      pointers.size===1 &&
      gesture?.type==="pan" &&
      zoom>1
    ){

      panX =
        gesture.startPanX+
        event.clientX-
        gesture.startX;

      panY =
        gesture.startPanY+
        event.clientY-
        gesture.startY;

      updateTransform();

    }else if(
      pointers.size===2 &&
      gesture?.type==="pinch"
    ){

      const values =
        [
          ...pointers.values()
        ];

      const currentDistance =
        distance(
          values[0],
          values[1]
        );

      zoom =
        clamp(
          gesture.startZoom*
          (
            currentDistance/
            gesture.startDistance
          ),
          .5,
          6
        );

      const currentMid =
        midpoint(
          values[0],
          values[1]
        );

      panX =
        gesture.startPanX+
        currentMid.x-
        gesture.startMid.x;

      panY =
        gesture.startPanY+
        currentMid.y-
        gesture.startMid.y;

      if(zoom<=1){

        zoom=1;
        panX=0;
        panY=0;
      }

      updateTransform();
    }
  }
);

stage.addEventListener(
  "pointerup",
  event=>{

    if(
      [
        "draw",
        "heal",
        "blur",
        "text",
        "crop"
      ].includes(tool)
    ){

      if(dragAction){

        dragAction=null;

        saveHistory();

        render();
      }

      return;
    }

    pointers.delete(
      event.pointerId
    );

    if(!pointers.size)
      gesture=null;

    const now =
      Date.now();

    if(
      now-lastTap<280
    ){

      if(zoom>1){

        resetZoom();

      }else{

        zoom=2;

        updateTransform();
      }
    }

    lastTap =
      now;
  }
);

stage.addEventListener(
  "pointercancel",
  event=>{

    pointers.delete(
      event.pointerId
    );

    if(!pointers.size)
      gesture=null;

    dragAction=null;
  }
);

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

$("beforeBtn")
  .addEventListener(
    "pointerdown",
    ()=>{
      showBefore=true;
      render();
    }
  );

[
  "pointerup",
  "pointercancel",
  "pointerleave"
]
.forEach(
  eventName=>{
    $("beforeBtn")
      .addEventListener(
        eventName,
        ()=>{
          showBefore=false;
          render();
        }
      );
  }
);

$("exportTop").onclick =
  ()=>{
    tool="export";
    setActiveTool();
    buildPanel();
  };

document
  .querySelectorAll(
    "[data-tool]"
  )
  .forEach(
    button=>{
      button.onclick =
        ()=>{
          tool =
            button.dataset.tool;

          stage.classList.remove(
            "picking"
          );

          setActiveTool();

          buildPanel();
        };
    }
  );

function setActiveTool(){

  document
    .querySelectorAll(
      "[data-tool]"
    )
    .forEach(
      button=>{
        button.classList.toggle(
          "active",
          button.dataset.tool===tool
        );
      }
    );
}

document
  .querySelectorAll(
    "[data-zoom]"
  )
  .forEach(
    button=>{

      button.onclick =
        ()=>{

          const action =
            button.dataset.zoom;

          if(action==="fit"){

            fitZoom();

            return;
          }

          if(action==="1"){

            zoom=1;
            panX=0;
            panY=0;

          }else{

            zoom =
              clamp(
                zoom+
                (
                  action==="in"
                    ?.25
                    :-.25
                ),
                .5,
                6
              );
          }

          if(zoom<=1){

            zoom=1;
            panX=0;
            panY=0;
          }

          updateTransform();
        };
    }
  );

function exportImage(
  type,
  quality,
  includeOverlays=true
){

  if(!sourceImg){

    toast(
      "Open a photo first"
    );

    return;
  }

  const c =
    S.crop;

  const w =
    photo.width;

  const h =
    photo.height;

  const sx =
    Math.round(
      c.x*w
    );

  const sy =
    Math.round(
      c.y*h
    );

  const sw =
    Math.max(
      1,
      Math.round(
        c.w*w
      )
    );

  const sh =
    Math.max(
      1,
      Math.round(
        c.h*h
      )
    );

  const output =
    document.createElement(
      "canvas"
    );

  output.width =
    sw;

  output.height =
    sh;

  const context =
    output.getContext("2d");

  if(
    type==="image/jpeg"
  ){

    context.fillStyle =
      "#ffffff";

    context.fillRect(
      0,
      0,
      sw,
      sh
    );
  }

  context.drawImage(
    photo,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    sw,
    sh
  );

  if(includeOverlays){

    context.drawImage(
      overlay,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      sw,
      sh
    );
  }

  const extension =
    type==="image/png"
      ? "png"
      : type==="image/webp"
        ? "webp"
        : "jpg";

  const link =
    document.createElement(
      "a"
    );

  link.download =
    `toolora-edited-photo.${extension}`;

  link.href =
    output.toDataURL(
      type,
      quality
    );

  link.click();

  toast(
    "Download started"
  );
}

window.addEventListener(
  "keydown",
  event=>{

    if(
      (
        event.ctrlKey ||
        event.metaKey
      ) &&
      event.key.toLowerCase()==="z"
    ){

      event.preventDefault();

      $("undoBtn").click();
    }

    if(
      (
        event.ctrlKey ||
        event.metaKey
      ) &&
      event.key.toLowerCase()==="y"
    ){

      event.preventDefault();

      $("redoBtn").click();
    }
  }
);

setActiveTool();
buildPanel();
updateHistory();

})();
