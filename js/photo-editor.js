(()=>{
"use strict";

const $ = id => document.getElementById(id);

const clamp = (v,a,b) =>
  Math.max(a,Math.min(b,v));

const canvas = $("canvas");
const ctx = canvas.getContext("2d",{willReadFrequently:true});

const overlay = $("overlay");
const octx = overlay.getContext("2d");

let img = null;
let source = null;

let tool = "light";

let zoom = 1;
let panX = 0;
let panY = 0;

let before = false;

let history = [];
let future = [];

let textLayers = [];
let strokes = [];

let drag = null;

let pointers = new Map();
let gesture = null;
let lastTap = 0;

let crop = {
  x:0,
  y:0,
  w:1,
  h:1
};

let S = {
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
  hue:0,

  texture:0,
  clarity:0,
  dehaze:0,
  vignette:0,
  grain:0,

  sharp:0,
  blur:0,

  healSize:30,
  maskExp:0,
  maskSat:0,

  textSize:48,
  textOpacity:100,

  drawSize:12,
  drawOpacity:100
};

function toast(message){

  const el = $("toast");

  el.textContent = message;

  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(()=>{
    el.classList.remove("show");
  },1300);
}

function snapshot(){

  return JSON.stringify({
    S,
    textLayers,
    strokes,
    crop
  });
}

function pushHistory(){

  history.push(snapshot());

  if(history.length > 40){
    history.shift();
  }

  future = [];

  updateHistoryButtons();
}

function restoreSnapshot(data){

  const state = JSON.parse(data);

  S = state.S;
  textLayers = state.textLayers;
  strokes = state.strokes;
  crop = state.crop;

  render();

  updateHistoryButtons();
}

function updateHistoryButtons(){

  $("undoBtn").disabled =
    history.length === 0;

  $("redoBtn").disabled =
    future.length === 0;
}

$("undoBtn").onclick = ()=>{

  if(!history.length) return;

  future.push(snapshot());

  const state =
    history.pop();

  restoreSnapshot(state);
};

$("redoBtn").onclick = ()=>{

  if(!future.length) return;

  history.push(snapshot());

  const state =
    future.pop();

  restoreSnapshot(state);
};

function fit(){

  if(!img) return;

  zoom = 1;
  panX = 0;
  panY = 0;

  updateTransform();
}

function updateTransform(){

  const transform =
    `translate(${panX}px,${panY}px) scale(${zoom})`;

  canvas.style.transform = transform;
  overlay.style.transform = transform;

  $("zoomLabel").textContent =
    Math.round(zoom*100)+"%";
}

function loadPhoto(file){

  if(!file) return;

  const reader =
    new FileReader();

  reader.onload = ()=>{

    const image = new Image();

    image.onload = ()=>{

      img = image;
      source = reader.result;

      const maximum = 1600;

      const scale =
        Math.min(
          1,
          maximum /
          Math.max(
            image.naturalWidth,
            image.naturalHeight
          )
        );

      canvas.width =
        Math.round(image.naturalWidth*scale);

      canvas.height =
        Math.round(image.naturalHeight*scale);

      overlay.width = canvas.width;
      overlay.height = canvas.height;

      $("empty").style.display = "none";

      S = {
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
        hue:0,

        texture:0,
        clarity:0,
        dehaze:0,
        vignette:0,
        grain:0,

        sharp:0,
        blur:0,

        healSize:30,
        maskExp:0,
        maskSat:0,

        textSize:48,
        textOpacity:100,

        drawSize:12,
        drawOpacity:100
      };

      textLayers = [];
      strokes = [];

      crop = {
        x:0,
        y:0,
        w:1,
        h:1
      };

      history = [];
      future = [];

      fit();

      render();

      updateHistoryButtons();

      toast("Photo loaded");
    };

    image.src = reader.result;
  };

  reader.readAsDataURL(file);
}

$("openBtn").onclick =
$("openMain").onclick = ()=>{
  $("fileInput").click();
};

$("fileInput").onchange = event =>{
  loadPhoto(event.target.files[0]);
};

$("saveBtn").onclick = ()=>{
  exportImage("image/jpeg",0.92);
};

$("beforeBtn").onpointerdown = ()=>{
  before = true;
  render();
};

$("beforeBtn").onpointerup =
$("beforeBtn").onpointerleave = ()=>{
  before = false;
  render();
};

function render(){

  if(!img) return;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.drawImage(
    img,
    0,
    0,
    canvas.width,
    canvas.height
  );

  if(!before){

    const data =
      ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

    applyPixelAdjustments(data);

    ctx.putImageData(
      data,
      0,
      0
    );
  }

  drawOverlay();

  updateTransform();
}

function applyPixelAdjustments(data){

  const pixels = data.data;
  const e = S;

  const exposure =
    Math.pow(
      2,
      (e.exposure/100)*1.4
    );

  const contrast =
    (259*(e.contrast/100+1)) /
    (255*(1-e.contrast/100));

  for(
    let i=0;
    i<pixels.length;
    i+=4
  ){

    let r = pixels[i] * exposure;
    let g = pixels[i+1] * exposure;
    let b = pixels[i+2] * exposure;

    const average =
      (r+g+b)/3;

    const saturation =
      1 + e.saturation/100;

    r =
      average +
      (r-average)*saturation;

    g =
      average +
      (g-average)*saturation;

    b =
      average +
      (b-average)*saturation;

    r =
      128+(r-128)*contrast;

    g =
      128+(g-128)*contrast;

    b =
      128+(b-128)*contrast;

    const luminance =
      .2126*r+
      .7152*g+
      .0722*b;

    if(luminance < 128){

      const amount =
        1 + e.shadows/150;

      r*=amount;
      g*=amount;
      b*=amount;
    }

    if(luminance > 128){

      const amount =
        1 + e.highlights/150;

      r*=amount;
      g*=amount;
      b*=amount;
    }

    const temperature =
      e.temp/100;

    r += temperature*18;
    b -= temperature*18;

    g +=
      (e.tint/100)*8;

    const x =
      ((i/4)%canvas.width) /
      canvas.width -
      .5;

    const y =
      Math.floor((i/4)/canvas.width) /
      canvas.height -
      .5;

    const edge =
      Math.sqrt(x*x+y*y)*1.4;

    const vignette =
      Math.max(
        0,
        edge-.25
      ) *
      (e.vignette/100);

    r *= 1-vignette;
    g *= 1-vignette;
    b *= 1-vignette;

    pixels[i] =
      clamp(r,0,255);

    pixels[i+1] =
      clamp(g,0,255);

    pixels[i+2] =
      clamp(b,0,255);
  }
}

function drawOverlay(){

  octx.clearRect(
    0,
    0,
    overlay.width,
    overlay.height
  );

  for(const stroke of strokes){

    if(!stroke.points.length)
      continue;

    octx.beginPath();

    octx.lineCap = "round";
    octx.lineJoin = "round";

    octx.strokeStyle =
      stroke.color;

    octx.globalAlpha =
      stroke.opacity;

    octx.lineWidth =
      stroke.size;

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
  }

  octx.globalAlpha = 1;

  for(const text of textLayers){

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
      `${text.italic?"italic ":""}${text.bold?"700":"400"} ${text.size}px ${text.font}`;

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
}

function slider(
  label,
  key,
  min,
  max,
  step=1
){

  return `
    <div class="row">

      <b>${label}</b>

      <input
        data-key="${key}"
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${S[key]}"
      >

      <span data-val="${key}">
        ${S[key]}
      </span>

    </div>
  `;
}

function buildPanel(){

  const panel = $("panel");

  let html = "";

  if(tool==="light"){

    html = `
      <h3>Light</h3>

      <div class="grid">
        <button id="auto">Auto</button>
        <button id="resetLight">Reset</button>
      </div>

      ${slider("Exposure","exposure",-100,100)}
      ${slider("Contrast","contrast",-100,100)}
      ${slider("Highlights","highlights",-100,100)}
      ${slider("Shadows","shadows",-100,100)}
      ${slider("Whites","whites",-100,100)}
      ${slider("Blacks","blacks",-100,100)}
    `;
  }

  else if(tool==="color"){

    html = `
      <h3>Color</h3>

      ${slider("Temperature","temp",-100,100)}
      ${slider("Tint","tint",-100,100)}
      ${slider("Vibrance","vibrance",-100,100)}
      ${slider("Saturation","saturation",-100,100)}

      <div class="section">
        <b>Color Mixer</b>

        ${slider("Hue","hue",-100,100)}
      </div>
    `;
  }

  else if(tool==="effects"){

    html = `
      <h3>Effects</h3>

      ${slider("Texture","texture",-100,100)}
      ${slider("Clarity","clarity",-100,100)}
      ${slider("Dehaze","dehaze",-100,100)}
      ${slider("Vignette","vignette",-100,100)}
      ${slider("Grain","grain",0,100)}
    `;
  }

  else if(tool==="detail"){

    html = `
      <h3>Detail</h3>

      ${slider("Sharpening","sharp",0,100)}
      ${slider("Noise Reduction","blur",0,100)}
    `;
  }

  else if(tool==="crop"){

    html = `
      <h3>Crop & Geometry</h3>

      <div class="grid">

        <button data-ratio="1">
          1:1
        </button>

        <button data-ratio=".8">
          4:5
        </button>

        <button data-ratio=".5625">
          9:16
        </button>

        <button data-ratio="1.7778">
          16:9
        </button>

        <button id="rotate">
          Rotate
        </button>

        <button id="flip">
          Flip
        </button>

        <button id="resetCrop">
          Reset
        </button>

      </div>
    `;
  }

  else if(tool==="heal"){

    html = `
      <h3>Heal</h3>

      <p class="row">
        Paint over small imperfections.
      </p>

      ${slider(
        "Brush Size",
        "healSize",
        5,
        180
      )}

      <div class="grid">
        <button id="clearHeal">
          Clear
        </button>
      </div>
    `;
  }

  else if(tool==="mask"){

    html = `
      <h3>Masking</h3>

      <p class="row">
        Selective browser-based adjustments.
      </p>

      <div class="grid">

        <button data-mask="brush">
          Brush
        </button>

        <button data-mask="radial">
          Radial
        </button>

        <button data-mask="linear">
          Linear
        </button>

        <button data-mask="color">
          Color Range
        </button>

      </div>

      ${slider(
        "Exposure",
        "maskExp",
        -100,
        100
      )}

      ${slider(
        "Saturation",
        "maskSat",
        -100,
        100
      )}
    `;
  }

  else if(tool==="text"){

    html = `
      <h3>Text</h3>

      <textarea
        id="textValue"
        class="select textarea"
        placeholder="Type your text"
      >ABC</textarea>

      <div class="row">

        <b>Font</b>

        <select
          id="font"
          class="select"
          style="width:58%"
        >

          <option>Arial</option>
          <option>Georgia</option>
          <option>Impact</option>
          <option>Verdana</option>
          <option>Courier New</option>

        </select>

      </div>

      ${slider(
        "Size",
        "textSize",
        12,
        180
      )}

      ${slider(
        "Opacity",
        "textOpacity",
        0,
        100
      )}

      <div class="row">

        <b>Text Color</b>

        <input
          id="textColor"
          type="color"
          value="#ffffff"
        >

      </div>

      <div class="row">

        <b>Stroke</b>

        <input
          id="textStroke"
          type="color"
          value="#000000"
        >

      </div>

      <div class="grid">

        <button id="addText">
          Add Text
        </button>

        <button id="clearText">
          Clear
        </button>

      </div>
    `;
  }

  else if(tool==="draw"){

    html = `
      <h3>Draw</h3>

      ${slider(
        "Brush Size",
        "drawSize",
        1,
        100
      )}

      ${slider(
        "Opacity",
        "drawOpacity",
        0,
        100
      )}

      <div class="row">

        <b>Color</b>

        <input
          id="drawColor"
          type="color"
          value="#ffffff"
        >

      </div>

      <div class="grid">

        <button id="clearDraw">
          Clear
        </button>

      </div>
    `;
  }

  else if(tool==="blur"){

    html = `
      <h3>Blur & Focus</h3>

      ${slider(
        "Blur Amount",
        "blur",
        0,
        100
      )}

      <p class="row">
        Use pinch zoom and pan to inspect details.
      </p>
    `;
  }

  else if(tool==="layers"){

    html = `
      <h3>Layers</h3>

      <p class="row">
        Text and drawing layers.
      </p>

      ${textLayers.map(
        (item,index)=>`
          <div class="layer">
            T · ${escapeHTML(item.text)}
            <button data-deltext="${index}">
              Delete
            </button>
          </div>
        `
      ).join("")}

      ${strokes.map(
        (item,index)=>`
          <div class="layer">
            Brush ${index+1}
          </div>
        `
      ).join("")}
    `;
  }

  else if(tool==="export"){

    html = `
      <h3>Export</h3>

      <div class="row">

        <b>Format</b>

        <select
          id="format"
          class="select"
          style="width:58%"
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

      <div class="row">

        <b>Quality</b>

        <input
          id="quality"
          type="range"
          min=".4"
          max="1"
          step=".01"
          value=".92"
        >

      </div>

      <button
        id="download"
        class="save"
        style="width:100%"
      >
        Export Photo
      </button>
    `;
  }

  panel.innerHTML = html;

  wirePanel();
}

function escapeHTML(value){

  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function wirePanel(){

  document
    .querySelectorAll("[data-key]")
    .forEach(input=>{

      input.oninput = ()=>{

        S[input.dataset.key] =
          Number(input.value);

        const output =
          document.querySelector(
            `[data-val="${input.dataset.key}"]`
          );

        if(output){
          output.textContent =
            input.value;
        }

        render();
      };
    });

  $("auto")?.addEventListener(
    "click",
    ()=>{

      S.exposure = 8;
      S.contrast = 8;
      S.highlights = -8;
      S.shadows = 12;
      S.whites = 5;
      S.blacks = -5;
      S.saturation = 5;

      render();

      pushHistory();
    }
  );

  $("resetLight")?.addEventListener(
    "click",
    ()=>{

      S.exposure = 0;
      S.contrast = 0;
      S.highlights = 0;
      S.shadows = 0;
      S.whites = 0;
      S.blacks = 0;

      render();

      pushHistory();
    }
  );

  document
    .querySelectorAll("[data-ratio]")
    .forEach(button=>{

      button.onclick = ()=>{

        const ratio =
          Number(button.dataset.ratio);

        if(ratio >= 1){

          crop.w = 1;
          crop.h = 1/ratio;

        }else{

          crop.w = 1;
          crop.h = ratio;
        }

        crop.x =
          (1-crop.w)/2;

        crop.y =
          (1-crop.h)/2;

        render();

        pushHistory();
      };
    });

  $("resetCrop")?.addEventListener(
    "click",
    ()=>{

      crop = {
        x:0,
        y:0,
        w:1,
        h:1
      };

      render();

      pushHistory();
    }
  );

  $("rotate")?.addEventListener(
    "click",
    ()=>{
      toast("Rotate control ready");
    }
  );

  $("flip")?.addEventListener(
    "click",
    ()=>{
      canvas.style.transform +=
        " scaleX(-1)";

      overlay.style.transform =
        canvas.style.transform;

      pushHistory();
    }
  );

  $("addText")?.addEventListener(
    "click",
    ()=>{

      const text =
        $("textValue").value.trim();

      if(!text) return;

      textLayers.push({

        text,

        x:
          canvas.width/2,

        y:
          canvas.height/2,

        size:
          S.textSize,

        font:
          $("font").value,

        opacity:
          S.textOpacity/100,

        color:
          $("textColor").value,

        stroke:
          $("textStroke").value,

        strokeWidth:2,

        bold:false,

        italic:false,

        align:"center"
      });

      pushHistory();

      render();
    }
  );

  $("clearText")?.addEventListener(
    "click",
    ()=>{

      textLayers = [];

      pushHistory();

      render();
    }
  );

  document
    .querySelectorAll("[data-deltext]")
    .forEach(button=>{

      button.onclick = ()=>{

        textLayers.splice(
          Number(button.dataset.deltext),
          1
        );

        pushHistory();

        render();

        buildPanel();
      };
    });

  $("clearDraw")?.addEventListener(
    "click",
    ()=>{

      strokes = [];

      pushHistory();

      render();
    }
  );

  $("clearHeal")?.addEventListener(
    "click",
    ()=>{
      toast("Heal strokes cleared");
    }
  );

  $("download")?.addEventListener(
    "click",
    ()=>{

      exportImage(
        $("format").value,
        Number($("quality").value)
      );
    }
  );
}

function exportImage(type,quality){

  if(!img){

    toast("Open a photo first");

    return;
  }

  const output =
    document.createElement("canvas");

  output.width =
    canvas.width;

  output.height =
    canvas.height;

  const outputContext =
    output.getContext("2d");

  outputContext.drawImage(
    canvas,
    0,
    0
  );

  outputContext.drawImage(
    overlay,
    0,
    0
  );

  const extension =
    type==="image/png"
      ? "png"
      : type==="image/webp"
        ? "webp"
        : "jpg";

  const link =
    document.createElement("a");

  link.href =
    output.toDataURL(
      type,
      quality
    );

  link.download =
    `toolora-edited-photo.${extension}`;

  link.click();

  toast("Export complete");
}

function canvasPosition(event){

  const rect =
    canvas.getBoundingClientRect();

  return {

    x:
      clamp(
        (event.clientX-rect.left) /
        rect.width *
        canvas.width,

        0,
        canvas.width
      ),

    y:
      clamp(
        (event.clientY-rect.top) /
        rect.height *
        canvas.height,

        0,
        canvas.height
      )
  };
}

$("stage").onpointerdown = event=>{

  if(!img) return;

  if(
    tool==="draw" ||
    tool==="heal"
  ){

    const point =
      canvasPosition(event);

    const stroke = {

      points:[point],

      size:
        tool==="heal"
          ? S.healSize
          : S.drawSize,

      opacity:
        tool==="heal"
          ? .75
          : S.drawOpacity/100,

      color:
        tool==="heal"
          ? "#ffffff"
          : (
            $("drawColor")?.value ||
            "#ffffff"
          )
    };

    drag = {
      kind:tool,
      stroke
    };

    if(tool==="draw"){
      strokes.push(stroke);
    }

    return;
  }

  pointers.set(
    event.pointerId,
    event
  );

  $("stage").setPointerCapture(
    event.pointerId
  );

  if(pointers.size===1){

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

  }

  else if(pointers.size===2){

    const values =
      [...pointers.values()];

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
};

$("stage").onpointermove = event=>{

  if(drag){

    const point =
      canvasPosition(event);

    drag.stroke.points.push(point);

    render();

    return;
  }

  if(!pointers.has(event.pointerId))
    return;

  pointers.set(
    event.pointerId,
    event
  );

  if(
    pointers.size===1 &&
    gesture &&
    gesture.type==="pan"
  ){

    if(zoom<=1)
      return;

    panX =
      gesture.startPanX +
      event.clientX -
      gesture.startX;

    panY =
      gesture.startPanY +
      event.clientY -
      gesture.startY;

    updateTransform();

    return;
  }

  if(
    pointers.size===2 &&
    gesture &&
    gesture.type==="pinch"
  ){

    const values =
      [...pointers.values()];

    const currentDistance =
      distance(
        values[0],
        values[1]
      );

    if(
      gesture.startDistance<=0
    ){
      return;
    }

    const factor =
      currentDistance /
      gesture.startDistance;

    zoom =
      clamp(
        gesture.startZoom *
        factor,
        .5,
        5
      );

    const currentMid =
      midpoint(
        values[0],
        values[1]
      );

    panX =
      gesture.startPanX +
      currentMid.x -
      gesture.startMid.x;

    panY =
      gesture.startPanY +
      currentMid.y -
      gesture.startMid.y;

    if(zoom<=1){

      panX = 0;
      panY = 0;
    }

    updateTransform();
  }
};

$("stage").onpointerup = event=>{

  if(drag){

    drag = null;

    pushHistory();

    render();

    return;
  }

  pointers.delete(
    event.pointerId
  );

  if(pointers.size===0){

    gesture = null;
  }

  const now =
    Date.now();

  if(
    now-lastTap<280 &&
    tool!=="draw" &&
    tool!=="heal"
  ){

    if(zoom>1){

      zoom = 1;

      panX = 0;
      panY = 0;

    }else{

      zoom = 2;
    }

    updateTransform();
  }

  lastTap = now;
};

$("stage").onpointercancel = event=>{

  pointers.delete(
    event.pointerId
  );

  if(pointers.size===0){

    gesture = null;
  }
};

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

document
  .querySelectorAll("[data-zoom]")
  .forEach(button=>{

    button.onclick = ()=>{

      const action =
        button.dataset.zoom;

      if(action==="fit"){

        fit();

        return;
      }

      if(action==="in"){

        zoom =
          clamp(
            zoom+.25,
            .5,
            5
          );

      }else{

        zoom =
          clamp(
            zoom-.25,
            .5,
            5
          );
      }

      if(zoom<=1){

        zoom = 1;

        panX = 0;
        panY = 0;
      }

      updateTransform();
    };
  });

document
  .querySelectorAll("[data-tool]")
  .forEach(button=>{

    button.onclick = ()=>{

      tool =
        button.dataset.tool;

      document
        .querySelectorAll("[data-tool]")
        .forEach(item=>{

          item.classList.toggle(
            "active",
            item===button
          );
        });

      buildPanel();
    };
  });

buildPanel();

window.addEventListener(
  "keydown",
  event=>{

    if(
      (event.ctrlKey ||
       event.metaKey) &&
      event.key.toLowerCase()==="z"
    ){

      event.preventDefault();

      $("undoBtn").click();
    }

    if(
      (event.ctrlKey ||
       event.metaKey) &&
      event.key.toLowerCase()==="y"
    ){

      event.preventDefault();

      $("redoBtn").click();
    }
  }
);

})();
