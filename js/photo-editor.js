(() => {

"use strict";

const $ = id => document.getElementById(id);

const clamp = (
  value,
  min = 0,
  max = 1
) => Math.min(max, Math.max(min, value));


const canvas = $("canvas");
const ctx = canvas.getContext("2d", {
  willReadFrequently: true
});

const overlay = $("overlay");
const overlayCtx = overlay.getContext("2d");

const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", {
  willReadFrequently: true
});


let image = null;
let fileName = "";
let activeTool = "light";

let zoom = 1;
let showBefore = false;
let renderQueued = false;

let drawing = false;
let selectedTextId = null;


/* -----------------------------
   HISTORY
----------------------------- */

const history = [];
const future = [];


/* -----------------------------
   TEXT / DRAW / COLOR
----------------------------- */

let textLayers = [];

let drawStrokes = [];

let selective = {
  active: false,
  color: "#ff0000",
  radius: 24,
  hue: 0,
  sat: 0,
  light: 0
};


/* -----------------------------
   MAIN EDIT STATE
----------------------------- */

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

  grain: 0,
  grainSize: 25,
  grainRough: 50,

  sharp: 0,
  radius: 1,
  noise: 0,
  colorNoise: 0,

  ratio: "original",

  rotate: 0,
  straighten: 0,

  flipX: false,
  flipY: false,

  blur: 0,
  blurX: 50,
  blurY: 50,

  gradeShadow: 0,
  gradeShadowSat: 0,

  gradeMid: 0,
  gradeMidSat: 0,

  gradeHigh: 0,
  gradeHighSat: 0,

  gradeBlend: 50,
  gradeBalance: 0,

  selectiveRadius: 24,
  selectiveHue: 0,
  selectiveSat: 0,
  selectiveLight: 0,

  brushSize: 8,
  brushOpacity: 100,

  textOpacity: 100,

  profile: "natural"
};


/* -----------------------------
   HSL BANDS
----------------------------- */

const bands = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta"
];

bands.forEach(name => {

  S["h_" + name] = 0;
  S["s_" + name] = 0;
  S["l_" + name] = 0;

});


/* -----------------------------
   TOOL TITLES
----------------------------- */

const names = {

  light: ["Adjust", "Light"],
  color: ["Adjust", "Color"],
  effects: ["Adjust", "Effects"],
  detail: ["Adjust", "Detail"],
  crop: ["Geometry", "Crop & Rotate"],
  text: ["Creative", "Text"],
  draw: ["Creative", "Draw"],
  selective: ["Color", "Selective Color"],
  presets: ["Style", "Presets"],
  layers: ["Layers", "Layers"],
  export: ["Output", "Export"]

};


/* -----------------------------
   HISTORY
----------------------------- */

function snapshot() {

  return JSON.stringify({

    state: S,

    textLayers,

    drawStrokes,

    selective

  });

}


function restore(snapshotValue) {

  const data = JSON.parse(snapshotValue);

  Object.assign(S, data.state);

  textLayers = data.textLayers || [];

  drawStrokes = data.drawStrokes || [];

  selective = data.selective || selective;

  panel();

  schedule();

}


function pushHistory() {

  history.push(snapshot());

  if (history.length > 60) {

    history.shift();

  }

  future.length = 0;

}


/* -----------------------------
   UI HELPERS
----------------------------- */

function formatValue(value) {

  return `${Math.round(Number(value))}%`;

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

        <span class="val" id="v_${key}">
          ${formatValue(S[key])}
        </span>

      </div>

      <input
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${S[key]}"
        data-key="${key}"
      >

    </div>
  `;

}


function selectControl(
  key,
  label,
  options
) {

  return `
    <div class="control">

      <div class="ch">
        <span>${label}</span>
      </div>

      <select data-select="${key}">

        ${options.map(option => `

          <option
            value="${option[0]}"
            ${S[key] === option[0] ? "selected" : ""}
          >
            ${option[1]}
          </option>

        `).join("")}

      </select>

    </div>
  `;

}


/* -----------------------------
   PANEL
----------------------------- */

function panel() {

  $("eyebrow").textContent =
    names[activeTool][0];

  $("title").textContent =
    names[activeTool][1];


  let html = "";


  /* LIGHT */

  if (activeTool === "light") {

    html = `

      <div class="section">

        <h3>Tone</h3>

        ${control("exposure","Exposure",-100,100)}

        ${control("contrast","Contrast",-100,100)}

        ${control("highlights","Highlights",-100,100)}

        ${control("shadows","Shadows",-100,100)}

        ${control("whites","Whites",-100,100)}

        ${control("blacks","Blacks",-100,100)}

      </div>

      <div class="section">

        <h3>Auto</h3>

        <button
          class="btn"
          id="autoTone"
        >
          Auto Tone
        </button>

      </div>

    `;

  }


  /* COLOR */

  if (activeTool === "color") {

    html = `

      <div class="section">

        <h3>White Balance</h3>

        ${control("temp","Temperature",-100,100)}

        ${control("tint","Tint",-100,100)}

      </div>

      <div class="section">

        <h3>Presence</h3>

        ${control("vibrance","Vibrance",-100,100)}

        ${control("saturation","Saturation",-100,100)}

      </div>

      <div class="section">

        <h3>Color Mixer</h3>

        ${bands.map(color => `

          <div class="section">

            <h3 class="colorhead">
              ${color.toUpperCase()}
            </h3>

            ${control("h_"+color,"Hue",-100,100)}

            ${control("s_"+color,"Saturation",-100,100)}

            ${control("l_"+color,"Luminance",-100,100)}

          </div>

        `).join("")}

      </div>

      <div class="section">

        <h3>Color Grading</h3>

        ${control("gradeShadow","Shadow Hue",0,360)}

        ${control("gradeShadowSat","Shadow Saturation",0,100)}

        ${control("gradeMid","Midtone Hue",0,360)}

        ${control("gradeMidSat","Midtone Saturation",0,100)}

        ${control("gradeHigh","Highlight Hue",0,360)}

        ${control("gradeHighSat","Highlight Saturation",0,100)}

        ${control("gradeBlend","Blending",0,100)}

        ${control("gradeBalance","Balance",-100,100)}

      </div>

    `;

  }


  /* EFFECTS */

  if (activeTool === "effects") {

    html = `

      <div class="section">

        <h3>Effects</h3>

        ${control("texture","Texture",-100,100)}

        ${control("clarity","Clarity",-100,100)}

        ${control("dehaze","Dehaze",-100,100)}

        ${control("vignette","Vignette",-100,100)}

        ${control("midpoint","Midpoint",0,100)}

        ${control("feather","Feather",1,100)}

      </div>

      <div class="section">

        <h3>Grain</h3>

        ${control("grain","Amount",0,100)}

        ${control("grainSize","Size",1,100)}

        ${control("grainRough","Roughness",0,100)}

      </div>

    `;

  }


  /* DETAIL */

  if (activeTool === "detail") {

    html = `

      <div class="section">

        <h3>Sharpening</h3>

        ${control("sharp","Amount",0,100)}

        ${control("radius","Radius",0.5,3,.1)}

      </div>

      <div class="section">

        <h3>Noise Reduction</h3>

        ${control("noise","Luminance",0,100)}

        ${control("colorNoise","Color",0,100)}

      </div>

    `;

  }


  /* CROP */

  if (activeTool === "crop") {

    html = `

      <div class="section">

        <h3>Aspect Ratio</h3>

        ${selectControl(
          "ratio",
          "Ratio",
          [
            ["original","Original"],
            ["1:1","Square 1:1"],
            ["4:5","Portrait 4:5"],
            ["3:4","Portrait 3:4"],
            ["4:3","Landscape 4:3"],
            ["16:9","Widescreen 16:9"],
            ["9:16","Story 9:16"]
          ]
        )}

      </div>

      <div class="section">

        <h3>Transform</h3>

        ${control(
          "straighten",
          "Straighten",
          -15,
          15,
          .1
        )}

        <div class="grid2">

          <button class="btn" id="rotL">
            Rotate Left
          </button>

          <button class="btn" id="rotR">
            Rotate Right
          </button>

          <button class="btn" id="flipX">
            Flip Horizontal
          </button>

          <button class="btn" id="flipY">
            Flip Vertical
          </button>

        </div>

      </div>

      <p class="note">
        The photo area remains fixed while the editing controls scroll.
      </p>

    `;

  }


  /* TEXT */

  if (activeTool === "text") {

    html = `

      <div class="section">

        <h3>Add Text</h3>

        <textarea
          id="textValue"
          placeholder="Type your text here..."
        ></textarea>

        <div class="grid2">

          <button
            class="btn"
            id="addText"
          >
            Add Text
          </button>

          <button
            class="btn"
            id="clearText"
          >
            Clear Text
          </button>

        </div>

      </div>


      <div class="section">

        <h3>Text Customization</h3>

        <p class="hint">
          Tap a text layer on the photo to select it.
          Drag it to any position.
        </p>

        <div class="control">

          <div class="ch">
            <span>Font</span>
          </div>

          <select id="textFont">

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


        <div class="control">

          <div class="ch">
            <span>Size</span>
            <span id="textSizeValue">64px</span>
          </div>

          <input
            id="textSize"
            type="range"
            min="10"
            max="240"
            value="64"
          >

        </div>


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
            id="textAlign"
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


        <div class="grid2">

          <div>

            <label class="hint">
              Text Color
            </label>

            <input
              id="textColor"
              type="color"
              value="#ffffff"
            >

          </div>


          <div>

            <label class="hint">
              Stroke
            </label>

            <input
              id="textStroke"
              type="color"
              value="#000000"
            >

          </div>

        </div>


        ${control(
          "textOpacity",
          "Opacity",
          0,
          100
        )}

      </div>


      <p class="note">
        Text is an independent layer. Move it directly on the photo and use
        Undo if the position or style is wrong.
      </p>

    `;

  }


  /* DRAW */

  if (activeTool === "draw") {

    html = `

      <div class="section">

        <h3>Brush</h3>

        ${control(
          "brushSize",
          "Size",
          1,
          100
        )}

        ${control(
          "brushOpacity",
          "Opacity",
          1,
          100
        )}

        <div class="control">

          <div class="ch">
            <span>Brush Color</span>
          </div>

          <input
            id="brushColor"
            type="color"
            value="#ffffff"
          >

        </div>


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


      <p class="note">
        Draw directly over the photo. The photo itself does not scroll.
      </p>

    `;

  }


  /* SELECTIVE COLOR */

  if (activeTool === "selective") {

    html = `

      <div class="section">

        <h3>Color Picker</h3>

        <button
          class="btn"
          id="pickColor"
        >
          Pick Color From Photo
        </button>

        <div class="swatches">

          <button
            class="swatch"
            data-color="#ff0000"
            style="background:#ff0000"
          ></button>

          <button
            class="swatch"
            data-color="#00ff00"
            style="background:#00ff00"
          ></button>

          <button
            class="swatch"
            data-color="#0000ff"
            style="background:#0000ff"
          ></button>

          <button
            class="swatch"
            data-color="#ffff00"
            style="background:#ffff00"
          ></button>

          <button
            class="swatch"
            data-color="#00ffff"
            style="background:#00ffff"
          ></button>

          <button
            class="swatch"
            data-color="#ff00ff"
            style="background:#ff00ff"
          ></button>

        </div>


        ${control(
          "selectiveRadius",
          "Color Range",
          5,
          80
        )}

        ${control(
          "selectiveHue",
          "Hue",
          -100,
          100
        )}

        ${control(
          "selectiveSat",
          "Saturation",
          -100,
          100
        )}

        ${control(
          "selectiveLight",
          "Lightness",
          -100,
          100
        )}


        <button
          class="btn"
          id="clearSelective"
        >
          Reset Selected Color
        </button>

      </div>


      <p class="note">
        Pick a color directly from the photo. Similar colors are adjusted
        together according to the selected range.
      </p>

    `;

  }


  /* PRESETS */

  if (activeTool === "presets") {

    html = `

      <div class="presets">

        ${[
          ["clean","Clean"],
          ["warm","Warm"],
          ["cool","Cool"],
          ["cinematic","Cinematic"],
          ["matte","Matte"],
          ["vivid","Vivid"],
          ["portrait","Portrait"],
          ["bw","Black & White"]
        ].map(item => `

          <button
            class="preset"
            data-preset="${item[0]}"
          >

            <b>${item[1]}</b>

            <small>
              Apply preset
            </small>

          </button>

        `).join("")}

      </div>

    `;

  }


  /* LAYERS */

  if (activeTool === "layers") {

    html = `

      <div class="section">

        <h3>Layers</h3>

        <p class="hint">
          Text and drawing layers are editable overlays.
        </p>


        ${
          textLayers.length
            ?

          textLayers.map((layer,index) => `

            <div class="layer">

              <b>
                ${escapeHTML(layer.text)}
              </b>

              <small>
                ${layer.font}
              </small>

              <button
                data-delete-layer="${index}"
              >
                ×
              </button>

            </div>

          `).join("")

            :

          `<p class="hint">
            No text layers yet.
          </p>`
        }


        <div class="grid2">

          <button
            class="btn"
            id="clearLayers"
          >
            Clear Text
          </button>

          <button
            class="btn"
            id="clearAllOverlays"
          >
            Clear All
          </button>

        </div>

      </div>

    `;

  }


  /* EXPORT */

  if (activeTool === "export") {

    html = `

      <div class="section">

        <h3>Export</h3>


        <div class="control">

          <div class="ch">
            <span>Format</span>
          </div>

          <select id="format">

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

          <div class="ch">
            <span>Maximum Long Edge</span>
          </div>

          <select id="size">

            <option value="0">
              Preview Size
            </option>

            <option value="1080">
              1080 px
            </option>

            <option value="1600">
              1600 px
            </option>

            <option value="2048">
              2048 px
            </option>

            <option value="3000">
              3000 px
            </option>

          </select>

        </div>


        ${control(
          "quality",
          "Quality",
          10,
          100
        )}


        <button
          class="download"
          id="download"
        >
          Export Photo
        </button>

      </div>


      <p class="note">
        Export is generated locally in your browser.
      </p>

    `;

  }


  $("panel").innerHTML = html;

  bindPanel();

}


/* -----------------------------
   PANEL EVENTS
----------------------------- */

let lastSliderHistoryKey = "";


function bindPanel() {

  $("panel")
    .querySelectorAll("input[data-key]")
    .forEach(input => {

      input.addEventListener("input", () => {

        const key = input.dataset.key;

        if (lastSliderHistoryKey !== key) {

          pushHistory();

          lastSliderHistoryKey = key;

          setTimeout(() => {

            if (lastSliderHistoryKey === key) {
              lastSliderHistoryKey = "";
            }

          }, 300);

        }


        S[key] = Number(input.value);


        if (key === "selectiveRadius") {
          selective.radius = Number(input.value);
        }

        if (key === "selectiveHue") {
          selective.hue = Number(input.value);
        }

        if (key === "selectiveSat") {
          selective.sat = Number(input.value);
        }

        if (key === "selectiveLight") {
          selective.light = Number(input.value);
        }


        if (key === "textOpacity") {

          const selected = getSelectedText();

          if (selected) {
            selected.opacity = Number(input.value);
          }

        }


        const valueElement =
          $("v_" + key);

        if (valueElement) {
          valueElement.textContent =
            formatValue(input.value);
        }


        schedule();

      });

    });


  $("panel")
    .querySelectorAll("select[data-select]")
    .forEach(select => {

      select.addEventListener("change", () => {

        pushHistory();

        S[select.dataset.select] =
          select.value;

        schedule();

      });

    });


  $("autoTone")?.addEventListener(
    "click",
    () => {

      pushHistory();

      S.exposure = 4;
      S.contrast = 6;
      S.highlights = -10;
      S.shadows = 12;
      S.whites = 3;
      S.blacks = -4;

      schedule();

    }
  );


  $("rotL")?.addEventListener(
    "click",
    () => {

      pushHistory();

      S.rotate -= 90;

      schedule();

    }
  );


  $("rotR")?.addEventListener(
    "click",
    () => {

      pushHistory();

      S.rotate += 90;

      schedule();

    }
  );


  $("flipX")?.addEventListener(
    "click",
    () => {

      pushHistory();

      S.flipX = !S.flipX;

      schedule();

    }
  );


  $("flipY")?.addEventListener(
    "click",
    () => {

      pushHistory();

      S.flipY = !S.flipY;

      schedule();

    }
  );


  /* TEXT */

  $("addText")?.addEventListener(
    "click",
    () => {

      const value =
        $("textValue").value.trim();

      if (!value) return;


      pushHistory();

      const layer = {

        id: Date.now(),

        text: value,

        x: .5,
        y: .5,

        size: 64,

        font: "Arial",

        bold: false,

        italic: false,

        align: "center",

        color: "#ffffff",

        stroke: "#000000",

        opacity: 100

      };


      textLayers.push(layer);

      selectedTextId = layer.id;

      panel();

      schedule();

    }
  );


  $("clearText")?.addEventListener(
    "click",
    () => {

      pushHistory();

      textLayers = [];

      selectedTextId = null;

      panel();

      schedule();

    }
  );


  $("deleteText")?.addEventListener(
    "click",
    () => {

      if (selectedTextId === null) return;

      pushHistory();

      textLayers =
        textLayers.filter(
          layer =>
            layer.id !== selectedTextId
        );

      selectedTextId = null;

      panel();

      schedule();

    }
  );


  $("textFont")?.addEventListener(
    "change",
    event => {

      const selected =
        getSelectedText();

      if (!selected) return;

      pushHistory();

      selected.font =
        event.target.value;

      schedule();

    }
  );


  $("textSize")?.addEventListener(
    "input",
    event => {

      const selected =
        getSelectedText();

      if (!selected) return;

      selected.size =
        Number(event.target.value);

      $("textSizeValue").textContent =
        `${selected.size}px`;

      schedule();

    }
  );


  $("textColor")?.addEventListener(
    "input",
    event => {

      const selected =
        getSelectedText();

      if (!selected) return;

      selected.color =
        event.target.value;

      schedule();

    }
  );


  $("textStroke")?.addEventListener(
    "input",
    event => {

      const selected =
        getSelectedText();

      if (!selected) return;

      selected.stroke =
        event.target.value;

      schedule();

    }
  );


  $("textBold")?.addEventListener(
    "click",
    () => {

      const selected =
        getSelectedText();

      if (!selected) return;

      pushHistory();

      selected.bold =
        !selected.bold;

      schedule();

    }
  );


  $("textItalic")?.addEventListener(
    "click",
    () => {

      const selected =
        getSelectedText();

      if (!selected) return;

      pushHistory();

      selected.italic =
        !selected.italic;

      schedule();

    }
  );


  $("textAlign")?.addEventListener(
    "click",
    () => {

      const selected =
        getSelectedText();

      if (!selected) return;

      pushHistory();

      selected.align =
        selected.align === "center"
          ? "left"
          : "center";

      schedule();

    }
  );


  /* DRAW */

  $("clearDraw")?.addEventListener(
    "click",
    () => {

      pushHistory();

      drawStrokes = [];

      schedule();

    }
  );


  $("undoDraw")?.addEventListener(
    "click",
    () => {

      if (!drawStrokes.length) return;

      pushHistory();

      drawStrokes.pop();

      schedule();

    }
  );


  /* SELECTIVE COLOR */

  $("pickColor")?.addEventListener(
    "click",
    () => {

      selective.active = true;

      $("status").textContent =
        "Click a color on the photo";

    }
  );


  $("panel")
    .querySelectorAll(".swatch")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          pushHistory();

          selective.active = true;

          selective.color =
            button.dataset.color;

          schedule();

        }
      );

    });


  $("clearSelective")?.addEventListener(
    "click",
    () => {

      pushHistory();

      selective = {

        active: false,

        color: "#ff0000",

        radius: 24,

        hue: 0,

        sat: 0,

        light: 0

      };

      S.selectiveRadius = 24;
      S.selectiveHue = 0;
      S.selectiveSat = 0;
      S.selectiveLight = 0;

      panel();

      schedule();

    }
  );


  /* PRESETS */

  $("panel")
    .querySelectorAll("[data-preset]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          applyPreset(
            button.dataset.preset
          );

        }
      );

    });


  /* LAYERS */

  $("panel")
    .querySelectorAll("[data-delete-layer]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          pushHistory();

          textLayers.splice(
            Number(button.dataset.deleteLayer),
            1
          );

          schedule();

          panel();

        }
      );

    });


  $("clearLayers")?.addEventListener(
    "click",
    () => {

      pushHistory();

      textLayers = [];

      selectedTextId = null;

      panel();

      schedule();

    }
  );


  $("clearAllOverlays")?.addEventListener(
    "click",
    () => {

      pushHistory();

      textLayers = [];

      drawStrokes = [];

      selectedTextId = null;

      panel();

      schedule();

    }
  );


  $("download")?.addEventListener(
    "click",
    exportImage
  );

}


/* -----------------------------
   TEXT HELPERS
----------------------------- */

function getSelectedText() {

  return textLayers.find(
    layer =>
      layer.id === selectedTextId
  );

}


function escapeHTML(value) {

  return String(value).replace(
    /[&<>'"]/g,
    character => {

      const map = {

        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"

      };

      return map[character];

    }
  );

}


/* -----------------------------
   PRESETS
----------------------------- */

function applyPreset(name) {

  pushHistory();

  const presets = {

    clean: {
      exposure: 4,
      contrast: 5,
      shadows: 8,
      vibrance: 10,
      texture: 8
    },

    warm: {
      temp: 18,
      contrast: 4,
      highlights: -8,
      shadows: 8,
      vibrance: 8
    },

    cool: {
      temp: -18,
      contrast: 5,
      shadows: 6,
      vibrance: 8
    },

    cinematic: {
      contrast: 14,
      highlights: -18,
      shadows: 8,
      blacks: -14,
      clarity: 10,
      dehaze: 8,
      vignette: 18,
      saturation: -5
    },

    matte: {
      contrast: -8,
      highlights: -12,
      shadows: 15,
      blacks: 15,
      clarity: -4,
      saturation: -5,
      vignette: 8
    },

    vivid: {
      contrast: 8,
      vibrance: 30,
      saturation: 5,
      clarity: 7
    },

    portrait: {
      exposure: 4,
      highlights: -8,
      shadows: 14,
      temp: 5,
      vibrance: 8,
      texture: -12,
      clarity: -5
    },

    bw: {
      contrast: 12,
      highlights: -10,
      shadows: 10,
      blacks: -12,
      saturation: -100
    }

  };


  Object.assign(
    S,
    presets[name] || {}
  );


  schedule();

}


/* -----------------------------
   LOAD IMAGE
----------------------------- */

function loadImage(file) {

  if (
    !file ||
    !file.type.startsWith("image/")
  ) {
    return;
  }


  const url =
    URL.createObjectURL(file);

  const newImage =
    new Image();


  newImage.onload = () => {

    URL.revokeObjectURL(url);

    image = newImage;

    fileName = file.name;


    const maximum =
      1800;

    const scale =
      Math.min(
        1,
        maximum /
        Math.max(
          newImage.naturalWidth,
          newImage.naturalHeight
        )
      );


    sourceCanvas.width =
      Math.max(
        1,
        Math.round(
          newImage.naturalWidth * scale
        )
      );


    sourceCanvas.height =
      Math.max(
        1,
        Math.round(
          newImage.naturalHeight * scale
        )
      );


    sourceCtx.clearRect(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height
    );


    sourceCtx.drawImage(
      newImage,
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height
    );


    $("name").textContent =
      file.name;


    $("meta").textContent =
      `${newImage.naturalWidth} × ${newImage.naturalHeight}px`;


    $("empty").style.display =
      "none";


    canvas.style.display =
      "block";


    overlay.style.display =
      "block";


    resetEditor();

    render();

  };


  newImage.onerror = () => {

    URL.revokeObjectURL(url);

    alert(
      "The selected image could not be opened. Please try another image."
    );

  };


  newImage.src = url;

}


/* -----------------------------
   RESET
----------------------------- */

function resetEditor() {

  Object.keys(S).forEach(key => {

    if (
      key === "ratio"
    ) {

      S[key] = "original";

    }

    else if (
      key === "profile"
    ) {

      S[key] = "natural";

    }

    else if (
      key === "midpoint" ||
      key === "feather"
    ) {

      S[key] = 50;

    }

    else if (
      key === "gradeBlend"
    ) {

      S[key] = 50;

    }

    else if (
      key === "radius"
    ) {

      S[key] = 1;

    }

    else if (
      key === "brushOpacity"
    ) {

      S[key] = 100;

    }

    else if (
      key === "textOpacity"
    ) {

      S[key] = 100;

    }

    else {

      S[key] = 0;

    }

  });


  S.flipX = false;
  S.flipY = false;


  S.selectiveRadius = 24;
  S.brushSize = 8;
  S.brushOpacity = 100;
  S.textOpacity = 100;


  textLayers = [];
  drawStrokes = [];

  selectedTextId = null;


  selective = {

    active: false,
    color: "#ff0000",
    radius: 24,
    hue: 0,
    sat: 0,
    light: 0

  };


  history.length = 0;
  future.length = 0;

  zoom = 1;

  panel();

  schedule();

}


/* -----------------------------
   COLOR MATH
----------------------------- */

function rgbToHsv(
  r,
  g,
  b
) {

  const max =
    Math.max(r,g,b);

  const min =
    Math.min(r,g,b);

  const difference =
    max - min;

  let h = 0;

  if (difference) {

    if (max === r) {

      h =
        ((g-b) / difference +
        (g < b ? 6 : 0)) / 6;

    }

    else if (max === g) {

      h =
        ((b-r) / difference + 2) / 6;

    }

    else {

      h =
        ((r-g) / difference + 4) / 6;

    }

  }


  return [
    h,
    max ? difference / max : 0,
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
    v * (1-s);

  const q =
    v * (1-f*s);

  const t =
    v * (1-(1-f)*s);


  return [
    [v,t,p],
    [q,v,p],
    [p,v,t],
    [p,q,v],
    [t,p,v],
    [v,p,q]
  ][i % 6];

}


function colorBand(h) {

  if (
    h < .04 ||
    h > .96
  ) return "red";

  if (h < .11) return "orange";

  if (h < .19) return "yellow";

  if (h < .43) return "green";

  if (h < .53) return "aqua";

  if (h < .70) return "blue";

  if (h < .85) return "purple";

  return "magenta";

}


/* -----------------------------
   PIXEL ADJUSTMENTS
----------------------------- */

function applyPixels(
  imageData,
  width,
  height
) {

  const pixels =
    imageData.data;


  const exposure =
    Math.pow(
      2,
      S.exposure / 50
    );


  const contrast =
    (100 + S.contrast) / 100;


  const saturation =
    (100 + S.saturation) / 100;


  const vibrance =
    S.vibrance / 100;


  for (
    let i = 0;
    i < pixels.length;
    i += 4
  ) {

    let r =
      pixels[i] / 255;

    let g =
      pixels[i+1] / 255;

    let b =
      pixels[i+2] / 255;


    r *= exposure;
    g *= exposure;
    b *= exposure;


    const luminance =
      .2126*r +
      .7152*g +
      .0722*b;


    const highlight =
      S.highlights / 120;

    const shadow =
      S.shadows / 120;


    if (luminance > .5) {

      r += highlight * (r-.5);
      g += highlight * (g-.5);
      b += highlight * (b-.5);

    }

    else {

      r += shadow * (.5-r);
      g += shadow * (.5-g);
      b += shadow * (.5-b);

    }


    const whiteBlack =
      (S.whites + S.blacks) / 255;


    r += whiteBlack;
    g += whiteBlack;
    b += whiteBlack;


    r =
      (r-.5) * contrast + .5;

    g =
      (g-.5) * contrast + .5;

    b =
      (b-.5) * contrast + .5;


    r += S.temp * .0009;
    b -= S.temp * .0009;
    g += S.tint * .00045;


    const gray =
      .299*r +
      .587*g +
      .114*b;


    const vibranceBoost =
      1 +
      vibrance *
      (1-Math.abs(
        2*luminance-1
      )) *
      .7;


    r =
      gray +
      (r-gray) *
      saturation *
      vibranceBoost;

    g =
      gray +
      (g-gray) *
      saturation *
      vibranceBoost;

    b =
      gray +
      (b-gray) *
      saturation *
      vibranceBoost;


    const effect =
      (S.texture + S.clarity) / 900;


    const average =
      (r+g+b)/3;


    r += (r-average)*effect;
    g += (g-average)*effect;
    b += (b-average)*effect;


    if (S.dehaze) {

      const dehaze =
        S.dehaze / 140;

      r =
        (r-.5) *
        (1+dehaze) +
        .5;

      g =
        (g-.5) *
        (1+dehaze) +
        .5;

      b =
        (b-.5) *
        (1+dehaze) +
        .5;

    }


    r = clamp(r);
    g = clamp(g);
    b = clamp(b);


    let [
      hue,
      sat,
      value
    ] = rgbToHsv(
      r,
      g,
      b
    );


    const band =
      colorBand(hue);


    const hueShift =
      S["h_"+band];

    const satShift =
      S["s_"+band];

    const lightShift =
      S["l_"+band];


    if (
      hueShift ||
      satShift ||
      lightShift
    ) {

      [
        r,
        g,
        b
      ] = hsvToRgb(

        (
          hue +
          hueShift / 360 +
          1
        ) % 1,

        clamp(
          sat *
          (1 + satShift/100)
        ),

        clamp(
          value *
          (1 + lightShift/100)
        )

      );

    }


    /* Color grading */

    const finalLum =
      .2126*r +
      .7152*g +
      .0722*b;


    let gradeHue;
    let gradeSat;


    if (finalLum < .35) {

      gradeHue =
        S.gradeShadow;

      gradeSat =
        S.gradeShadowSat;

    }

    else if (
      finalLum > .65
    ) {

      gradeHue =
        S.gradeHigh;

      gradeSat =
        S.gradeHighSat;

    }

    else {

      gradeHue =
        S.gradeMid;

      gradeSat =
        S.gradeMidSat;

    }


    if (gradeSat > 0) {

      const graded =
        hsvToRgb(
          gradeHue / 360,
          gradeSat / 100,
          Math.max(
            .25,
            finalLum
          )
        );


      const blend =
        (S.gradeBlend/100) * .3;


      r =
        r*(1-blend) +
        graded[0]*blend;

      g =
        g*(1-blend) +
        graded[1]*blend;

      b =
        b*(1-blend) +
        graded[2]*blend;

    }


    /* Vignette */

    const x =
      ((i/4) % width) /
      width -
      .5;

    const y =
      Math.floor(
        (i/4) / width
      ) /
      height -
      .5;


    const distance =
      Math.sqrt(
        x*x+y*y
      ) * 1.414;


    if (S.vignette) {

      const edge =
        clamp(
          (
            distance -
            (S.midpoint/100*.65)
          ) /
          Math.max(
            .05,
            S.feather/100
          )
        );


      const vignette =
        1 -
        (S.vignette/100) *
        edge *
        edge;


      r *= vignette;
      g *= vignette;
      b *= vignette;

    }


    /* Selective Color */

    if (
      selective.active
    ) {

      const selectedRGB =
        hexToRGB(
          selective.color
        );


      const selectedHSV =
        rgbToHsv(
          selectedRGB[0],
          selectedRGB[1],
          selectedRGB[2]
        );


      const currentHSV =
        rgbToHsv(
          clamp(r),
          clamp(g),
          clamp(b)
        );


      const hueDistance =
        Math.min(
          Math.abs(
            currentHSV[0] -
            selectedHSV[0]
          ),

          1 -
          Math.abs(
            currentHSV[0] -
            selectedHSV[0]
          )
        );


      const mask =
        clamp(
          1 -
          hueDistance /
          (
            selective.radius /
            100 *
            .5
          )
        ) *
        currentHSV[1];


      if (mask > .01) {

        [
          r,
          g,
          b
        ] = hsvToRgb(

          (
            currentHSV[0] +
            selective.hue/360 +
            1
          ) % 1,

          clamp(
            currentHSV[1] *
            (
              1 +
              selective.sat/100 *
              mask
            )
          ),

          clamp(
            currentHSV[2] +
            selective.light/100 *
            mask
          )

        );

      }

    }


    pixels[i] =
      clamp(r) * 255;

    pixels[i+1] =
      clamp(g) * 255;

    pixels[i+2] =
      clamp(b) * 255;

  }


  return imageData;

}


/* -----------------------------
   EFFECTS
----------------------------- */

function sharpen(
  context,
  width,
  height,
  amount
) {

  if (amount < 1) return;


  const source =
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


  output.data.set(
    source.data
  );


  const sourceData =
    source.data;

  const outputData =
    output.data;


  const strength =
    amount/100*.65;


  for (
    let y=1;
    y<height-1;
    y++
  ) {

    for (
      let x=1;
      x<width-1;
      x++
    ) {

      const index =
        (y*width+x)*4;


      for (
        let channel=0;
        channel<3;
        channel++
      ) {

        const value =
          sourceData[
            index+channel
          ];


        const left =
          sourceData[
            index-4+channel
          ];

        const right =
          sourceData[
            index+4+channel
          ];

        const top =
          sourceData[
            index-width*4+channel
          ];

        const bottom =
          sourceData[
            index+width*4+channel
          ];


        outputData[
          index+channel
        ] =
          clamp(
            (
              value +
              strength *
              (
                4*value -
                left -
                right -
                top -
                bottom
              )
            ) / 255
          ) * 255;

      }

    }

  }


  context.putImageData(
    output,
    0,
    0
  );

}


function blurCanvas(
  context,
  width,
  height,
  amount
) {

  if (amount <= 0) return;


  const temporary =
    document.createElement(
      "canvas"
    );


  temporary.width =
    width;

  temporary.height =
    height;


  const temporaryContext =
    temporary.getContext("2d");


  temporaryContext.drawImage(
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


  context.filter =
    `blur(${Math.max(.1,amount)}px)`;


  context.drawImage(
    temporary,
    0,
    0
  );


  context.filter =
    "none";

}


function colorNoise(
  context,
  width,
  height,
  amount
) {

  if (amount <= 0) return;


  const imageData =
    context.getImageData(
      0,
      0,
      width,
      height
    );


  const pixels =
    imageData.data;


  const strength =
    amount / 100;


  for (
    let i=0;
    i<pixels.length;
    i+=4
  ) {

    const variation =
      (
        Math.random()-.5
      ) *
      18 *
      strength;


    pixels[i] =
      clamp(
        pixels[i]/255 +
        variation/255
      ) * 255;


    pixels[i+1] =
      clamp(
        pixels[i+1]/255 -
        variation/255
      ) * 255;

  }


  context.putImageData(
    imageData,
    0,
    0
  );

}


function grain(
  context,
  width,
  height,
  amount
) {

  if (amount <= 0) return;


  const imageData =
    context.getImageData(
      0,
      0,
      width,
      height
    );


  const pixels =
    imageData.data;


  const strength =
    amount/100 * 28;


  for (
    let i=0;
    i<pixels.length;
    i+=4
  ) {

    const variation =
      (
        Math.random()-.5
      ) *
      strength;


    pixels[i] =
      clamp(
        pixels[i]/255 +
        variation/255
      ) * 255;


    pixels[i+1] =
      clamp(
        pixels[i+1]/255 +
        variation/255
      ) * 255;


    pixels[i+2] =
      clamp(
        pixels[i+2]/255 +
        variation/255
      ) * 255;

  }


  context.putImageData(
    imageData,
    0,
    0
  );

}


/* -----------------------------
   GEOMETRY
----------------------------- */

function createGeometryCanvas() {

  const angle =
    (
      S.rotate +
      S.straighten
    ) *
    Math.PI /
    180;


  const width =
    sourceCanvas.width;

  const height =
    sourceCanvas.height;


  const rotatedWidth =
    Math.abs(
      Math.cos(angle)
    ) *
    width
    +
    Math.abs(
      Math.sin(angle)
    ) *
    height;


  const rotatedHeight =
    Math.abs(
      Math.sin(angle)
    ) *
    width
    +
    Math.abs(
      Math.cos(angle)
    ) *
    height;


  const result =
    document.createElement(
      "canvas"
    );


  result.width =
    Math.max(
      1,
      Math.ceil(rotatedWidth)
    );


  result.height =
    Math.max(
      1,
      Math.ceil(rotatedHeight)
    );


  const resultContext =
    result.getContext("2d");


  resultContext.translate(
    result.width/2,
    result.height/2
  );


  resultContext.rotate(
    angle
  );


  resultContext.scale(
    S.flipX ? -1 : 1,
    S.flipY ? -1 : 1
  );


  resultContext.drawImage(
    sourceCanvas,
    -width/2,
    -height/2
  );


  return result;

}


function getCropBox(canvasValue) {

  let width =
    canvasValue.width;

  let height =
    canvasValue.height;

  let x = 0;
  let y = 0;


  if (
    S.ratio !== "original"
  ) {

    const parts =
      S.ratio
        .split(":")
        .map(Number);


    const targetRatio =
      parts[0] / parts[1];


    const currentRatio =
      width / height;


    if (
      currentRatio >
      targetRatio
    ) {

      const newWidth =
        height *
        targetRatio;


      x =
        (width-newWidth)/2;

      width =
        newWidth;

    }

    else {

      const newHeight =
        width /
        targetRatio;


      y =
        (height-newHeight)/2;

      height =
        newHeight;

    }

  }


  return {
    x,
    y,
    width,
    height
  };

}


/* -----------------------------
   RENDER
----------------------------- */

function render() {

  if (!image) return;


  $("status").textContent =
    "Rendering...";


  const geometry =
    createGeometryCanvas();


  const crop =
    getCropBox(
      geometry
    );


  const maximum =
    window.innerWidth < 700
      ? 760
      : 1200;


  const scale =
    Math.min(
      1,
      maximum /
      Math.max(
        crop.width,
        crop.height
      )
    );


  const width =
    Math.max(
      1,
      Math.round(
        crop.width * scale
      )
    );


  const height =
    Math.max(
      1,
      Math.round(
        crop.height * scale
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

    geometry,

    crop.x,
    crop.y,
    crop.width,
    crop.height,

    0,
    0,
    width,
    height

  );


  if (showBefore) {

    drawOverlays();

    finishRender(
      "Original"
    );

    return;

  }


  const pixels =
    ctx.getImageData(
      0,
      0,
      width,
      height
    );


  const adjusted =
    applyPixels(
      pixels,
      width,
      height
    );


  ctx.putImageData(
    adjusted,
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

    blurCanvas(
      ctx,
      width,
      height,
      S.noise / 35
    );

  }


  if (S.colorNoise > 0) {

    colorNoise(
      ctx,
      width,
      height,
      S.colorNoise
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

    blurCanvas(
      ctx,
      width,
      height,
      Math.min(
        12,
        S.blur/8
      )
    );

  }


  drawOverlays();


  canvas.style.transform =
    `scale(${zoom})`;


  $("zlabel").textContent =
    `${Math.round(zoom*100)}%`;


  finishRender(
    "Ready"
  );

}


/* -----------------------------
   OVERLAYS
----------------------------- */

function drawOverlays() {

  overlay.width =
    canvas.width;

  overlay.height =
    canvas.height;


  overlayCtx.clearRect(
    0,
    0,
    overlay.width,
    overlay.height
  );


  const width =
    canvas.width;

  const height =
    canvas.height;


  /* TEXT */

  textLayers.forEach(
    layer => {

      const x =
        layer.x * width;

      const y =
        layer.y * height;


      const size =
        Math.max(
          8,
          layer.size *
          (
            width /
            sourceCanvas.width
          )
        );


      const weight =
        layer.bold
          ? "700"
          : "400";


      const fontStyle =
        layer.italic
          ? "italic"
          : "normal";


      overlayCtx.save();


      overlayCtx.globalAlpha =
        clamp(
          layer.opacity/100
        );


      overlayCtx.font =
        `${fontStyle} ${weight} ${size}px "${layer.font}"`;


      overlayCtx.textAlign =
        layer.align;


      overlayCtx.textBaseline =
        "middle";


      if (layer.stroke) {

        overlayCtx.lineWidth =
          Math.max(
            2,
            size*.05
          );


        overlayCtx.strokeStyle =
          layer.stroke;


        overlayCtx.strokeText(
          layer.text,
          x,
          y
        );

      }


      overlayCtx.fillStyle =
        layer.color;


      overlayCtx.fillText(
        layer.text,
        x,
        y
      );


      overlayCtx.restore();

    }
  );


  /* DRAWING */

  drawStrokes.forEach(
    stroke => {

      overlayCtx.save();

      overlayCtx.globalAlpha =
        stroke.opacity/100;

      overlayCtx.strokeStyle =
        stroke.color;

      overlayCtx.lineWidth =
        stroke.size;

      overlayCtx.lineCap =
        "round";

      overlayCtx.lineJoin =
        "round";


      overlayCtx.beginPath();


      stroke.points.forEach(
        (point,index) => {

          const x =
            point.x *
            width;

          const y =
            point.y *
            height;


          if (index === 0) {

            overlayCtx.moveTo(
              x,
              y
            );

          }

          else {

            overlayCtx.lineTo(
              x,
              y
            );

          }

        }
      );


      overlayCtx.stroke();

      overlayCtx.restore();

    }
  );

}


/* -----------------------------
   POINTER POSITION
----------------------------- */

function getPointerPosition(event) {

  const rect =
    canvas.getBoundingClientRect();


  return {

    x: clamp(
      (
        event.clientX -
        rect.left
      ) /
      rect.width
    ),

    y: clamp(
      (
        event.clientY -
        rect.top
      ) /
      rect.height
    )

  };

}


/* -----------------------------
   DIRECT PHOTO INTERACTION
----------------------------- */

$("stage").addEventListener(
  "pointerdown",
  event => {

    if (!image) return;


    const position =
      getPointerPosition(
        event
      );


    /* TEXT MOVE */

    if (
      activeTool === "text"
    ) {

      const hit =
        textLayers
          .slice()
          .reverse()
          .find(
            layer =>
              Math.hypot(
                layer.x-position.x,
                layer.y-position.y
              ) < .15
          );


      if (hit) {

        selectedTextId =
          hit.id;

        pushHistory();

        drawing = true;

        $("stage").setPointerCapture(
          event.pointerId
        );

        panel();

      }

      return;

    }


    /* DRAW */

    if (
      activeTool === "draw"
    ) {

      pushHistory();

      drawing = true;


      const brushColor =
        $("brushColor")?.value ||
        "#ffffff";


      const brushSize =
        (
          Number(
            $("brushSize")?.value ||
            8
          ) *
          canvas.width /
          1000
        );


      const opacity =
        Number(
          $("brushOpacity")?.value ||
          100
        );


      drawStrokes.push({

        color: brushColor,

        size: Math.max(
          1,
          brushSize
        ),

        opacity,

        points: [
          position
        ]

      });


      $("stage").setPointerCapture(
        event.pointerId
      );


      schedule();

      return;

    }


    /* SELECTIVE COLOR */

    if (
      activeTool ===
      "selective" &&
      selective.active
    ) {

      pushHistory();


      const pixelX =
        Math.floor(
          position.x *
          canvas.width
        );


      const pixelY =
        Math.floor(
          position.y *
          canvas.height
        );


      const pixel =
        ctx.getImageData(
          pixelX,
          pixelY,
          1,
          1
        ).data;


      selective.color =
        "#" +
        [
          pixel[0],
          pixel[1],
          pixel[2]
        ]
          .map(
            value =>
              value
                .toString(16)
                .padStart(2,"0")
          )
          .join("");


      panel();

      schedule();

    }

  }
);


$("stage").addEventListener(
  "pointermove",
  event => {

    if (!drawing) return;


    const position =
      getPointerPosition(
        event
      );


    if (
      activeTool === "draw"
    ) {

      const last =
        drawStrokes[
          drawStrokes.length-1
        ];


      if (last) {

        last.points.push(
          position
        );

      }


      schedule();

    }


    if (
      activeTool === "text"
    ) {

      const selected =
        getSelectedText();


      if (selected) {

        selected.x =
          position.x;

        selected.y =
          position.y;

      }


      schedule();

    }

  }
);


$("stage").addEventListener(
  "pointerup",
  () => {

    drawing = false;

  }
);


$("stage").addEventListener(
  "pointercancel",
  () => {

    drawing = false;

  }
);


/* -----------------------------
   BUTTONS
----------------------------- */

$("openTop").onclick =
  () => $("fileInput").click();


$("openEmpty").onclick =
  () => $("fileInput").click();


$("fileInput").onchange =
  event => {

    loadImage(
      event.target.files[0]
    );

  };


$("undo").onclick =
  () => {

    if (!history.length) return;

    future.push(
      snapshot()
    );

    restore(
      history.pop()
    );

  };


$("redo").onclick =
  () => {

    if (!future.length) return;

    history.push(
      snapshot()
    );

    restore(
      future.pop()
    );

  };


$("before").onclick =
  () => {

    showBefore =
      !showBefore;

    $("badge").style.display =
      showBefore
        ? "block"
        : "none";

    schedule();

  };


$("reset").onclick =
  () => {

    if (!image) return;

    pushHistory();

    resetEditor();

  };


$("zout").onclick =
  () => {

    zoom =
      clamp(
        zoom-.1,
        .5,
        2.5
      );

    render();

  };


$("zin").onclick =
  () => {

    zoom =
      clamp(
        zoom+.1,
        .5,
        2.5
      );

    render();

  };


$("fit").onclick =
  () => {

    zoom = 1;

    render();

  };


$("full").onclick =
  () => {

    $("stage")
      .requestFullscreen?.();

  };


/* -----------------------------
   TOOL TABS
----------------------------- */

$("tabs").addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        "[data-tool]"
      );


    if (!button) return;


    activeTool =
      button.dataset.tool;


    document
      .querySelectorAll(
        "#tabs button"
      )
      .forEach(
        item =>
          item.classList.toggle(
            "active",
            item === button
          )
      );


    panel();

  }
);


/* -----------------------------
   KEYBOARD UNDO / REDO
----------------------------- */

document.addEventListener(
  "keydown",
  event => {

    if (
      (event.ctrlKey ||
       event.metaKey) &&
      event.key.toLowerCase() === "z"
    ) {

      event.preventDefault();

      $("undo").click();

    }

    else if (
      (event.ctrlKey ||
       event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "z"
    ) {

      event.preventDefault();

      $("redo").click();

    }

  }
);


/* -----------------------------
   DRAG IMAGE
----------------------------- */

$("stage").addEventListener(
  "dragover",
  event => {

    event.preventDefault();

  }
);


$("stage").addEventListener(
  "drop",
  event => {

    event.preventDefault();

    loadImage(
      event.dataTransfer.files[0]
    );

  }
);


/* -----------------------------
   HEX COLOR
----------------------------- */

function hexToRGB(hex) {

  const value =
    hex.replace(
      "#",
      ""
    );


  return [

    parseInt(
      value.slice(0,2),
      16
    ) / 255,

    parseInt(
      value.slice(2,4),
      16
    ) / 255,

    parseInt(
      value.slice(4,6),
      16
    ) / 255

  ];

}


/* -----------------------------
   EXPORT
----------------------------- */

function exportImage() {

  if (!image) {

    alert(
      "Please open a photo first."
    );

    return;

  }


  $("status").textContent =
    "Exporting...";


  const format =
    $("format")?.value ||
    "image/jpeg";


  const requestedSize =
    Number(
      $("size")?.value || 0
    );


  const quality =
    Number(
      $("quality")?.value || 90
    ) / 100;


  const previousZoom =
    zoom;


  zoom = 1;

  render();


  const maximum =
    requestedSize ||
    Math.max(
      canvas.width,
      canvas.height
    );


  const scale =
    Math.min(
      1,
      maximum /
      Math.max(
        canvas.width,
        canvas.height
      )
    );


  const output =
    document.createElement(
      "canvas"
    );


  output.width =
    Math.max(
      1,
      Math.round(
        canvas.width*scale
      )
    );


  output.height =
    Math.max(
      1,
      Math.round(
        canvas.height*scale
      )
    );


  const outputContext =
    output.getContext("2d");


  outputContext.drawImage(
    canvas,
    0,
    0,
    output.width,
    output.height
  );


  const extension =
    format === "image/png"
      ? "png"
      : format === "image/webp"
        ? "webp"
        : "jpg";


  const link =
    document.createElement("a");


  link.download =
    `toolora-edited-${Date.now()}.${extension}`;


  link.href =
    output.toDataURL(
      format,
      quality
    );


  link.click();


  zoom =
    previousZoom;


  render();


  $("status").textContent =
    "Export complete";

}


/* -----------------------------
   RENDER QUEUE
----------------------------- */

function schedule() {

  if (renderQueued) return;


  renderQueued = true;


  requestAnimationFrame(
    () => {

      renderQueued = false;

      render();

    }
  );

}


/* -----------------------------
   INITIALIZE
----------------------------- */

document
  .querySelector(
    '[data-tool="light"]'
  )
  .classList.add("active");


panel();

})();
