(() => {
"use strict";

const $ = id => document.getElementById(id);

const clamp = (n, a, b) =>
  Math.max(a, Math.min(b, n));

const C = $("canvas");
const ctx = C.getContext("2d", {
  willReadFrequently: true
});

const O = $("overlay");
const ox = O.getContext("2d");

const src = document.createElement("canvas");
const sx = src.getContext("2d", {
  willReadFrequently: true
});

let img = null;
let fileName = "";
let renderQueued = false;
let zoom = 1;
let active = "light";
let showBefore = false;

let history = [];
let future = [];

let retouch = [];

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
  roundness: 0,

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

  profile: "natural",
  preset: "none",
  presetAmount: 100,

  blur: 0,
  blurX: 50,
  blurY: 50,

  lensVignette: 0,
  defringe: 0,

  maskType: "radial",
  maskAmount: 0,
  maskExposure: 0,
  maskContrast: 0,
  maskSaturation: 0,

  retouchSize: 30,

  gradeShadow: 0,
  gradeShadowSat: 0,
  gradeMid: 0,
  gradeMidSat: 0,
  gradeHigh: 0,
  gradeHighSat: 0,
  gradeBlend: 50,
  gradeBalance: 0
};

const colors = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta"
];

colors.forEach(color => {
  S["h_" + color] = 0;
  S["s_" + color] = 0;
  S["l_" + color] = 0;
});

const names = {
  light: ["Adjust", "Light"],
  color: ["Adjust", "Color"],
  effects: ["Adjust", "Effects"],
  detail: ["Adjust", "Detail"],
  crop: ["Transform", "Crop"],
  presets: ["Looks", "Presets"],
  profiles: ["Looks", "Profiles"],
  mask: ["Local", "Mask"],
  retouch: ["Retouch", "Spot Blur"],
  blur: ["Effects", "Blur"],
  optics: ["Lens", "Optics"],
  export: ["Output", "Export"]
};

function snap() {
  return JSON.parse(JSON.stringify(S));
}

function push() {
  history.push(snap());

  if (history.length > 25) {
    history.shift();
  }

  future = [];
}

function restore(state) {
  Object.assign(S, state);
  render();
  panel();
}

function fmt(value) {
  value = Number(value);

  return (
    value > 0 ? "+" : ""
  ) +
  (
    Number.isInteger(value)
      ? value
      : value.toFixed(1)
  );
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
          ${fmt(S[key])}
        </span>
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

function bind() {

  document
    .querySelectorAll("#panel input[data-k]")
    .forEach(input => {

      input.oninput = () => {

        S[input.dataset.k] =
          Number(input.value);

        const value =
          $("v_" + input.dataset.k);

        if (value) {
          value.textContent =
            fmt(input.value);
        }

        schedule();
      };

      input.onchange = () => {
        push();
      };
    });

  document
    .querySelectorAll("#panel [data-mix]")
    .forEach(input => {

      input.oninput = () => {

        S[
          input.dataset.mix +
          input.dataset.color
        ] = Number(input.value);

        schedule();
      };
    });
}

function panel() {

  const p = $("panel");

  $("eyebrow").textContent =
    names[active][0];

  $("title").textContent =
    names[active][1];

  let h = "";

  if (active === "light") {

    h = `
      <div class="section">

        <h3>Tone</h3>

        ${control(
          "exposure",
          "Exposure",
          -100,
          100
        )}

        ${control(
          "contrast",
          "Contrast",
          -100,
          100
        )}

        ${control(
          "highlights",
          "Highlights",
          -100,
          100
        )}

        ${control(
          "shadows",
          "Shadows",
          -100,
          100
        )}

        ${control(
          "whites",
          "Whites",
          -100,
          100
        )}

        ${control(
          "blacks",
          "Blacks",
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

        <p
          class="note"
          style="margin-top:8px"
        >
          Auto applies a quick balanced correction.
        </p>

      </div>
    `;
  }

  if (active === "color") {

    h = `
      <div class="section">

        <h3>White Balance</h3>

        ${control(
          "temp",
          "Temperature",
          -100,
          100
        )}

        ${control(
          "tint",
          "Tint",
          -100,
          100
        )}

        ${control(
          "vibrance",
          "Vibrance",
          -100,
          100
        )}

        ${control(
          "saturation",
          "Saturation",
          -100,
          100
        )}

      </div>

      <div class="section">

        <h3>Color Mixer</h3>

        ${colors.map(color => `
          <div class="mixer">

            <span>
              ${color.charAt(0).toUpperCase() +
              color.slice(1)}
            </span>

            <input
              data-mix="h_${color}"
              data-color=""
              type="range"
              min="-30"
              max="30"
              value="${S["h_" + color]}"
              title="Hue"
            >

            <input
              data-mix="s_${color}"
              data-color=""
              type="range"
              min="-100"
              max="100"
              value="${S["s_" + color]}"
              title="Saturation"
            >

            <input
              data-mix="l_${color}"
              data-color=""
              type="range"
              min="-100"
              max="100"
              value="${S["l_" + color]}"
              title="Luminance"
            >

          </div>
        `).join("")}

        <p class="note">
          Each row contains Hue, Saturation and Luminance.
        </p>

      </div>

      <div class="section">

        <h3>Color Grading</h3>

        ${control(
          "gradeShadow",
          "Shadow Color",
          0,
          360
        )}

        ${control(
          "gradeShadowSat",
          "Shadow Strength",
          0,
          100
        )}

        ${control(
          "gradeMid",
          "Midtone Color",
          0,
          360
        )}

        ${control(
          "gradeMidSat",
          "Midtone Strength",
          0,
          100
        )}

        ${control(
          "gradeHigh",
          "Highlight Color",
          0,
          360
        )}

        ${control(
          "gradeHighSat",
          "Highlight Strength",
          0,
          100
        )}

        ${control(
          "gradeBlend",
          "Blending",
          0,
          100
        )}

        ${control(
          "gradeBalance",
          "Balance",
          -100,
          100
        )}

      </div>
    `;
  }

  if (active === "effects") {

    h = `
      <div class="section">

        <h3>Effects</h3>

        ${control(
          "texture",
          "Texture",
          -100,
          100
        )}

        ${control(
          "clarity",
          "Clarity",
          -100,
          100
        )}

        ${control(
          "dehaze",
          "Dehaze",
          -100,
          100
        )}

        ${control(
          "vignette",
          "Vignette",
          -100,
          100
        )}

        ${control(
          "midpoint",
          "Midpoint",
          0,
          100
        )}

        ${control(
          "feather",
          "Feather",
          0,
          100
        )}

        ${control(
          "roundness",
          "Roundness",
          -100,
          100
        )}

      </div>

      <div class="section">

        <h3>Grain</h3>

        ${control(
          "grain",
          "Amount",
          0,
          100
        )}

        ${control(
          "grainSize",
          "Size",
          0,
          100
        )}

        ${control(
          "grainRough",
          "Roughness",
          0,
          100
        )}

      </div>
    `;
  }

  if (active === "detail") {

    h = `
      <div class="section">

        <h3>Detail</h3>

        ${control(
          "sharp",
          "Sharpening",
          0,
          100
        )}

        ${control(
          "radius",
          "Radius",
          0.5,
          3,
          0.1
        )}

        ${control(
          "noise",
          "Noise Reduction",
          0,
          100
        )}

        ${control(
          "colorNoise",
          "Color Noise",
          0,
          100
        )}

      </div>

      <p class="note">
        Preview processing is capped for speed.
      </p>
    `;
  }

  if (active === "crop") {

    h = `
      <div class="section">

        <h3>Crop & Geometry</h3>

        <div class="cropbox">
          Centered crop preview
        </div>

        <select
          class="select"
          id="ratio"
        >
          <option value="original">
            Original
          </option>

          <option value="1:1">1 : 1</option>
          <option value="4:5">4 : 5</option>
          <option value="3:4">3 : 4</option>
          <option value="4:3">4 : 3</option>
          <option value="16:9">16 : 9</option>
          <option value="9:16">9 : 16</option>
          <option value="2:3">2 : 3</option>
        </select>

        ${control(
          "straighten",
          "Straighten",
          -10,
          10,
          0.1
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
    `;
  }

  if (active === "presets") {

    h = `
      <div class="section">

        <h3>Toolora Presets</h3>

        <div class="presets">

          <button
            class="preset"
            data-preset="clean"
          >
            <b>Clean</b>
            <small>Balanced</small>
          </button>

          <button
            class="preset"
            data-preset="warm"
          >
            <b>Warm</b>
            <small>Soft warm</small>
          </button>

          <button
            class="preset"
            data-preset="cool"
          >
            <b>Cool</b>
            <small>Clean cool</small>
          </button>

          <button
            class="preset"
            data-preset="cinematic"
          >
            <b>Cinematic</b>
            <small>Moody</small>
          </button>

          <button
            class="preset"
            data-preset="matte"
          >
            <b>Matte</b>
            <small>Soft film</small>
          </button>

          <button
            class="preset"
            data-preset="vivid"
          >
            <b>Vivid</b>
            <small>Color punch</small>
          </button>

          <button
            class="preset"
            data-preset="portrait"
          >
            <b>Portrait</b>
            <small>Soft portrait</small>
          </button>

          <button
            class="preset"
            data-preset="bw"
          >
            <b>B&W</b>
            <small>Monochrome</small>
          </button>

        </div>

      </div>

      ${control(
        "presetAmount",
        "Preset Amount",
        0,
        100
      )}
    `;
  }

  if (active === "profiles") {

    h = `
      <div class="section">

        <h3>Profiles</h3>

        <div class="grid2">

          <button
            class="btn ${S.profile === "natural" ? "active" : ""}"
            data-profile="natural"
          >
            Natural
          </button>

          <button
            class="btn ${S.profile === "neutral" ? "active" : ""}"
            data-profile="neutral"
          >
            Neutral
          </button>

          <button
            class="btn ${S.profile === "vivid" ? "active" : ""}"
            data-profile="vivid"
          >
            Vivid
          </button>

          <button
            class="btn ${S.profile === "modern" ? "active" : ""}"
            data-profile="modern"
          >
            Modern
          </button>

          <button
            class="btn ${S.profile === "film" ? "active" : ""}"
            data-profile="film"
          >
            Film
          </button>

          <button
            class="btn ${S.profile === "mono" ? "active" : ""}"
            data-profile="mono"
          >
            Monochrome
          </button>

        </div>

      </div>

      <p class="note">
        Profiles change the base rendering character
        while keeping edits non-destructive.
      </p>
    `;
  }

  if (active === "mask") {

    h = `
      <div class="section">

        <h3>Local Mask</h3>

        <div class="grid3">

          <button
            class="btn mask ${S.maskType === "radial" ? "active" : ""}"
            data-type="radial"
          >
            Radial
          </button>

          <button
            class="btn mask ${S.maskType === "linear" ? "active" : ""}"
            data-type="linear"
          >
            Linear
          </button>

          <button
            class="btn mask ${S.maskType === "brush" ? "active" : ""}"
            data-type="brush"
          >
            Brush
          </button>

        </div>

        ${control(
          "maskAmount",
          "Mask Amount",
          0,
          100
        )}

        ${control(
          "maskExposure",
          "Local Exposure",
          -100,
          100
        )}

        ${control(
          "maskContrast",
          "Local Contrast",
          -100,
          100
        )}

        ${control(
          "maskSaturation",
          "Local Saturation",
          -100,
          100
        )}

        <button
          class="btn"
          id="maskClear"
          style="width:100%"
        >
          Clear Mask
        </button>

      </div>

      <p class="note">
        Radial and linear masks are browser-side masks.
        AI subject and sky selection is not faked.
      </p>
    `;
  }

  if (active === "retouch") {

    h = `
      <div class="section">

        <h3>Spot Blur Retouch</h3>

        ${control(
          "retouchSize",
          "Brush Size",
          5,
          100
        )}

        <button
          class="btn"
          id="retouchClear"
          style="width:100%"
        >
          Clear Retouch
        </button>

      </div>

      <p class="note">
        Paint over an unwanted area on the photo
        to blur it locally.
      </p>
    `;
  }

  if (active === "blur") {

    h = `
      <div class="section">

        <h3>Lens-style Blur</h3>

        ${control(
          "blur",
          "Blur Amount",
          0,
          100
        )}

        ${control(
          "blurX",
          "Focus X",
          0,
          100
        )}

        ${control(
          "blurY",
          "Focus Y",
          0,
          100
        )}

      </div>
    `;
  }

  if (active === "optics") {

    h = `
      <div class="section">

        <h3>Optics</h3>

        ${control(
          "lensVignette",
          "Lens Vignette",
          -100,
          100
        )}

        ${control(
          "defringe",
          "Defringe",
          0,
          100
        )}

      </div>

      <p class="note">
        Camera-specific lens profiles require
        external profile data.
      </p>
    `;
  }

  if (active === "export") {

    h = `
      <div class="section">

        <h3>Export</h3>

        <div class="export">

          <div class="grid2">

            <div>

              <div class="colorhead">
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

              <div class="colorhead">
                Quality
              </div>

              <select
                class="select"
                id="quality"
              >
                <option value=".7">
                  Standard
                </option>

                <option
                  value=".85"
                  selected
                >
                  High
                </option>

                <option value=".95">
                  Maximum
                </option>
              </select>

            </div>

          </div>

          <div
            class="colorhead"
            style="margin-top:10px"
          >
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

      </div>

      <button
        class="btn danger"
        id="resetAll"
        style="width:100%"
      >
        Reset All Edits
      </button>
    `;
  }

  p.innerHTML = h;

  bind();
  panelActions();
}

function panelActions() {

  $("auto")?.addEventListener(
    "click",
    () => {

      push();

      S.exposure = 0;
      S.contrast = 8;
      S.highlights = -14;
      S.shadows = 16;
      S.whites = 4;
      S.blacks = -5;

      render();
      panel();
    }
  );

  $("ratio")?.addEventListener(
    "change",
    e => {

      push();

      S.ratio = e.target.value;

      schedule();
    }
  );

  $("rl")?.addEventListener(
    "click",
    () => {

      push();

      S.rotate =
        (S.rotate + 270) % 360;

      schedule();
    }
  );

  $("rr")?.addEventListener(
    "click",
    () => {

      push();

      S.rotate =
        (S.rotate + 90) % 360;

      schedule();
    }
  );

  $("fx")?.addEventListener(
    "click",
    () => {

      push();

      S.flipX = !S.flipX;

      schedule();
    }
  );

  $("fy")?.addEventListener(
    "click",
    () => {

      push();

      S.flipY = !S.flipY;

      schedule();
    }
  );

  document
    .querySelectorAll("[data-preset]")
    .forEach(button => {

      button.onclick = () =>
        preset(button.dataset.preset);
    });

  document
    .querySelectorAll("[data-profile]")
    .forEach(button => {

      button.onclick = () => {

        push();

        S.profile =
          button.dataset.profile;

        render();
        panel();
      };
    });

  document
    .querySelectorAll(".mask")
    .forEach(button => {

      button.onclick = () => {

        S.maskType =
          button.dataset.type;

        document
          .querySelectorAll(".mask")
          .forEach(x =>
            x.classList.remove("active")
          );

        button.classList.add("active");

        schedule();
      };
    });

  $("maskClear")?.addEventListener(
    "click",
    () => {

      push();

      S.maskAmount = 0;
      S.maskExposure = 0;
      S.maskContrast = 0;
      S.maskSaturation = 0;

      schedule();
    }
  );

  $("retouchClear")?.addEventListener(
    "click",
    () => {

      retouch = [];

      render();
    }
  );

  $("download")?.addEventListener(
    "click",
    exportImage
  );

  $("resetAll")?.addEventListener(
    "click",
    resetAll
  );
}

function preset(name) {

  push();

  const z = {
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
    grain: 0
  };

  const presets = {

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

  Object.assign(
    z,
    presets[name] || {}
  );

  Object.assign(
    S,
    z
  );

  S.preset = name;

  render();
  panel();
}

function load(file) {

  if (
    !file ||
    !file.type.startsWith("image/")
  ) {
    return;
  }

  const url =
    URL.createObjectURL(file);

  const image =
    new Image();

  image.onload = () => {

    URL.revokeObjectURL(url);

    img = image;
    fileName = file.name;

    const max = 1400;

    const scale =
      Math.min(
        1,
        max /
        Math.max(
          image.naturalWidth,
          image.naturalHeight
        )
      );

    src.width =
      Math.round(
        image.naturalWidth * scale
      );

    src.height =
      Math.round(
        image.naturalHeight * scale
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

    $("name").textContent =
      file.name;

    $("meta").textContent =
      `${image.naturalWidth} × ${image.naturalHeight}px`;

    $("empty").style.display =
      "none";

    C.style.display =
      "block";

    O.style.display =
      "block";

    resetState(false);

    render();
  };

  image.src = url;
}

$("fileInput").onchange =
  e => load(e.target.files[0]);

$("emptyInput").onchange =
  e => load(e.target.files[0]);

function resetState() {

  for (
    const key of Object.keys(S)
  ) {

    if (
      key.startsWith("h_") ||
      key.startsWith("s_") ||
      key.startsWith("l_")
    ) {

      S[key] = 0;

    } else if (
      typeof S[key] === "boolean"
    ) {

      S[key] = false;

    } else if (
      key === "ratio" ||
      key === "profile" ||
      key === "preset" ||
      key === "maskType"
    ) {

      if (key === "ratio") {
        S[key] = "original";
      }

      if (key === "profile") {
        S[key] = "natural";
      }

      if (key === "preset") {
        S[key] = "none";
      }

      if (key === "maskType") {
        S[key] = "radial";
      }

    } else if (
      key === "midpoint" ||
      key === "feather"
    ) {

      S[key] = 50;

    } else if (
      key === "grainSize"
    ) {

      S[key] = 25;

    } else if (
      key === "grainRough" ||
      key === "blurX" ||
      key === "blurY"
    ) {

      S[key] = 50;

    } else if (
      key === "radius"
    ) {

      S[key] = 1;

    } else if (
      key === "gradeBlend"
    ) {

      S[key] = 50;

    } else {

      S[key] = 0;
    }
  }

  S.presetAmount = 100;

  history = [];
  future = [];

  retouch = [];

  zoom = 1;

  panel();

  schedule();
}

function resetAll() {

  push();

  resetState();
}

function schedule() {

  if (renderQueued) {
    return;
  }

  renderQueued = true;

  requestAnimationFrame(() => {

    renderQueued = false;

    render();
  });
}

function profileValues() {

  const p = {
    exposure: S.exposure,
    contrast: S.contrast,
    saturation: S.saturation,
    vibrance: S.vibrance,
    clarity: S.clarity,
    temp: S.temp,
    grain: S.grain
  };

  if (S.profile === "vivid") {
    p.vibrance += 12;
    p.saturation += 5;
    p.contrast += 5;
  }

  if (S.profile === "neutral") {
    p.contrast -= 3;
    p.saturation -= 3;
  }

  if (S.profile === "modern") {
    p.contrast += 5;
    p.clarity += 7;
    p.vibrance += 7;
  }

  if (S.profile === "film") {
    p.contrast += 4;
    p.saturation -= 5;
    p.temp += 4;
    p.grain += 5;
  }

  if (S.profile === "mono") {
    p.saturation = -100;
  }

  return p;
}

function rgbh(r, g, b) {

  const max =
    Math.max(r, g, b);

  const min =
    Math.min(r, g, b);

  const d =
    max - min;

  let h = 0;

  const s =
    max ? d / max : 0;

  if (d) {

    if (max === r) {
      h =
        ((g - b) / d +
        (g < b ? 6 : 0)) / 6;

    } else if (max === g) {

      h =
        ((b - r) / d + 2) / 6;

    } else {

      h =
        ((r - g) / d + 4) / 6;
    }
  }

  return [
    h,
    s,
    max
  ];
}

function hsv(h, s, v) {

  let i =
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
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q]
  ][i % 6];
}

function band(h) {

  if (h < .04 || h > .96)
    return "red";

  if (h < .11)
    return "orange";

  if (h < .19)
    return "yellow";

  if (h < .43)
    return "green";

  if (h < .53)
    return "aqua";

  if (h < .70)
    return "blue";

  if (h < .85)
    return "purple";

  return "magenta";
}

function applyPixel(
  imageData,
  w,
  h
) {

  const d =
    imageData.data;

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

  for (
    let i = 0;
    i < d.length;
    i += 4
  ) {

    let r =
      d[i] / 255;

    let g =
      d[i + 1] / 255;

    let b =
      d[i + 2] / 255;

    r *= exposure;
    g *= exposure;
    b *= exposure;

    const lum =
      .2126 * r +
      .7152 * g +
      .0722 * b;

    const highlights =
      p.highlights / 120;

    const shadows =
      p.shadows / 120;

    if (lum > .5) {

      r += highlights * (r - .5);
      g += highlights * (g - .5);
      b += highlights * (b - .5);

    } else {

      r += shadows * (.5 - r);
      g += shadows * (.5 - g);
      b += shadows * (.5 - b);
    }

    const whiteBlack =
      p.whites / 255 +
      p.blacks / 255;

    r += whiteBlack;
    g += whiteBlack;
    b += whiteBlack;

    r =
      (r - .5) *
      contrast + .5;

    g =
      (g - .5) *
      contrast + .5;

    b =
      (b - .5) *
      contrast + .5;

    r += p.temp * .0009;
    b -= p.temp * .0009;

    g += p.tint * .00045;

    const gray =
      .299 * r +
      .587 * g +
      .114 * b;

    const boost =
      1 +
      vibrance *
      (1 - Math.abs(2 * lum - 1)) *
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

    const effect =
      (p.texture + p.clarity) /
      900;

    const average =
      (r + g + b) / 3;

    r +=
      (r - average) *
      effect;

    g +=
      (g - average) *
      effect;

    b +=
      (b - average) *
      effect;

    if (p.dehaze) {

      const dehaze =
        p.dehaze / 140;

      r =
        (r - .5) *
        (1 + dehaze) + .5;

      g =
        (g - .5) *
        (1 + dehaze) + .5;

      b =
        (b - .5) *
        (1 + dehaze) + .5;
    }

    let [
      hue,
      sat,
      val
    ] = rgbh(
      clamp(r, 0, 1),
      clamp(g, 0, 1),
      clamp(b, 0, 1)
    );

    const colorBand =
      band(hue);

    const hueAdjust =
      S["h_" + colorBand];

    const satAdjust =
      S["s_" + colorBand];

    const lumAdjust =
      S["l_" + colorBand];

    if (
      hueAdjust ||
      satAdjust ||
      lumAdjust
    ) {

      [
        r,
        g,
        b
      ] = hsv(
        (
          hue +
          hueAdjust / 360 +
          1
        ) % 1,

        clamp(
          sat *
          (1 + satAdjust / 100),
          0,
          1
        ),

        clamp(
          val *
          (1 + lumAdjust / 100),
          0,
          1
        )
      );
    }

    const luminance =
      .2126 * r +
      .7152 * g +
      .0722 * b;

    let gradeHue;
    let gradeSat;

    if (luminance < .35) {

      gradeHue =
        S.gradeShadow;

      gradeSat =
        S.gradeShadowSat;

    } else if (luminance > .65) {

      gradeHue =
        S.gradeHigh;

      gradeSat =
        S.gradeHighSat;

    } else {

      gradeHue =
        S.gradeMid;

      gradeSat =
        S.gradeMidSat;
    }

    if (gradeSat) {

      const graded =
        hsv(
          gradeHue / 360,
          gradeSat / 100,
          Math.max(.25, luminance)
        );

      const blend =
        (S.gradeBlend / 100) *
        .35;

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

    const x =
      (i / 4 % w) / w - .5;

    const y =
      Math.floor(i / 4 / w) /
      h - .5;

    const distance =
      Math.sqrt(
        x * x +
        y * y
      ) * 1.414;

    if (p.vignette) {

      const edge =
        clamp(
          (
            distance -
            S.midpoint / 100 * .65
          ) /
          Math.max(
            .05,
            S.feather / 100
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

    if (S.lensVignette) {

      const edge =
        clamp(
          distance * 1.5,
          0,
          1
        );

      const lens =
        1 -
        S.lensVignette /
        100 *
        edge *
        edge;

      r *= lens;
      g *= lens;
      b *= lens;
    }

    if (S.maskAmount) {

      let mask = 0;

      if (
        S.maskType === "radial"
      ) {

        mask =
          1 -
          clamp(
            Math.sqrt(
              x * x +
              y * y
            ) * 2.1,
            0,
            1
          );

      } else if (
        S.maskType === "linear"
      ) {

        mask =
          clamp(
            1 -
            Math.abs(y) * 2,
            0,
            1
          );

      } else {

        mask = 1;
      }

      mask *=
        S.maskAmount / 100;

      r +=
        mask *
        S.maskExposure /
        250;

      g +=
        mask *
        S.maskExposure /
        250;

      b +=
        mask *
        S.maskExposure /
        250;

      const maskContrast =
        1 +
        mask *
        S.maskContrast /
        100;

      r =
        (r - .5) *
        maskContrast + .5;

      g =
        (g - .5) *
        maskContrast + .5;

      b =
        (b - .5) *
        maskContrast + .5;

      const maskGray =
        .299 * r +
        .587 * g +
        .114 * b;

      const maskSat =
        1 +
        mask *
        S.maskSaturation /
        100;

      r =
        maskGray +
        (r - maskGray) *
        maskSat;

      g =
        maskGray +
        (g - maskGray) *
        maskSat;

      b =
        maskGray +
        (b - maskGray) *
        maskSat;
    }

    d[i] =
      clamp(r * 255, 0, 255);

    d[i + 1] =
      clamp(g * 255, 0, 255);

    d[i + 2] =
      clamp(b * 255, 0, 255);
  }

  return imageData;
}

function sharpen(
  canvasContext,
  w,
  h,
  amount
) {

  if (amount < 1) {
    return;
  }

  const source =
    canvasContext.getImageData(
      0,
      0,
      w,
      h
    );

  const output =
    canvasContext.createImageData(
      w,
      h
    );

  const d =
    source.data;

  const q =
    output.data;

  const k =
    amount / 100 * .7;

  for (
    let y = 1;
    y < h - 1;
    y++
  ) {

    for (
      let x = 1;
      x < w - 1;
      x++
    ) {

      const i =
        (y * w + x) * 4;

      for (
        let channel = 0;
        channel < 3;
        channel++
      ) {

        q[i + channel] =
          clamp(
            d[i + channel] *
              (1 + 4 * k) -

            k * (
              d[i - 4 + channel] +
              d[i + 4 + channel] +
              d[i - w * 4 + channel] +
              d[i + w * 4 + channel]
            ),

            0,
            255
          );
      }

      q[i + 3] = 255;
    }
  }

  canvasContext.putImageData(
    output,
    0,
    0
  );
}

function grain(
  canvasContext,
  w,
  h,
  amount
) {

  if (!amount) {
    return;
  }

  const data =
    canvasContext.getImageData(
      0,
      0,
      w,
      h
    );

  const d =
    data.data;

  const intensity =
    amount / 100 * 28;

  for (
    let i = 0;
    i < d.length;
    i += 4
  ) {

    const random =
      (Math.random() - .5) *
      intensity;

    d[i] =
      clamp(
        d[i] + random,
        0,
        255
      );

    d[i + 1] =
      clamp(
        d[i + 1] + random,
        0,
        255
      );

    d[i + 2] =
      clamp(
        d[i + 2] + random,
        0,
        255
      );
  }

  canvasContext.putImageData(
    data,
    0,
    0
  );
}

function applyBlur(
  canvasContext,
  w,
  h,
  amount
) {

  if (!amount) {
    return;
  }

  const copy =
    document.createElement("canvas");

  copy.width = w;
  copy.height = h;

  const copyContext =
    copy.getContext("2d");

  copyContext.drawImage(
    canvasContext.canvas,
    0,
    0
  );

  canvasContext.save();

  canvasContext.filter =
    `blur(${Math.min(
      10,
      amount / 10
    )}px)`;

  canvasContext.clearRect(
    0,
    0,
    w,
    h
  );

  canvasContext.drawImage(
    copy,
    0,
    0
  );

  canvasContext.restore();
}

function retouchDraw(
  canvasContext,
  w,
  h
) {

  if (!retouch.length) {
    return;
  }

  for (
    const point of retouch
  ) {

    const radius =
      point.r;

    const blur =
      Math.max(
        2,
        radius / 5
      );

    canvasContext.save();

    canvasContext.beginPath();

    canvasContext.arc(
      point.x,
      point.y,
      radius,
      0,
      Math.PI * 2
    );

    canvasContext.clip();

    const copy =
      document.createElement("canvas");

    copy.width = w;
    copy.height = h;

    const copyContext =
      copy.getContext("2d");

    copyContext.filter =
      `blur(${blur}px)`;

    copyContext.drawImage(
      canvasContext.canvas,
      0,
      0
    );

    canvasContext.drawImage(
      copy,
      0,
      0
    );

    canvasContext.restore();
  }
}

function render() {

  if (!img) {
    return;
  }

  $("status").textContent =
    "Rendering...";

  const angle =
    (
      S.rotate +
      S.straighten
    ) *
    Math.PI /
    180;

  const W = src.width;
  const H = src.height;

  const rotation =
    S.rotate % 180 !== 0;

  const sw =
    rotation ? H : W;

  const sh =
    rotation ? W : H;

  const transformed =
    document.createElement("canvas");

  transformed.width = sw;
  transformed.height = sh;

  const tc =
    transformed.getContext("2d");

  tc.translate(
    sw / 2,
    sh / 2
  );

  tc.rotate(angle);

  tc.scale(
    S.flipX ? -1 : 1,
    S.flipY ? -1 : 1
  );

  tc.drawImage(
    src,
    -W / 2,
    -H / 2
  );

  let cw = sw;
  let ch = sh;

  let cx = 0;
  let cy = 0;

  if (
    S.ratio !== "original"
  ) {

    const [
      rw,
      rh
    ] =
      S.ratio
        .split(":")
        .map(Number);

    const targetRatio =
      rw / rh;

    const currentRatio =
      sw / sh;

    if (
      currentRatio >
      targetRatio
    ) {

      cw =
        Math.round(
          sh *
          targetRatio
        );

      cx =
        (sw - cw) / 2;

    } else {

      ch =
        Math.round(
          sw /
          targetRatio
        );

      cy =
        (sh - ch) / 2;
    }
  }

  const max =
    innerWidth < 700
      ? 720
      : 1100;

  const scale =
    Math.min(
      1,
      max /
      Math.max(
        cw,
        ch
      )
    );

  const w =
    Math.max(
      1,
      Math.round(cw * scale)
    );

  const h =
    Math.max(
      1,
      Math.round(ch * scale)
    );

  C.width = w;
  C.height = h;

  ctx.clearRect(
    0,
    0,
    w,
    h
  );

  ctx.drawImage(
    transformed,
    cx,
    cy,
    cw,
    ch,
    0,
    0,
    w,
    h
  );

  if (showBefore) {

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

    $("status").textContent =
      "Original";

    return;
  }

  let data =
    ctx.getImageData(
      0,
      0,
      w,
      h
    );

  data =
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

  if (S.sharp) {

    sharpen(
      ctx,
      w,
      h,
      S.sharp
    );
  }

  if (S.noise) {

    const copy =
      document.createElement("canvas");

    copy.width = w;
    copy.height = h;

    const copyContext =
      copy.getContext("2d");

    copyContext.filter =
      `blur(${S.noise / 50}px)`;

    copyContext.drawImage(
      C,
      0,
      0
    );

    ctx.clearRect(
      0,
      0,
      w,
      h
    );

    ctx.drawImage(
      copy,
      0,
      0
    );
  }

  if (S.colorNoise) {

    const data =
      ctx.getImageData(
        0,
        0,
        w,
        h
      );

    const d =
      data.data;

    const strength =
      S.colorNoise / 100;

    for (
      let i = 0;
      i < d.length;
      i += 4
    ) {

      const gray =
        .299 * d[i] +
        .587 * d[i + 1] +
        .114 * d[i + 2];

      d[i] =
        d[i] * (1 - strength) +
        gray * strength;

      d[i + 1] =
        d[i + 1] * (1 - strength) +
        gray * strength;

      d[i + 2] =
        d[i + 2] * (1 - strength) +
        gray * strength;
    }

    ctx.putImageData(
      data,
      0,
      0
    );
  }

  if (S.grain) {

    grain(
      ctx,
      w,
      h,
      S.grain
    );
  }

  if (S.blur) {

    applyBlur(
      ctx,
      w,
      h,
      S.blur
    );
  }

  retouchDraw(
    ctx,
    w,
    h
  );

  showOverlay();

  C.style.transform =
    `scale(${zoom})`;

  $("zlabel").textContent =
    zoom === 1
      ? "Fit"
      : `${Math.round(
          zoom * 100
        )}%`;

  $("status").textContent =
    "Ready";
}

function showOverlay() {

  O.width = C.width;
  O.height = C.height;

  ox.clearRect(
    0,
    0,
    O.width,
    O.height
  );

  O.style.width =
    C.clientWidth + "px";

  O.style.height =
    C.clientHeight + "px";
}

function exportImage() {

  if (!img) {

    alert(
      "Please open a photo first."
    );

    return;
  }

  $("status").textContent =
    "Exporting...";

  const max =
    Number(
      $("size").value
    ) ||
    Math.max(
      src.width,
      src.height
    );

  const oldZoom =
    zoom;

  zoom = 1;

  render();

  const scale =
    Math.min(
      1,
      max /
      Math.max(
        C.width,
        C.height
      )
    );

  const output =
    document.createElement("canvas");

  output.width =
    Math.max(
      1,
      Math.round(
        C.width * scale
      )
    );

  output.height =
    Math.max(
      1,
      Math.round(
        C.height * scale
      )
    );

  const outputContext =
    output.getContext("2d");

  outputContext.drawImage(
    C,
    0,
    0,
    output.width,
    output.height
  );

  const type =
    $("format").value;

  const quality =
    Number(
      $("quality").value
    );

  let extension = "jpg";

  if (
    type === "image/png"
  ) {
    extension = "png";
  }

  if (
    type === "image/webp"
  ) {
    extension = "webp";
  }

  const link =
    document.createElement("a");

  link.download =
    `toolora-edited-${Date.now()}.${extension}`;

  link.href =
    output.toDataURL(
      type,
      quality
    );

  link.click();

  zoom = oldZoom;

  render();

  $("status").textContent =
    "Export complete";
}

$("tabs").addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        "[data-tool]"
      );

    if (!button) {
      return;
    }

    active =
      button.dataset.tool;

    document
      .querySelectorAll(
        "#tabs button"
      )
      .forEach(button =>
        button.classList.toggle(
          "active",
          button ===
          document.querySelector(
            `#tabs button[data-tool="${active}"]`
          )
        )
      );

    panel();
  }
);

$("reset").onclick = () => {

  push();

  resetState();
};

$("undo").onclick = () => {

  if (!history.length) {
    return;
  }

  future.push(
    snap()
  );

  restore(
    history.pop()
  );
};

$("redo").onclick = () => {

  if (!future.length) {
    return;
  }

  history.push(
    snap()
  );

  restore(
    future.pop()
  );
};

$("before").onclick = () => {

  showBefore =
    !showBefore;

  $("badge").style.display =
    showBefore
      ? "block"
      : "none";

  render();
};

$("zout").onclick = () => {

  zoom =
    clamp(
      zoom - .1,
      .5,
      2.5
    );

  render();
};

$("zin").onclick = () => {

  zoom =
    clamp(
      zoom + .1,
      .5,
      2.5
    );

  render();
};

$("fit").onclick = () => {

  zoom = 1;

  render();
};

$("full").onclick = () => {

  $("stage")
    .requestFullscreen?.();
};

$("stage").ondblclick = () => {

  $("before").click();
};

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

    if (
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

let drawing = false;

$("stage").addEventListener(
  "pointerdown",
  event => {

    if (
      active !== "retouch" ||
      !img
    ) {
      return;
    }

    drawing = true;

    $("stage")
      .setPointerCapture(
        event.pointerId
      );

    addRetouch(event);
  }
);

$("stage").addEventListener(
  "pointermove",
  event => {

    if (drawing) {
      addRetouch(event);
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

function addRetouch(event) {

  const rect =
    C.getBoundingClientRect();

  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return;
  }

  const x =
    (
      event.clientX -
      rect.left
    ) /
    rect.width *
    C.width;

  const y =
    (
      event.clientY -
      rect.top
    ) /
    rect.height *
    C.height;

  retouch.push({
    x,
    y,
    r:
      Math.max(
        3,
        S.retouchSize *
        C.width /
        1000
      )
  });

  schedule();
}

function init() {

  const lightButton =
    document.querySelector(
      '#tabs button[data-tool="light"]'
    );

  if (lightButton) {
    lightButton.classList.add(
      "active"
    );
  }

  panel();
}

init();

})();
