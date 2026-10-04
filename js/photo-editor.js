"use strict";

/*
    Toolora Professional Photo Editor
    Browser-based Lightroom-inspired editing engine.

    No external image-processing service is required.
    The editor uses Canvas and pixel processing.
*/


const canvas = document.getElementById("photoCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const overlay = document.getElementById("overlayCanvas");
const overlayCtx = overlay.getContext("2d");

const imageInput = document.getElementById("imageInput");
const emptyState = document.getElementById("emptyState");
const loadingOverlay = document.getElementById("loadingOverlay");
const canvasStage = document.getElementById("canvasStage");

const imageName = document.getElementById("imageName");
const imageDimensions = document.getElementById("imageDimensions");
const zoomValue = document.getElementById("zoomValue");
const activeToolName = document.getElementById("activeToolName");
const historyStatus = document.getElementById("historyStatus");

const histogramCanvas = document.getElementById("histogramCanvas");
const histogramCtx = histogramCanvas.getContext("2d");


/* -------------------------------------------------------
   STATE
------------------------------------------------------- */

const DEFAULT_STATE = {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,

    temperature: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,

    colorMixer: {},

    shadowHue: 220,
    shadowSat: 0,

    midHue: 45,
    midSat: 0,

    highlightHue: 45,
    highlightSat: 0,

    gradingBlending: 50,
    gradingBalance: 0,

    texture: 0,
    clarity: 0,
    dehaze: 0,

    vignette: 0,
    vignetteMidpoint: 50,
    vignetteFeather: 50,
    vignetteRoundness: 0,

    grain: 0,
    grainSize: 25,
    grainRoughness: 50,

    sharpening: 0,
    radius: 1,
    detail: 25,
    sharpenMasking: 0,

    noiseReduction: 0,
    noiseDetail: 50,
    noiseContrast: 0,

    colorNoiseReduction: 0,

    rotation: 0,
    flipX: false,
    flipY: false,
    straighten: 0,

    profile: "natural",

    blurAmount: 0,
    blurFocusX: 50,
    blurFocusY: 50,
    blurFocusRadius: 35,

    lensCorrection: false,
    chromaticAberration: false,
    defringe: 0,
    lensVignette: 0,

    presetAmount: 100,

    maskExposure: 0,
    maskContrast: 0,
    maskHighlights: 0,
    maskShadows: 0,
    maskTemperature: 0,
    maskTint: 0,
    maskSaturation: 0,
    maskTexture: 0,
    maskClarity: 0,
    maskDehaze: 0,

    brushSize: 80,
    brushFeather: 50,
    brushFlow: 100,

    removeSize: 50,
    removeFeather: 60
};


const colorChannels = [
    "red",
    "orange",
    "yellow",
    "green",
    "aqua",
    "blue",
    "purple",
    "magenta"
];

colorChannels.forEach(color => {
    DEFAULT_STATE.colorMixer[color] = {
        hue: 0,
        saturation: 0,
        luminance: 0
    };
});


let state = structuredClone(DEFAULT_STATE);

let sourceImage = null;
let originalImageData = null;

let undoStack = [];
let redoStack = [];

let currentZoom = 1;
let fitZoom = 1;

let isBeforeAfter = false;
let currentTool = "light";

let selectedColor = "red";
let selectedMaskTool = "brush";

let isDrawingMask = false;
let maskCanvas = null;
let maskCtx = null;

let isDrawingRemove = false;
let removePoints = [];

let selectedAspect = "free";

let renderTimer = null;


/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

function cloneState() {
    return structuredClone(state);
}


function showLoading(show) {
    loadingOverlay.classList.toggle("active", show);
}


function clamp(value, min = 0, max = 255) {
    return Math.max(min, Math.min(max, value));
}


function lerp(a, b, amount) {
    return a + (b - a) * amount;
}


function signed(value) {
    const n = Number(value);

    if (Math.abs(n) < 0.001) {
        return "0";
    }

    return n > 0 ? `+${n}` : `${n}`;
}


function setOutput(id, value, suffix = "") {
    const el = document.getElementById(id);

    if (el) {
        el.textContent = `${value}${suffix}`;
    }
}


function scheduleRender() {
    clearTimeout(renderTimer);

    renderTimer = setTimeout(() => {
        render();
    }, 25);
}


function pushHistory() {
    undoStack.push(cloneState());

    if (undoStack.length > 40) {
        undoStack.shift();
    }

    redoStack = [];

    updateHistoryUI();
}


function updateHistoryUI() {
    historyStatus.textContent =
        undoStack.length > 0
            ? `${undoStack.length} edit${undoStack.length === 1 ? "" : "s"}`
            : "Original";
}


function resetHistory() {
    undoStack = [];
    redoStack = [];
    updateHistoryUI();
}


/* -------------------------------------------------------
   IMAGE UPLOAD
------------------------------------------------------- */

function openFilePicker() {
    imageInput.click();
}


document.getElementById("uploadTopBtn").addEventListener("click", openFilePicker);
document.getElementById("uploadMainBtn").addEventListener("click", openFilePicker);


imageInput.addEventListener("change", event => {

    const file = event.target.files?.[0];

    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {
        alert("Please select a valid image file.");
        return;
    }

    const reader = new FileReader();

    reader.onload = e => {

        const img = new Image();

        img.onload = () => {

            sourceImage = img;

            imageName.textContent = file.name;

            imageDimensions.textContent =
                `${img.naturalWidth} × ${img.naturalHeight}px`;

            originalImageData = {
                width: img.naturalWidth,
                height: img.naturalHeight
            };

            state = structuredClone(DEFAULT_STATE);

            resetHistory();

            emptyState.style.display = "none";

            setupCanvas();

            calculateFitZoom();

            currentZoom = fitZoom;

            updateZoomUI();

            render();

            drawHistogram();

        };

        img.src = e.target.result;
    };

    reader.readAsDataURL(file);

});


/* -------------------------------------------------------
   CANVAS
------------------------------------------------------- */

function setupCanvas() {

    if (!sourceImage) {
        return;
    }

    canvas.width = sourceImage.naturalWidth;
    canvas.height = sourceImage.naturalHeight;

    overlay.width = canvas.width;
    overlay.height = canvas.height;

    maskCanvas = document.createElement("canvas");

    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;

    maskCtx = maskCanvas.getContext("2d");

    clearMask();

    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;

    overlay.style.width = `${canvas.width}px`;
    overlay.style.height = `${canvas.height}px`;
}


function calculateFitZoom() {

    if (!sourceImage) {
        return;
    }

    const rect = canvasStage.getBoundingClientRect();

    const widthRatio =
        (rect.width - 30) / sourceImage.naturalWidth;

    const heightRatio =
        (rect.height - 30) / sourceImage.naturalHeight;

    fitZoom = Math.min(widthRatio, heightRatio);

    fitZoom = Math.min(fitZoom, 1);

    if (!Number.isFinite(fitZoom) || fitZoom <= 0) {
        fitZoom = 1;
    }
}


window.addEventListener("resize", () => {

    if (!sourceImage) {
        return;
    }

    calculateFitZoom();

    if (zoomValue.textContent === "Fit") {
        currentZoom = fitZoom;
    }

    updateCanvasTransform();

});


function updateCanvasTransform() {

    const transform = [
        `translate(-50%, -50%)`,
        `scale(${currentZoom})`,
        `rotate(${state.rotation + state.straighten}deg)`,
        `scaleX(${state.flipX ? -1 : 1})`,
        `scaleY(${state.flipY ? -1 : 1})`
    ].join(" ");

    canvas.style.left = "50%";
    canvas.style.top = "50%";
    canvas.style.transform = transform;

    overlay.style.left = "50%";
    overlay.style.top = "50%";
    overlay.style.transform = transform;
}


function updateZoomUI() {

    if (Math.abs(currentZoom - fitZoom) < 0.01) {
        zoomValue.textContent = "Fit";
    } else {
        zoomValue.textContent =
            `${Math.round(currentZoom * 100)}%`;
    }

    updateCanvasTransform();
}


document.getElementById("zoomInBtn").addEventListener("click", () => {

    if (!sourceImage) return;

    currentZoom = Math.min(currentZoom * 1.2, 5);

    updateZoomUI();

});


document.getElementById("zoomOutBtn").addEventListener("click", () => {

    if (!sourceImage) return;

    currentZoom = Math.max(currentZoom / 1.2, 0.1);

    updateZoomUI();

});


document.getElementById("fitBtn").addEventListener("click", () => {

    if (!sourceImage) return;

    calculateFitZoom();

    currentZoom = fitZoom;

    updateZoomUI();

});


/* -------------------------------------------------------
   TOOL TABS
------------------------------------------------------- */

document.querySelectorAll(".tool-tab").forEach(tab => {

    tab.addEventListener("click", () => {

        currentTool = tab.dataset.tool;

        document.querySelectorAll(".tool-tab")
            .forEach(t => t.classList.remove("active"));

        tab.classList.add("active");

        document.querySelectorAll(".tool-panel")
            .forEach(panel => panel.classList.remove("active"));

        const panel =
            document.querySelector(
                `.tool-panel[data-panel="${currentTool}"]`
            );

        if (panel) {
            panel.classList.add("active");
        }

        activeToolName.textContent =
            currentTool.charAt(0).toUpperCase() +
            currentTool.slice(1);

        clearOverlay();

    });

});


/* -------------------------------------------------------
   GENERIC SLIDERS
------------------------------------------------------- */

const sliderIDs = [
    "exposure",
    "contrast",
    "highlights",
    "shadows",
    "whites",
    "blacks",

    "temperature",
    "tint",
    "vibrance",
    "saturation",

    "texture",
    "clarity",
    "dehaze",

    "vignette",
    "vignetteMidpoint",
    "vignetteFeather",
    "vignetteRoundness",

    "grain",
    "grainSize",
    "grainRoughness",

    "sharpening",
    "radius",
    "detail",
    "sharpenMasking",

    "noiseReduction",
    "noiseDetail",
    "noiseContrast",
    "colorNoiseReduction",

    "straighten",

    "presetAmount",

    "blurAmount",
    "blurFocusX",
    "blurFocusY",
    "blurFocusRadius",

    "defringe",
    "lensVignette",

    "maskExposure",
    "maskContrast",
    "maskHighlights",
    "maskShadows",
    "maskTemperature",
    "maskTint",
    "maskSaturation",
    "maskTexture",
    "maskClarity",
    "maskDehaze",

    "brushSize",
    "brushFeather",
    "brushFlow",

    "removeSize",
    "removeFeather",

    "shadowHue",
    "shadowSat",
    "midHue",
    "midSat",
    "highlightHue",
    "highlightSat",
    "gradingBlending",
    "gradingBalance"
];


sliderIDs.forEach(id => {

    const input = document.getElementById(id);

    if (!input) return;

    input.addEventListener("input", () => {

        const value = Number(input.value);

        if (Object.prototype.hasOwnProperty.call(state, id)) {
            state[id] = value;
        }

        updateOutputForSlider(id, value);

        scheduleRender();

    });

    input.addEventListener("change", () => {
        pushHistory();
    });

});


function updateOutputForSlider(id, value) {

    const map = {
        exposure: "exposureValue",
        contrast: "contrastValue",
        highlights: "highlightsValue",
        shadows: "shadowsValue",
        whites: "whitesValue",
        blacks: "blacksValue",

        temperature: "temperatureValue",
        tint: "tintValue",
        vibrance: "vibranceValue",
        saturation: "saturationValue",

        texture: "textureValue",
        clarity: "clarityValue",
        dehaze: "dehazeValue",

        vignette: "vignetteValue",
        vignetteMidpoint: "vignetteMidpointValue",
        vignetteFeather: "vignetteFeatherValue",
        vignetteRoundness: "vignetteRoundnessValue",

        grain: "grainValue",
        grainSize: "grainSizeValue",
        grainRoughness: "grainRoughnessValue",

        sharpening: "sharpeningValue",
        radius: "radiusValue",
        detail: "detailValue",
        sharpenMasking: "sharpenMaskingValue",

        noiseReduction: "noiseReductionValue",
        noiseDetail: "noiseDetailValue",
        noiseContrast: "noiseContrastValue",
        colorNoiseReduction: "colorNoiseReductionValue",

        straighten: "straightenValue",

        presetAmount: "presetAmountValue",

        blurAmount: "blurAmountValue",
        blurFocusX: "blurFocusXValue",
        blurFocusY: "blurFocusYValue",
        blurFocusRadius: "blurFocusRadiusValue",

        defringe: "defringeValue",
        lensVignette: "lensVignetteValue",

        maskExposure: "maskExposureValue",
        maskContrast: "maskContrastValue",
        maskHighlights: "maskHighlightsValue",
        maskShadows: "maskShadowsValue",
        maskTemperature: "maskTemperatureValue",
        maskTint: "maskTintValue",
        maskSaturation: "maskSaturationValue",
        maskTexture: "maskTextureValue",
        maskClarity: "maskClarityValue",
        maskDehaze: "maskDehazeValue",

        brushSize: "brushSizeValue",
        brushFeather: "brushFeatherValue",
        brushFlow: "brushFlowValue",

        removeSize: "removeSizeValue",
        removeFeather: "removeFeatherValue",

        shadowHue: null,
        shadowSat: null,
        midHue: null,
        midSat: null,
        highlightHue: null,
        highlightSat: null,
        gradingBlending: "gradingBlendingValue",
        gradingBalance: "gradingBalanceValue"
    };

    const output = map[id];

    if (!output) return;

    if (id === "straighten") {
        setOutput(output, value, "°");
    } else {
        setOutput(output, signed(value));
    }

}


/* -------------------------------------------------------
   COLOR MIXER
------------------------------------------------------- */

document.querySelectorAll(".color-dot").forEach(button => {

    button.addEventListener("click", () => {

        document.querySelectorAll(".color-dot")
            .forEach(b => b.classList.remove("active"));

        button.classList.add("active");

        selectedColor = button.dataset.color;

        loadColorMixer();

    });

});


function loadColorMixer() {

    const values = state.colorMixer[selectedColor];

    document.getElementById("mixerHue").value = values.hue;
    document.getElementById("mixerSaturation").value = values.saturation;
    document.getElementById("mixerLuminance").value = values.luminance;

    setOutput("mixerHueValue", signed(values.hue));
    setOutput("mixerSaturationValue", signed(values.saturation));
    setOutput("mixerLuminanceValue", signed(values.luminance));

}


["mixerHue", "mixerSaturation", "mixerLuminance"]
    .forEach(id => {

        document.getElementById(id)
            .addEventListener("input", event => {

                const value = Number(event.target.value);

                const key =
                    id === "mixerHue"
                        ? "hue"
                        : id === "mixerSaturation"
                            ? "saturation"
                            : "luminance";

                state.colorMixer[selectedColor][key] = value;

                const outputId =
                    id + "Value";

                setOutput(outputId, signed(value));

                scheduleRender();

            });


        document.getElementById(id)
            .addEventListener("change", pushHistory);

    });


/* -------------------------------------------------------
   PROFILE
------------------------------------------------------- */

document.querySelectorAll(".profile-card").forEach(card => {

    card.addEventListener("click", () => {

        pushHistory();

        document.querySelectorAll(".profile-card")
            .forEach(c => c.classList.remove("active"));

        card.classList.add("active");

        state.profile = card.dataset.profile;

        render();

    });

});


/* -------------------------------------------------------
   PRESETS
------------------------------------------------------- */

const PRESETS = {

    clean: {
        exposure: 0.15,
        contrast: 5,
        highlights: -8,
        shadows: 10,
        whites: 4,
        blacks: -4,
        vibrance: 10,
        saturation: 2,
        texture: 5,
        clarity: 3
    },

    warm: {
        exposure: 0.1,
        contrast: 5,
        highlights: -8,
        shadows: 8,
        temperature: 28,
        tint: 4,
        vibrance: 14,
        saturation: 5
    },

    cool: {
        exposure: 0.05,
        contrast: 8,
        highlights: -10,
        shadows: 8,
        temperature: -25,
        tint: 0,
        vibrance: 15,
        saturation: 2
    },

    cinematic: {
        exposure: -0.15,
        contrast: 18,
        highlights: -28,
        shadows: -8,
        whites: -8,
        blacks: -18,
        temperature: 8,
        vibrance: 12,
        saturation: -5,
        clarity: 12,
        dehaze: 8,
        vignette: -18,
        grain: 8
    },

    portrait: {
        exposure: 0.18,
        contrast: -5,
        highlights: -15,
        shadows: 15,
        whites: 4,
        blacks: 5,
        temperature: 8,
        tint: 3,
        vibrance: 8,
        saturation: -4,
        texture: -12,
        clarity: -8
    },

    matte: {
        exposure: 0.05,
        contrast: -12,
        highlights: -12,
        shadows: 12,
        whites: -15,
        blacks: 18,
        saturation: -4,
        clarity: -4,
        vignette: -8,
        grain: 12
    },

    vivid: {
        exposure: 0.1,
        contrast: 12,
        highlights: -8,
        shadows: 8,
        whites: 8,
        blacks: -8,
        vibrance: 30,
        saturation: 10,
        clarity: 8,
        dehaze: 5
    },

    bw: {
        exposure: 0.05,
        contrast: 20,
        highlights: -15,
        shadows: 10,
        whites: 5,
        blacks: -12,
        saturation: -100,
        texture: 5,
        clarity: 10,
        grain: 8
    }

};


document.querySelectorAll(".preset-card").forEach(card => {

    card.addEventListener("click", () => {

        if (!sourceImage) return;

        pushHistory();

        const preset = PRESETS[card.dataset.preset];

        const amount =
            Number(document.getElementById("presetAmount").value) / 100;

        Object.keys(preset).forEach(key => {

            const original =
                DEFAULT_STATE[key] ?? 0;

            state[key] =
                lerp(original, preset[key], amount);

        });

        syncControls();

        render();

    });

});


/* -------------------------------------------------------
   AUTO
------------------------------------------------------- */

document.getElementById("autoAdjustBtn")
    .addEventListener("click", () => {

        if (!sourceImage) return;

        pushHistory();

        const sample = getSampleStats();

        state.exposure =
            clamp((0.5 - sample.average) * 2, -1.2, 1.2);

        state.contrast =
            clamp((0.48 - sample.average) * 80, -30, 30);

        state.highlights =
            clamp((0.65 - sample.highlights) * 100, -35, 25);

        state.shadows =
            clamp((0.35 - sample.shadows) * 100, -25, 35);

        state.whites =
            clamp((0.8 - sample.whitePoint) * 40, -20, 20);

        state.blacks =
            clamp((0.18 - sample.blackPoint) * 40, -20, 20);

        state.vibrance = 8;

        syncControls();

        render();

    });


function getSampleStats() {

    if (!sourceImage) {
        return {
            average: 0.5,
            highlights: 0.5,
            shadows: 0.5,
            whitePoint: 0.8,
            blackPoint: 0.2
        };
    }

    const temp = document.createElement("canvas");

    const maxSize = 250;

    const ratio =
        Math.min(
            maxSize / sourceImage.naturalWidth,
            maxSize / sourceImage.naturalHeight,
            1
        );

    temp.width =
        Math.max(1, Math.round(sourceImage.naturalWidth * ratio));

    temp.height =
        Math.max(1, Math.round(sourceImage.naturalHeight * ratio));

    const tctx = temp.getContext("2d");

    tctx.drawImage(
        sourceImage,
        0,
        0,
        temp.width,
        temp.height
    );

    const data =
        tctx.getImageData(
            0,
            0,
            temp.width,
            temp.height
        ).data;

    let total = 0;
    let count = 0;

    let highlights = 0;
    let shadows = 0;

    let whiteCount = 0;
    let blackCount = 0;

    for (let i = 0; i < data.length; i += 4) {

        const lum =
            (
                0.2126 * data[i] +
                0.7152 * data[i + 1] +
                0.0722 * data[i + 2]
            ) / 255;

        total += lum;

        if (lum > 0.75) highlights++;
        if (lum < 0.25) shadows++;

        if (lum > 0.9) whiteCount++;
        if (lum < 0.1) blackCount++;

        count++;
    }

    return {
        average: total / count,
        highlights: highlights / count,
        shadows: shadows / count,
        whitePoint: 1 - whiteCount / count,
        blackPoint: blackCount / count
    };

}


/* -------------------------------------------------------
   COLOR UTILITIES
------------------------------------------------------- */

function rgbToHsl(r, g, b) {

    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    let h = 0;
    let s = 0;

    const l = (max + min) / 2;

    if (max !== min) {

        const d = max - min;

        s =
            l > 0.5
                ? d / (2 - max - min)
                : d / (max + min);

        switch (max) {

            case r:
                h =
                    (g - b) / d +
                    (g < b ? 6 : 0);
                break;

            case g:
                h =
                    (b - r) / d +
                    2;
                break;

            case b:
                h =
                    (r - g) / d +
                    4;
                break;

        }

        h /= 6;
    }

    return {
        h: h * 360,
        s: s * 100,
        l: l * 100
    };

}


function hueToRgb(p, q, t) {

    if (t < 0) t += 1;
    if (t > 1) t -= 1;

    if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
    }

    if (t < 1 / 2) {
        return q;
    }

    if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
    }

    return p;
}


function hslToRgb(h, s, l) {

    h = ((h % 360) + 360) % 360 / 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;

    if (s === 0) {

        const v = Math.round(l * 255);

        return {
            r: v,
            g: v,
            b: v
        };

    }

    const q =
        l < 0.5
            ? l * (1 + s)
            : l + s - l * s;

    const p = 2 * l - q;

    return {
        r: hueToRgb(p, q, h + 1 / 3) * 255,
        g: hueToRgb(p, q, h) * 255,
        b: hueToRgb(p, q, h - 1 / 3) * 255
    };

}


/* -------------------------------------------------------
   PIXEL PROCESSING
------------------------------------------------------- */

function processPixels(imageData, width, height) {

    const data = imageData.data;

    const exposureMultiplier =
        Math.pow(2, state.exposure);

    const contrastFactor =
        (259 * (state.contrast + 255)) /
        (255 * (259 - state.contrast));

    const saturationFactor =
        1 + state.saturation / 100;

    const vibranceAmount =
        state.vibrance / 100;

    const temperature =
        state.temperature / 100;

    const tint =
        state.tint / 100;


    for (let i = 0; i < data.length; i += 4) {

        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];


        /* Exposure */

        r *= exposureMultiplier;
        g *= exposureMultiplier;
        b *= exposureMultiplier;


        /* Temperature */

        r += temperature * 24;
        b -= temperature * 24;

        g += tint * 10;


        /* Tone */

        const lum =
            (
                0.2126 * r +
                0.7152 * g +
                0.0722 * b
            ) / 255;


        const shadowWeight =
            Math.max(0, 1 - lum * 3);

        const highlightWeight =
            Math.max(0, (lum - 0.5) * 2);


        const shadowAdjust =
            state.shadows / 100 * 55 * shadowWeight;

        const highlightAdjust =
            state.highlights / 100 * 55 * highlightWeight;

        r += shadowAdjust + highlightAdjust;
        g += shadowAdjust + highlightAdjust;
        b += shadowAdjust + highlightAdjust;


        /* Whites / Blacks */

        const whiteAdjust =
            state.whites / 100 * 35 *
            Math.max(0, (lum - 0.55) * 2);

        const blackAdjust =
            state.blacks / 100 * 35 *
            Math.max(0, (0.45 - lum) * 2);

        r += whiteAdjust + blackAdjust;
        g += whiteAdjust + blackAdjust;
        b += whiteAdjust + blackAdjust;


        /* Contrast */

        r = 128 + contrastFactor * (r - 128);
        g = 128 + contrastFactor * (g - 128);
        b = 128 + contrastFactor * (b - 128);


        /* Vibrance + Saturation */

        let hsl = rgbToHsl(
            clamp(r),
            clamp(g),
            clamp(b)
        );

        const vibranceBoost =
            vibranceAmount *
            (1 - hsl.s / 100) *
            55;

        hsl.s =
            clamp(
                hsl.s * saturationFactor +
                vibranceBoost,
                0,
                100
            );


        /* Color Mixer */

        const channel = getColorChannel(hsl.h);

        if (channel) {

            const mix =
                state.colorMixer[channel];

            const influence =
                getChannelInfluence(
                    hsl.h,
                    channel
                );

            hsl.h +=
                mix.hue *
                1.8 *
                influence;

            hsl.s +=
                mix.saturation *
                influence;

            hsl.l +=
                mix.luminance *
                0.7 *
                influence;
        }


        const rgb =
            hslToRgb(
                hsl.h,
                hsl.s,
                hsl.l
            );


        r = rgb.r;
        g = rgb.g;
        b = rgb.b;


        /* Profile */

        if (state.profile === "vivid") {

            const p =
                rgbToHsl(r, g, b);

            p.s =
                clamp(p.s * 1.12);

            const c =
                hslToRgb(p.h, p.s, p.l);

            r = c.r;
            g = c.g;
            b = c.b;

        }

        else if (state.profile === "film") {

            r += 5;
            g -= 2;
            b -= 5;

        }

        else if (state.profile === "modern") {

            r *= 1.02;
            g *= 1.01;
            b *= 0.99;

        }

        else if (state.profile === "monochrome") {

            const gray =
                0.2126 * r +
                0.7152 * g +
                0.0722 * b;

            r = gray;
            g = gray;
            b = gray;

        }


        /* Dehaze */

        if (state.dehaze !== 0) {

            const amount =
                state.dehaze / 100;

            const gray =
                (r + g + b) / 3;

            r += (r - gray) * amount * 0.5;
            g += (g - gray) * amount * 0.5;
            b += (b - gray) * amount * 0.5;

            r += amount * 8;
            g += amount * 8;
            b += amount * 8;

        }


        data[i] = clamp(r);
        data[i + 1] = clamp(g);
        data[i + 2] = clamp(b);
    }


    applyClarity(imageData, width, height);

    applyTexture(imageData, width, height);

    applyNoiseReduction(imageData, width, height);

    applySharpening(imageData, width, height);

    applyColorGrading(imageData);

    applyVignette(imageData, width, height);

    applyGrain(imageData);

    applyLensEffects(imageData, width, height);

    applyBlurEffect(imageData, width, height);

    return imageData;
}


/* -------------------------------------------------------
   COLOR CHANNELS
------------------------------------------------------- */

function getColorChannel(h) {

    if (h < 15 || h >= 345) return "red";
    if (h < 45) return "orange";
    if (h < 75) return "yellow";
    if (h < 165) return "green";
    if (h < 195) return "aqua";
    if (h < 255) return "blue";
    if (h < 285) return "purple";

    return "magenta";
}


function getChannelCenter(channel) {

    return {
        red: 0,
        orange: 30,
        yellow: 60,
        green: 120,
        aqua: 180,
        blue: 225,
        purple: 270,
        magenta: 315
    }[channel];

}


function getChannelInfluence(hue, channel) {

    const center =
        getChannelCenter(channel);

    let distance =
        Math.abs(hue - center);

    if (distance > 180) {
        distance = 360 - distance;
    }

    return clamp(
        1 - distance / 45,
        0,
        1
    );
}


/* -------------------------------------------------------
   CLARITY
------------------------------------------------------- */

function applyClarity(data, width, height) {

    if (state.clarity === 0) {
        return;
    }

    const amount =
        state.clarity / 100;

    const copy =
        new Uint8ClampedArray(data.data);

    const strength =
        Math.abs(amount) * 0.55;

    for (let y = 1; y < height - 1; y++) {

        for (let x = 1; x < width - 1; x++) {

            const index =
                (y * width + x) * 4;

            const left =
                index - 4;

            const right =
                index + 4;

            const top =
                index - width * 4;

            const bottom =
                index + width * 4;


            for (let c = 0; c < 3; c++) {

                const center =
                    copy[index + c];

                const average =
                    (
                        copy[left + c] +
                        copy[right + c] +
                        copy[top + c] +
                        copy[bottom + c]
                    ) / 4;

                const detail =
                    center - average;

                data.data[index + c] =
                    clamp(
                        center +
                        detail *
                        strength *
                        (amount >= 0 ? 1 : -1)
                    );
            }
        }
    }

}


/* -------------------------------------------------------
   TEXTURE
------------------------------------------------------- */

function applyTexture(data, width, height) {

    if (state.texture === 0) {
        return;
    }

    const amount =
        state.texture / 100;

    const copy =
        new Uint8ClampedArray(data.data);

    const strength =
        Math.abs(amount) * 0.28;

    for (let y = 1; y < height - 1; y++) {

        for (let x = 1; x < width - 1; x++) {

            const i =
                (y * width + x) * 4;

            const p =
                i - width * 4;

            const n =
                i + width * 4;

            for (let c = 0; c < 3; c++) {

                const detail =
                    copy[i + c] -
                    (
                        copy[p + c] +
                        copy[n + c]
                    ) / 2;

                data.data[i + c] =
                    clamp(
                        copy[i + c] +
                        detail *
                        strength *
                        (amount > 0 ? 1 : -1)
                    );
            }
        }
    }

}


/* -------------------------------------------------------
   NOISE REDUCTION
------------------------------------------------------- */

function applyNoiseReduction(data, width, height) {

    if (state.noiseReduction <= 0) {
        return;
    }

    const amount =
        state.noiseReduction / 100;

    const copy =
        new Uint8ClampedArray(data.data);

    const radius = 1;

    for (let y = radius; y < height - radius; y++) {

        for (let x = radius; x < width - radius; x++) {

            const i =
                (y * width + x) * 4;

            for (let c = 0; c < 3; c++) {

                let total = 0;
                let count = 0;

                for (let yy = -radius; yy <= radius; yy++) {

                    for (let xx = -radius; xx <= radius; xx++) {

                        const ni =
                            (
                                (y + yy) * width +
                                (x + xx)
                            ) * 4 + c;

                        total += copy[ni];
                        count++;

                    }

                }

                const avg =
                    total / count;

                data.data[i + c] =
                    lerp(
                        copy[i + c],
                        avg,
                        amount * 0.65
                    );
            }
        }
    }

}


/* -------------------------------------------------------
   SHARPENING
------------------------------------------------------- */

function applySharpening(data, width, height) {

    if (state.sharpening <= 0) {
        return;
    }

    const amount =
        state.sharpening / 100;

    const copy =
        new Uint8ClampedArray(data.data);

    for (let y = 1; y < height - 1; y++) {

        for (let x = 1; x < width - 1; x++) {

            const i =
                (y * width + x) * 4;

            const top =
                i - width * 4;

            const bottom =
                i + width * 4;

            const left =
                i - 4;

            const right =
                i + 4;

            for (let c = 0; c < 3; c++) {

                const center =
                    copy[i + c];

                const blur =
                    (
                        copy[top + c] +
                        copy[bottom + c] +
                        copy[left + c] +
                        copy[right + c]
                    ) / 4;

                const edge =
                    center - blur;

                data.data[i + c] =
                    clamp(
                        center +
                        edge *
                        amount *
                        2.2
                    );

            }
        }
    }

}


/* -------------------------------------------------------
   COLOR GRADING
------------------------------------------------------- */

function applyColorGrading(data) {

    const shadowSat =
        state.shadowSat / 100;

    const midSat =
        state.midSat / 100;

    const highlightSat =
        state.highlightSat / 100;

    if (
        shadowSat === 0 &&
        midSat === 0 &&
        highlightSat === 0
    ) {
        return;
    }

    for (let i = 0; i < data.data.length; i += 4) {

        const r = data.data[i];
        const g = data.data[i + 1];
        const b = data.data[i + 2];

        const lum =
            (
                0.2126 * r +
                0.7152 * g +
                0.0722 * b
            ) / 255;

        let amount;
        let hue;
        let sat;

        if (lum < 0.35) {

            amount =
                (0.35 - lum) / 0.35;

            hue = state.shadowHue;
            sat = shadowSat;

        } else if (lum > 0.65) {

            amount =
                (lum - 0.65) / 0.35;

            hue = state.highlightHue;
            sat = highlightSat;

        } else {

            amount =
                1 - Math.abs(lum - 0.5) / 0.15;

            amount =
                clamp(amount);

            hue = state.midHue;
            sat = midSat;

        }

        if (sat === 0) continue;

        const tint =
            hslToRgb(
                hue,
                100,
                50
            );

        data.data[i] =
            clamp(
                lerp(
                    data.data[i],
                    tint.r,
                    sat * amount * 0.22
                )
            );

        data.data[i + 1] =
            clamp(
                lerp(
                    data.data[i + 1],
                    tint.g,
                    sat * amount * 0.22
                )
            );

        data.data[i + 2] =
            clamp(
                lerp(
                    data.data[i + 2],
                    tint.b,
                    sat * amount * 0.22
                )
            );

    }

}


/* -------------------------------------------------------
   VIGNETTE
------------------------------------------------------- */

function applyVignette(data, width, height) {

    if (state.vignette === 0) {
        return;
    }

    const amount =
        state.vignette / 100;

    const midpoint =
        state.vignetteMidpoint / 100;

    const feather =
        Math.max(
            0.05,
            state.vignetteFeather / 100
        );

    const roundness =
        state.vignetteRoundness / 100;


    for (let y = 0; y < height; y++) {

        for (let x = 0; x < width; x++) {

            const nx =
                (x / width - 0.5) * 2;

            const ny =
                (y / height - 0.5) * 2;

            const rx =
                nx * (1 - roundness * 0.25);

            const ry =
                ny * (1 + roundness * 0.25);

            const distance =
                Math.sqrt(
                    rx * rx +
                    ry * ry
                );

            let edge =
                (distance - midpoint) /
                feather;

            edge =
                clamp(edge, 0, 1);

            edge *= edge;

            const factor =
                1 - amount * edge * 0.75;

            const i =
                (y * width + x) * 4;

            data.data[i] =
                clamp(data.data[i] * factor);

            data.data[i + 1] =
                clamp(data.data[i + 1] * factor);

            data.data[i + 2] =
                clamp(data.data[i + 2] * factor);

        }
    }

}


/* -------------------------------------------------------
   GRAIN
------------------------------------------------------- */

function applyGrain(data) {

    if (state.grain <= 0) {
        return;
    }

    const amount =
        state.grain / 100;

    const roughness =
        state.grainRoughness / 100;

    for (let i = 0; i < data.data.length; i += 4) {

        const random =
            (
                Math.random() -
                0.5
            ) *
            55 *
            amount *
            (0.55 + roughness);

        data.data[i] =
            clamp(data.data[i] + random);

        data.data[i + 1] =
            clamp(data.data[i + 1] + random);

        data.data[i + 2] =
            clamp(data.data[i + 2] + random);

    }

}


/* -------------------------------------------------------
   LENS EFFECTS
------------------------------------------------------- */

function applyLensEffects(data, width, height) {

    if (
        !state.lensCorrection &&
        state.lensVignette <= 0
    ) {
        return;
    }

    if (state.lensVignette > 0) {

        const amount =
            state.lensVignette / 100;

        for (let y = 0; y < height; y++) {

            for (let x = 0; x < width; x++) {

                const nx =
                    (x / width - 0.5) * 2;

                const ny =
                    (y / height - 0.5) * 2;

                const distance =
                    Math.sqrt(
                        nx * nx +
                        ny * ny
                    );

                const factor =
                    1 +
                    amount *
                    Math.max(0, distance - 0.45) *
                    0.25;

                const i =
                    (y * width + x) * 4;

                data.data[i] =
                    clamp(data.data[i] * factor);

                data.data[i + 1] =
                    clamp(data.data[i + 1] * factor);

                data.data[i + 2] =
                    clamp(data.data[i + 2] * factor);
            }
        }
    }

}


/* -------------------------------------------------------
   BLUR / FOCUS
------------------------------------------------------- */

function applyBlurEffect(data, width, height) {

    if (state.blurAmount <= 0) {
        return;
    }

    const amount =
        state.blurAmount / 30;

    const focusX =
        state.blurFocusX / 100 * width;

    const focusY =
        state.blurFocusY / 100 * height;

    const radius =
        state.blurFocusRadius / 100 *
        Math.max(width, height);

    const copy =
        new Uint8ClampedArray(data.data);

    const blurRadius =
        Math.max(
            1,
            Math.round(amount * 3)
        );


    for (let y = blurRadius; y < height - blurRadius; y++) {

        for (let x = blurRadius; x < width - blurRadius; x++) {

            const distance =
                Math.sqrt(
                    Math.pow(x - focusX, 2) +
                    Math.pow(y - focusY, 2)
                );

            if (distance < radius) {
                continue;
            }

            const strength =
                clamp(
                    (
                        distance - radius
                    ) /
                    Math.max(radius, 1),
                    0,
                    1
                );

            const i =
                (y * width + x) * 4;

            for (let c = 0; c < 3; c++) {

                let total = 0;
                let count = 0;

                for (let yy = -blurRadius; yy <= blurRadius; yy++) {

                    for (let xx = -blurRadius; xx <= blurRadius; xx++) {

                        const ni =
                            (
                                (y + yy) * width +
                                (x + xx)
                            ) * 4 + c;

                        total += copy[ni];
                        count++;
                    }
                }

                const average =
                    total / count;

                data.data[i + c] =
                    lerp(
                        copy[i + c],
                        average,
                        strength * 0.75
                    );

            }

        }

    }

}


/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */

function render() {

    if (!sourceImage) {
        return;
    }

    showLoading(false);

    const tempCanvas =
        document.createElement("canvas");

    tempCanvas.width =
        sourceImage.naturalWidth;

    tempCanvas.height =
        sourceImage.naturalHeight;

    const tempCtx =
        tempCanvas.getContext(
            "2d",
            { willReadFrequently: true }
        );

    tempCtx.drawImage(
        sourceImage,
        0,
        0
    );

    let imageData;

    if (isBeforeAfter) {

        imageData =
            tempCtx.getImageData(
                0,
                0,
                tempCanvas.width,
                tempCanvas.height
            );

    } else {

        imageData =
            tempCtx.getImageData(
                0,
                0,
                tempCanvas.width,
                tempCanvas.height
            );

        processPixels(
            imageData,
            tempCanvas.width,
            tempCanvas.height
        );

        applyMaskAdjustments(
            imageData,
            tempCanvas.width,
            tempCanvas.height
        );

    }


    ctx.putImageData(
        imageData,
        0,
        0
    );

    updateCanvasTransform();

    drawHistogram();

}


/* -------------------------------------------------------
   MASKING
------------------------------------------------------- */

function clearMask() {

    if (!maskCtx || !maskCanvas) {
        return;
    }

    maskCtx.clearRect(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height
    );

    clearOverlay();

}


function clearOverlay() {

    overlayCtx.clearRect(
        0,
        0,
        overlay.width,
        overlay.height
    );

}


function getCanvasPoint(event) {

    const rect =
        canvas.getBoundingClientRect();

    const x =
        (
            event.clientX -
            rect.left
        ) /
        currentZoom;

    const y =
        (
            event.clientY -
            rect.top
        ) /
        currentZoom;

    return {
        x,
        y
    };

}


overlay.addEventListener("pointerdown", event => {

    if (
        currentTool !== "mask" &&
        currentTool !== "remove"
    ) {
        return;
    }

    const point =
        getCanvasPoint(event);

    if (currentTool === "mask") {

        if (selectedMaskTool === "brush") {

            isDrawingMask = true;

            paintMask(
                point.x,
                point.y
            );

        }

    }

    if (currentTool === "remove") {

        isDrawingRemove = true;

        removePoints.push(point);

        drawRemovePreview();

    }

});


overlay.addEventListener("pointermove", event => {

    if (
        currentTool !== "mask" &&
        currentTool !== "remove"
    ) {
        return;
    }

    const point =
        getCanvasPoint(event);

    if (
        currentTool === "mask" &&
        isDrawingMask
    ) {

        paintMask(
            point.x,
            point.y
        );

        render();

    }

    if (
        currentTool === "remove" &&
        isDrawingRemove
    ) {

        removePoints.push(point);

        drawRemovePreview();

    }

});


overlay.addEventListener("pointerup", () => {

    if (isDrawingMask) {

        isDrawingMask = false;

        pushHistory();

        render();

    }

    if (isDrawingRemove) {

        isDrawingRemove = false;

        drawRemovePreview();

    }

});


overlay.addEventListener("pointercancel", () => {

    isDrawingMask = false;
    isDrawingRemove = false;

});


function paintMask(x, y) {

    if (!maskCtx) return;

    const radius =
        state.brushSize / 2;

    const gradient =
        maskCtx.createRadialGradient(
            x,
            y,
            radius *
            (
                1 -
                state.brushFeather / 100
            ),
            x,
            y,
            radius
        );

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    maskCtx.fillStyle = gradient;

    maskCtx.globalAlpha =
        state.brushFlow / 100;

    maskCtx.beginPath();

    maskCtx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2
    );

    maskCtx.fill();

    maskCtx.globalAlpha = 1;

    drawMaskOverlay();

}


function drawMaskOverlay() {

    clearOverlay();

    if (!maskCanvas) return;

    overlayCtx.save();

    overlayCtx.globalAlpha = 0.34;

    overlayCtx.globalCompositeOperation =
        "source-over";

    overlayCtx.drawImage(
        maskCanvas,
        0,
        0
    );

    overlayCtx.globalCompositeOperation =
        "source-in";

    overlayCtx.fillStyle =
        "#ff315f";

    overlayCtx.fillRect(
        0,
        0,
        overlay.width,
        overlay.height
    );

    overlayCtx.restore();

}


function applyMaskAdjustments(data, width, height) {

    if (!maskCanvas) return;

    const maskData =
        maskCtx.getImageData(
            0,
            0,
            width,
            height
        ).data;

    const exposureMultiplier =
        Math.pow(
            2,
            state.maskExposure
        );

    for (let i = 0; i < data.data.length; i += 4) {

        const mask =
            maskData[i + 3] / 255;

        if (mask <= 0) {
            continue;
        }

        let r =
            data.data[i];

        let g =
            data.data[i + 1];

        let b =
            data.data[i + 2];


        r *=
            lerp(
                1,
                exposureMultiplier,
                mask
            );

        g *=
            lerp(
                1,
                exposureMultiplier,
                mask
            );

        b *=
            lerp(
                1,
                exposureMultiplier,
                mask
            );


        const temperature =
            state.maskTemperature /
            100 *
            mask;

        const tint =
            state.maskTint /
            100 *
            mask;

        r += temperature * 22;
        b -= temperature * 22;
        g += tint * 10;


        const hsl =
            rgbToHsl(
                clamp(r),
                clamp(g),
                clamp(b)
            );

        hsl.s =
            clamp(
                hsl.s +
                state.maskSaturation *
                mask
            );


        const rgb =
            hslToRgb(
                hsl.h,
                hsl.s,
                hsl.l
            );

        r = rgb.r;
        g = rgb.g;
        b = rgb.b;


        data.data[i] =
            clamp(r);

        data.data[i + 1] =
            clamp(g);

        data.data[i + 2] =
            clamp(b);

    }

}


/* MASK TOOL BUTTONS */

document.querySelectorAll(".mask-tool")
    .forEach(button => {

        button.addEventListener("click", () => {

            document.querySelectorAll(".mask-tool")
                .forEach(b =>
                    b.classList.remove("active")
                );

            button.classList.add("active");

            selectedMaskTool =
                button.dataset.mask;

            if (selectedMaskTool !== "brush") {

                activeToolName.textContent =
                    `${button.textContent} Mask`;

            } else {

                activeToolName.textContent =
                    "Brush Mask";

            }

        });

    });


document.getElementById("clearMaskBtn")
    .addEventListener("click", () => {

        pushHistory();

        clearMask();

        render();

    });


/* -------------------------------------------------------
   REMOVE / HEAL
------------------------------------------------------- */

function drawRemovePreview() {

    clearOverlay();

    if (!removePoints.length) {
        return;
    }

    overlayCtx.save();

    overlayCtx.strokeStyle =
        "rgba(255,255,255,.85)";

    overlayCtx.lineWidth =
        Math.max(
            1,
            state.removeSize
        );

    overlayCtx.lineCap = "round";

    overlayCtx.lineJoin = "round";

    overlayCtx.beginPath();

    removePoints.forEach((point, index) => {

        if (index === 0) {

            overlayCtx.moveTo(
                point.x,
                point.y
            );

        } else {

            overlayCtx.lineTo(
                point.x,
                point.y
            );

        }

    });

    overlayCtx.stroke();

    overlayCtx.restore();

}


document.getElementById("applyRemoveBtn")
    .addEventListener("click", () => {

        if (
            !sourceImage ||
            removePoints.length === 0
        ) {
            return;
        }

        pushHistory();

        applyHealStroke();

        removePoints = [];

        clearOverlay();

        render();

    });


function applyHealStroke() {

    const imageData =
        ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );

    const data =
        imageData.data;

    const radius =
        state.removeSize / 2;

    removePoints.forEach(point => {

        const sourceX =
            clamp(
                Math.round(
                    point.x -
                    radius * 1.5
                ),
                0,
                canvas.width - 1
            );

        const sourceY =
            clamp(
                Math.round(
                    point.y -
                    radius * 1.5
                ),
                0,
                canvas.height - 1
            );

        const startX =
            Math.max(
                0,
                Math.floor(point.x - radius)
            );

        const endX =
            Math.min(
                canvas.width - 1,
                Math.ceil(point.x + radius)
            );

        const startY =
            Math.max(
                0,
                Math.floor(point.y - radius)
            );

        const endY =
            Math.min(
                canvas.height - 1,
                Math.ceil(point.y + radius)
            );


        for (let y = startY; y <= endY; y++) {

            for (let x = startX; x <= endX; x++) {

                const dx =
                    x - point.x;

                const dy =
                    y - point.y;

                const distance =
                    Math.sqrt(
                        dx * dx +
                        dy * dy
                    );

                if (distance > radius) {
                    continue;
                }

                const edge =
                    clamp(
                        distance / radius
                    );

                const strength =
                    1 -
                    Math.pow(
                        edge,
                        1 +
                        state.removeFeather / 30
                    );

                const target =
                    (y * canvas.width + x) * 4;

                const sx =
                    clamp(
                        Math.round(
                            sourceX +
                            (x - point.x)
                        ),
                        0,
                        canvas.width - 1
                    );

                const sy =
                    clamp(
                        Math.round(
                            sourceY +
                            (y - point.y)
                        ),
                        0,
                        canvas.height - 1
                    );

                const source =
                    (sy * canvas.width + sx) * 4;

                for (let c = 0; c < 3; c++) {

                    data[target + c] =
                        lerp(
                            data[target + c],
                            data[source + c],
                            strength
                        );

                }

            }

        }

    });


    ctx.putImageData(
        imageData,
        0,
        0
    );

}


document.getElementById("clearRemoveBtn")
    .addEventListener("click", () => {

        removePoints = [];

        clearOverlay();

    });


/* -------------------------------------------------------
   CROP / TRANSFORM
------------------------------------------------------- */

document.querySelectorAll(".aspect-btn")
    .forEach(button => {

        button.addEventListener("click", () => {

            document.querySelectorAll(".aspect-btn")
                .forEach(b =>
                    b.classList.remove("active")
                );

            button.classList.add("active");

            selectedAspect =
                button.dataset.aspect;

        });

    });


document.getElementById("rotateLeftBtn")
    .addEventListener("click", () => {

        pushHistory();

        state.rotation -= 90;

        updateCanvasTransform();

    });


document.getElementById("rotateRightBtn")
    .addEventListener("click", () => {

        pushHistory();

        state.rotation += 90;

        updateCanvasTransform();

    });


document.getElementById("flipHBtn")
    .addEventListener("click", () => {

        pushHistory();

        state.flipX =
            !state.flipX;

        updateCanvasTransform();

    });


document.getElementById("flipVBtn")
    .addEventListener("click", () => {

        pushHistory();

        state.flipY =
            !state.flipY;

        updateCanvasTransform();

    });


document.getElementById("applyCropBtn")
    .addEventListener("click", () => {

        if (!sourceImage) return;

        pushHistory();

        applyCrop();

    });


function applyCrop() {

    if (
        selectedAspect === "free" ||
        selectedAspect === "original"
    ) {
        render();
        return;
    }

    const parts =
        selectedAspect.split(":");

    const targetRatio =
        Number(parts[0]) /
        Number(parts[1]);

    const width =
        canvas.width;

    const height =
        canvas.height;

    let cropWidth = width;
    let cropHeight = width / targetRatio;

    if (cropHeight > height) {

        cropHeight = height;
        cropWidth = height * targetRatio;

    }

    const x =
        (width - cropWidth) / 2;

    const y =
        (height - cropHeight) / 2;

    const cropped =
        ctx.getImageData(
            x,
            y,
            cropWidth,
            cropHeight
        );

    canvas.width =
        Math.round(cropWidth);

    canvas.height =
        Math.round(cropHeight);

    overlay.width =
        canvas.width;

    overlay.height =
        canvas.height;

    ctx.putImageData(
        cropped,
        0,
        0
    );

    setupMaskAfterResize();

    calculateFitZoom();

    currentZoom = fitZoom;

    updateZoomUI();

}


/* -------------------------------------------------------
   MASK RESIZE
------------------------------------------------------- */

function setupMaskAfterResize() {

    maskCanvas =
        document.createElement("canvas");

    maskCanvas.width =
        canvas.width;

    maskCanvas.height =
        canvas.height;

    maskCtx =
        maskCanvas.getContext("2d");

}


/* -------------------------------------------------------
   BEFORE / AFTER
------------------------------------------------------- */

document.getElementById("beforeAfterBtn")
    .addEventListener("click", () => {

        if (!sourceImage) {
            return;
        }

        isBeforeAfter =
            !isBeforeAfter;

        document.getElementById("beforeAfterBtn")
            .querySelector("span").textContent =
            isBeforeAfter
                ? "After"
                : "Before";

        render();

    });


/* -------------------------------------------------------
   UNDO / REDO
------------------------------------------------------- */

document.getElementById("undoBtn")
    .addEventListener("click", undo);


document.getElementById("redoBtn")
    .addEventListener("click", redo);


function undo() {

    if (!undoStack.length) {
        return;
    }

    redoStack.push(
        cloneState()
    );

    state =
        undoStack.pop();

    syncControls();

    render();

    updateHistoryUI();

}


function redo() {

    if (!redoStack.length) {
        return;
    }

    undoStack.push(
        cloneState()
    );

    state =
        redoStack.pop();

    syncControls();

    render();

    updateHistoryUI();

}


/* -------------------------------------------------------
   RESET TOOL
------------------------------------------------------- */

document.querySelectorAll(".reset-tool")
    .forEach(button => {

        button.addEventListener("click", () => {

            const tool =
                button.dataset.reset;

            if (!tool) {
                return;
            }

            pushHistory();

            resetTool(tool);

            syncControls();

            render();

        });

    });


function resetTool(tool) {

    const groups = {

        light: [
            "exposure",
            "contrast",
            "highlights",
            "shadows",
            "whites",
            "blacks"
        ],

        color: [
            "temperature",
            "tint",
            "vibrance",
            "saturation"
        ],

        effects: [
            "texture",
            "clarity",
            "dehaze",
            "vignette",
            "vignetteMidpoint",
            "vignetteFeather",
            "vignetteRoundness",
            "grain",
            "grainSize",
            "grainRoughness"
        ],

        detail: [
            "sharpening",
            "radius",
            "detail",
            "sharpenMasking",
            "noiseReduction",
            "noiseDetail",
            "noiseContrast",
            "colorNoiseReduction"
        ],

        crop: [
            "rotation",
            "straighten"
        ],

        blur: [
            "blurAmount",
            "blurFocusX",
            "blurFocusY",
            "blurFocusRadius"
        ],

        optics: [
            "defringe",
            "lensVignette"
        ]

    };


    if (!groups[tool]) {
        return;
    }


    groups[tool].forEach(key => {

        state[key] =
            DEFAULT_STATE[key];

    });


    if (tool === "crop") {

        state.flipX = false;
        state.flipY = false;

    }

}


/* -------------------------------------------------------
   RESET ALL
------------------------------------------------------- */

document.getElementById("resetAllBtn")
    .addEventListener("click", () => {

        if (!sourceImage) {
            return;
        }

        const confirmed =
            confirm(
                "Reset all photo edits?"
            );

        if (!confirmed) {
            return;
        }

        pushHistory();

        state =
            structuredClone(DEFAULT_STATE);

        selectedColor = "red";

        selectedAspect = "free";

        document.querySelectorAll(".aspect-btn")
            .forEach(button => {

                button.classList.toggle(
                    "active",
                    button.dataset.aspect === "free"
                );

            });

        syncControls();

        clearMask();

        render();

    });


/* -------------------------------------------------------
   SYNC UI
------------------------------------------------------- */

function syncControls() {

    sliderIDs.forEach(id => {

        const input =
            document.getElementById(id);

        if (!input) {
            return;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                state,
                id
            )
        ) {

            input.value =
                state[id];

            updateOutputForSlider(
                id,
                state[id]
            );
        }

    });


    document.getElementById("lensCorrection").checked =
        state.lensCorrection;

    document.getElementById("chromaticAberration").checked =
        state.chromaticAberration;

    loadColorMixer();

    document.querySelectorAll(".profile-card")
        .forEach(card => {

            card.classList.toggle(
                "active",
                card.dataset.profile === state.profile
            );

        });

}


/* -------------------------------------------------------
   OPTICS TOGGLES
------------------------------------------------------- */

document.getElementById("lensCorrection")
    .addEventListener("change", event => {

        pushHistory();

        state.lensCorrection =
            event.target.checked;

        render();

    });


document.getElementById("chromaticAberration")
    .addEventListener("change", event => {

        pushHistory();

        state.chromaticAberration =
            event.target.checked;

        render();

    });


/* -------------------------------------------------------
   HISTOGRAM
------------------------------------------------------- */

function drawHistogram() {

    if (!sourceImage) {
        return;
    }

    const rect =
        histogramCanvas.getBoundingClientRect();

    const width =
        Math.max(
            1,
            Math.floor(rect.width)
        );

    const height =
        Math.max(
            1,
            Math.floor(rect.height)
        );

    histogramCanvas.width =
        width * devicePixelRatio;

    histogramCanvas.height =
        height * devicePixelRatio;

    histogramCtx.scale(
        devicePixelRatio,
        devicePixelRatio
    );

    histogramCtx.clearRect(
        0,
        0,
        width,
        height
    );


    const sample =
        document.createElement("canvas");

    const max =
        180;

    const ratio =
        Math.min(
            max / canvas.width,
            max / canvas.height,
            1
        );

    sample.width =
        Math.max(
            1,
            Math.round(canvas.width * ratio)
        );

    sample.height =
        Math.max(
            1,
            Math.round(canvas.height * ratio)
        );

    const sctx =
        sample.getContext(
            "2d",
            { willReadFrequently: true }
        );

    sctx.drawImage(
        canvas,
        0,
        0,
        sample.width,
        sample.height
    );

    const pixels =
        sctx.getImageData(
            0,
            0,
            sample.width,
            sample.height
        ).data;

    const red =
        new Array(64).fill(0);

    const green =
        new Array(64).fill(0);

    const blue =
        new Array(64).fill(0);


    for (
        let i = 0;
        i < pixels.length;
        i += 4
    ) {

        red[
            Math.floor(
                pixels[i] / 256 * 64
            )
        ]++;

        green[
            Math.floor(
                pixels[i + 1] / 256 * 64
            )
        ]++;

        blue[
            Math.floor(
                pixels[i + 2] / 256 * 64
            )
        ]++;

    }


    const maxValue =
        Math.max(
            ...red,
            ...green,
            ...blue,
            1
        );


    drawHistogramChannel(
        red,
        width,
        height,
        maxValue,
        "rgba(255,100,100,.30)"
    );

    drawHistogramChannel(
        green,
        width,
        height,
        maxValue,
        "rgba(100,255,150,.28)"
    );

    drawHistogramChannel(
        blue,
        width,
        height,
        maxValue,
        "rgba(100,150,255,.30)"
    );

}


function drawHistogramChannel(
    values,
    width,
    height,
    maxValue,
    color
) {

    histogramCtx.beginPath();

    values.forEach((value, index) => {

        const x =
            index /
            (values.length - 1) *
            width;

        const y =
            height -
            (
                value /
                maxValue
            ) *
            (
                height - 5
            );

        if (index === 0) {
            histogramCtx.moveTo(x, y);
        } else {
            histogramCtx.lineTo(x, y);
        }

    });

    histogramCtx.strokeStyle =
        color;

    histogramCtx.lineWidth = 1.2;

    histogramCtx.stroke();

}


/* -------------------------------------------------------
   KEYBOARD SHORTCUTS
------------------------------------------------------- */

document.addEventListener("keydown", event => {

    const modifier =
        event.ctrlKey ||
        event.metaKey;

    if (
        modifier &&
        event.key.toLowerCase() === "z"
    ) {

        event.preventDefault();

        if (event.shiftKey) {
            redo();
        } else {
            undo();
        }

    }

    if (
        modifier &&
        event.key.toLowerCase() === "y"
    ) {

        event.preventDefault();

        redo();

    }

});


/* -------------------------------------------------------
   DOWNLOAD
------------------------------------------------------- */

document.getElementById("downloadBtn")
    .addEventListener("click", async () => {

        if (!sourceImage) {

            alert(
                "Please upload a photo first."
            );

            return;
        }


        showLoading(true);

        await new Promise(
            resolve =>
                requestAnimationFrame(resolve)
        );


        const exportCanvas =
            document.createElement("canvas");

        exportCanvas.width =
            canvas.width;

        exportCanvas.height =
            canvas.height;

        const exportCtx =
            exportCanvas.getContext(
                "2d",
                { willReadFrequently: true }
            );


        const temp =
            document.createElement("canvas");

        temp.width =
            sourceImage.naturalWidth;

        temp.height =
            sourceImage.naturalHeight;

        const tempCtx =
            temp.getContext(
                "2d",
                { willReadFrequently: true }
            );

        tempCtx.drawImage(
            sourceImage,
            0,
            0
        );


        let imageData =
            tempCtx.getImageData(
                0,
                0,
                temp.width,
                temp.height
            );


        processPixels(
            imageData,
            temp.width,
            temp.height
        );


        applyMaskAdjustments(
            imageData,
            temp.width,
            temp.height
        );


        exportCtx.putImageData(
            imageData,
            0,
            0
        );


        /* Apply flips */

        if (state.flipX || state.flipY || state.rotation !== 0) {

            const transformed =
                document.createElement("canvas");

            const angle =
                (
                    state.rotation +
                    state.straighten
                ) *
                Math.PI /
                180;

            const sin =
                Math.abs(
                    Math.sin(angle)
                );

            const cos =
                Math.abs(
                    Math.cos(angle)
                );

            transformed.width =
                Math.round(
                    exportCanvas.width * cos +
                    exportCanvas.height * sin
                );

            transformed.height =
                Math.round(
                    exportCanvas.width * sin +
                    exportCanvas.height * cos
                );

            const tctx =
                transformed.getContext("2d");

            tctx.translate(
                transformed.width / 2,
                transformed.height / 2
            );

            tctx.rotate(angle);

            tctx.scale(
                state.flipX ? -1 : 1,
                state.flipY ? -1 : 1
            );

            tctx.drawImage(
                exportCanvas,
                -exportCanvas.width / 2,
                -exportCanvas.height / 2
            );

            exportCanvas.width =
                transformed.width;

            exportCanvas.height =
                transformed.height;

            exportCtx.clearRect(
                0,
                0,
                exportCanvas.width,
                exportCanvas.height
            );

            exportCtx.drawImage(
                transformed,
                0,
                0
            );

        }


        const format =
            document.getElementById(
                "exportFormat"
            ).value;

        const quality =
            Number(
                document.getElementById(
                    "exportQuality"
                ).value
            );


        const extension =
            format === "image/png"
                ? "png"
                : format === "image/webp"
                    ? "webp"
                    : "jpg";


        exportCanvas.toBlob(
            blob => {

                if (!blob) {

                    showLoading(false);

                    alert(
                        "Export failed. Please try again."
                    );

                    return;
                }


                const url =
                    URL.createObjectURL(blob);

                const link =
                    document.createElement("a");

                link.href = url;

                link.download =
                    `${getBaseFileName()}-edited.${extension}`;

                document.body.appendChild(link);

                link.click();

                link.remove();

                setTimeout(
                    () =>
                        URL.revokeObjectURL(url),
                    1000
                );

                showLoading(false);

            },
            format,
            quality
        );

    });


function getBaseFileName() {

    const name =
        imageName.textContent ||
        "photo";

    return name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-z0-9-_]/gi, "-")
        .replace(/-+/g, "-");

}


/* -------------------------------------------------------
   INITIAL UI
------------------------------------------------------- */

syncControls();

activeToolName.textContent = "Light";

updateHistoryUI();

console.log(
    "Toolora Professional Photo Editor initialized."
);
