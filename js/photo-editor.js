(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const canvas = $("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const overlay = $("overlay");
  const overlayCtx = overlay.getContext("2d");

  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d", {
    willReadFrequently: true
  });

  let image = null;
  let fileName = "";
  let renderQueued = false;
  let zoom = 1;
  let activeTool = "light";
  let showBefore = false;

  let history = [];
  let future = [];

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
    gradeMidtone: 0,
    gradeHighlight: 0,
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

  colors.forEach((color) => {
    S["h_" + color] = 0;
    S["s_" + color] = 0;
    S["l_" + color] = 0;
  });

  /* =========================================================
     IMAGE UPLOAD
     ========================================================= */

  function handleImageFile(file) {
    if (!file) return;

    if (!file.type || !file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }

    const url = URL.createObjectURL(file);
    const newImage = new Image();

    newImage.onload = function () {
      URL.revokeObjectURL(url);

      image = newImage;
      fileName = file.name;

      const maxSize = 1400;

      const longestSide = Math.max(
        newImage.naturalWidth,
        newImage.naturalHeight
      );

      const scale = Math.min(1, maxSize / longestSide);

      sourceCanvas.width = Math.max(
        1,
        Math.round(newImage.naturalWidth * scale)
      );

      sourceCanvas.height = Math.max(
        1,
        Math.round(newImage.naturalHeight * scale)
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

      const nameElement = $("name");
      const metaElement = $("meta");
      const emptyElement = $("empty");
      const canvasElement = $("canvas");
      const overlayElement = $("overlay");
      const badgeElement = $("badge");

      if (nameElement) {
        nameElement.textContent = file.name;
      }

      if (metaElement) {
        metaElement.textContent =
          `${newImage.naturalWidth} × ${newImage.naturalHeight}px`;
      }

      if (emptyElement) {
        emptyElement.style.display = "none";
      }

      if (canvasElement) {
        canvasElement.style.display = "block";
      }

      if (overlayElement) {
        overlayElement.style.display = "block";
      }

      showBefore = false;

      if (badgeElement) {
        badgeElement.style.display = "none";
      }

      resetState(false);
      render();
    };

    newImage.onerror = function () {
      URL.revokeObjectURL(url);

      alert(
        "The selected image could not be opened. Please try another image."
      );
    };

    newImage.src = url;
  }

  function openFilePicker() {
    const input = $("fileInput");

    if (!input) {
      alert("Image upload control is unavailable.");
      return;
    }

    input.value = "";
    input.click();
  }

  const fileInput = $("fileInput");

  if (fileInput) {
    fileInput.addEventListener("change", function (event) {
      const file =
        event.target.files && event.target.files.length
          ? event.target.files[0]
          : null;

      handleImageFile(file);

      event.target.value = "";
    });
  }

  const emptyInput = $("emptyInput");

  if (emptyInput) {
    emptyInput.addEventListener("change", function (event) {
      const file =
        event.target.files && event.target.files.length
          ? event.target.files[0]
          : null;

      handleImageFile(file);

      event.target.value = "";
    });
  }

  /* =========================================================
     OPEN PHOTO BUTTON
     ========================================================= */

  const uploadButtons = document.querySelectorAll(
    '[data-action="upload"], #uploadBtn, #openPhoto, .upload-button'
  );

  uploadButtons.forEach((button) => {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openFilePicker();
    });
  });

  /* =========================================================
     COLOR HELPERS
     ========================================================= */

  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    const d = max - min;

    let h = 0;

    if (d !== 0) {
      if (max === r) {
        h = ((g - b) / d) % 6;
      } else if (max === g) {
        h = (b - r) / d + 2;
      } else {
        h = (r - g) / d + 4;
      }

      h *= 60;

      if (h < 0) {
        h += 360;
      }
    }

    const s = max === 0 ? 0 : d / max;

    return {
      h,
      s,
      v: max
    };
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  function applyTemperature(r, g, b, value) {
    const amount = value / 100;

    r += amount * 25;
    b -= amount * 25;

    return [
      clamp(r, 0, 255),
      clamp(g, 0, 255),
      clamp(b, 0, 255)
    ];
  }

  /* =========================================================
     PRESETS
     ========================================================= */

  const presets = {
    clean: {
      exposure: 4,
      contrast: 4,
      saturation: 2,
      clarity: 4
    },

    warm: {
      exposure: 3,
      temperature: 18,
      contrast: 3,
      saturation: 5
    },

    cool: {
      temperature: -18,
      contrast: 4,
      saturation: 2
    },

    cinematic: {
      contrast: 15,
      highlights: -12,
      shadows: 8,
      saturation: -5,
      clarity: 10,
      vignette: 18
    },

    matte: {
      contrast: -8,
      blacks: 12,
      saturation: -5,
      grain: 10
    },

    vivid: {
      contrast: 10,
      saturation: 18,
      vibrance: 22,
      clarity: 8
    },

    portrait: {
      exposure: 3,
      highlights: -10,
      shadows: 10,
      texture: -8,
      clarity: -4,
      saturation: 2
    },

    bw: {
      saturation: -100,
      contrast: 12,
      clarity: 8
    }
  };

  function applyPreset(name) {
    if (!presets[name]) return;

    const preset = presets[name];

    Object.keys(preset).forEach((key) => {
      if (key in S) {
        S[key] = preset[key];
      }
    });

    S.preset = name;
    S.presetAmount = 100;

    render();
  }

  /* =========================================================
     PROFILE
     ========================================================= */

  function applyProfile(r, g, b) {
    const profile = S.profile;

    if (profile === "neutral") {
      return [r, g, b];
    }

    if (profile === "vivid") {
      r = (r - 128) * 1.08 + 128;
      g = (g - 128) * 1.08 + 128;
      b = (b - 128) * 1.08 + 128;
    }

    if (profile === "modern") {
      r = (r - 128) * 1.05 + 128;
      g = (g - 128) * 1.05 + 128;
      b = (b - 128) * 1.05 + 128;
    }

    if (profile === "film") {
      r = r * 0.96 + 6;
      g = g * 0.97 + 5;
      b = b * 0.95 + 7;
    }

    if (profile === "monochrome") {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      r = gray;
      g = gray;
      b = gray;
    }

    return [
      clamp(r, 0, 255),
      clamp(g, 0, 255),
      clamp(b, 0, 255)
    ];
  }

  /* =========================================================
     PIXEL PROCESSING
     ========================================================= */

  function processPixels(imageData) {
    const data = imageData.data;

    const exposureFactor = Math.pow(2, S.exposure / 100);

    const contrastFactor =
      (259 * (S.contrast + 255)) /
      (255 * (259 - S.contrast));

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      /* Exposure */
      r *= exposureFactor;
      g *= exposureFactor;
      b *= exposureFactor;

      /* Highlights / Shadows */
      const luminance =
        0.2126 * r +
        0.7152 * g +
        0.0722 * b;

      const shadowAmount =
        ((255 - luminance) / 255) *
        (S.shadows / 100);

      const highlightAmount =
        (luminance / 255) *
        (S.highlights / 100);

      r += 255 * shadowAmount;
      g += 255 * shadowAmount;
      b += 255 * shadowAmount;

      r -= 255 * highlightAmount;
      g -= 255 * highlightAmount;
      b -= 255 * highlightAmount;

      /* Contrast */
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;

      /* Whites / Blacks */
      const whiteAmount = S.whites / 100;
      const blackAmount = S.blacks / 100;

      r += whiteAmount * 30;
      g += whiteAmount * 30;
      b += whiteAmount * 30;

      r += blackAmount * 25;
      g += blackAmount * 25;
      b += blackAmount * 25;

      /* Temperature */
      [r, g, b] = applyTemperature(
        r,
        g,
        b,
        S.temp
      );

      /* Tint */
      const tintAmount = S.tint / 100;

      r += tintAmount * 8;
      b += tintAmount * 8;
      g -= tintAmount * 10;

      /* Saturation */
      const gray =
        0.299 * r +
        0.587 * g +
        0.114 * b;

      const saturationFactor =
        1 + S.saturation / 100;

      r = gray + (r - gray) * saturationFactor;
      g = gray + (g - gray) * saturationFactor;
      b = gray + (b - gray) * saturationFactor;

      /* Vibrance */
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);

      const currentSat =
        maxChannel === 0
          ? 0
          : (maxChannel - minChannel) / maxChannel;

      const vibranceAmount =
        (S.vibrance / 100) *
        (1 - currentSat);

      r = gray + (r - gray) * (1 + vibranceAmount);
      g = gray + (g - gray) * (1 + vibranceAmount);
      b = gray + (b - gray) * (1 + vibranceAmount);

      /* Texture */
      if (S.texture !== 0) {
        const textureFactor =
          1 + S.texture / 300;

        r = gray + (r - gray) * textureFactor;
        g = gray + (g - gray) * textureFactor;
        b = gray + (b - gray) * textureFactor;
      }

      /* Clarity */
      if (S.clarity !== 0) {
        const clarityFactor =
          1 + S.clarity / 200;

        r = gray + (r - gray) * clarityFactor;
        g = gray + (g - gray) * clarityFactor;
        b = gray + (b - gray) * clarityFactor;
      }

      /* Dehaze */
      if (S.dehaze !== 0) {
        const dehazeFactor =
          1 + S.dehaze / 180;

        r = 128 + (r - 128) * dehazeFactor;
        g = 128 + (g - 128) * dehazeFactor;
        b = 128 + (b - 128) * dehazeFactor;
      }

      /* Profile */
      [r, g, b] = applyProfile(r, g, b);

      data[i] = clamp(r, 0, 255);
      data[i + 1] = clamp(g, 0, 255);
      data[i + 2] = clamp(b, 0, 255);
    }

    return imageData;
  }

  /* =========================================================
     VIGNETTE
     ========================================================= */

  function applyVignette(context, width, height) {
    if (S.vignette === 0) return;

    const amount = Math.abs(S.vignette) / 100;

    const gradient = context.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.15,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75
    );

    if (S.vignette > 0) {
      gradient.addColorStop(
        0,
        "rgba(0,0,0,0)"
      );

      gradient.addColorStop(
        1,
        `rgba(0,0,0,${amount * 0.7})`
      );
    } else {
      gradient.addColorStop(
        0,
        `rgba(255,255,255,${amount * 0.35})`
      );

      gradient.addColorStop(
        1,
        "rgba(0,0,0,0)"
      );
    }

    context.save();

    context.fillStyle = gradient;

    context.fillRect(
      0,
      0,
      width,
      height
    );

    context.restore();
  }

  /* =========================================================
     GRAIN
     ========================================================= */

  function applyGrain(context, width, height) {
    if (S.grain <= 0) return;

    const imageData = context.getImageData(
      0,
      0,
      width,
      height
    );

    const data = imageData.data;

    const amount = S.grain * 0.8;

    for (let i = 0; i < data.length; i += 4) {
      const random =
        (Math.random() - 0.5) * amount;

      data[i] = clamp(
        data[i] + random,
        0,
        255
      );

      data[i + 1] = clamp(
        data[i + 1] + random,
        0,
        255
      );

      data[i + 2] = clamp(
        data[i + 2] + random,
        0,
        255
      );
    }

    context.putImageData(
      imageData,
      0,
      0
    );
  }

  /* =========================================================
     BLUR
     ========================================================= */

  function applyBlur(context, width, height) {
    if (S.blur <= 0) return;

    const tempCanvas =
      document.createElement("canvas");

    tempCanvas.width = width;
    tempCanvas.height = height;

    const tempCtx =
      tempCanvas.getContext("2d");

    tempCtx.filter =
      `blur(${Math.max(1, S.blur / 8)}px)`;

    tempCtx.drawImage(
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
      tempCanvas,
      0,
      0
    );
  }

  /* =========================================================
     SHARPEN
     ========================================================= */

  function applySharpen(context, width, height) {
    if (S.sharp <= 0) return;

    const imageData =
      context.getImageData(
        0,
        0,
        width,
        height
      );

    const source =
      new Uint8ClampedArray(
        imageData.data
      );

    const data =
      imageData.data;

    const strength =
      S.sharp / 100;

    for (
      let y = 1;
      y < height - 1;
      y++
    ) {
      for (
        let x = 1;
        x < width - 1;
        x++
      ) {
        const i =
          (y * width + x) * 4;

        const top =
          ((y - 1) * width + x) * 4;

        const bottom =
          ((y + 1) * width + x) * 4;

        const left =
          (y * width + x - 1) * 4;

        const right =
          (y * width + x + 1) * 4;

        for (let c = 0; c < 3; c++) {
          const value =
            source[i + c] * 5 -
            source[top + c] -
            source[bottom + c] -
            source[left + c] -
            source[right + c];

          data[i + c] =
            clamp(
              source[i + c] +
                (value - source[i + c]) *
                  strength,
              0,
              255
            );
        }
      }
    }

    context.putImageData(
      imageData,
      0,
      0
    );
  }

  /* =========================================================
     MASK
     ========================================================= */

  function applyMask(context, width, height) {
    if (S.maskAmount === 0) return;

    const imageData =
      context.getImageData(
        0,
        0,
        width,
        height
      );

    const data =
      imageData.data;

    const amount =
      S.maskAmount / 100;

    for (
      let y = 0;
      y < height;
      y++
    ) {
      for (
        let x = 0;
        x < width;
        x++
      ) {
        let mask = 0;

        if (S.maskType === "radial") {
          const dx =
            (x - width / 2) /
            (width / 2);

          const dy =
            (y - height / 2) /
            (height / 2);

          const distance =
            Math.sqrt(
              dx * dx +
              dy * dy
            );

          mask =
            clamp(
              1 - distance,
              0,
              1
            );
        } else if (
          S.maskType === "linear"
        ) {
          mask =
            clamp(
              1 - y / height,
              0,
              1
            );
        } else {
          mask =
            1 -
            Math.abs(
              y / height - 0.5
            ) * 2;
        }

        mask *= amount;

        const i =
          (y * width + x) * 4;

        const localExposure =
          Math.pow(
            2,
            (S.maskExposure / 100) *
              mask
          );

        data[i] =
          clamp(
            data[i] *
              localExposure,
            0,
            255
          );

        data[i + 1] =
          clamp(
            data[i + 1] *
              localExposure,
            0,
            255
          );

        data[i + 2] =
          clamp(
            data[i + 2] *
              localExposure,
            0,
            255
          );
      }
    }

    context.putImageData(
      imageData,
      0,
      0
    );
  }

  /* =========================================================
     GEOMETRY
     ========================================================= */

  function getGeometry() {
    let width = sourceCanvas.width;
    let height = sourceCanvas.height;

    const angle =
      (S.rotate + S.straighten) *
      Math.PI /
      180;

    const cos =
      Math.abs(Math.cos(angle));

    const sin =
      Math.abs(Math.sin(angle));

    const rotatedWidth =
      Math.ceil(
        width * cos +
        height * sin
      );

    const rotatedHeight =
      Math.ceil(
        width * sin +
        height * cos
      );

    return {
      width: rotatedWidth,
      height: rotatedHeight,
      angle
    };
  }

  /* =========================================================
     RENDER
     ========================================================= */

  function render() {
    if (!image) return;

    if (renderQueued) return;

    renderQueued = true;

    requestAnimationFrame(() => {
      renderQueued = false;

      renderNow();
    });
  }

  function renderNow() {
    if (!image) return;

    const geometry =
      getGeometry();

    const workingCanvas =
      document.createElement("canvas");

    workingCanvas.width =
      geometry.width;

    workingCanvas.height =
      geometry.height;

    const workingCtx =
      workingCanvas.getContext("2d", {
        willReadFrequently: true
      });

    workingCtx.save();

    workingCtx.translate(
      geometry.width / 2,
      geometry.height / 2
    );

    workingCtx.rotate(
      geometry.angle
    );

    workingCtx.scale(
      S.flipX ? -1 : 1,
      S.flipY ? -1 : 1
    );

    workingCtx.drawImage(
      sourceCanvas,
      -sourceCanvas.width / 2,
      -sourceCanvas.height / 2
    );

    workingCtx.restore();

    let imageData =
      workingCtx.getImageData(
        0,
        0,
        geometry.width,
        geometry.height
      );

    imageData =
      processPixels(imageData);

    workingCtx.putImageData(
      imageData,
      0,
      0
    );

    applyMask(
      workingCtx,
      geometry.width,
      geometry.height
    );

    applySharpen(
      workingCtx,
      geometry.width,
      geometry.height
    );

    applyBlur(
      workingCtx,
      geometry.width,
      geometry.height
    );

    applyVignette(
      workingCtx,
      geometry.width,
      geometry.height
    );

    applyGrain(
      workingCtx,
      geometry.width,
      geometry.height
    );

    drawPreview(
      workingCanvas,
      geometry.width,
      geometry.height
    );
  }

  function drawPreview(
    workingCanvas,
    width,
    height
  ) {
    const viewer =
      document.querySelector(".stage");

    if (!viewer) return;

    const maxWidth =
      Math.max(
        100,
        viewer.clientWidth || 600
      );

    const maxHeight =
      Math.max(
        100,
        viewer.clientHeight || 500
      );

    const scale =
      Math.min(
        maxWidth / width,
        maxHeight / height,
        1
      );

    const outputWidth =
      Math.max(
        1,
        Math.round(width * scale)
      );

    const outputHeight =
      Math.max(
        1,
        Math.round(height * scale)
      );

    canvas.width =
      outputWidth;

    canvas.height =
      outputHeight;

    overlay.width =
      outputWidth;

    overlay.height =
      outputHeight;

    ctx.clearRect(
      0,
      0,
      outputWidth,
      outputHeight
    );

    if (showBefore) {
      ctx.drawImage(
        sourceCanvas,
        0,
        0,
        outputWidth,
        outputHeight
      );
    } else {
      ctx.drawImage(
        workingCanvas,
        0,
        0,
        outputWidth,
        outputHeight
      );
    }

    canvas.style.width =
      outputWidth + "px";

    canvas.style.height =
      outputHeight + "px";

    overlay.style.width =
      outputWidth + "px";

    overlay.style.height =
      outputHeight + "px";

    updateStatus(
      width,
      height
    );
  }

  /* =========================================================
     STATUS
     ========================================================= */

  function updateStatus(width, height) {
    const status =
      $("status");

    if (!status) return;

    status.textContent =
      `${width} × ${height}px`;
  }

  /* =========================================================
     STATE RESET
     ========================================================= */

  function resetState(saveHistory = true) {
    if (saveHistory) {
      pushHistory();
    }

    const defaults = {
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
      gradeMidtone: 0,
      gradeHighlight: 0,
      gradeBlend: 50,
      gradeBalance: 0
    };

    Object.assign(S, defaults);

    colors.forEach((color) => {
      S["h_" + color] = 0;
      S["s_" + color] = 0;
      S["l_" + color] = 0;
    });

    updateAllControls();
  }

  /* =========================================================
     HISTORY
     ========================================================= */

  function cloneState() {
    return JSON.parse(
      JSON.stringify(S)
    );
  }

  function pushHistory() {
    history.push(cloneState());

    if (history.length > 30) {
      history.shift();
    }

    future = [];
  }

  function undo() {
    if (!history.length) return;

    future.push(cloneState());

    const previous =
      history.pop();

    Object.assign(
      S,
      previous
    );

    updateAllControls();

    render();
  }

  function redo() {
    if (!future.length) return;

    history.push(cloneState());

    const next =
      future.pop();

    Object.assign(
      S,
      next
    );

    updateAllControls();

    render();
  }

  /* =========================================================
     CONTROLS
     ========================================================= */

  function updateAllControls() {
    document
      .querySelectorAll(
        "[data-key]"
      )
      .forEach((element) => {
        const key =
          element.dataset.key;

        if (!(key in S)) return;

        if (
          element.type === "range" ||
          element.type === "number"
        ) {
          element.value = S[key];
        }

        if (
          element.tagName === "SELECT"
        ) {
          element.value = S[key];
        }

        const valueElement =
          document.querySelector(
            `[data-value-for="${key}"]`
          );

        if (valueElement) {
          valueElement.textContent =
            formatValue(S[key]);
        }
      });
  }

  function formatValue(value) {
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return String(value);
      }

      return value.toFixed(1);
    }

    return String(value);
  }

  function bindControls() {
    document
      .querySelectorAll(
        "[data-key]"
      )
      .forEach((element) => {
        element.addEventListener(
          "pointerdown",
          () => {
            pushHistory();
          },
          { once: true }
        );

        element.addEventListener(
          "input",
          function () {
            const key =
              this.dataset.key;

            if (!(key in S)) return;

            let value;

            if (
              this.type === "range" ||
              this.type === "number"
            ) {
              value =
                parseFloat(
                  this.value
                );
            } else {
              value =
                this.value;
            }

            if (
              Number.isNaN(value)
            ) {
              return;
            }

            S[key] = value;

            const valueElement =
              document.querySelector(
                `[data-value-for="${key}"]`
              );

            if (valueElement) {
              valueElement.textContent =
                formatValue(value);
            }

            render();
          }
        );
      });
  }

  /* =========================================================
     TOOL PANEL
     ========================================================= */

  const panelTemplates = {
    light: `
      <section>
        <h3>Light</h3>
        ${slider("Exposure", "exposure", -100, 100)}
        ${slider("Contrast", "contrast", -100, 100)}
        ${slider("Highlights", "highlights", -100, 100)}
        ${slider("Shadows", "shadows", -100, 100)}
        ${slider("Whites", "whites", -100, 100)}
        ${slider("Blacks", "blacks", -100, 100)}
      </section>
    `,

    color: `
      <section>
        <h3>Color</h3>
        ${slider("Temperature", "temp", -100, 100)}
        ${slider("Tint", "tint", -100, 100)}
        ${slider("Vibrance", "vibrance", -100, 100)}
        ${slider("Saturation", "saturation", -100, 100)}

        <h3>Color Grading</h3>
        ${slider("Shadows", "gradeShadow", -100, 100)}
        ${slider("Midtones", "gradeMidtone", -100, 100)}
        ${slider("Highlights", "gradeHighlight", -100, 100)}
        ${slider("Blending", "gradeBlend", 0, 100)}
        ${slider("Balance", "gradeBalance", -100, 100)}
      </section>
    `,

    effects: `
      <section>
        <h3>Effects</h3>
        ${slider("Texture", "texture", -100, 100)}
        ${slider("Clarity", "clarity", -100, 100)}
        ${slider("Dehaze", "dehaze", -100, 100)}
        ${slider("Vignette", "vignette", -100, 100)}
        ${slider("Midpoint", "midpoint", 0, 100)}
        ${slider("Feather", "feather", 0, 100)}
        ${slider("Roundness", "roundness", -100, 100)}
        ${slider("Grain", "grain", 0, 100)}
        ${slider("Grain Size", "grainSize", 0, 100)}
        ${slider("Roughness", "grainRough", 0, 100)}
      </section>
    `,

    detail: `
      <section>
        <h3>Detail</h3>
        ${slider("Sharpening", "sharp", 0, 100)}
        ${slider("Radius", "radius", 0, 3, 0.1)}
        ${slider("Noise Reduction", "noise", 0, 100)}
        ${slider("Color Noise Reduction", "colorNoise", 0, 100)}
      </section>
    `,

    crop: `
      <section>
        <h3>Crop & Geometry</h3>

        <label>Aspect Ratio</label>
        <select data-key="ratio">
          <option value="original">Original</option>
          <option value="1:1">1:1</option>
          <option value="4:5">4:5</option>
          <option value="5:4">5:4</option>
          <option value="4:3">4:3</option>
          <option value="3:4">3:4</option>
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
        </select>

        ${slider("Straighten", "straighten", -45, 45)}
        
        <button class="tool-action" data-action="rotate-left">
          Rotate Left
        </button>

        <button class="tool-action" data-action="rotate-right">
          Rotate Right
        </button>

        <button class="tool-action" data-action="flip-x">
          Flip Horizontal
        </button>

        <button class="tool-action" data-action="flip-y">
          Flip Vertical
        </button>
      </section>
    `,

    presets: `
      <section>
        <h3>Presets</h3>

        <div class="preset-grid">
          <button data-preset="clean">Clean</button>
          <button data-preset="warm">Warm</button>
          <button data-preset="cool">Cool</button>
          <button data-preset="cinematic">Cinematic</button>
          <button data-preset="matte">Matte</button>
          <button data-preset="vivid">Vivid</button>
          <button data-preset="portrait">Portrait</button>
          <button data-preset="bw">B&W</button>
        </div>

        ${slider("Preset Amount", "presetAmount", 0, 100)}
      </section>
    `,

    profiles: `
      <section>
        <h3>Profiles</h3>

        <select data-key="profile">
          <option value="natural">Natural</option>
          <option value="neutral">Neutral</option>
          <option value="vivid">Vivid</option>
          <option value="modern">Modern</option>
          <option value="film">Film</option>
          <option value="monochrome">Monochrome</option>
        </select>
      </section>
    `,

    mask: `
      <section>
        <h3>Mask</h3>

        <label>Mask Type</label>

        <select data-key="maskType">
          <option value="radial">Radial</option>
          <option value="linear">Linear</option>
          <option value="brush">Brush</option>
        </select>

        ${slider("Mask Amount", "maskAmount", 0, 100)}
        ${slider("Local Exposure", "maskExposure", -100, 100)}
        ${slider("Local Contrast", "maskContrast", -100, 100)}
        ${slider("Local Saturation", "maskSaturation", -100, 100)}
      </section>
    `,

    retouch: `
      <section>
        <h3>Retouch</h3>

        ${slider("Brush Size", "retouchSize", 5, 100)}

        <button class="tool-action" data-action="retouch">
          Enable Retouch Brush
        </button>
      </section>
    `,

    blur: `
      <section>
        <h3>Lens Blur</h3>

        ${slider("Blur Amount", "blur", 0, 100)}
        ${slider("Focus X", "blurX", 0, 100)}
        ${slider("Focus Y", "blurY", 0, 100)}
      </section>
    `,

    optics: `
      <section>
        <h3>Optics</h3>

        ${slider("Lens Vignette", "lensVignette", -100, 100)}
        ${slider("Defringe", "defringe", 0, 100)}

        <p class="tool-note">
          Browser-based optics controls provide lightweight corrections.
        </p>
      </section>
    `,

    export: `
      <section>
        <h3>Export</h3>

        <label>Format</label>

        <select id="exportFormat">
          <option value="image/jpeg">JPG</option>
          <option value="image/png">PNG</option>
          <option value="image/webp">WebP</option>
        </select>

        ${slider("Quality", "exportQuality", 50, 100)}

        <label>Maximum Long Edge</label>

        <select id="exportSize">
          <option value="original">Original</option>
          <option value="4000">4000px</option>
          <option value="3000">3000px</option>
          <option value="2500">2500px</option>
          <option value="2000">2000px</option>
          <option value="1600">1600px</option>
          <option value="1200">1200px</option>
        </select>

        <button class="export-button" data-action="export">
          Export Photo
        </button>
      </section>
    `
  };

  function slider(
    label,
    key,
    min,
    max,
    step = 1
  ) {
    return `
      <div class="control">
        <div class="control-head">
          <label>${label}</label>
          <span data-value-for="${key}">
            ${formatValue(
              key in S
                ? S[key]
                : 0
            )}
          </span>
        </div>

        <input
          type="range"
          data-key="${key}"
          min="${min}"
          max="${max}"
          step="${step}"
          value="${
            key in S
              ? S[key]
              : 0
          }"
        />
      </div>
    `;
  }

  function showPanel(tool) {
    activeTool = tool;

    const panel =
      $("panel");

    if (!panel) return;

    panel.innerHTML =
      panelTemplates[tool] ||
      "";

    bindControls();
    bindPanelActions();
    updateAllControls();
  }

  function bindPanelActions() {
    document
      .querySelectorAll(
        "[data-preset]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            pushHistory();

            applyPreset(
              button.dataset.preset
            );
          }
        );
      });

    document
      .querySelectorAll(
        ".tool-action"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const action =
              button.dataset.action;

            if (
              action === "rotate-left"
            ) {
              pushHistory();
              S.rotate -= 90;
              render();
            }

            if (
              action === "rotate-right"
            ) {
              pushHistory();
              S.rotate += 90;
              render();
            }

            if (
              action === "flip-x"
            ) {
              pushHistory();
              S.flipX = !S.flipX;
              render();
            }

            if (
              action === "flip-y"
            ) {
              pushHistory();
              S.flipY = !S.flipY;
              render();
            }
          }
        );
      });

    const exportButton =
      document.querySelector(
        '[data-action="export"]'
      );

    if (exportButton) {
      exportButton.addEventListener(
        "click",
        exportPhoto
      );
    }
  }

  /* =========================================================
     EXPORT
     ========================================================= */

  function exportPhoto() {
    if (!image) {
      alert("Please select a photo first.");
      return;
    }

    const format =
      $("exportFormat")
        ? $("exportFormat").value
        : "image/jpeg";

    const qualityControl =
      $("exportQuality");

    const quality =
      qualityControl
        ? Number(
            qualityControl.value
          ) / 100
        : 0.92;

    const sizeControl =
      $("exportSize");

    const selectedSize =
      sizeControl
        ? sizeControl.value
        : "original";

    const geometry =
      getGeometry();

    const exportCanvas =
      document.createElement("canvas");

    let width =
      geometry.width;

    let height =
      geometry.height;

    if (
      selectedSize !==
      "original"
    ) {
      const maxEdge =
        Number(selectedSize);

      const scale =
        Math.min(
          1,
          maxEdge /
            Math.max(
              width,
              height
            )
        );

      width =
        Math.max(
          1,
          Math.round(
            width * scale
          )
        );

      height =
        Math.max(
          1,
          Math.round(
            height * scale
          )
        );
    }

    exportCanvas.width =
      width;

    exportCanvas.height =
      height;

    const exportCtx =
      exportCanvas.getContext(
        "2d",
        {
          willReadFrequently: true
        }
      );

    exportCtx.save();

    exportCtx.translate(
      width / 2,
      height / 2
    );

    exportCtx.rotate(
      geometry.angle
    );

    exportCtx.scale(
      S.flipX ? -1 : 1,
      S.flipY ? -1 : 1
    );

    const scale =
      Math.min(
        width / geometry.width,
        height / geometry.height
      );

    exportCtx.drawImage(
      sourceCanvas,
      -sourceCanvas.width *
        scale /
        2,
      -sourceCanvas.height *
        scale /
        2,
      sourceCanvas.width *
        scale,
      sourceCanvas.height *
        scale
    );

    exportCtx.restore();

    let imageData =
      exportCtx.getImageData(
        0,
        0,
        width,
        height
      );

    imageData =
      processPixels(
        imageData
      );

    exportCtx.putImageData(
      imageData,
      0,
      0
    );

    applyMask(
      exportCtx,
      width,
      height
    );

    applySharpen(
      exportCtx,
      width,
      height
    );

    applyBlur(
      exportCtx,
      width,
      height
    );

    applyVignette(
      exportCtx,
      width,
      height
    );

    applyGrain(
      exportCtx,
      width,
      height
    );

    exportCanvas.toBlob(
      (blob) => {
        if (!blob) {
          alert(
            "Export failed. Please try again."
          );
          return;
        }

        const extension =
          format ===
          "image/png"
            ? "png"
            : format ===
              "image/webp"
              ? "webp"
              : "jpg";

        const baseName =
          fileName
            ? fileName.replace(
                /\.[^/.]+$/,
                ""
              )
            : "toolora-photo";

        const downloadName =
          `${baseName}-edited.${extension}`;

        const url =
          URL.createObjectURL(
            blob
          );

        const link =
          document.createElement(
            "a"
          );

        link.href = url;
        link.download =
          downloadName;

        document.body.appendChild(
          link
        );

        link.click();

        link.remove();

        setTimeout(() => {
          URL.revokeObjectURL(
            url
          );
        }, 1000);
      },
      format,
      quality
    );
  }

  /* =========================================================
     TOP BAR ACTIONS
     ========================================================= */

  const undoButton =
    $("undoBtn");

  if (undoButton) {
    undoButton.addEventListener(
      "click",
      undo
    );
  }

  const redoButton =
    $("redoBtn");

  if (redoButton) {
    redoButton.addEventListener(
      "click",
      redo
    );
  }

  const beforeButton =
    $("beforeBtn");

  if (beforeButton) {
    beforeButton.addEventListener(
      "click",
      () => {
        showBefore =
          !showBefore;

        const badge =
          $("badge");

        if (badge) {
          badge.style.display =
            showBefore
              ? "block"
              : "none";
        }

        render();
      }
    );
  }

  /* =========================================================
     ZOOM
     ========================================================= */

  const zoomIn =
    $("zoomIn");

  if (zoomIn) {
    zoomIn.addEventListener(
      "click",
      () => {
        zoom =
          clamp(
            zoom + 0.1,
            0.5,
            3
          );

        canvas.style.transform =
          `scale(${zoom})`;

        overlay.style.transform =
          `scale(${zoom})`;
      }
    );
  }

  const zoomOut =
    $("zoomOut");

  if (zoomOut) {
    zoomOut.addEventListener(
      "click",
      () => {
        zoom =
          clamp(
            zoom - 0.1,
            0.5,
            3
          );

        canvas.style.transform =
          `scale(${zoom})`;

        overlay.style.transform =
          `scale(${zoom})`;
      }
    );
  }

  const fitButton =
    $("fitBtn");

  if (fitButton) {
    fitButton.addEventListener(
      "click",
      () => {
        zoom = 1;

        canvas.style.transform =
          "scale(1)";

        overlay.style.transform =
          "scale(1)";
      }
    );
  }

  /* =========================================================
     FULLSCREEN
     ========================================================= */

  const fullscreenButton =
    $("fullscreenBtn");

  if (fullscreenButton) {
    fullscreenButton.addEventListener(
      "click",
      async () => {
        try {
          if (
            !document.fullscreenElement
          ) {
            await document.documentElement.requestFullscreen();
          } else {
            await document.exitFullscreen();
          }
        } catch (error) {
          console.warn(
            "Fullscreen unavailable.",
            error
          );
        }
      }
    );
  }

  /* =========================================================
     TABS
     ========================================================= */

  const tabs =
    document.querySelectorAll(
      "#tabs [data-tool]"
    );

  tabs.forEach((tab) => {
    tab.addEventListener(
      "click",
      () => {
        tabs.forEach((item) => {
          item.classList.remove(
            "active"
          );
        });

        tab.classList.add(
          "active"
        );

        showPanel(
          tab.dataset.tool
        );
      }
    );
  });

  /* =========================================================
     KEYBOARD
     ========================================================= */

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() ===
          "z"
      ) {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() ===
          "y"
      ) {
        event.preventDefault();
        redo();
      }
    }
  );

  /* =========================================================
     RESIZE
     ========================================================= */

  let resizeTimer = null;

  window.addEventListener(
    "resize",
    () => {
      clearTimeout(
        resizeTimer
      );

      resizeTimer =
        setTimeout(
          () => {
            render();
          },
          120
        );
    }
  );

  /* =========================================================
     INITIALIZE
     ========================================================= */

  function init() {
    const firstTab =
      document.querySelector(
        '#tabs [data-tool="light"]'
      );

    if (firstTab) {
      firstTab.classList.add(
        "active"
      );
    }

    showPanel("light");
  }

  init();
})();
