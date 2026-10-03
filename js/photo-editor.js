/* =========================================================
   TOOLORA - PROFESSIONAL PHOTO EDITOR
   ========================================================= */

const photoInput = document.getElementById("photoInput");
const photoCanvas = document.getElementById("photoCanvas");
const canvasWrapper = document.getElementById("canvasWrapper");
const emptyPreview = document.getElementById("emptyPreview");

const ctx = photoCanvas.getContext("2d");

const activeToolText = document.getElementById("activeToolText");
const imageInfo = document.getElementById("imageInfo");
const imageStatus = document.getElementById("imageStatus");

const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomValue = document.getElementById("zoomValue");

const brightness = document.getElementById("brightness");
const contrast = document.getElementById("contrast");
const saturation = document.getElementById("saturation");
const blur = document.getElementById("blur");

const brightnessValue = document.getElementById("brightnessValue");
const contrastValue = document.getElementById("contrastValue");
const saturationValue = document.getElementById("saturationValue");
const blurValue = document.getElementById("blurValue");

const resetAdjustBtn = document.getElementById("resetAdjustBtn");

const rotateLeftBtn = document.getElementById("rotateLeftBtn");
const rotateRightBtn = document.getElementById("rotateRightBtn");
const flipHorizontalBtn = document.getElementById("flipHorizontalBtn");
const flipVerticalBtn = document.getElementById("flipVerticalBtn");
const resetTransformBtn = document.getElementById("resetTransformBtn");

const imageWidth = document.getElementById("imageWidth");
const imageHeight = document.getElementById("imageHeight");
const lockRatio = document.getElementById("lockRatio");
const applyResizeBtn = document.getElementById("applyResizeBtn");

const exportFormat = document.getElementById("exportFormat");
const exportQuality = document.getElementById("exportQuality");
const qualityValue = document.getElementById("qualityValue");
const downloadBtn = document.getElementById("downloadBtn");

const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const resetBtn = document.getElementById("resetBtn");

const toolTabs = document.querySelectorAll(".tool-tab");
const toolContents = document.querySelectorAll(".tool-content");
const filterButtons = document.querySelectorAll(".filter-button");

let originalImage = null;

let state = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    filter: "none",
    rotation: 0,
    flipX: 1,
    flipY: 1,
    zoom: 100,
    width: 0,
    height: 0
};

let history = [];
let historyIndex = -1;


/* =========================================================
   TOOL SWITCHING
   ========================================================= */

function activateTool(toolName) {

    toolTabs.forEach(tab => {
        tab.classList.toggle(
            "active",
            tab.dataset.tool === toolName
        );
    });

    toolContents.forEach(content => {
        content.classList.toggle(
            "active",
            content.dataset.content === toolName
        );
    });

    const toolNames = {
        adjust: "Adjustments",
        filters: "Filters",
        transform: "Transform",
        resize: "Resize",
        export: "Export"
    };

    if (activeToolText) {
        activeToolText.textContent =
            originalImage
                ? `${toolNames[toolName]}`
                : "Upload a photo to begin editing.";
    }
}

toolTabs.forEach(tab => {

    tab.addEventListener("click", () => {

        activateTool(tab.dataset.tool);

    });

});


/* =========================================================
   IMAGE UPLOAD
   ========================================================= */

photoInput.addEventListener("change", event => {

    const file = event.target.files[0];

    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {
        alert("Please select a valid image file.");
        return;
    }

    const reader = new FileReader();

    reader.onload = event => {

        const img = new Image();

        img.onload = () => {

            originalImage = img;

            state = {
                brightness: 100,
                contrast: 100,
                saturation: 100,
                blur: 0,
                filter: "none",
                rotation: 0,
                flipX: 1,
                flipY: 1,
                zoom: 100,
                width: img.naturalWidth,
                height: img.naturalHeight
            };

            history = [];
            historyIndex = -1;

            imageWidth.value = img.naturalWidth;
            imageHeight.value = img.naturalHeight;

            updateControls();

            emptyPreview.hidden = true;
            photoCanvas.hidden = false;

            imageInfo.textContent =
                `${img.naturalWidth} × ${img.naturalHeight}px`;

            imageStatus.textContent = "Ready";

            zoomValue.textContent = "100%";

            activateTool("adjust");

            saveHistory();

            render();

        };

        img.src = event.target.result;

    };

    reader.readAsDataURL(file);

});


/* =========================================================
   RENDER IMAGE
   ========================================================= */

function render() {

    if (!originalImage) {
        return;
    }

    const width = state.width;
    const height = state.height;

    const angle =
        ((state.rotation % 360) + 360) % 360;

    const rotated =
        angle === 90 || angle === 270;

    const canvasWidth = rotated ? height : width;
    const canvasHeight = rotated ? width : height;

    photoCanvas.width = canvasWidth;
    photoCanvas.height = canvasHeight;

    ctx.clearRect(
        0,
        0,
        photoCanvas.width,
        photoCanvas.height
    );

    ctx.save();

    ctx.translate(
        canvasWidth / 2,
        canvasHeight / 2
    );

    ctx.rotate(
        state.rotation * Math.PI / 180
    );

    ctx.scale(
        state.flipX,
        state.flipY
    );

    ctx.filter = buildFilter();

    ctx.drawImage(
        originalImage,
        -width / 2,
        -height / 2,
        width,
        height
    );

    ctx.restore();

    applyZoom();

    imageInfo.textContent =
        `${canvasWidth} × ${canvasHeight}px`;

    imageStatus.textContent = "Edited";
}


/* =========================================================
   FILTER BUILD
   ========================================================= */

function buildFilter() {

    let filters = [];

    filters.push(
        `brightness(${state.brightness}%)`
    );

    filters.push(
        `contrast(${state.contrast}%)`
    );

    filters.push(
        `saturate(${state.saturation}%)`
    );

    if (state.blur > 0) {

        filters.push(
            `blur(${state.blur}px)`
        );

    }

    switch (state.filter) {

        case "grayscale":
            filters.push("grayscale(100%)");
            break;

        case "sepia":
            filters.push("sepia(100%)");
            break;

        case "vintage":
            filters.push(
                "sepia(35%) contrast(110%) saturate(80%)"
            );
            break;

        case "warm":
            filters.push(
                "sepia(20%) saturate(125%)"
            );
            break;

        case "cool":
            filters.push(
                "saturate(90%) hue-rotate(10deg)"
            );
            break;

        default:
            break;
    }

    return filters.join(" ");
}


/* =========================================================
   ZOOM
   ========================================================= */

function applyZoom() {

    const zoom =
        state.zoom / 100;

    photoCanvas.style.width =
        `${photoCanvas.width * zoom}px`;

    photoCanvas.style.height =
        `${photoCanvas.height * zoom}px`;
}


zoomInBtn.addEventListener("click", () => {

    if (!originalImage) {
        return;
    }

    state.zoom = Math.min(
        state.zoom + 10,
        200
    );

    zoomValue.textContent =
        `${state.zoom}%`;

    applyZoom();

});


zoomOutBtn.addEventListener("click", () => {

    if (!originalImage) {
        return;
    }

    state.zoom = Math.max(
        state.zoom - 10,
        25
    );

    zoomValue.textContent =
        `${state.zoom}%`;

    applyZoom();

});


/* =========================================================
   ADJUSTMENTS
   ========================================================= */

brightness.addEventListener("input", () => {

    state.brightness =
        Number(brightness.value);

    brightnessValue.textContent =
        `${state.brightness}%`;

    render();

});


contrast.addEventListener("input", () => {

    state.contrast =
        Number(contrast.value);

    contrastValue.textContent =
        `${state.contrast}%`;

    render();

});


saturation.addEventListener("input", () => {

    state.saturation =
        Number(saturation.value);

    saturationValue.textContent =
        `${state.saturation}%`;

    render();

});


blur.addEventListener("input", () => {

    state.blur =
        Number(blur.value);

    blurValue.textContent =
        `${state.blur}px`;

    render();

});


/* =========================================================
   RESET ADJUSTMENTS
   ========================================================= */

resetAdjustBtn.addEventListener("click", () => {

    state.brightness = 100;
    state.contrast = 100;
    state.saturation = 100;
    state.blur = 0;

    updateControls();
    saveHistory();
    render();

});


/* =========================================================
   FILTERS
   ========================================================= */

filterButtons.forEach(button => {

    button.addEventListener("click", () => {

        state.filter =
            button.dataset.filter;

        filterButtons.forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");

        saveHistory();
        render();

    });

});


/* =========================================================
   TRANSFORM
   ========================================================= */

rotateLeftBtn.addEventListener("click", () => {

    state.rotation -= 90;

    saveHistory();
    render();

});


rotateRightBtn.addEventListener("click", () => {

    state.rotation += 90;

    saveHistory();
    render();

});


flipHorizontalBtn.addEventListener("click", () => {

    state.flipX *= -1;

    saveHistory();
    render();

});


flipVerticalBtn.addEventListener("click", () => {

    state.flipY *= -1;

    saveHistory();
    render();

});


resetTransformBtn.addEventListener("click", () => {

    state.rotation = 0;
    state.flipX = 1;
    state.flipY = 1;

    saveHistory();
    render();

});


/* =========================================================
   RESIZE
   ========================================================= */

imageWidth.addEventListener("input", () => {

    if (!originalImage || !lockRatio.checked) {
        return;
    }

    const width =
        Number(imageWidth.value);

    if (!width) {
        return;
    }

    const ratio =
        state.height / state.width;

    imageHeight.value =
        Math.round(width * ratio);

});


imageHeight.addEventListener("input", () => {

    if (!originalImage || !lockRatio.checked) {
        return;
    }

    const height =
        Number(imageHeight.value);

    if (!height) {
        return;
    }

    const ratio =
        state.width / state.height;

    imageWidth.value =
        Math.round(height * ratio);

});


applyResizeBtn.addEventListener("click", () => {

    if (!originalImage) {
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
        width < 1 ||
        height < 1
    ) {
        alert("Please enter valid image dimensions.");
        return;
    }

    state.width = width;
    state.height = height;

    saveHistory();
    render();

});


/* =========================================================
   EXPORT
   ========================================================= */

exportQuality.addEventListener("input", () => {

    qualityValue.textContent =
        `${exportQuality.value}%`;

});


downloadBtn.addEventListener("click", () => {

    if (!originalImage) {
        alert("Please upload a photo first.");
        return;
    }

    const format =
        exportFormat.value;

    const quality =
        Number(exportQuality.value) / 100;

    const exportCanvas =
        document.createElement("canvas");

    const exportContext =
        exportCanvas.getContext("2d");

    exportCanvas.width =
        photoCanvas.width;

    exportCanvas.height =
        photoCanvas.height;

    exportContext.drawImage(
        photoCanvas,
        0,
        0
    );

    exportCanvas.toBlob(blob => {

        if (!blob) {
            alert("Unable to export the image.");
            return;
        }

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        const extension =
            format === "image/png"
                ? "png"
                : format === "image/webp"
                    ? "webp"
                    : "jpg";

        link.href = url;

        link.download =
            `toolora-edited-photo.${extension}`;

        document.body.appendChild(link);

        link.click();

        link.remove();

        URL.revokeObjectURL(url);

        imageStatus.textContent =
            "Downloaded";

    }, format, quality);

});


/* =========================================================
   HISTORY
   ========================================================= */

function cloneState() {

    return {
        brightness: state.brightness,
        contrast: state.contrast,
        saturation: state.saturation,
        blur: state.blur,
        filter: state.filter,
        rotation: state.rotation,
        flipX: state.flipX,
        flipY: state.flipY,
        zoom: state.zoom,
        width: state.width,
        height: state.height
    };

}


function saveHistory() {

    if (!originalImage) {
        return;
    }

    history =
        history.slice(
            0,
            historyIndex + 1
        );

    history.push(
        cloneState()
    );

    historyIndex =
        history.length - 1;

    if (history.length > 30) {

        history.shift();

        historyIndex--;

    }

}


function restoreHistory(index) {

    if (
        index < 0 ||
        index >= history.length
    ) {
        return;
    }

    state = {
        ...history[index]
    };

    updateControls();

    render();

    historyIndex = index;

}


/* =========================================================
   UNDO
   ========================================================= */

undoBtn.addEventListener("click", () => {

    if (!originalImage) {
        return;
    }

    if (historyIndex <= 0) {
        return;
    }

    restoreHistory(
        historyIndex - 1
    );

});


/* =========================================================
   REDO
   ========================================================= */

redoBtn.addEventListener("click", () => {

    if (!originalImage) {
        return;
    }

    if (
        historyIndex >=
        history.length - 1
    ) {
        return;
    }

    restoreHistory(
        historyIndex + 1
    );

});


/* =========================================================
   RESET ALL
   ========================================================= */

resetBtn.addEventListener("click", () => {

    if (!originalImage) {
        return;
    }

    state = {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        blur: 0,
        filter: "none",
        rotation: 0,
        flipX: 1,
        flipY: 1,
        zoom: 100,
        width: originalImage.naturalWidth,
        height: originalImage.naturalHeight
    };

    history = [];

    historyIndex = -1;

    updateControls();

    saveHistory();

    render();

    activateTool("adjust");

});


/* =========================================================
   UPDATE UI CONTROLS
   ========================================================= */

function updateControls() {

    brightness.value =
        state.brightness;

    contrast.value =
        state.contrast;

    saturation.value =
        state.saturation;

    blur.value =
        state.blur;

    brightnessValue.textContent =
        `${state.brightness}%`;

    contrastValue.textContent =
        `${state.contrast}%`;

    saturationValue.textContent =
        `${state.saturation}%`;

    blurValue.textContent =
        `${state.blur}px`;

    imageWidth.value =
        state.width;

    imageHeight.value =
        state.height;

    zoomValue.textContent =
        `${state.zoom}%`;

    filterButtons.forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.filter === state.filter
        );

    });

    qualityValue.textContent =
        `${exportQuality.value}%`;

}


/* =========================================================
   INITIAL STATE
   ========================================================= */

activateTool("adjust");
updateControls();
