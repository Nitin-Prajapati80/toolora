"use strict";

/*
    Toolora Photo Editor
    Browser-based photo editing engine.
    No external libraries required.
*/


/* =========================================================
   ELEMENTS
   ========================================================= */

const photoInput = document.getElementById("photoInput");
const openPhotoBtn = document.getElementById("openPhotoBtn");
const emptyOpenBtn = document.getElementById("emptyOpenBtn");

const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d", {
    willReadFrequently: true
});

const photoStage = document.getElementById("photoStage");

const controlPanel =
    document.getElementById("controlPanel");

const toolButtons =
    document.querySelectorAll(".tool-button");

const emptyState =
    document.getElementById("emptyState");

const beforeLabel =
    document.getElementById("beforeLabel");

const photoName =
    document.getElementById("photoName");

const photoSize =
    document.getElementById("photoSize");

const statusBar =
    document.getElementById("statusBar");

const zoomValue =
    document.getElementById("zoomValue");

const undoBtn =
    document.getElementById("undoBtn");

const redoBtn =
    document.getElementById("redoBtn");

const beforeBtn =
    document.getElementById("beforeBtn");

const zoomInBtn =
    document.getElementById("zoomInBtn");

const zoomOutBtn =
    document.getElementById("zoomOutBtn");

const fitBtn =
    document.getElementById("fitBtn");


/* =========================================================
   IMAGE CANVASES
   ========================================================= */

const sourceCanvas =
    document.createElement("canvas");

const sourceCtx =
    sourceCanvas.getContext("2d", {
        willReadFrequently: true
    });


/* =========================================================
   APPLICATION STATE
   ========================================================= */

let imageLoaded = false;

let originalFileName = "";

let originalWidth = 0;
let originalHeight = 0;

let zoom = 1;

let beforeMode = false;

let activeTool = "light";

let renderPending = false;

let history = [];
let future = [];


/* =========================================================
   EDIT STATE
   ========================================================= */

const state = {

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

    texture: 0,
    clarity: 0,
    dehaze: 0,
    vignette: 0,

    grain: 0,

    sharpening: 0,
    noiseReduction: 0,

    rotation: 0,
    straighten: 0,

    flipX: false,
    flipY: false,

    aspectRatio: "original",

    presetAmount: 100,

    maskType: "radial",
    maskAmount: 0,
    maskExposure: 0,
    maskContrast: 0,
    maskSaturation: 0,

    blurAmount: 0,
    blurX: 50,
    blurY: 50
};


/* =========================================================
   DEFAULT STATE
   ========================================================= */

function getDefaultState() {

    return {
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

        texture: 0,
        clarity: 0,
        dehaze: 0,
        vignette: 0,

        grain: 0,

        sharpening: 0,
        noiseReduction: 0,

        rotation: 0,
        straighten: 0,

        flipX: false,
        flipY: false,

        aspectRatio: "original",

        presetAmount: 100,

        maskType: "radial",
        maskAmount: 0,
        maskExposure: 0,
        maskContrast: 0,
        maskSaturation: 0,

        blurAmount: 0,
        blurX: 50,
        blurY: 50
    };
}


/* =========================================================
   UTILITY
   ========================================================= */

function clamp(value, min, max) {
    return Math.max(
        min,
        Math.min(max, value)
    );
}


function copyState() {
    return JSON.parse(
        JSON.stringify(state)
    );
}


function restoreState(saved) {

    Object.keys(state).forEach((key) => {

        if (saved[key] !== undefined) {
            state[key] = saved[key];
        }

    });
}


/* =========================================================
   OPEN PHOTO
   ========================================================= */

function openPhotoPicker() {

    if (!photoInput) {
        alert(
            "Photo upload is unavailable."
        );

        return;
    }

    photoInput.value = "";

    photoInput.click();
}


if (openPhotoBtn) {

    openPhotoBtn.addEventListener(
        "click",
        openPhotoPicker
    );
}


if (emptyOpenBtn) {

    emptyOpenBtn.addEventListener(
        "click",
        openPhotoPicker
    );
}


if (photoStage) {

    photoStage.addEventListener(
        "dblclick",
        openPhotoPicker
    );
}


/* =========================================================
   PHOTO FILE
   ========================================================= */

if (photoInput) {

    photoInput.addEventListener(
        "change",
        function (event) {

            const file =
                event.target.files &&
                event.target.files[0];

            if (!file) {
                return;
            }

            if (
                !file.type ||
                !file.type.startsWith(
                    "image/"
                )
            ) {

                alert(
                    "Please select a valid image file."
                );

                return;
            }

            loadPhoto(file);
        }
    );
}


/* =========================================================
   LOAD PHOTO
   ========================================================= */

function loadPhoto(file) {

    const objectURL =
        URL.createObjectURL(file);

    const image =
        new Image();

    image.onload = function () {

        URL.revokeObjectURL(
            objectURL
        );

        originalFileName =
            file.name;

        originalWidth =
            image.naturalWidth;

        originalHeight =
            image.naturalHeight;

        /*
            Keep a reasonably sized working copy.
            This prevents very large phone photos
            from making every slider slow.
        */

        const maximumWorkingSize =
            1800;

        const longestSide =
            Math.max(
                originalWidth,
                originalHeight
            );

        const scale =
            Math.min(
                1,
                maximumWorkingSize /
                longestSide
            );

        sourceCanvas.width =
            Math.max(
                1,
                Math.round(
                    originalWidth * scale
                )
            );

        sourceCanvas.height =
            Math.max(
                1,
                Math.round(
                    originalHeight * scale
                )
            );

        sourceCtx.clearRect(
            0,
            0,
            sourceCanvas.width,
            sourceCanvas.height
        );

        sourceCtx.drawImage(
            image,
            0,
            0,
            sourceCanvas.width,
            sourceCanvas.height
        );

        imageLoaded = true;

        photoName.textContent =
            file.name;

        photoSize.textContent =
            `${originalWidth} × ${originalHeight}px`;

        emptyState.style.display =
            "none";

        canvas.style.display =
            "block";

        beforeMode = false;

        beforeLabel.style.display =
            "none";

        history = [];
        future = [];

        resetEditing();

        fitPhoto();

        render();
    };


    image.onerror = function () {

        URL.revokeObjectURL(
            objectURL
        );

        alert(
            "This image could not be opened. Please select another photo."
        );
    };


    image.src = objectURL;
}


/* =========================================================
   RESET
   ========================================================= */

function resetEditing() {

    const defaults =
        getDefaultState();

    restoreState(defaults);

    history = [];
    future = [];

    zoom = 1;

    updateZoomLabel();

    updateAllControls();
}


/* =========================================================
   HISTORY
   ========================================================= */

function saveHistory() {

    history.push(
        copyState()
    );

    if (history.length > 40) {
        history.shift();
    }

    future = [];
}


function undo() {

    if (!history.length) {
        return;
    }

    future.push(
        copyState()
    );

    const previous =
        history.pop();

    restoreState(previous);

    updateAllControls();

    render();
}


function redo() {

    if (!future.length) {
        return;
    }

    history.push(
        copyState()
    );

    const next =
        future.pop();

    restoreState(next);

    updateAllControls();

    render();
}


undoBtn.addEventListener(
    "click",
    undo
);


redoBtn.addEventListener(
    "click",
    redo
);


/* =========================================================
   BEFORE
   ========================================================= */

beforeBtn.addEventListener(
    "click",
    function () {

        if (!imageLoaded) {
            return;
        }

        beforeMode =
            !beforeMode;

        beforeLabel.style.display =
            beforeMode
                ? "block"
                : "none";

        render();
    }
);


/* =========================================================
   COLOR PROCESSING
   ========================================================= */

function processImageData(imageData) {

    const data =
        imageData.data;

    const exposure =
        Math.pow(
            2,
            state.exposure / 100
        );

    const contrast =
        (state.contrast + 100) /
        100;

    const saturation =
        1 +
        state.saturation / 100;

    const vibrance =
        state.vibrance / 100;

    const temperature =
        state.temperature / 100;

    const tint =
        state.tint / 100;

    for (
        let i = 0;
        i < data.length;
        i += 4
    ) {

        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];


        /* Exposure */

        r *= exposure;
        g *= exposure;
        b *= exposure;


        /* Contrast */

        r =
            128 +
            (r - 128) *
            contrast;

        g =
            128 +
            (g - 128) *
            contrast;

        b =
            128 +
            (b - 128) *
            contrast;


        /* Highlights */

        const brightness =
            (
                0.299 * r +
                0.587 * g +
                0.114 * b
            ) / 255;

        const highlightWeight =
            brightness *
            brightness;

        const highlightValue =
            state.highlights /
            100 *
            highlightWeight *
            55;

        r += highlightValue;
        g += highlightValue;
        b += highlightValue;


        /* Shadows */

        const shadowWeight =
            1 - brightness;

        const shadowValue =
            state.shadows /
            100 *
            shadowWeight *
            55;

        r += shadowValue;
        g += shadowValue;
        b += shadowValue;


        /* Whites */

        const whiteValue =
            state.whites /
            100 *
            25;

        r += whiteValue;
        g += whiteValue;
        b += whiteValue;


        /* Blacks */

        const blackValue =
            state.blacks /
            100 *
            20;

        r += blackValue;
        g += blackValue;
        b += blackValue;


        /* Temperature */

        r +=
            temperature * 25;

        b -=
            temperature * 25;


        /* Tint */

        r +=
            tint * 7;

        g -=
            tint * 12;

        b +=
            tint * 7;


        /* Saturation */

        const gray =
            0.299 * r +
            0.587 * g +
            0.114 * b;

        r =
            gray +
            (r - gray) *
            saturation;

        g =
            gray +
            (g - gray) *
            saturation;

        b =
            gray +
            (b - gray) *
            saturation;


        /* Vibrance */

        const max =
            Math.max(r, g, b);

        const min =
            Math.min(r, g, b);

        const currentSaturation =
            max === 0
                ? 0
                : (max - min) / max;

        const vibranceFactor =
            1 +
            vibrance *
            (1 - currentSaturation);

        r =
            gray +
            (r - gray) *
            vibranceFactor;

        g =
            gray +
            (g - gray) *
            vibranceFactor;

        b =
            gray +
            (b - gray) *
            vibranceFactor;


        /* Texture */

        if (state.texture !== 0) {

            const factor =
                1 +
                state.texture /
                250;

            r =
                gray +
                (r - gray) *
                factor;

            g =
                gray +
                (g - gray) *
                factor;

            b =
                gray +
                (b - gray) *
                factor;
        }


        /* Clarity */

        if (state.clarity !== 0) {

            const factor =
                1 +
                state.clarity /
                220;

            r =
                128 +
                (r - 128) *
                factor;

            g =
                128 +
                (g - 128) *
                factor;

            b =
                128 +
                (b - 128) *
                factor;
        }


        /* Dehaze */

        if (state.dehaze !== 0) {

            const factor =
                1 +
                state.dehaze /
                180;

            r =
                128 +
                (r - 128) *
                factor;

            g =
                128 +
                (g - 128) *
                factor;

            b =
                128 +
                (b - 128) *
                factor;
        }


        data[i] =
            clamp(r, 0, 255);

        data[i + 1] =
            clamp(g, 0, 255);

        data[i + 2] =
            clamp(b, 0, 255);
    }

    return imageData;
}


/* =========================================================
   MASK
   ========================================================= */

function applyMask(context, width, height) {

    if (
        state.maskAmount === 0
    ) {
        return;
    }

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
        state.maskAmount / 100;

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

            if (
                state.maskType ===
                "radial"
            ) {

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

            } else {

                mask =
                    clamp(
                        1 -
                        y / height,
                        0,
                        1
                    );
            }

            mask *= amount;

            const index =
                (y * width + x) * 4;


            /* Exposure */

            const exposureFactor =
                Math.pow(
                    2,
                    (
                        state.maskExposure /
                        100
                    ) *
                    mask
                );

            data[index] =
                clamp(
                    data[index] *
                    exposureFactor,
                    0,
                    255
                );

            data[index + 1] =
                clamp(
                    data[index + 1] *
                    exposureFactor,
                    0,
                    255
                );

            data[index + 2] =
                clamp(
                    data[index + 2] *
                    exposureFactor,
                    0,
                    255
                );


            /* Saturation */

            const gray =
                0.299 *
                data[index] +
                0.587 *
                data[index + 1] +
                0.114 *
                data[index + 2];

            const satFactor =
                1 +
                (
                    state.maskSaturation /
                    100
                ) *
                mask;

            data[index] =
                clamp(
                    gray +
                    (
                        data[index] -
                        gray
                    ) *
                    satFactor,
                    0,
                    255
                );

            data[index + 1] =
                clamp(
                    gray +
                    (
                        data[index + 1] -
                        gray
                    ) *
                    satFactor,
                    0,
                    255
                );

            data[index + 2] =
                clamp(
                    gray +
                    (
                        data[index + 2] -
                        gray
                    ) *
                    satFactor,
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
   VIGNETTE
   ========================================================= */

function applyVignette(
    context,
    width,
    height
) {

    if (
        state.vignette === 0
    ) {
        return;
    }

    const amount =
        Math.abs(
            state.vignette
        ) / 100;

    const gradient =
        context.createRadialGradient(
            width / 2,
            height / 2,
            Math.min(
                width,
                height
            ) * 0.18,

            width / 2,
            height / 2,
            Math.max(
                width,
                height
            ) * 0.72
        );

    if (
        state.vignette > 0
    ) {

        gradient.addColorStop(
            0,
            "rgba(0,0,0,0)"
        );

        gradient.addColorStop(
            1,
            `rgba(0,0,0,${amount * 0.75})`
        );

    } else {

        gradient.addColorStop(
            0,
            `rgba(255,255,255,${amount * 0.25})`
        );

        gradient.addColorStop(
            1,
            "rgba(255,255,255,0)"
        );
    }

    context.save();

    context.fillStyle =
        gradient;

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

function applyGrain(
    context,
    width,
    height
) {

    if (state.grain <= 0) {
        return;
    }

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
        state.grain * 0.55;

    for (
        let i = 0;
        i < data.length;
        i += 4
    ) {

        const random =
            (
                Math.random() -
                0.5
            ) *
            amount;

        data[i] =
            clamp(
                data[i] + random,
                0,
                255
            );

        data[i + 1] =
            clamp(
                data[i + 1] + random,
                0,
                255
            );

        data[i + 2] =
            clamp(
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
   SHARPEN
   ========================================================= */

function applySharpen(
    context,
    width,
    height
) {

    if (
        state.sharpening <= 0
    ) {
        return;
    }

    const imageData =
        context.getImageData(
            0,
            0,
            width,
            height
        );

    const original =
        new Uint8ClampedArray(
            imageData.data
        );

    const data =
        imageData.data;

    const strength =
        state.sharpening / 100;

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

            const index =
                (y * width + x) * 4;

            const top =
                ((y - 1) * width + x) *
                4;

            const bottom =
                ((y + 1) * width + x) *
                4;

            const left =
                (y * width + x - 1) *
                4;

            const right =
                (y * width + x + 1) *
                4;

            for (
                let channel = 0;
                channel < 3;
                channel++
            ) {

                const sharpened =
                    original[index + channel] * 5 -
                    original[top + channel] -
                    original[bottom + channel] -
                    original[left + channel] -
                    original[right + channel];

                data[index + channel] =
                    clamp(
                        original[index + channel] +
                        (
                            sharpened -
                            original[index + channel]
                        ) *
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
   BLUR
   ========================================================= */

function applyBlur(
    context,
    width,
    height
) {

    if (
        state.blurAmount <= 0
    ) {
        return;
    }

    const amount =
        state.blurAmount /
        14;

    context.save();

    context.filter =
        `blur(${Math.max(
            0.5,
            amount
        )}px)`;

    const copy =
        document.createElement(
            "canvas"
        );

    copy.width = width;
    copy.height = height;

    const copyCtx =
        copy.getContext("2d");

    copyCtx.drawImage(
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
        copy,
        0,
        0
    );

    context.restore();
}


/* =========================================================
   GEOMETRY
   ========================================================= */

function getRotation() {

    return (
        state.rotation +
        state.straighten
    ) *
    Math.PI /
    180;
}


function getRotatedSize() {

    const width =
        sourceCanvas.width;

    const height =
        sourceCanvas.height;

    const angle =
        getRotation();

    const cos =
        Math.abs(
            Math.cos(angle)
        );

    const sin =
        Math.abs(
            Math.sin(angle)
        );

    return {
        width: Math.max(
            1,
            Math.ceil(
                width * cos +
                height * sin
            )
        ),

        height: Math.max(
            1,
            Math.ceil(
                width * sin +
                height * cos
            )
        )
    };
}


/* =========================================================
   RENDER
   ========================================================= */

function requestRender() {

    if (!imageLoaded) {
        return;
    }

    if (renderPending) {
        return;
    }

    renderPending = true;

    requestAnimationFrame(
        function () {

            renderPending =
                false;

            renderNow();
        }
    );
}


function render() {
    requestRender();
}


function renderNow() {

    if (!imageLoaded) {
        return;
    }

    const size =
        getRotatedSize();

    const workCanvas =
        document.createElement(
            "canvas"
        );

    workCanvas.width =
        size.width;

    workCanvas.height =
        size.height;

    const workCtx =
        workCanvas.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );


    /* Geometry */

    workCtx.save();

    workCtx.translate(
        size.width / 2,
        size.height / 2
    );

    workCtx.rotate(
        getRotation()
    );

    workCtx.scale(
        state.flipX
            ? -1
            : 1,

        state.flipY
            ? -1
            : 1
    );

    workCtx.drawImage(
        sourceCanvas,

        -sourceCanvas.width / 2,
        -sourceCanvas.height / 2
    );

    workCtx.restore();


    /* Before */

    if (beforeMode) {

        drawCanvasToPreview(
            sourceCanvas
        );

        statusBar.textContent =
            "Original photo";

        return;
    }


    /* Pixel adjustments */

    let imageData =
        workCtx.getImageData(
            0,
            0,
            size.width,
            size.height
        );

    imageData =
        processImageData(
            imageData
        );

    workCtx.putImageData(
        imageData,
        0,
        0
    );


    /* Local mask */

    applyMask(
        workCtx,
        size.width,
        size.height
    );


    /* Sharpen */

    applySharpen(
        workCtx,
        size.width,
        size.height
    );


    /* Blur */

    applyBlur(
        workCtx,
        size.width,
        size.height
    );


    /* Vignette */

    applyVignette(
        workCtx,
        size.width,
        size.height
    );


    /* Grain */

    applyGrain(
        workCtx,
        size.width,
        size.height
    );


    drawCanvasToPreview(
        workCanvas
    );

    statusBar.textContent =
        `${size.width} × ${size.height}px`;
}


/* =========================================================
   PREVIEW DRAW
   ========================================================= */

function drawCanvasToPreview(
    source
) {

    const availableWidth =
        Math.max(
            100,
            photoStage.clientWidth - 24
        );

    const availableHeight =
        Math.max(
            100,
            photoStage.clientHeight - 24
        );

    const scale =
        Math.min(
            availableWidth /
            source.width,

            availableHeight /
            source.height,

            1
        );

    const width =
        Math.max(
            1,
            Math.round(
                source.width * scale
            )
        );

    const height =
        Math.max(
            1,
            Math.round(
                source.height * scale
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
        source,
        0,
        0,
        width,
        height
    );

    canvas.style.width =
        `${width}px`;

    canvas.style.height =
        `${height}px`;

    applyZoomTransform();
}


/* =========================================================
   ZOOM
   ========================================================= */

function applyZoomTransform() {

    canvas.style.transform =
        `scale(${zoom})`;

    updateZoomLabel();
}


function updateZoomLabel() {

    if (zoom === 1) {

        zoomValue.textContent =
            "Fit";

        return;
    }

    zoomValue.textContent =
        `${Math.round(
            zoom * 100
        )}%`;
}


function fitPhoto() {

    zoom = 1;

    applyZoomTransform();

    render();
}


zoomInBtn.addEventListener(
    "click",
    function () {

        if (!imageLoaded) {
            return;
        }

        zoom =
            clamp(
                zoom + 0.1,
                0.5,
                2.5
            );

        applyZoomTransform();
    }
);


zoomOutBtn.addEventListener(
    "click",
    function () {

        if (!imageLoaded) {
            return;
        }

        zoom =
            clamp(
                zoom - 0.1,
                0.5,
                2.5
            );

        applyZoomTransform();
    }
);


fitBtn.addEventListener(
    "click",
    fitPhoto
);


/* =========================================================
   SLIDER CREATOR
   ========================================================= */

function createSlider(
    label,
    key,
    min,
    max,
    step = 1
) {

    return `
        <div class="slider-control">

            <div class="slider-header">

                <label>
                    ${label}
                </label>

                <span
                    class="slider-value"
                    data-value="${key}"
                >
                    ${state[key]}
                </span>

            </div>

            <input
                type="range"
                data-key="${key}"
                min="${min}"
                max="${max}"
                step="${step}"
                value="${state[key]}"
            >

        </div>
    `;
}


/* =========================================================
   PANEL CONTENT
   ========================================================= */

function lightPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Light
            </h3>

            ${createSlider(
                "Exposure",
                "exposure",
                -100,
                100
            )}

            ${createSlider(
                "Contrast",
                "contrast",
                -100,
                100
            )}

            ${createSlider(
                "Highlights",
                "highlights",
                -100,
                100
            )}

            ${createSlider(
                "Shadows",
                "shadows",
                -100,
                100
            )}

            ${createSlider(
                "Whites",
                "whites",
                -100,
                100
            )}

            ${createSlider(
                "Blacks",
                "blacks",
                -100,
                100
            )}

        </div>

        <div class="editor-info">
            Light controls change the overall brightness and tonal range of your photo.
        </div>
    `;
}


function colorPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Color
            </h3>

            ${createSlider(
                "Temperature",
                "temperature",
                -100,
                100
            )}

            ${createSlider(
                "Tint",
                "tint",
                -100,
                100
            )}

            ${createSlider(
                "Vibrance",
                "vibrance",
                -100,
                100
            )}

            ${createSlider(
                "Saturation",
                "saturation",
                -100,
                100
            )}

        </div>

        <div class="editor-info">
            Temperature and tint change the color mood. Vibrance and saturation control color intensity.
        </div>
    `;
}


function effectsPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Effects
            </h3>

            ${createSlider(
                "Texture",
                "texture",
                -100,
                100
            )}

            ${createSlider(
                "Clarity",
                "clarity",
                -100,
                100
            )}

            ${createSlider(
                "Dehaze",
                "dehaze",
                -100,
                100
            )}

            ${createSlider(
                "Vignette",
                "vignette",
                -100,
                100
            )}

            ${createSlider(
                "Grain",
                "grain",
                0,
                100
            )}

        </div>

        <div class="editor-info">
            Use effects carefully for a natural result. Negative vignette creates a subtle brightening effect.
        </div>
    `;
}


function detailPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Detail
            </h3>

            ${createSlider(
                "Sharpening",
                "sharpening",
                0,
                100
            )}

            ${createSlider(
                "Noise Reduction",
                "noiseReduction",
                0,
                100
            )}

        </div>

        <div class="editor-info">
            Sharpening improves edge definition. Noise reduction is designed for photos with visible digital noise.
        </div>
    `;
}


function cropPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Crop & Geometry
            </h3>

            <label class="field-label">
                Aspect Ratio
            </label>

            <select
                class="editor-select"
                data-select="aspectRatio"
            >
                <option value="original">
                    Original
                </option>

                <option value="1:1">
                    1:1 Square
                </option>

                <option value="4:5">
                    4:5 Portrait
                </option>

                <option value="5:4">
                    5:4 Landscape
                </option>

                <option value="4:3">
                    4:3
                </option>

                <option value="3:4">
                    3:4
                </option>

                <option value="16:9">
                    16:9
                </option>

                <option value="9:16">
                    9:16
                </option>
            </select>

            ${createSlider(
                "Straighten",
                "straighten",
                -45,
                45,
                0.5
            )}

            <button
                type="button"
                class="action-button"
                data-action="rotate-left"
            >
                Rotate Left
            </button>

            <button
                type="button"
                class="action-button"
                data-action="rotate-right"
            >
                Rotate Right
            </button>

            <button
                type="button"
                class="action-button"
                data-action="flip-x"
            >
                Flip Horizontal
            </button>

            <button
                type="button"
                class="action-button"
                data-action="flip-y"
            >
                Flip Vertical
            </button>

        </div>
    `;
}


function presetsPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Presets
            </h3>

            <div class="preset-grid">

                <button
                    type="button"
                    class="preset-button"
                    data-preset="clean"
                >
                    Clean
                </button>

                <button
                    type="button"
                    class="preset-button"
                    data-preset="warm"
                >
                    Warm
                </button>

                <button
                    type="button"
                    class="preset-button"
                    data-preset="cool"
                >
                    Cool
                </button>

                <button
                    type="button"
                    class="preset-button"
                    data-preset="cinematic"
                >
                    Cinematic
                </button>

                <button
                    type="button"
                    class="preset-button"
                    data-preset="matte"
                >
                    Matte
                </button>

                <button
                    type="button"
                    class="preset-button"
                    data-preset="vivid"
                >
                    Vivid
                </button>

                <button
                    type="button"
                    class="preset-button"
                    data-preset="portrait"
                >
                    Portrait
                </button>

                <button
                    type="button"
                    class="preset-button"
                    data-preset="blackwhite"
                >
                    B&W
                </button>

            </div>

            ${createSlider(
                "Preset Amount",
                "presetAmount",
                0,
                100
            )}

        </div>
    `;
}


function maskPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Local Mask
            </h3>

            <label class="field-label">
                Mask Type
            </label>

            <select
                class="editor-select"
                data-select="maskType"
            >

                <option value="radial">
                    Radial
                </option>

                <option value="linear">
                    Linear
                </option>

            </select>

            ${createSlider(
                "Mask Amount",
                "maskAmount",
                0,
                100
            )}

            ${createSlider(
                "Mask Exposure",
                "maskExposure",
                -100,
                100
            )}

            ${createSlider(
                "Mask Contrast",
                "maskContrast",
                -100,
                100
            )}

            ${createSlider(
                "Mask Saturation",
                "maskSaturation",
                -100,
                100
            )}

        </div>

        <div class="editor-info">
            This browser-based mask provides radial and linear local adjustments. It is not AI subject detection.
        </div>
    `;
}


function blurPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Lens Blur
            </h3>

            ${createSlider(
                "Blur Amount",
                "blurAmount",
                0,
                100
            )}

            ${createSlider(
                "Focus Position",
                "blurX",
                0,
                100
            )}

            ${createSlider(
                "Focus Height",
                "blurY",
                0,
                100
            )}

        </div>

        <div class="editor-info">
            Browser-based blur provides a lightweight depth-style effect. It does not perform AI depth detection.
        </div>
    `;
}


function exportPanel() {

    return `

        <div class="editor-section">

            <h3 class="section-title">
                Export
            </h3>

            <div class="export-card">

                <label class="field-label">
                    Format
                </label>

                <select
                    id="exportFormat"
                    class="editor-select"
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


                <label class="field-label">
                    Maximum Long Edge
                </label>

                <select
                    id="exportSize"
                    class="editor-select"
                >

                    <option value="original">
                        Original Working Size
                    </option>

                    <option value="4000">
                        4000px
                    </option>

                    <option value="3000">
                        3000px
                    </option>

                    <option value="2500">
                        2500px
                    </option>

                    <option value="2000">
                        2000px
                    </option>

                    <option value="1600">
                        1600px
                    </option>

                    <option value="1200">
                        1200px
                    </option>

                </select>


                <label class="field-label">
                    JPG / WebP Quality
                </label>

                <input
                    id="exportQuality"
                    type="range"
                    min="50"
                    max="100"
                    value="92"
                >

                <button
                    type="button"
                    class="action-button primary"
                    id="exportBtn"
                >
                    Export Photo
                </button>

            </div>

        </div>

        <div class="editor-info">
            Photo processing happens locally in your browser. Your photo is not uploaded to a server by this editor.
        </div>
    `;
}


/* =========================================================
   PANEL SELECTOR
   ========================================================= */

function showTool(tool) {

    activeTool = tool;

    toolButtons.forEach(
        (button) => {

            button.classList.toggle(
                "active",
                button.dataset.tool === tool
            );
        }
    );


    if (tool === "light") {
        controlPanel.innerHTML =
            lightPanel();
    }

    else if (tool === "color") {
        controlPanel.innerHTML =
            colorPanel();
    }

    else if (tool === "effects") {
        controlPanel.innerHTML =
            effectsPanel();
    }

    else if (tool === "detail") {
        controlPanel.innerHTML =
            detailPanel();
    }

    else if (tool === "crop") {
        controlPanel.innerHTML =
            cropPanel();
    }

    else if (tool === "presets") {
        controlPanel.innerHTML =
            presetsPanel();
    }

    else if (tool === "mask") {
        controlPanel.innerHTML =
            maskPanel();
    }

    else if (tool === "blur") {
        controlPanel.innerHTML =
            blurPanel();
    }

    else if (tool === "export") {
        controlPanel.innerHTML =
            exportPanel();
    }


    bindPanelControls();

    controlPanel.scrollTop = 0;
}


toolButtons.forEach(
    (button) => {

        button.addEventListener(
            "click",
            function () {

                showTool(
                    this.dataset.tool
                );
            }
        );
    }
);


/* =========================================================
   PANEL CONTROLS
   ========================================================= */

function bindPanelControls() {

    const sliders =
        controlPanel.querySelectorAll(
            'input[type="range"][data-key]'
        );


    sliders.forEach(
        (slider) => {

            slider.addEventListener(
                "pointerdown",
                function () {

                    saveHistory();
                },
                {
                    once: true
                }
            );


            slider.addEventListener(
                "input",
                function () {

                    const key =
                        this.dataset.key;

                    state[key] =
                        Number(
                            this.value
                        );

                    const value =
                        controlPanel.querySelector(
                            `[data-value="${key}"]`
                        );

                    if (value) {

                        value.textContent =
                            Number(
                                this.value
                            ).toFixed(
                                this.step &&
                                Number(
                                    this.step
                                ) < 1
                                    ? 1
                                    : 0
                            );
                    }

                    requestRender();
                }
            );
        }
    );


    const selects =
        controlPanel.querySelectorAll(
            "[data-select]"
        );


    selects.forEach(
        (select) => {

            select.value =
                state[
                    select.dataset.select
                ];

            select.addEventListener(
                "change",
                function () {

                    saveHistory();

                    state[
                        this.dataset.select
                    ] =
                        this.value;

                    requestRender();
                }
            );
        }
    );


    const actionButtons =
        controlPanel.querySelectorAll(
            "[data-action]"
        );


    actionButtons.forEach(
        (button) => {

            button.addEventListener(
                "click",
                function () {

                    saveHistory();

                    const action =
                        this.dataset.action;


                    if (
                        action ===
                        "rotate-left"
                    ) {

                        state.rotation -= 90;
                    }


                    if (
                        action ===
                        "rotate-right"
                    ) {

                        state.rotation += 90;
                    }


                    if (
                        action ===
                        "flip-x"
                    ) {

                        state.flipX =
                            !state.flipX;
                    }


                    if (
                        action ===
                        "flip-y"
                    ) {

                        state.flipY =
                            !state.flipY;
                    }


                    requestRender();
                }
            );
        }
    );


    const presetButtons =
        controlPanel.querySelectorAll(
            "[data-preset]"
        );


    presetButtons.forEach(
        (button) => {

            button.addEventListener(
                "click",
                function () {

                    saveHistory();

                    applyPreset(
                        this.dataset.preset
                    );

                    requestRender();
                }
            );
        }
    );


    const exportButton =
        document.getElementById(
            "exportBtn"
        );


    if (exportButton) {

        exportButton.addEventListener(
            "click",
            exportPhoto
        );
    }


    updateAllControls();
}


/* =========================================================
   UPDATE CONTROLS
   ========================================================= */

function updateAllControls() {

    const sliders =
        controlPanel.querySelectorAll(
            'input[type="range"][data-key]'
        );


    sliders.forEach(
        (slider) => {

            const key =
                slider.dataset.key;

            if (
                state[key] ===
                undefined
            ) {
                return;
            }

            slider.value =
                state[key];

            const value =
                controlPanel.querySelector(
                    `[data-value="${key}"]`
                );

            if (value) {
                value.textContent =
                    state[key];
            }
        }
    );


    const selects =
        controlPanel.querySelectorAll(
            "[data-select]"
        );


    selects.forEach(
        (select) => {

            const key =
                select.dataset.select;

            select.value =
                state[key];
        }
    );
}


/* =========================================================
   PRESETS
   ========================================================= */

const presets = {

    clean: {
        exposure: 4,
        contrast: 4,
        highlights: -3,
        shadows: 4,
        saturation: 3,
        clarity: 3
    },

    warm: {
        exposure: 4,
        temperature: 20,
        contrast: 3,
        saturation: 5
    },

    cool: {
        temperature: -18,
        contrast: 4,
        saturation: 2
    },

    cinematic: {
        exposure: 2,
        contrast: 18,
        highlights: -18,
        shadows: 10,
        saturation: -6,
        clarity: 12,
        dehaze: 8,
        vignette: 20
    },

    matte: {
        contrast: -12,
        shadows: 8,
        blacks: 15,
        saturation: -7,
        grain: 8
    },

    vivid: {
        contrast: 10,
        vibrance: 28,
        saturation: 10,
        clarity: 8
    },

    portrait: {
        exposure: 3,
        highlights: -12,
        shadows: 10,
        texture: -8,
        clarity: -5,
        saturation: 3
    },

    blackwhite: {
        saturation: -100,
        contrast: 12,
        clarity: 8
    }
};


function applyPreset(name) {

    const preset =
        presets[name];

    if (!preset) {
        return;
    }

    const amount =
        state.presetAmount /
        100;

    const defaults =
        getDefaultState();

    Object.keys(preset).forEach(
        (key) => {

            const target =
                preset[key];

            const start =
                defaults[key] !==
                undefined
                    ? defaults[key]
                    : 0;

            state[key] =
                start +
                (
                    target -
                    start
                ) *
                amount;
        }
    );

    updateAllControls();
}


/* =========================================================
   EXPORT
   ========================================================= */

function exportPhoto() {

    if (!imageLoaded) {

        alert(
            "Please open a photo first."
        );

        return;
    }


    const formatElement =
        document.getElementById(
            "exportFormat"
        );

    const sizeElement =
        document.getElementById(
            "exportSize"
        );

    const qualityElement =
        document.getElementById(
            "exportQuality"
        );


    const format =
        formatElement
            ? formatElement.value
            : "image/jpeg";


    const quality =
        qualityElement
            ? Number(
                qualityElement.value
            ) / 100
            : 0.92;


    const requestedSize =
        sizeElement
            ? sizeElement.value
            : "original";


    const geometry =
        getRotatedSize();


    let width =
        geometry.width;

    let height =
        geometry.height;


    if (
        requestedSize !==
        "original"
    ) {

        const maximum =
            Number(
                requestedSize
            );

        const scale =
            Math.min(
                1,
                maximum /
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


    const output =
        document.createElement(
            "canvas"
        );

    output.width =
        width;

    output.height =
        height;


    const outputCtx =
        output.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );


    const scale =
        Math.min(
            width /
            geometry.width,

            height /
            geometry.height
        );


    outputCtx.save();

    outputCtx.translate(
        width / 2,
        height / 2
    );

    outputCtx.rotate(
        getRotation()
    );

    outputCtx.scale(
        state.flipX
            ? -1
            : 1,

        state.flipY
            ? -1
            : 1
    );


    outputCtx.drawImage(
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


    outputCtx.restore();


    let imageData =
        outputCtx.getImageData(
            0,
            0,
            width,
            height
        );


    imageData =
        processImageData(
            imageData
        );


    outputCtx.putImageData(
        imageData,
        0,
        0
    );


    applyMask(
        outputCtx,
        width,
        height
    );


    applySharpen(
        outputCtx,
        width,
        height
    );


    applyBlur(
        outputCtx,
        width,
        height
    );


    applyVignette(
        outputCtx,
        width,
        height
    );


    applyGrain(
        outputCtx,
        width,
        height
    );


    output.toBlob(
        function (blob) {

            if (!blob) {

                alert(
                    "Export failed. Please try again."
                );

                return;
            }


            let extension =
                "jpg";

            if (
                format ===
                "image/png"
            ) {
                extension =
                    "png";
            }

            if (
                format ===
                "image/webp"
            ) {
                extension =
                    "webp";
            }


            const baseName =
                originalFileName
                    ? originalFileName
                        .replace(
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

            link.href =
                url;

            link.download =
                downloadName;


            document.body.appendChild(
                link
            );

            link.click();

            link.remove();


            setTimeout(
                function () {

                    URL.revokeObjectURL(
                        url
                    );

                },
                1000
            );

        },
        format,
        quality
    );
}


/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

document.addEventListener(
    "keydown",
    function (event) {

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
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
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
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
    function () {

        clearTimeout(
            resizeTimer
        );

        resizeTimer =
            setTimeout(
                function () {

                    if (
                        imageLoaded
                    ) {
                        render();
                    }

                },
                120
            );
    }
);


/* =========================================================
   INITIAL TOOL
   ========================================================= */

showTool("light");
