"use strict";


/* =========================
   ELEMENT HELPERS
========================= */

const $ = (id) => document.getElementById(id);


/* =========================
   DOM ELEMENTS
========================= */

const photoInput = $("photoInput");
const photoCanvas = $("photoCanvas");
const canvasWrapper = $("canvasWrapper");
const emptyPreview = $("emptyPreview");

const brightness = $("brightness");
const contrast = $("contrast");
const saturation = $("saturation");
const blur = $("blur");

const brightnessValue = $("brightnessValue");
const contrastValue = $("contrastValue");
const saturationValue = $("saturationValue");
const blurValue = $("blurValue");

const imageWidth = $("imageWidth");
const imageHeight = $("imageHeight");
const lockRatio = $("lockRatio");

const exportFormat = $("exportFormat");
const exportQuality = $("exportQuality");
const qualityValue = $("qualityValue");

const zoomValue = $("zoomValue");

const imageInfo = $("imageInfo");
const imageStatus = $("imageStatus");


/* =========================
   CANVAS
========================= */

const ctx = photoCanvas.getContext("2d", {
    willReadFrequently: true
});


/* =========================
   APPLICATION STATE
========================= */

let originalImage = null;

let originalWidth = 0;
let originalHeight = 0;

let currentRotation = 0;
let flipX = 1;
let flipY = 1;

let zoom = 1;

let selectedFilter = "none";

let history = [];
let historyIndex = -1;

let isImageLoaded = false;


/* =========================
   DEFAULT SETTINGS
========================= */

function getDefaultSettings() {

    return {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        blur: 0,
        rotation: 0,
        flipX: 1,
        flipY: 1,
        filter: "none"
    };
}


/* =========================
   CURRENT SETTINGS
========================= */

function getCurrentSettings() {

    return {
        brightness: Number(brightness.value),
        contrast: Number(contrast.value),
        saturation: Number(saturation.value),
        blur: Number(blur.value),
        rotation: currentRotation,
        flipX: flipX,
        flipY: flipY,
        filter: selectedFilter
    };
}


/* =========================
   IMAGE UPLOAD
========================= */

photoInput.addEventListener("change", function () {

    const file = this.files[0];

    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {

        alert("Please select a valid image file.");

        this.value = "";

        return;
    }

    const reader = new FileReader();

    reader.onload = function (event) {

        const image = new Image();

        image.onload = function () {

            originalImage = image;

            originalWidth = image.naturalWidth;
            originalHeight = image.naturalHeight;

            isImageLoaded = true;

            resetEditorControls();

            imageWidth.value = originalWidth;
            imageHeight.value = originalHeight;

            emptyPreview.style.display = "none";
            photoCanvas.hidden = false;

            zoom = 1;

            updateZoom();

            renderImage();

            clearHistory();

            saveHistory();

            imageInfo.textContent =
                `${originalWidth} × ${originalHeight}px`;

            imageStatus.textContent = "Photo loaded";

        };

        image.onerror = function () {

            alert("Unable to load this image.");

        };

        image.src = event.target.result;
    };

    reader.readAsDataURL(file);

});


/* =========================
   RESET EDITOR CONTROLS
========================= */

function resetEditorControls() {

    brightness.value = 100;
    contrast.value = 100;
    saturation.value = 100;
    blur.value = 0;

    currentRotation = 0;

    flipX = 1;
    flipY = 1;

    selectedFilter = "none";

    updateControlValues();

}


/* =========================
   CONTROL VALUES
========================= */

function updateControlValues() {

    brightnessValue.textContent =
        `${brightness.value}%`;

    contrastValue.textContent =
        `${contrast.value}%`;

    saturationValue.textContent =
        `${saturation.value}%`;

    blurValue.textContent =
        `${blur.value}px`;

    qualityValue.textContent =
        `${exportQuality.value}%`;
}


/* =========================
   REAL-TIME ADJUSTMENTS
========================= */

brightness.addEventListener("input", function () {

    updateControlValues();

    renderImage();

});


contrast.addEventListener("input", function () {

    updateControlValues();

    renderImage();

});


saturation.addEventListener("input", function () {

    updateControlValues();

    renderImage();

});


blur.addEventListener("input", function () {

    updateControlValues();

    renderImage();

});


/* =========================
   FILTER BUTTONS
========================= */

document.querySelectorAll("[data-filter]").forEach(button => {

    button.addEventListener("click", function () {

        if (!isImageLoaded) {

            alert("Please upload a photo first.");

            return;
        }

        selectedFilter =
            this.dataset.filter;

        renderImage();

        saveHistory();

        imageStatus.textContent =
            `${this.textContent} filter applied`;

    });

});


/* =========================
   ROTATE LEFT
========================= */

$("rotateLeftBtn").addEventListener("click", function () {

    if (!isImageLoaded) {

        alert("Please upload a photo first.");

        return;
    }

    currentRotation =
        (currentRotation - 90 + 360) % 360;

    renderImage();

    saveHistory();

    imageStatus.textContent =
        "Rotated left";

});


/* =========================
   ROTATE RIGHT
========================= */

$("rotateRightBtn").addEventListener("click", function () {

    if (!isImageLoaded) {

        alert("Please upload a photo first.");

        return;
    }

    currentRotation =
        (currentRotation + 90) % 360;

    renderImage();

    saveHistory();

    imageStatus.textContent =
        "Rotated right";

});


/* =========================
   FLIP HORIZONTAL
========================= */

$("flipHorizontalBtn").addEventListener("click", function () {

    if (!isImageLoaded) {

        alert("Please upload a photo first.");

        return;
    }

    flipX *= -1;

    renderImage();

    saveHistory();

    imageStatus.textContent =
        "Flipped horizontally";

});


/* =========================
   FLIP VERTICAL
========================= */

$("flipVerticalBtn").addEventListener("click", function () {

    if (!isImageLoaded) {

        alert("Please upload a photo first.");

        return;
    }

    flipY *= -1;

    renderImage();

    saveHistory();

    imageStatus.textContent =
        "Flipped vertically";

});


/* =========================
   RENDER IMAGE
========================= */

function renderImage() {

    if (!originalImage || !isImageLoaded) {
        return;
    }

    const sourceWidth =
        Number(imageWidth.value) || originalWidth;

    const sourceHeight =
        Number(imageHeight.value) || originalHeight;

    const rotation =
        currentRotation % 360;

    const rotated =
        rotation === 90 ||
        rotation === 270;

    const canvasWidth =
        rotated ? sourceHeight : sourceWidth;

    const canvasHeight =
        rotated ? sourceWidth : sourceHeight;

    photoCanvas.width = canvasWidth;
    photoCanvas.height = canvasHeight;

    ctx.clearRect(
        0,
        0,
        canvasWidth,
        canvasHeight
    );

    ctx.save();

    ctx.translate(
        canvasWidth / 2,
        canvasHeight / 2
    );

    ctx.rotate(
        rotation * Math.PI / 180
    );

    ctx.scale(
        flipX,
        flipY
    );

    ctx.filter =
        createCanvasFilter();

    ctx.drawImage(
        originalImage,
        -sourceWidth / 2,
        -sourceHeight / 2,
        sourceWidth,
        sourceHeight
    );

    ctx.restore();

    ctx.filter = "none";

    updateImageInfo();

}


/* =========================
   CANVAS FILTER
========================= */

function createCanvasFilter() {

    let filterString =
        `brightness(${brightness.value}%) ` +
        `contrast(${contrast.value}%) ` +
        `saturate(${saturation.value}%) ` +
        `blur(${blur.value}px)`;

    switch (selectedFilter) {

        case "grayscale":

            filterString +=
                " grayscale(100%)";

            break;


        case "sepia":

            filterString +=
                " sepia(100%)";

            break;


        case "vintage":

            filterString +=
                " sepia(35%) saturate(80%) contrast(110%)";

            break;


        case "warm":

            filterString +=
                " sepia(20%) saturate(125%)";

            break;


        case "cool":

            filterString +=
                " saturate(90%) contrast(105%)";

            break;

    }

    return filterString;
}


/* =========================
   IMAGE INFORMATION
========================= */

function updateImageInfo() {

    imageInfo.textContent =
        `${photoCanvas.width} × ${photoCanvas.height}px`;

}


/* =========================
   RESIZE
========================= */

imageWidth.addEventListener("input", function () {

    if (!lockRatio.checked || !originalImage) {
        return;
    }

    const width =
        Number(this.value);

    if (!width || width <= 0) {
        return;
    }

    const ratio =
        originalHeight / originalWidth;

    imageHeight.value =
        Math.round(width * ratio);

});


imageHeight.addEventListener("input", function () {

    if (!lockRatio.checked || !originalImage) {
        return;
    }

    const height =
        Number(this.value);

    if (!height || height <= 0) {
        return;
    }

    const ratio =
        originalWidth / originalHeight;

    imageWidth.value =
        Math.round(height * ratio);

});


$("applyResizeBtn").addEventListener("click", function () {

    if (!isImageLoaded) {

        alert("Please upload a photo first.");

        return;
    }

    const width =
        Number(imageWidth.value);

    const height =
        Number(imageHeight.value);

    if (
        !width ||
        !height ||
        width <= 0 ||
        height <= 0
    ) {

        alert("Please enter valid width and height.");

        return;
    }

    if (
        width > 10000 ||
        height > 10000
    ) {

        alert(
            "For browser performance, maximum size is 10000 × 10000 pixels."
        );

        return;
    }

    renderImage();

    saveHistory();

    imageStatus.textContent =
        "Image resized";

});


/* =========================
   ZOOM
========================= */

$("zoomInBtn").addEventListener("click", function () {

    zoom += 0.1;

    if (zoom > 3) {
        zoom = 3;
    }

    updateZoom();

});


$("zoomOutBtn").addEventListener("click", function () {

    zoom -= 0.1;

    if (zoom < 0.2) {
        zoom = 0.2;
    }

    updateZoom();

});


function updateZoom() {

    photoCanvas.style.transform =
        `scale(${zoom})`;

    zoomValue.textContent =
        `${Math.round(zoom * 100)}%`;

}


/* =========================
   UNDO / REDO
========================= */

function createHistoryState() {

    return {
        brightness: Number(brightness.value),
        contrast: Number(contrast.value),
        saturation: Number(saturation.value),
        blur: Number(blur.value),

        width: Number(imageWidth.value),
        height: Number(imageHeight.value),

        rotation: currentRotation,

        flipX: flipX,
        flipY: flipY,

        filter: selectedFilter
    };

}


function applyHistoryState(state) {

    brightness.value =
        state.brightness;

    contrast.value =
        state.contrast;

    saturation.value =
        state.saturation;

    blur.value =
        state.blur;

    imageWidth.value =
        state.width;

    imageHeight.value =
        state.height;

    currentRotation =
        state.rotation;

    flipX =
        state.flipX;

    flipY =
        state.flipY;

    selectedFilter =
        state.filter;

    updateControlValues();

    renderImage();

}


function saveHistory() {

    if (!isImageLoaded) {
        return;
    }

    const state =
        createHistoryState();

    history =
        history.slice(
            0,
            historyIndex + 1
        );

    history.push(state);

    if (history.length > 30) {
        history.shift();
    }

    historyIndex =
        history.length - 1;

}


function clearHistory() {

    history = [];

    historyIndex = -1;

}


$("undoBtn").addEventListener("click", function () {

    if (
        !isImageLoaded ||
        historyIndex <= 0
    ) {

        imageStatus.textContent =
            "Nothing to undo";

        return;
    }

    historyIndex--;

    applyHistoryState(
        history[historyIndex]
    );

    imageStatus.textContent =
        "Undo applied";

});


$("redoBtn").addEventListener("click", function () {

    if (
        !isImageLoaded ||
        historyIndex >= history.length - 1
    ) {

        imageStatus.textContent =
            "Nothing to redo";

        return;
    }

    historyIndex++;

    applyHistoryState(
        history[historyIndex]
    );

    imageStatus.textContent =
        "Redo applied";

});


/* =========================
   RESET
========================= */

$("resetBtn").addEventListener("click", function () {

    if (!isImageLoaded) {

        return;
    }

    resetEditorControls();

    imageWidth.value =
        originalWidth;

    imageHeight.value =
        originalHeight;

    zoom = 1;

    updateZoom();

    renderImage();

    clearHistory();

    saveHistory();

    imageStatus.textContent =
        "Editor reset";

});


/* =========================
   EXPORT QUALITY
========================= */

exportQuality.addEventListener("input", function () {

    qualityValue.textContent =
        `${this.value}%`;

});


/* =========================
   DOWNLOAD
========================= */

$("downloadBtn").addEventListener("click", function () {

    if (!isImageLoaded) {

        alert("Please upload a photo first.");

        return;
    }

    renderImage();

    const format =
        exportFormat.value;

    const quality =
        Number(exportQuality.value) / 100;

    let extension = "jpg";

    if (format === "image/png") {
        extension = "png";
    }

    if (format === "image/webp") {
        extension = "webp";
    }

    const safeName =
        "toolora-edited-photo";

    photoCanvas.toBlob(
        function (blob) {

            if (!blob) {

                alert(
                    "Unable to export the photo. Please try again."
                );

                return;
            }

            const url =
                URL.createObjectURL(blob);

            const link =
                document.createElement("a");

            link.href = url;

            link.download =
                `${safeName}.${extension}`;

            document.body.appendChild(link);

            link.click();

            link.remove();

            setTimeout(function () {

                URL.revokeObjectURL(url);

            }, 1000);

            imageStatus.textContent =
                "Photo downloaded";

        },
        format,
        quality
    );

});


/* =========================
   CROP
========================= */

$("cropBtn").addEventListener("click", function () {

    if (!isImageLoaded) {

        alert("Please upload a photo first.");

        return;
    }

    const cropWidth =
        Math.round(photoCanvas.width * 0.8);

    const cropHeight =
        Math.round(photoCanvas.height * 0.8);

    if (
        cropWidth <= 0 ||
        cropHeight <= 0
    ) {
        return;
    }

    const cropCanvas =
        document.createElement("canvas");

    cropCanvas.width =
        cropWidth;

    cropCanvas.height =
        cropHeight;

    const cropCtx =
        cropCanvas.getContext("2d");

    const startX =
        Math.round(
            (photoCanvas.width - cropWidth) / 2
        );

    const startY =
        Math.round(
            (photoCanvas.height - cropHeight) / 2
        );

    cropCtx.drawImage(
        photoCanvas,

        startX,
        startY,
        cropWidth,
        cropHeight,

        0,
        0,
        cropWidth,
        cropHeight
    );

    const croppedImage =
        new Image();

    croppedImage.onload = function () {

        originalImage =
            croppedImage;

        originalWidth =
            cropWidth;

        originalHeight =
            cropHeight;

        currentRotation = 0;

        flipX = 1;
        flipY = 1;

        imageWidth.value =
            cropWidth;

        imageHeight.value =
            cropHeight;

        renderImage();

        saveHistory();

        imageStatus.textContent =
            "Photo cropped";

    };

    croppedImage.src =
        cropCanvas.toDataURL("image/png");

});


/* =========================
   INITIALIZE
========================= */

updateControlValues();

updateZoom();

imageStatus.textContent =
    "Ready";
